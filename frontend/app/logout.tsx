import { useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { logoutHelper } from '../src/logoutHelper';  // adjust path

export default function LogoutScreen() {
  useFocusEffect(
    useCallback(() => {
      (async () => {
        await logoutHelper();        // 1️⃣ clear token
        router.replace('auth/login');    // 2️⃣ go to login
      })();
    }, [])                           // no deps → run each time screen gains focus
  );

  return null;                       // no UI
}
