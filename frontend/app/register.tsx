import { useState } from 'react';
import { View, TextInput, Button, Alert, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { endpoints } from '../src/api';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPw] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!email || !password) {
      Alert.alert('Fill both fields'); return;
    }
    setLoading(true);
    try {
      const res = await fetch(endpoints.register, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || res.status.toString());
      }
      Alert.alert('Account created. Log in now.');
      router.replace('auth/login');
    } catch (e: any) {
      Alert.alert('Sign-up failed', e.message);
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
      <Button title={loading ? '...' : 'Register'} onPress={handleRegister} />
      <View style={{ height: 20 }} />
      <Button
        title="I already have an account"
        onPress={() => router.replace('/login')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: 24 },
  input: { borderWidth: 1, padding: 12, marginBottom: 12, borderRadius: 6 },
});
