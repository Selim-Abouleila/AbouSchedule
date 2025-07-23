// app/(app)/_layout.tsx
import { Drawer } from 'expo-router/drawer';
import { DrawerToggleButton } from '@react-navigation/drawer';

export default function AppDrawerLayout() {
  return (
    <Drawer
      screenOptions={{
        drawerType: 'slide',
        headerLeft: () => <DrawerToggleButton />, // hamburger icon
      }}
    >
      {/* TASK list (and nested add / detail) */}
      <Drawer.Screen name="tasks/index" options={{ title: 'Tasks' }} />

      {/* Settings page */}
      <Drawer.Screen name="settings" options={{ title: 'Settings' }} />

      {/* Login lives one level up (app/login.tsx) */}
      <Drawer.Screen name="login" options={{ title: 'Login' }} />

      {/* Logout screen we’ll add next */}
      <Drawer.Screen name="logout" options={{ title: 'Logout' }} />

      {/* ─── HIDDEN routes ─── */}
      <Drawer.Screen
        name="register"
        options={{ drawerItemStyle: { display: 'none' } }}
      />

      <Drawer.Screen
        name="tasks/add"
        options={{ drawerItemStyle: { display: 'none' } }}
      />

      <Drawer.Screen
        name="_necessary"
        options={{ drawerItemStyle: { display: 'none' } }}
      />

      <Drawer.Screen
        name="tasks/[id]"
        options={{ drawerItemStyle: { display: 'none' } }}
      />

    </Drawer>
  );


  
}
