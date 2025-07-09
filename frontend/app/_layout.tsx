// app/(app)/_layout.tsx
import { Stack, router } from 'expo-router';
import { logout } from './logout';
import { Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

function HeaderLogin() {
  return (
    <Pressable
      onPress={() => router.push('/login')}
      style={{ paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}
    >
      <Ionicons name="log-in-outline" size={20} color="#007AFF" />
      <Text style={{ color: '#007AFF', marginLeft: 4 }}>Login</Text>
    </Pressable>
  );
}

function HeaderLogout() {
  return (
    <Pressable
      onPress={() => logout()}   // arrow keeps correct `this` + avoids lint warning
      style={{ paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}
    >
      <Ionicons name="log-out-outline" size={20} color="#007AFF" />
      <Text style={{ color: '#007AFF', marginLeft: 4 }}>Logout</Text>
    </Pressable>
  );
}

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerLeft:  () => <HeaderLogin />,   // 👈 appears on every screen
        headerRight: () => <HeaderLogout />,  // 👉 appears on every screen
      }}
    >
      <Stack.Screen name="tasks/index" options={{ title: 'My Tasks' }} />
      <Stack.Screen name="tasks/add"   options={{ title: 'Add Task'  }} />
    </Stack>
  );
}
