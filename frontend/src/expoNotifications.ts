import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { getToken as getAuthToken } from './auth';
import { API_BASE } from './api';

// Configure foreground presentation on iOS
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // Legacy fields
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    // Newer fields required by current NotificationBehavior typings
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF231F7C',
  });
}

async function registerNotificationCategories(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    await Notifications.setNotificationCategoryAsync('immediate_task_alert', [
      {
        identifier: 'ignore',
        buttonTitle: 'Ignore',
        options: { isDestructive: true, isAuthenticationRequired: false },
      },
      {
        identifier: 'view',
        buttonTitle: 'View Task',
        options: { isDestructive: false, isAuthenticationRequired: false },
      },
    ]);
  } catch (e) {
    console.log('Failed to register iOS notification categories:', e);
  }
}

export const requestPermissionsAndGetExpoToken = async (): Promise<string | null> => {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.log('❌ Notification permission not granted');
    return null;
  }

  await ensureAndroidChannel();
  await registerNotificationCategories();

  // Get Expo push token (use EAS projectId when available)
  const projectId = (Constants?.expoConfig as any)?.extra?.eas?.projectId || (Constants as any)?.easConfig?.projectId;
  const resp = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );
  const token = resp?.data ?? null;
  if (!token) return null;

  // Register token with backend
  try {
    const authToken = await getAuthToken();
    if (!authToken) return token;
    await fetch(`${API_BASE}/push-tokens/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ token }),
    });
  } catch (e) {
    console.log('Failed to register Expo push token with backend:', e);
  }

  return token;
};

export const setupForegroundHandler = (): (() => void) => {
  const sub = Notifications.addNotificationReceivedListener((n) => {
    console.log('📱 Expo notification received (foreground):', n.request.content);
  });
  return () => sub.remove();
};

export const setupNotificationResponseHandler = (
  onNavigate: (data: Record<string, any>) => void
): (() => void) => {
  const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
    const data = resp.notification.request.content.data as Record<string, any>;
    onNavigate(data);
  });
  return () => sub.remove();
};

export const cleanupExpoNotifications = async (): Promise<void> => {
  // There is no concept of unregistering an Expo token from the device side.
  // If you need to remove it on the backend, you can fetch the token again and call your delete endpoint.
  try {
    const projectId = (Constants?.expoConfig as any)?.extra?.eas?.projectId || (Constants as any)?.easConfig?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined))?.data;
    if (token) {
      const authToken = await getAuthToken();
      if (authToken) {
        await fetch(`${API_BASE}/push-tokens/unregister`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({ token }),
        });
      }
    }
  } catch (e) {
    console.log('Failed to unregister Expo push token:', e);
  }
};


