import { useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Alert } from 'react-native';
import { logoutHelper } from '../src/logoutHelper';  // adjust path

export default function LogoutScreen() {
  useFocusEffect(
    useCallback(() => {
      Alert.alert(
        'Log out',
        'Are you sure you want to log out?',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => router.back() },
          { text: 'Log out', style: 'destructive', onPress: async () => {
              await logoutHelper();
              router.replace('auth/login');
            }
          },
        ]
      );
    }, [])                           // no deps → run each time screen gains focus
  );

  return null;                       // no UI
}
