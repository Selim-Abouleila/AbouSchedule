import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { getToken as getAuthToken } from './auth';
import { API_BASE } from './api';

let handlersConfigured = false;

async function getNotifications() {
  try {
    const Notifications = await import('expo-notifications');
    if (!handlersConfigured) {
      try {
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });
      } catch {}
      handlersConfigured = true;
    }
    return Notifications;
  } catch {
    return null;
  }
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const Notifications = await getNotifications();
  if (!Notifications) return;
  // Default channel
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF231F7C',
  });
  // Admin alert channel (used by server for unread immediate task alerts)
  await Notifications.setNotificationChannelAsync('immediate_task_alert', {
    name: 'Immediate Task Alerts',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 500, 500, 500],
    lightColor: '#FF231F7C',
  });
}

async function registerNotificationCategories(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  const Notifications = await getNotifications();
  if (!Notifications) return;
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
  const Notifications = await getNotifications();
  if (!Notifications) return null;
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  try {
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
  } catch (e) {
    console.warn('Failed to request notification permissions:', e);
    return null;
  }

  await ensureAndroidChannel();
  await registerNotificationCategories();

  // Get Expo push token (use EAS projectId when available)
  let token: string | null = null;
  try {
    const projectId = (Constants?.expoConfig as any)?.extra?.eas?.projectId || (Constants as any)?.easConfig?.projectId;
    const resp = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    token = resp?.data ?? null;
  } catch (e) {
    console.warn('Failed to get Expo push token:', e);
    return null;
  }
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
  let unsub: (() => void) | null = null;
  (async () => {
    const Notifications = await getNotifications();
    if (!Notifications) return;
    const sub = Notifications.addNotificationReceivedListener((n) => {
      console.log('📱 Expo notification received (foreground):', n.request.content);
    });
    unsub = () => sub.remove();
  })();
  return () => {
    if (unsub) unsub();
  };
};

export const setupNotificationResponseHandler = (
  onNavigate: (data: Record<string, any>) => void
): (() => void) => {
  let unsub: (() => void) | null = null;
  (async () => {
    const Notifications = await getNotifications();
    if (!Notifications) return;
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const data = resp.notification.request.content.data as Record<string, any>;
      onNavigate(data);
    });
    unsub = () => sub.remove();
  })();
  return () => {
    if (unsub) unsub();
  };
};

export const getInitialNotificationData = async (): Promise<Record<string, any> | null> => {
  const Notifications = await getNotifications();
  if (!Notifications) return null;
  const initial = await Notifications.getLastNotificationResponseAsync();
  const data = initial?.notification?.request?.content?.data as Record<string, any> | undefined;
  return data ?? null;
};

export const cleanupExpoNotifications = async (): Promise<void> => {
  // There is no concept of unregistering an Expo token from the device side.
  // If you need to remove it on the backend, you can fetch the token again and call your delete endpoint.
  try {
    const Notifications = await getNotifications();
    if (!Notifications) return;
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


