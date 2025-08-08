// src/logoutHelper.ts  (new location)
import { clearTokenAndNotify } from '../src/auth';
import { cleanupNotifications } from './firebaseNotifications';

export async function logoutHelper() {
  await clearTokenAndNotify();          // wipe SecureStore JWT
  await cleanupNotifications();         // cleanup Firebase notifications
}
