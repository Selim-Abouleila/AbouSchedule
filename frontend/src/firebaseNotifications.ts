import { getToken as getAuthToken } from './auth';
import { API_BASE } from './api';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// Request notification permissions and get push token
export const requestNotificationPermissions = async (): Promise<string | null> => {
  if (!Device.isDevice) {
    console.log('Must use physical device for Push Notifications');
    return null;
  }

  try {
    console.log('🔔 Starting notification permission request...');
    
    // Request permission using expo-notifications
    const { getPermissionsAsync, requestPermissionsAsync } = await import('expo-notifications');
    
    const { status: existingStatus } = await getPermissionsAsync();
    console.log('📱 Current notification status:', existingStatus);
    
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      console.log('🔔 Requesting notification permissions...');
      const { status } = await requestPermissionsAsync();
      finalStatus = status;
      console.log('📱 New notification status:', finalStatus);
    }

    if (finalStatus !== 'granted') {
      console.log('❌ Failed to get push token for push notification!');
      return null;
    }

    console.log('✅ Notification permissions granted, getting push token...');

    // For Expo, we need to use expo-notifications to get the token
    const { getExpoPushTokenAsync } = await import('expo-notifications');
    
    const token = await getExpoPushTokenAsync({
      projectId: '8cffe111-34b6-49d5-8fff-60395880677b' // Your actual Expo project ID
    });

    if (token) {
      console.log('✅ Push token received:', token.data);
      
      // Register token with backend
      await registerPushToken(token.data);
      
      return token.data;
    } else {
      console.log('❌ No registration token available');
      return null;
    }
  } catch (error) {
    console.error('❌ Error getting push token:', error);
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
      console.log('Push token registered successfully');
    } else {
      console.error('Failed to register push token:', response.status);
    }
  } catch (error) {
    console.error('Error registering push token:', error);
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
      console.log('Push token unregistered successfully');
    } else {
      console.error('Failed to unregister push token:', response.status);
    }
  } catch (error) {
    console.error('Error unregistering push token:', error);
  }
};

// Handle foreground messages
export const setupForegroundHandler = (): void => {
  // For Expo, we handle notifications through expo-notifications
  // Background notifications are handled automatically by Expo
  console.log('Foreground handler setup - notifications will be handled by Expo');
};

// Initialize notifications
export const initializeNotifications = async (): Promise<void> => {
  try {
    // Request permissions and get token
    const token = await requestNotificationPermissions();
    
    if (token) {
      // Setup foreground message handler
      setupForegroundHandler();
      console.log('Expo notifications initialized successfully');
    } else {
      console.log('Failed to initialize Expo notifications');
    }
  } catch (error) {
    console.error('Error initializing notifications:', error);
  }
};

// Cleanup function for when user logs out
export const cleanupNotifications = async (): Promise<void> => {
  try {
    const { getExpoPushTokenAsync } = await import('expo-notifications');
    const token = await getExpoPushTokenAsync({
      projectId: '8cffe111-34b6-49d5-8fff-60395880677b'
    });
    
    if (token && token.data) {
      await unregisterPushToken(token.data);
    }
  } catch (error) {
    console.error('Error cleaning up notifications:', error);
  }
};
