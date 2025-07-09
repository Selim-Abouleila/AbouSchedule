import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,      // hide native headers
        animation: 'slide_from_right', // nice default Android/iOS slide-in
      }}
    >
      {/* No need to list screens manually; any file in this folder
          that's not prefixed with "_" becomes a route automatically. */}
    </Stack>
  );
}
