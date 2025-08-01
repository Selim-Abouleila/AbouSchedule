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
  username?: string;
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

  const handleAddTask = (userId: number, userEmail: string, username?: string) => {
    const userDisplayName = username || userEmail;
    router.push({
      pathname: `/admin/tasks/add`,
      params: { userId: userId.toString(), userDisplayName }
    });
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
          <View style={styles.headerIconContainer}>
            <Ionicons name="shield-checkmark" size={28} color="#0A84FF" />
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>Admin Panel</Text>
            <Text style={styles.headerSubtitle}>Manage users and their tasks</Text>
          </View>
        </View>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0A84FF" />
            <Text style={styles.loadingText}>Loading users...</Text>
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>User Management</Text>
              <Text style={styles.sectionSubtitle}>{users.length} user{users.length !== 1 ? 's' : ''}</Text>
            </View>
            
            {users.map((user) => (
              <View key={user.id} style={styles.userCard}>
                {/* User Info Section */}
                <View style={styles.userInfoSection}>
                  <View style={styles.userAvatar}>
                    <Ionicons 
                      name={user.role === 'ADMIN' ? 'shield-checkmark' : 'person'} 
                      size={20} 
                      color={user.role === 'ADMIN' ? '#0A84FF' : '#6c757d'} 
                    />
                  </View>
                  <View style={styles.userDetails}>
                                         <Text style={styles.userEmail}>
                       {user.username ? `${user.username} (${user.email})` : user.email}
                     </Text>
                     <View style={styles.roleContainer}>
                       <View style={[
                         styles.roleBadge,
                         { backgroundColor: user.role === 'ADMIN' ? '#0A84FF20' : '#6c757d20' }
                       ]}>
                         <Text style={[
                           styles.userRole,
                           { color: user.role === 'ADMIN' ? '#0A84FF' : '#6c757d' }
                         ]}>
                                                       {user.role === 'EMPLOYEE' ? 'USER' : user.role}
                         </Text>
                       </View>
                     </View>
                  </View>
                </View>
                
                {/* Task Management Buttons */}
                <View style={styles.taskButtonsContainer}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.taskButton,
                      styles.viewTasksButton,
                      pressed && styles.buttonPressed
                    ]}
                    onPress={() => handleViewTasks(user.id, user.email)}
                  >
                    <Ionicons name="eye-outline" size={18} color="#0A84FF" />
                    <Text style={styles.viewTasksButtonText}>View / Edit Tasks</Text>
                  </Pressable>
                  
                  <Pressable
                    style={({ pressed }) => [
                      styles.taskButton,
                      styles.addTaskButton,
                      pressed && styles.buttonPressed
                    ]}
                    onPress={() => handleAddTask(user.id, user.email, user.username)}
                  >
                    <Ionicons name="add-circle-outline" size={18} color="#28a745" />
                    <Text style={styles.addTaskButtonText}>Add Task</Text>
                  </Pressable>
                </View>

                {/* User Management Buttons */}
                <View style={styles.userActionsContainer}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.actionButton,
                      styles.toggleRoleButton,
                      pressed && styles.buttonPressed
                    ]}
                                         onPress={() => {
                       Alert.alert(
                         'Toggle User Role',
                                                   `Are you sure you want to change ${user.username ? user.username : user.email}'s role from ${user.role === 'EMPLOYEE' ? 'USER' : user.role} to ${user.role === 'ADMIN' ? 'USER' : 'ADMIN'}?`,
                         [
                           { text: 'Cancel', style: 'cancel' },
                           { 
                             text: 'Toggle', 
                             style: 'default', 
                             onPress: () => handleUserAction(user.id, 'toggle-role') 
                           }
                         ]
                       );
                     }}
                  >
                    <Ionicons name="swap-horizontal-outline" size={18} color="#0A84FF" />
                    <Text style={styles.toggleRoleButtonText}>Toggle Role</Text>
                  </Pressable>
                  
                  <Pressable
                    style={({ pressed }) => [
                      styles.actionButton,
                      styles.deleteButton,
                      pressed && styles.buttonPressed
                    ]}
                    onPress={() => {
                      Alert.alert(
                        'Delete User',
                        `Are you sure you want to delete ${user.username ? user.username : user.email}? This action cannot be undone.`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { 
                            text: 'Delete', 
                            style: 'destructive', 
                            onPress: () => {
                              // Second confirmation dialog
                              Alert.alert(
                                'Final Confirmation',
                                `This is your final warning. Are you absolutely sure you want to permanently delete ${user.username ? user.username : user.email}? This action cannot be undone and all their data will be lost.`,
                                [
                                  { text: 'Cancel', style: 'cancel' },
                                  { 
                                    text: 'Yes, Delete Permanently', 
                                    style: 'destructive', 
                                    onPress: () => handleUserAction(user.id, 'delete') 
                                  }
                                ]
                              );
                            }
                          }
                        ]
                      );
                    }}
                  >
                    <Ionicons name="trash-outline" size={18} color="#dc3545" />
                    <Text style={styles.deleteButtonText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            
            {users.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color="#6c757d" />
                <Text style={styles.emptyStateTitle}>No Users Found</Text>
                <Text style={styles.emptyStateSubtitle}>Users will appear here once they register</Text>
              </View>
            )}
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
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6c757d',
    textAlign: 'center',
  },
  header: {
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0A84FF10',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6c757d',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 20,
  },
  sectionHeader: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6c757d',
  },
  userCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  userInfoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  userDetails: {
    flex: 1,
  },
  userEmail: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 6,
  },
  roleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  userRole: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  taskButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  taskButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    minHeight: 48,
  },
  viewTasksButton: {
    backgroundColor: '#0A84FF10',
    borderColor: '#0A84FF30',
  },
  addTaskButton: {
    backgroundColor: '#28a74510',
    borderColor: '#28a74530',
  },
  viewTasksButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0A84FF',
    marginLeft: 8,
  },
  addTaskButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#28a745',
    marginLeft: 8,
  },
  userActionsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    minHeight: 48,
  },
  toggleRoleButton: {
    backgroundColor: '#0A84FF10',
    borderColor: '#0A84FF30',
  },
  deleteButton: {
    backgroundColor: '#dc354510',
    borderColor: '#dc354530',
  },
  toggleRoleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0A84FF',
    marginLeft: 8,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dc3545',
    marginLeft: 8,
  },
  buttonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
    lineHeight: 20,
  },
}); 