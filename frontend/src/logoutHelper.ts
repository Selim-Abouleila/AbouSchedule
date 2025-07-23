// src/logoutHelper.ts  (new location)
import { clearToken } from '../src/auth';

export async function logoutHelper() {
  await clearToken();          // wipe SecureStore JWT
}
