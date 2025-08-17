// src/logoutHelper.ts  (new location)
import { clearTokenAndNotify } from '../src/auth';
import { cleanupNotifications } from './notificationManager';

export async function logoutHelper() {
  await clearTokenAndNotify();          // wipe SecureStore JWT
  await cleanupNotifications();         // cleanup notifications (works with both Expo and native Firebase)
}
