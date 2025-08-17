import { 
  initializeNativeFirebaseNotifications,
  cleanupNativeFirebaseNotifications,
  requestNotificationPermissions as requestNativePermissions
} from './nativeFirebaseNotifications';

// Simplified notification manager - always uses native Firebase
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

  // Initialize notifications (always uses native Firebase)
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('🔔 Notifications already initialized');
      return;
    }

    try {
      console.log('🔔 Initializing native Firebase notifications...');
      await initializeNativeFirebaseNotifications();
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
      return await requestNativePermissions();
    } catch (error) {
      console.error('❌ Error requesting notification permissions:', error);
      return null;
    }
  }

  // Cleanup notifications
  async cleanup(): Promise<void> {
    try {
      await cleanupNativeFirebaseNotifications();
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

  // Get current notification method (always native Firebase now)
  getCurrentMethod(): string {
    return 'Native Firebase';
  }
}

// Export singleton instance
export const notificationManager = NotificationManager.getInstance();

// Convenience functions
export const initializeNotifications = () => notificationManager.initialize();
export const requestNotificationPermissions = () => notificationManager.requestPermissions();
export const cleanupNotifications = () => notificationManager.cleanup();
export const isUsingNativeFirebase = () => true; // Always true now
export const getNotificationMethod = () => notificationManager.getCurrentMethod();
