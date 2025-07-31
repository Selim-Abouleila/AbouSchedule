import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { isAdmin } from '../src/auth';
import { endpoints, API_BASE } from '../src/api';
import { getToken } from '../src/auth';

interface User {
  id: number;
  email: string;
  role: 'ADMIN' | 'EMPLOYEE';
}

export default function AdminPanel() {
  const [isUserAdmin, setIsUserAdmin] = useState<boolean | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    checkAdminStatus();
  }, []);

  const checkAdminStatus = async () => {
    try {
      const adminStatus = await isAdmin();
      setIsUserAdmin(adminStatus);
      
      if (!adminStatus) {
        Alert.alert('Access Denied', 'You do not have admin privileges.');
        router.replace('/tasks');
        return;
      }
      
      loadData();
    } catch (error) {
      console.error('Error checking admin status:', error);
      setIsUserAdmin(false);
    }
  };

  const loadData = async () => {
    try {
      const token = await getToken();
      if (!token) {
        router.replace('/auth/login');
        return;
      }

      // Load users
      const usersResponse = await fetch(`${API_BASE}/admin/users`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (usersResponse.ok) {
        const usersData = await usersResponse.json();
        setUsers(usersData);
      }
    } catch (error) {
      console.error('Error loading admin data:', error);
      Alert.alert('Error', 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleUserAction = async (userId: number, action: 'delete' | 'toggle-role') => {
    try {
      const token = await getToken();
      if (!token) return;

      const response = await fetch(`${API_BASE}/admin/users/${userId}/${action}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        Alert.alert('Success', `User ${action === 'delete' ? 'deleted' : 'role updated'} successfully`);
        loadData();
      } else {
        Alert.alert('Error', 'Failed to perform action');
      }
    } catch (error) {
      console.error('Error performing user action:', error);
      Alert.alert('Error', 'Failed to perform action');
    }
  };

  const handleViewTasks = (userId: number, userEmail: string) => {
    router.push(`/admin/tasks/${userId}`);
  };

  const handleAddTask = (userId: number, userEmail: string) => {
    router.push(`/admin/tasks/${userId}/add`);
  };

  if (isUserAdmin === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0A84FF" />
        <Text style={styles.loadingText}>Checking permissions...</Text>
      </View>
    );
  }

  if (!isUserAdmin) {
    return null; // Will redirect to tasks
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Ionicons name="shield-checkmark" size={32} color="#0A84FF" />
          <Text style={styles.headerTitle}>Admin Panel</Text>
        </View>
        <Text style={styles.headerSubtitle}>Manage users and their tasks</Text>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0A84FF" />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>User Management</Text>
            {users.map((user) => (
              <View key={user.id} style={styles.userCard}>
                <View style={styles.userInfo}>
                  <Ionicons 
                    name={user.role === 'ADMIN' ? 'shield-checkmark' : 'person'} 
                    size={24} 
                    color={user.role === 'ADMIN' ? '#0A84FF' : '#6c757d'} 
                  />
                  <View style={styles.userDetails}>
                    <Text style={styles.userEmail}>{user.email}</Text>
                    <Text style={[styles.userRole, { color: user.role === 'ADMIN' ? '#0A84FF' : '#6c757d' }]}>
                      {user.role}
                    </Text>
                  </View>
                </View>
                
                {/* Task Management Buttons */}
                <View style={styles.taskButtons}>
                  <Pressable
                    style={styles.taskButton}
                    onPress={() => handleViewTasks(user.id, user.email)}
                  >
                    <Ionicons name="eye" size={16} color="#0A84FF" />
                    <Text style={styles.taskButtonText}>View Tasks</Text>
                  </Pressable>
                  <Pressable
                    style={styles.taskButton}
                    onPress={() => handleAddTask(user.id, user.email)}
                  >
                    <Ionicons name="add" size={16} color="#28a745" />
                    <Text style={[styles.taskButtonText, { color: '#28a745' }]}>Add Task</Text>
                  </Pressable>
                </View>

                {/* User Management Buttons */}
                <View style={styles.userActions}>
                  <Pressable
                    style={styles.actionButton}
                    onPress={() => handleUserAction(user.id, 'toggle-role')}
                  >
                    <Ionicons name="swap-horizontal" size={16} color="#0A84FF" />
                    <Text style={styles.actionButtonText}>Toggle Role</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionButton, styles.deleteButton]}
                    onPress={() => {
                      Alert.alert(
                        'Delete User',
                        `Are you sure you want to delete ${user.email}?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => handleUserAction(user.id, 'delete') }
                        ]
                      );
                    }}
                  >
                    <Ionicons name="trash" size={16} color="#dc3545" />
                    <Text style={[styles.actionButtonText, styles.deleteButtonText]}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6c757d',
  },
  header: {
    backgroundColor: 'white',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    marginLeft: 12,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#6c757d',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  userCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  userDetails: {
    marginLeft: 12,
    flex: 1,
  },
  userEmail: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  userRole: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
  },
  taskButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  taskButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
    flex: 1,
    marginHorizontal: 4,
    justifyContent: 'center',
  },
  taskButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0A84FF',
    marginLeft: 4,
  },
  userActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0A84FF',
    marginLeft: 4,
  },
  deleteButton: {
    borderColor: '#dc3545',
  },
  deleteButtonText: {
    color: '#dc3545',
  },
}); 