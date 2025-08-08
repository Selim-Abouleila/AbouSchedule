import { messaging, getToken, onMessage } from './firebase';
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
    // Request permission using expo-notifications
    const { getPermissionsAsync, requestPermissionsAsync } = await import('expo-notifications');
    
    const { status: existingStatus } = await getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return null;
    }

    // For Expo, we need to use expo-notifications to get the token
    const { getExpoPushTokenAsync } = await import('expo-notifications');
    
    const token = await getExpoPushTokenAsync({
      projectId: 'abouschedule' // Your Expo project ID
    });

    if (token) {
      console.log('Push token:', token.data);
      
      // Register token with backend
      await registerPushToken(token.data);
      
      return token.data;
    } else {
      console.log('No registration token available');
      return null;
    }
  } catch (error) {
    console.error('Error getting push token:', error);
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
  onMessage(messaging, (payload) => {
    console.log('Message received in foreground:', payload);
    
    // You can show a local notification here if needed
    // For now, we'll just log it
  });
};

// Initialize notifications
export const initializeNotifications = async (): Promise<void> => {
  try {
    // Request permissions and get token
    const token = await requestNotificationPermissions();
    
    if (token) {
      // Setup foreground message handler
      setupForegroundHandler();
      console.log('Firebase notifications initialized successfully');
    } else {
      console.log('Failed to initialize Firebase notifications');
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
      projectId: 'abouschedule'
    });
    
    if (token && token.data) {
      await unregisterPushToken(token.data);
    }
  } catch (error) {
    console.error('Error cleaning up notifications:', error);
  }
};
