import { Platform } from 'react-native';
import {
  initializeNativeFirebaseNotifications,
  cleanupNativeFirebaseNotifications,
  requestNotificationPermissions as requestNativePermissions
} from './nativeFirebaseNotifications';

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

  // Initialize Firebase notifications
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('🔔 Firebase notifications already initialized');
      return;
    }

    try {
      if (Platform.OS === 'android') {
        console.log('🔔 Initializing Firebase notifications...');
        await initializeNativeFirebaseNotifications();
        this.isInitialized = true;
        console.log('✅ Firebase notification manager initialized successfully');
      } else {
        console.log('⚠️ Firebase notifications only supported on Android');
        this.isInitialized = true;
      }
    } catch (error) {
      console.error('❌ Error initializing Firebase notification manager:', error);
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
      if (Platform.OS === 'android') {
        await cleanupNativeFirebaseNotifications();
      }
      this.isInitialized = false;
      console.log('✅ Firebase notification manager cleaned up successfully');
    } catch (error) {
      console.error('❌ Error cleaning up Firebase notification manager:', error);
    }
  }

  // Check if notifications are initialized
  isNotificationsInitialized(): boolean {
    return this.isInitialized;
  }

  // Get current notification method
  getCurrentMethod(): string {
    return 'Firebase';
  }

  // Check if using native Firebase
  isUsingNativeFirebaseNotifications(): boolean {
    return Platform.OS === 'android';
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
