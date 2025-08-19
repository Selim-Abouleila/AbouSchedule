import { getInitialNotificationData, setupNotificationResponseHandler, clearLastNotificationResponse } from '../src/expoNotifications';
import { router, useRootNavigationState } from 'expo-router';
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
  const rootNav = useRootNavigationState();

  useEffect(() => {
    if (!rootNav?.key) return;
    checkAdminStatus();
    // Handle cold start - ONLY if the app was actually launched from a notification
    (async () => {
      // Get notification data first, then immediately clear it to prevent future redirects
      const data = await getInitialNotificationData();
      
      // Always clear notification data immediately to prevent stale redirects
      await clearLastNotificationResponse();
      
      if (data) {
        console.log('🔔 Initial notification data:', data);
        
        // If we have notification data with a taskId, it means the app was launched by tapping a notification
        // The presence of data from getLastNotificationResponseAsync() indicates a notification was tapped
        if (data?.taskId) {
          console.log('🔔 App launched from notification tap - redirecting');
          // Check admin status before deciding where to redirect
          const adminStatus = await isAdmin();
          // Defer a tick to ensure router is ready on cold start
          setTimeout(() => {
            if (data.type === 'unread_immediate_task' && data.userId) {
              router.replace(`/admin/tasks/${data.userId}/${data.taskId}`);
            } else if (data.type === 'immediate_task') {
              // If user is admin, redirect to admin task view instead of regular task view
              if (adminStatus) {
                router.replace(`/admin/tasks/${data.userId || 'unknown'}/${data.taskId}`);
              } else {
                router.replace(`/tasks/${data.taskId}`);
              }
            }
          }, 0);
        } else {
          console.log('🔔 App launched normally - no valid notification data');
        }
      } else {
        console.log('🔔 App launched normally - no notification data');
      }
    })();

    // Subscribe to taps
    const unsub = setupNotificationResponseHandler(async (data: any) => {
      console.log('🔔 Notification tap data:', data);
      if (data?.taskId) {
        // Check admin status before deciding where to redirect
        const adminStatus = await isAdmin();
        setTimeout(() => {
          if (data.type === 'unread_immediate_task' && data.userId) {
            router.push(`/admin/tasks/${data.userId}/${data.taskId}`);
          } else if (data.type === 'immediate_task') {
            // If user is admin, redirect to admin task view instead of regular task view
            if (adminStatus) {
              router.push(`/admin/tasks/${data.userId || 'unknown'}/${data.taskId}`);
            } else {
              router.push(`/tasks/${data.taskId}`);
            }
          }
        }, 0);
      }
    });

    return () => {
      if (unsub) unsub();
    };
  }, [rootNav?.key]);

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
