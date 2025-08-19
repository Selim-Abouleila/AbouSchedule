import '@react-native-firebase/app';
import { getToken as getAuthToken } from './auth';
import { API_BASE } from './api';
import { Platform, PermissionsAndroid } from 'react-native';
import { handleNotificationAction } from './notificationActions';
import messaging from '@react-native-firebase/messaging';

// Ensure device is ready to receive remote messages
const ensureFirebaseReady = async (): Promise<void> => {
  try {
    await messaging().registerDeviceForRemoteMessages();
  } catch {}
};

// Request notification permissions and get push token
export const requestNotificationPermissions = async (): Promise<string | null> => {
  try {
    console.log('🔔 Starting native Firebase notification permission request...');
    
    // Ensure Firebase app + registration is ready
    await ensureFirebaseReady();

    // Android 13+ requires runtime POST_NOTIFICATIONS permission
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        console.log('❌ Notifications permission not granted on Android');
        return null;
      }
    }

    // Only iOS uses messaging().requestPermission()
    let enabled = true;
    if (Platform.OS === 'ios') {
      const authStatus = await messaging().requestPermission();
      enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;
      console.log('📱 Firebase notification status:', authStatus);
    }

    if (enabled) {
      console.log('✅ Firebase notification permissions granted, getting push token...');
      
      // Get the token
      const token = await messaging().getToken();
      
      if (token) {
        console.log('✅ Firebase push token received:', token);
        
        // Register token with backend
        await registerPushToken(token);
        
        return token;
      } else {
        console.log('❌ No Firebase registration token available');
        return null;
      }
    } else {
      console.log('❌ Failed to get Firebase push token - permissions not granted');
      return null;
    }
  } catch (error: unknown) {
    console.error('❌ Error getting Firebase push token:', error);
    return null;
  }
};

// Register push token with backend
export const registerPushToken = async (token: string): Promise<void> => {
  try {
    const authToken = await getAuthToken();
    if (!authToken) {
      console.log('No auth token available');
      return;
    }

    const response = await fetch(`${API_BASE}/push-tokens/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ token }),
    });

    if (response.ok) {
      console.log('Firebase push token registered successfully');
    } else {
      console.error('Failed to register Firebase push token:', response.status);
    }
  } catch (error: unknown) {
    console.error('Error registering Firebase push token:', error);
  }
};

// Unregister push token from backend
export const unregisterPushToken = async (token: string): Promise<void> => {
  try {
    const authToken = await getAuthToken();
    if (!authToken) {
      console.log('No auth token available');
      return;
    }

    const response = await fetch(`${API_BASE}/push-tokens/unregister`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ token }),
    });

    if (response.ok) {
      console.log('Firebase push token unregistered successfully');
    } else {
      console.error('Failed to unregister Firebase push token:', response.status);
    }
  } catch (error: unknown) {
    console.error('Error unregistering Firebase push token:', error);
  }
};

// Handle foreground messages
export const setupForegroundHandler = (): (() => void) => {
  console.log('🔔 Setting up Firebase foreground message handler...');
  
  const unsubscribe = messaging().onMessage(async remoteMessage => {
    console.log('📱 Firebase foreground message received:', remoteMessage);
    
    // Show local notification with action buttons for immediate task alerts
    if (remoteMessage.data?.type === 'unread_immediate_task') {
      await showLocalNotificationWithActions(remoteMessage);
    }
  });
  
  return unsubscribe;
};

// Show local notification with action buttons
const showLocalNotificationWithActions = async (remoteMessage: any) => {
  try {
    // For Android, we'll use the native notification system
    // The action buttons will be handled by the notification response handler
    console.log('🔔 Showing local notification with actions for:', remoteMessage.data);
    
    // The notification will be displayed automatically by Firebase
    // Action buttons will be handled by the notification response handler
  } catch (error: unknown) {
    console.error('Error showing local notification:', error);
  }
};

// Handle notification responses (when user taps notification or action buttons)
export const setupNotificationResponseHandler = (): void => {
  console.log('🔔 Setting up Firebase notification response handler...');
  
  // Handle notification taps when app is in background/closed
  messaging().onNotificationOpenedApp(remoteMessage => {
    console.log('🔔 Firebase notification opened app:', remoteMessage);
    
    const data = remoteMessage.data;
    if (data?.type === 'unread_immediate_task') {
      handleNotificationAction('view', data);
    }
  });

  // Handle notification taps when app is closed
  messaging().getInitialNotification().then(remoteMessage => {
    if (remoteMessage) {
      console.log('🔔 Firebase initial notification:', remoteMessage);
      
      const data = remoteMessage.data;
      if (data?.type === 'unread_immediate_task') {
        handleNotificationAction('view', data);
      }
    }
  });

  // For Android, we need to handle action buttons through the native notification system
  // This will be handled by the Android notification service
  console.log('✅ Firebase notification response handler setup complete');
};

// Initialize native Firebase notifications
export const initializeNativeFirebaseNotifications = async (): Promise<void> => {
  try {
    console.log('🔔 Initializing native Firebase notifications...');
    
    // Request permissions and get token
    const token = await requestNotificationPermissions();
    
    if (token) {
      // Setup foreground message handler
      const unsubscribeForeground = setupForegroundHandler();
      
      // Setup notification response handler
      setupNotificationResponseHandler();
      
      console.log('✅ Native Firebase notifications initialized successfully');
      
      // Note: We don't return the cleanup function here since this function returns Promise<void>
      // The cleanup function should be handled separately
    } else {
      console.log('Failed to initialize native Firebase notifications');
    }
  } catch (error: unknown) {
    console.error('Error initializing native Firebase notifications:', error);
  }
};

// Cleanup function for when user logs out
export const cleanupNativeFirebaseNotifications = async (): Promise<void> => {
  try {
    await ensureFirebaseReady();
    const token = await messaging().getToken();
    
    if (token) {
      await unregisterPushToken(token);
    }
  } catch (error: unknown) {
    console.error('Error cleaning up native Firebase notifications:', error);
  }
};

// Get current Firebase token
export const getCurrentFirebaseToken = async (): Promise<string | null> => {
  try {
    return await messaging().getToken();
  } catch (error: unknown) {
    console.error('Error getting current Firebase token:', error);
    return null;
  }
};

// Check if Firebase messaging is supported
export const isFirebaseMessagingSupported = (): boolean => {
  return Platform.OS === 'android' && messaging !== undefined;
};
