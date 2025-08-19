import { Platform } from 'react-native';
import {
  requestPermissionsAndGetExpoToken,
  setupForegroundHandler,
  setupNotificationResponseHandler,
  cleanupExpoNotifications,
} from './expoNotifications';

// Firebase-only notification manager
export class NotificationManager {
  private static instance: NotificationManager;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): NotificationManager {
    if (!NotificationManager.instance) {
      NotificationManager.instance = new NotificationManager();
    }
    return NotificationManager.instance;
  }

  // Initialize notifications (expo-notifications)
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('🔔 Notifications already initialized');
      return;
    }

    try {
      console.log('🔔 Initializing notifications...');
      const token = await requestPermissionsAndGetExpoToken();
      if (token) console.log('✅ Expo push token:', token);

      // Foreground
      const unsubFg = setupForegroundHandler();
      // Tap/click routing hook – consumer can add handler later if needed
      setupNotificationResponseHandler((data) => {
        console.log('🔔 Notification tapped with data:', data);
      });

      // Store unsub if you later want to support teardown
      this.isInitialized = true;
      console.log('✅ Notification manager initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing notification manager:', error);
      throw error;
    }
  }

  // Request notification permissions
  async requestPermissions(): Promise<string | null> {
    try {
      if (Platform.OS === 'android') {
        return await requestNativePermissions();
      } else {
        console.log('⚠️ Firebase notifications only supported on Android');
        return null;
      }
    } catch (error) {
      console.error('❌ Error requesting notification permissions:', error);
      return null;
    }
  }

  // Cleanup notifications
  async cleanup(): Promise<void> {
    try {
      await cleanupExpoNotifications();
      this.isInitialized = false;
      console.log('✅ Notification manager cleaned up successfully');
    } catch (error) {
      console.error('❌ Error cleaning up notification manager:', error);
    }
  }

  // Check if notifications are initialized
  isNotificationsInitialized(): boolean {
    return this.isInitialized;
  }

  // Get current notification method
  getCurrentMethod(): string {
    return 'Expo';
  }

  // Check if using native Firebase
  isUsingNativeFirebaseNotifications(): boolean {
    return true;
  }
}

// Export singleton instance
export const notificationManager = NotificationManager.getInstance();

// Convenience functions
export const initializeNotifications = () => notificationManager.initialize();
export const requestNotificationPermissions = () => notificationManager.requestPermissions();
export const cleanupNotifications = () => notificationManager.cleanup();
export const isUsingNativeFirebase = () => notificationManager.isUsingNativeFirebaseNotifications();
export const getNotificationMethod = () => notificationManager.getCurrentMethod();
