import { useState } from 'react';
import {
  View,
  TextInput,
  Alert,
  StyleSheet,
  Pressable,
  Text,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { endpoints } from '../../src/api';
import { saveToken } from '../../src/auth';

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
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#f8f9fa' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header Section */}
        <View style={{
          backgroundColor: 'white',
          padding: 24,
          borderRadius: 16,
          marginBottom: 24,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 4,
        }}>
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <View style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: '#0A84FF',
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: 16,
              shadowColor: '#0A84FF',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 6,
            }}>
              <Ionicons name="person" size={32} color="white" />
            </View>
            <Text style={{
              fontSize: 28,
              fontWeight: '700',
              color: '#1a1a1a',
              marginBottom: 8,
            }}>
              Welcome Back
            </Text>
            <Text style={{
              fontSize: 16,
              color: '#6c757d',
              textAlign: 'center',
              lineHeight: 22,
            }}>
              Sign in to your account to continue
            </Text>
          </View>

          {/* Form Section */}
          <View style={{ marginBottom: 24 }}>
            {/* Email Input */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{
                fontSize: 14,
                fontWeight: '600',
                color: '#495057',
                marginBottom: 8,
              }}>
                Email Address
              </Text>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: '#e9ecef',
                borderRadius: 12,
                backgroundColor: '#f8f9fa',
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}>
                <Ionicons name="mail-outline" size={20} color="#6c757d" style={{ marginRight: 12 }} />
                <TextInput
                  placeholder="Enter your email"
                  placeholderTextColor="#adb5bd"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  style={{
                    flex: 1,
                    fontSize: 16,
                    color: '#1a1a1a',
                  }}
                />
              </View>
            </View>

            {/* Password Input */}
            <View style={{ marginBottom: 24 }}>
              <Text style={{
                fontSize: 14,
                fontWeight: '600',
                color: '#495057',
                marginBottom: 8,
              }}>
                Password
              </Text>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: '#e9ecef',
                borderRadius: 12,
                backgroundColor: '#f8f9fa',
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}>
                <Ionicons name="lock-closed-outline" size={20} color="#6c757d" style={{ marginRight: 12 }} />
                <TextInput
                  placeholder="Enter your password"
                  placeholderTextColor="#adb5bd"
                  secureTextEntry
                  value={password}
                  onChangeText={setPw}
                  style={{
                    flex: 1,
                    fontSize: 16,
                    color: '#1a1a1a',
                  }}
                />
              </View>
            </View>

            {/* Login Button */}
            <Pressable
              onPress={handleLogin}
              disabled={loading}
              style={({ pressed }) => ({
                backgroundColor: '#0A84FF',
                borderRadius: 12,
                paddingVertical: 16,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.8 : 1,
                shadowColor: '#0A84FF',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 6,
              })}
            >
              {loading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: 'white',
                }}>
                  Sign In
                </Text>
              )}
            </Pressable>
          </View>
        </View>

        {/* Action Buttons Section */}
        <View style={{
          backgroundColor: 'white',
          padding: 20,
          borderRadius: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 4,
        }}>
          {/* Create Account Button */}
          <Pressable
            onPress={() => router.push('/register')}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 14,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#0A84FF',
              backgroundColor: 'transparent',
              opacity: pressed ? 0.7 : 1,
              marginBottom: 12,
            })}
          >
            <Ionicons name="person-add-outline" size={18} color="#0A84FF" style={{ marginRight: 8 }} />
            <Text style={{
              fontSize: 16,
              fontWeight: '600',
              color: '#0A84FF',
            }}>
              Create an Account
            </Text>
          </Pressable>

          {/* Back Button */}
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 14,
              borderRadius: 12,
              backgroundColor: '#f8f9fa',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="arrow-back" size={18} color="#6c757d" style={{ marginRight: 8 }} />
            <Text style={{
              fontSize: 16,
              fontWeight: '600',
              color: '#6c757d',
            }}>
              Go Back
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
