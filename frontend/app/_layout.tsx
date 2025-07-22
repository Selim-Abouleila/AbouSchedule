// app/(app)/_layout.tsx
import { Drawer } from 'expo-router/drawer';
import { DrawerToggleButton } from '@react-navigation/drawer';
import { logout } from './logout';          // your helper

/* ───────── drawer layout ───────── */
export default function AppDrawerLayout() {
  return (
    <Drawer
      screenOptions={{
        drawerType: 'slide',
        headerLeft: () => <DrawerToggleButton />,   // hamburger
      }}
    >
      {/* TASKS stack (index + add) */}
      <Drawer.Screen
        name="tasks/index"               // ← existing list screen
        options={{ title: 'Tasks' }}
      />

      {/* SETTINGS page (make the file below) */}
      <Drawer.Screen
        name="settings"
        options={{ title: 'Settings' }}
      />

      {/* LOGIN screen (already exists at /login) */}
      <Drawer.Screen
        name="../login"                  // step up one folder
        options={{ title: 'Login' }}
      />

      {/* LOGOUT pseudo‑screen that runs the action then leaves */}
      <Drawer.Screen
        name="logout"
        options={{ title: 'Logout' }}
      />
    </Drawer>
  );
}
