import { useState } from 'react';
import {
  View,
  TextInput,
  Button,
  Alert,
  StyleSheet,
  Pressable,
  Text,
} from 'react-native';
import { router } from 'expo-router';
import { endpoints } from '../src/api';
import { saveToken } from '../src/auth';

export default function Login() {
  const [email, setEmail]     = useState('');
  const [password, setPw]     = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Please fill both fields');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(endpoints.login, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error('Bad credentials');
      const { token } = await res.json();
      await saveToken(token);
      router.replace('/tasks');           // go to tasks
    } catch (e: any) {
      Alert.alert('Login failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <TextInput
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
      />
      <TextInput
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPw}
        style={styles.input}
      />

      {/* Log‑in action */}
      <Button title={loading ? '...' : 'Log in'} onPress={handleLogin} />

      {/* Create‑account link */}
      <View style={{ height: 20 }} />
      <Button title="Create an account" onPress={() => router.push('/register')} />

      {/* Back button */}
      <View style={{ height: 20 }} />
      <Button title="← Back" onPress={() => router.back()} />

    </View>
  );
}

const styles = StyleSheet.create({
  wrap:  { flex: 1, justifyContent: 'center', padding: 24 },
  input: { borderWidth: 1, padding: 12, marginBottom: 12, borderRadius: 6 },
});
