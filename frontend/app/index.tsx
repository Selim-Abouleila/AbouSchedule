import { useEffect } from 'react';
import { router } from 'expo-router';
import { getInitialNotificationData } from '../src/expoNotifications';
import { getToken, isAdmin } from '../src/auth';
import { View, ActivityIndicator } from 'react-native';

export default function Index() {
  useEffect(() => {
    checkAuthAndRedirect();
  }, []);

  const checkAuthAndRedirect = async () => {
    try {
      // Handle cold-start deep link from notification BEFORE auth routing
      const initialData = await getInitialNotificationData();
      if (initialData?.taskId) {
        if (initialData.type === 'unread_immediate_task' && initialData.userId) {
          router.replace(`/admin/tasks/${initialData.userId}/${initialData.taskId}`);
          return;
        } else if (initialData.type === 'immediate_task') {
          router.replace(`/tasks/${initialData.taskId}`);
          return;
        }
      }

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
