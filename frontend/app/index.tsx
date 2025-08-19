import { useEffect } from 'react';
import { router } from 'expo-router';
import { getToken, isAdmin } from '../src/auth';
import { View, ActivityIndicator } from 'react-native';

export default function Index() {
  useEffect(() => {
    checkAuthAndRedirect();
  }, []);

  const checkAuthAndRedirect = async () => {
    try {
      const token = await getToken();
      if (token) {
        // User is logged in, check if admin
        const adminStatus = await isAdmin();
        if (adminStatus) {
          // Admin goes to admin panel
          router.replace('/admin');
        } else {
          // Regular user goes to tasks
          router.replace('/tasks');
        }
      } else {
        // User is not logged in, go to login
        router.replace('/auth/login');
      }
    } catch (error) {
      console.error('Error checking auth:', error);
      // On error, go to login
      router.replace('/auth/login');
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#0A84FF" />
    </View>
  );
}
