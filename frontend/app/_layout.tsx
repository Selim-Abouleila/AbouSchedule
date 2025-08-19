import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
export const unstable_settings = {
  initialRouteName: 'index',   // Start with index which handles auth
  statePersistence: false,
};

// app/(app)/_layout.tsx
import { Drawer } from 'expo-router/drawer';
import { DrawerToggleButton } from '@react-navigation/drawer';
import { useEffect, useState } from 'react';
import { isAdmin } from '../src/auth';
import { Ionicons } from '@expo/vector-icons';

export default function AppDrawerLayout() {
  const [showAdminPanel, setShowAdminPanel] = useState<boolean>(false);

  useEffect(() => {
    checkAdminStatus();
    // Handle cold start
    (async () => {
      const initial = await Notifications.getLastNotificationResponseAsync();
      const data = initial?.notification?.request?.content?.data as any;
      if (data?.type === 'immediate_task' && data.taskId) {
        router.replace(`/tasks/${data.taskId}`);
      }
    })();

    // Subscribe to taps
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const data = resp.notification.request.content.data as any;
      if (data?.type === 'immediate_task' && data.taskId) {
        router.push(`/tasks/${data.taskId}`);
      }
    });

    return () => sub.remove();
  }, []);

  const checkAdminStatus = async () => {
    try {
      const adminStatus = await isAdmin();
      setShowAdminPanel(adminStatus);
    } catch (error) {
      console.error('Error checking admin status:', error);
      setShowAdminPanel(false);
    }
  };

  return (
    <Drawer
      screenOptions={{
        drawerType: 'slide',
        headerLeft: () => <DrawerToggleButton />, // hamburger icon
        drawerStyle: {
          width: 230, // Reduced from default ~320px
        },
      }}
    >

      {/* Admin Panel - always included but conditionally visible */}
      <Drawer.Screen 
        name="admin" 
        options={{ 
          title: 'Admin Panel',
          drawerItemStyle: showAdminPanel ? undefined : { display: 'none' },
          drawerIcon: ({ color, size }) => (
            <Ionicons name="shield-checkmark" size={size} color={color} />
          ),
        }} 
      />

      {/* Tasks list - main screen */}
      <Drawer.Screen 
        name="tasks/index" 
        options={{ 
          title: 'Tasks',
          drawerIcon: ({ color, size }) => (
            <Ionicons name="list" size={size} color={color} />
          ),
        }} 
      />

      {/* Media page */}
      <Drawer.Screen 
        name="media/media" 
        options={{ 
          title: 'Media',
          drawerIcon: ({ color, size }) => (
            <Ionicons name="images" size={size} color={color} />
          ),
        }} 
      />

      {/* Settings page */}
      <Drawer.Screen 
        name="settings" 
        options={{ 
          title: 'Settings',
          drawerIcon: ({ color, size }) => (
            <Ionicons name="settings" size={size} color={color} />
          ),
        }} 
      />

      {/* Login lives one level up (app/login.tsx) */}
      <Drawer.Screen 
        name="auth/login" 
        options={{ 
          title: 'Login',
          drawerIcon: ({ color, size }) => (
            <Ionicons name="key" size={size} color={color} />
          ),
        }} 
      />

      {/* Logout screen we'll add next */}
      <Drawer.Screen 
        name="logout" 
        options={{ 
          title: 'Logout',
          drawerIcon: ({ color, size }) => (
            <Ionicons name="log-out" size={size} color={color} />
          ),
        }} 
      />

      {/* Edit Screen*/}
      <Drawer.Screen name="[id]/edit" options={{ title: 'Edit Task', drawerItemStyle: { display: 'none' }, }}  />

      {/* Task Viewer*/}
      <Drawer.Screen name="tasks/[id]" options={{ title: 'View Task', drawerItemStyle: { display: 'none' }, }}  />

      {/*Register Pager*/}
      <Drawer.Screen name="tasks/add" options={{ title: 'Add Task', drawerItemStyle: { display: 'none' }, }}  />

      {/* Task Adder*/}
      <Drawer.Screen name="register" options={{ title: 'Register', drawerItemStyle: { display: 'none' }, }}  />

      {/*Admin User Tasks*/}
      <Drawer.Screen name="admin/tasks/[userId]/index" options={{ title: 'View Task for User', drawerItemStyle: { display: 'none' }, }}  />

      {/*Admin User Tasks*/}
        <Drawer.Screen name="admin/tasks/[userId]/[id]" options={{ title: 'View Task for User', drawerItemStyle: { display: 'none' }, }}  />

      {/*Admin Add Tasks*/}
        <Drawer.Screen name="admin/tasks/add" options={{ title: 'Add Task for User', drawerItemStyle: { display: 'none' }, }}  />

      {/*Admin Edit Tasks*/}
        <Drawer.Screen name="admin/tasks/[userId]/edit" options={{ title: 'Edit Task for User', drawerItemStyle: { display: 'none' }, }}  />



      <Drawer.Screen
        name="_necessary"
        options={{ drawerItemStyle: { display: 'none' } }}
      />

      {/* Root index - loading/redirect screen */}
      <Drawer.Screen
        name="index"
        options={{ 
          title: 'Loading',
          drawerItemStyle: { display: 'none' }
        }}
      />

      

    </Drawer>
  );


  
}
