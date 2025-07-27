export const unstable_settings = {
  initialRouteName: 'tasks/index',   // or 'index' / '(tabs)' / any drawer screen
  statePersistence: false,
};

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
      <Drawer.Screen name="auth/login" options={{ title: 'Login' }} />

      {/* Logout screen we’ll add next */}
      <Drawer.Screen name="logout" options={{ title: 'Logout' }} />

      {/* Edit Screen*/}
      <Drawer.Screen name="[id]/edit" options={{ title: 'Edit Task', drawerItemStyle: { display: 'none' }, }}  />

      {/* Task Viewer*/}
      <Drawer.Screen name="tasks/[id]" options={{ title: 'View Task', drawerItemStyle: { display: 'none' }, }}  />

      {/* Task Adder*/}
      <Drawer.Screen name="tasks/add" options={{ title: 'Add Task', drawerItemStyle: { display: 'none' }, }}  />

      
      {/*Register*/}
      <Drawer.Screen name="register" options={{ title: 'Register', drawerItemStyle: { display: 'none' }, }}  />

      <Drawer.Screen
        name="_necessary"
        options={{ drawerItemStyle: { display: 'none' } }}
      />


      

    </Drawer>
  );


  
}
