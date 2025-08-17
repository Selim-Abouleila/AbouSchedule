import { 
  initializeNotifications as initializeExpoNotifications,
  cleanupNotifications as cleanupExpoNotifications,
  requestNotificationPermissions as requestExpoPermissions
} from './firebaseNotifications';

// Hybrid notification manager - handles both Expo and Firebase tokens
export class NotificationManager {
  private static instance: NotificationManager;
  private isInitialized = false;
  private isUsingNativeFirebase = false;

  private constructor() {}

  static getInstance(): NotificationManager {
    if (!NotificationManager.instance) {
      NotificationManager.instance = new NotificationManager();
    }
    return NotificationManager.instance;
  }

  // Initialize notifications (uses Expo notifications for now)
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('🔔 Notifications already initialized');
      return;
    }

    try {
      console.log('🔔 Initializing Expo notifications...');
      await initializeExpoNotifications();
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
      return await requestExpoPermissions();
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
    return this.isUsingNativeFirebase ? 'Native Firebase' : 'Expo';
  }

  // Check if using native Firebase
  isUsingNativeFirebaseNotifications(): boolean {
    return this.isUsingNativeFirebase;
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
