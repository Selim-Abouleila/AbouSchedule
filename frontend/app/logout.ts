import { clearToken } from '../src/auth';
import { router } from 'expo-router';

/** Wipe SecureStore token then go back to the auth stack */
export async function logout() {
  await clearToken();               // 1️⃣ erase the JWT

  // 2️⃣ navigate to the real login route
  // use an ABSOLUTE path from the project root
  router.push('/login');
}
