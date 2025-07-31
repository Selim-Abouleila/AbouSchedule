export const unstable_settings = {
  initialRouteName: 'tasks/index',   // or 'index' / '(tabs)' / any drawer screen
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
      }}
    >

      
      {/* TASK list (and nested add / detail) */}
      <Drawer.Screen name="tasks/index" options={{ title: 'Tasks' }} />
      

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

      {/* Media page */}
      <Drawer.Screen name="media/media" options={{ title: 'Media' }} />

      {/* Settings page */}
      <Drawer.Screen name="settings" options={{ title: 'Settings' }} />

      {/* Login lives one level up (app/login.tsx) */}
      <Drawer.Screen name="auth/login" options={{ title: 'Login' }} />

      {/* Logout screen we'll add next */}
      <Drawer.Screen name="logout" options={{ title: 'Logout' }} />

      {/* Edit Screen*/}
      <Drawer.Screen name="[id]/edit" options={{ title: 'Edit Task', drawerItemStyle: { display: 'none' }, }}  />

      {/* Task Viewer*/}
      <Drawer.Screen name="tasks/[id]" options={{ title: 'View Task', drawerItemStyle: { display: 'none' }, }}  />

      {/* Task Adder*/}
      <Drawer.Screen name="tasks/add" options={{ title: 'Add Task', drawerItemStyle: { display: 'none' }, }}  />

      {/* Task Adder*/}
      <Drawer.Screen name="register" options={{ title: 'Register', drawerItemStyle: { display: 'none' }, }}  />

      {/*Admin User Tasks*/}
      <Drawer.Screen name="admin/tasks/[userId]/index" options={{ title: 'View Task for User', drawerItemStyle: { display: 'none' }, }}  />

      {/*Admin User Tasks*/}
        <Drawer.Screen name="admin/tasks/[userId]/[id]" options={{ title: 'View Task for User', drawerItemStyle: { display: 'none' }, }}  />

      <Drawer.Screen
        name="_necessary"
        options={{ drawerItemStyle: { display: 'none' } }}
      />


      

    </Drawer>
  );


  
}
