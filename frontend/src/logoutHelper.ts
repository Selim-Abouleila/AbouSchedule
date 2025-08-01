// src/logoutHelper.ts  (new location)
import { clearTokenAndNotify } from '../src/auth';

export async function logoutHelper() {
  await clearTokenAndNotify();          // wipe SecureStore JWT
}
