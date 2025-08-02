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
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { isAdmin } from '../src/auth';
import { endpoints, API_BASE } from '../src/api';
import { getToken } from '../src/auth';
import { jwtDecode } from 'jwt-decode';

interface User {
  id: number;
  email: string;
  username?: string;
  role: 'ADMIN' | 'EMPLOYEE';
}

export default function AdminPanel() {
  const [isUserAdmin, setIsUserAdmin] = useState<boolean | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [pendingAction, setPendingAction] = useState<{ type: string; userId: number } | null>(null);

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
        // Set the first user as selected by default
        if (usersData.length > 0) {
          setSelectedUserId(usersData[0].id);
        }
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

  const getSelectedUser = () => {
    return users.find(user => user.id === selectedUserId);
  };

  const handleUserSelect = (userId: number) => {
    setSelectedUserId(userId);
    setShowUserModal(false);
  };

  const verifyPassword = async (inputPassword: string) => {
    try {
      const token = await getToken();
      if (!token) return false;

      // Get the current user's information from the admin users endpoint
      const usersResponse = await fetch(`${API_BASE}/admin/users`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!usersResponse.ok) {
        console.error('Failed to fetch users');
        return false;
      }

      const users = await usersResponse.json();
      
      // Find the current user by matching the JWT sub with user id
      const decoded = jwtDecode<{ sub: number; role: string }>(token);
      const currentUser = users.find((user: any) => user.id === decoded.sub);
      
      if (!currentUser) {
        console.error('Current user not found');
        return false;
      }

      // Use the same login endpoint to verify the password
      const response = await fetch(endpoints.login, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          email: currentUser.email, 
          password: inputPassword 
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('Error verifying password:', error);
      return false;
    }
  };

  const handlePasswordSubmit = async () => {
    if (!password.trim()) {
      Alert.alert('Error', 'Please enter your password');
      return;
    }

    const isValid = await verifyPassword(password);
    if (isValid) {
      setShowPasswordModal(false);
      setPassword('');
      
      // Execute the pending action
      if (pendingAction) {
        if (pendingAction.type === 'toggle-role') {
          Alert.alert(
            'Toggle User Role',
            `Are you sure you want to change ${selectedUser?.username ? selectedUser.username : selectedUser?.email}'s role from ${selectedUser?.role === 'EMPLOYEE' ? 'USER' : selectedUser?.role} to ${selectedUser?.role === 'ADMIN' ? 'USER' : 'ADMIN'}?`,
            [
              { text: 'Cancel', style: 'cancel' },
              { 
                text: 'Toggle', 
                style: 'default', 
                onPress: () => handleUserAction(pendingAction.userId, 'toggle-role') 
              }
            ]
          );
        }
        setPendingAction(null);
      }
    } else {
      Alert.alert('Error', 'Incorrect password. Please try again.');
      setPassword('');
    }
  };

  const sortedUsers = users.sort((a, b) => {
    // Sort by role first (EMPLOYEE before ADMIN), then by name
    if (a.role !== b.role) {
      return a.role === 'EMPLOYEE' ? -1 : 1;
    }
    // If same role, sort by name
    const aName = a.username || a.email;
    const bName = b.username || b.email;
    return aName.localeCompare(bName);
  });

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

  const selectedUser = getSelectedUser();

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
            {/* User Selection Dropdown */}
            <View style={styles.dropdownSection}>
              <Text style={styles.dropdownLabel}>Select User</Text>
              <View style={styles.dropdownContainer}>
                <Pressable
                  style={({ pressed }) => [
                    styles.dropdownButton,
                    pressed && styles.dropdownButtonPressed
                  ]}
                  onPress={() => setShowUserModal(!showUserModal)}
                >
                  <View style={styles.dropdownButtonContent}>
                    {selectedUser ? (
                      <>
                        <View style={styles.dropdownUserInfo}>
                          <View style={styles.dropdownUserAvatar}>
                            <Ionicons 
                              name={selectedUser.role === 'ADMIN' ? 'shield-checkmark' : 'person'} 
                              size={20} 
                              color={selectedUser.role === 'ADMIN' ? '#0A84FF' : '#6c757d'} 
                            />
                          </View>
                          <View style={styles.dropdownUserDetails}>
                            <Text style={styles.dropdownUserName}>
                              {selectedUser.username || selectedUser.email}
                            </Text>
                          </View>
                        </View>
                        <Ionicons 
                          name={showUserModal ? "chevron-up" : "chevron-down"} 
                          size={20} 
                          color="#6c757d" 
                        />
                      </>
                    ) : (
                      <>
                        <Text style={styles.dropdownPlaceholder}>Select a user...</Text>
                        <Ionicons name="chevron-down" size={20} color="#6c757d" />
                      </>
                    )}
                  </View>
                </Pressable>

                {/* Quick Dropdown List */}
                {showUserModal && (
                  <View style={styles.quickDropdownList}>
                    <ScrollView 
                      style={styles.quickDropdownScrollView}
                      showsVerticalScrollIndicator={false}
                      nestedScrollEnabled={true}
                    >
                      {sortedUsers.map((user) => (
                        <Pressable
                          key={user.id}
                          style={({ pressed }) => [
                            styles.quickDropdownItem,
                            selectedUserId === user.id && styles.selectedQuickDropdownItem,
                            pressed && styles.quickDropdownItemPressed
                          ]}
                          onPress={() => handleUserSelect(user.id)}
                        >
                          <View style={styles.quickDropdownItemContent}>
                            <View style={styles.quickDropdownAvatar}>
                              <Ionicons 
                                name={user.role === 'ADMIN' ? 'shield-checkmark' : 'person'} 
                                size={14} 
                                color={user.role === 'ADMIN' ? '#0A84FF' : '#6c757d'} 
                              />
                            </View>
                            <Text style={styles.quickDropdownName}>
                              {user.username || user.email}
                            </Text>
                            {selectedUserId === user.id && (
                              <Ionicons name="checkmark" size={16} color="#0A84FF" />
                            )}
                          </View>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            </View>
            
            {/* Selected User Actions */}
            {selectedUser && (
              <View style={styles.selectedUserSection}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>User Actions</Text>
                  <Text style={styles.sectionSubtitle}>
                    Managing: {selectedUser.username ? selectedUser.username : selectedUser.email}
                  </Text>
                </View>

                {/* User Info Card */}
                <View style={styles.userCard}>
                  <View style={styles.userInfoSection}>
                    <View style={styles.userAvatar}>
                      <Ionicons 
                        name={selectedUser.role === 'ADMIN' ? 'shield-checkmark' : 'person'} 
                        size={20} 
                        color={selectedUser.role === 'ADMIN' ? '#0A84FF' : '#6c757d'} 
                      />
                    </View>
                    <View style={styles.userDetails}>
                      <Text style={styles.userEmail}>
                        {selectedUser.username || selectedUser.email}
                      </Text>
                      <View style={styles.roleContainer}>
                        <View style={[
                          styles.roleBadge,
                          { backgroundColor: selectedUser.role === 'ADMIN' ? '#0A84FF20' : '#6c757d20' }
                        ]}>
                          <Text style={[
                            styles.userRole,
                            { color: selectedUser.role === 'ADMIN' ? '#0A84FF' : '#6c757d' }
                          ]}>
                            {selectedUser.role === 'EMPLOYEE' ? 'USER' : selectedUser.role}
                          </Text>
                        </View>
                      </View>
                    </View>
                    
                    {/* Advanced Options Gear Icon */}
                    <Pressable
                      style={({ pressed }) => [
                        styles.advancedOptionsGear,
                        pressed && styles.advancedOptionsGearPressed
                      ]}
                      onPress={() => {
                        setPendingAction({ type: 'toggle-role', userId: selectedUser.id });
                        setShowPasswordModal(true);
                      }}
                    >
                      <Ionicons name="settings-outline" size={16} color="#6c757d" />
                    </Pressable>
                  </View>
                  
                  {/* Task Management Buttons */}
                  <View style={styles.taskButtonsContainer}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.taskButton,
                        styles.addTaskButton,
                        pressed && styles.buttonPressed
                      ]}
                      onPress={() => handleAddTask(selectedUser.id, selectedUser.email, selectedUser.username)}
                    >
                      <Ionicons name="add-circle-outline" size={18} color="#28a745" />
                      <Text style={styles.addTaskButtonText}>Add Task</Text>
                    </Pressable>
                    
                    <Pressable
                      style={({ pressed }) => [
                        styles.taskButton,
                        styles.viewTasksButton,
                        pressed && styles.buttonPressed
                      ]}
                      onPress={() => handleViewTasks(selectedUser.id, selectedUser.email)}
                    >
                      <Ionicons name="eye-outline" size={18} color="#0A84FF" />
                      <Text style={styles.viewTasksButtonText}>View / Edit Tasks</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}
            
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

              {/* Password Verification Modal */}
      {showPasswordModal && (
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
          >
            <View style={styles.passwordModal}>
              <View style={styles.passwordModalHeader}>
                <Text style={styles.passwordModalTitle}>Admin Verification</Text>
                <Text style={styles.passwordModalSubtitle}>Enter your password to continue</Text>
              </View>
              
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter your password"
                secureTextEntry={true}
                value={password}
                onChangeText={setPassword}
                autoFocus={true}
                onSubmitEditing={handlePasswordSubmit}
              />
              
              <View style={styles.passwordModalButtons}>
                <Pressable
                  style={({ pressed }) => [
                    styles.passwordModalButton,
                    styles.cancelButton,
                    pressed && styles.buttonPressed
                  ]}
                  onPress={() => {
                    setShowPasswordModal(false);
                    setPassword('');
                    setPendingAction(null);
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                
                <Pressable
                  style={({ pressed }) => [
                    styles.passwordModalButton,
                    styles.confirmButton,
                    pressed && styles.buttonPressed
                  ]}
                  onPress={handlePasswordSubmit}
                >
                  <Text style={styles.confirmButtonText}>Verify</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}
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
    dropdownSection: {
      marginBottom: 24,
    },
    dropdownLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: '#1a1a1a',
      marginBottom: 8,
    },
    dropdownContainer: {
      position: 'relative',
    },
    dropdownButton: {
      backgroundColor: 'white',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#e9ecef',
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    dropdownButtonPressed: {
      opacity: 0.7,
      backgroundColor: '#f8f9fa',
    },
    dropdownButtonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    dropdownUserInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    dropdownUserAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: '#f8f9fa',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    dropdownUserDetails: {
      flex: 1,
    },
    dropdownUserName: {
      fontSize: 18,
      fontWeight: '700',
      color: '#1a1a1a',
    },
    dropdownUserEmail: {
      fontSize: 14,
      color: '#6c757d',
      marginTop: 2,
    },
    dropdownPlaceholder: {
      fontSize: 16,
      color: '#6c757d',
      flex: 1,
    },
    quickDropdownList: {
      position: 'absolute',
      top: '100%', // Position below the button
      left: 0,
      right: 0,
      backgroundColor: 'white',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#e9ecef',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
      zIndex: 1, // Ensure it's above other content
    },
    quickDropdownScrollView: {
      maxHeight: 200, // Limit the height of the scrollable list
    },
    quickDropdownItem: {
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: '#f8f9fa',
    },
    selectedQuickDropdownItem: {
      backgroundColor: '#0A84FF10',
    },
    quickDropdownItemPressed: {
      backgroundColor: '#f8f9fa',
    },
    quickDropdownItemContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    quickDropdownAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: '#f8f9fa',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    quickDropdownName: {
      fontSize: 18,
      fontWeight: '700',
      color: '#1a1a1a',
    },
    selectedUserSection: {
      marginTop: 8,
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
      padding: 24,
      marginBottom: 20,
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
      fontSize: 20,
      fontWeight: '700',
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
    advancedOptionsGear: {
      marginLeft: 16, // Space between user details and gear
      padding: 8, // Make it easier to press
    },
    advancedOptionsGearPressed: {
      opacity: 0.7,
    },
    taskButtonsContainer: {
      flexDirection: 'row',
      gap: 16,
      marginBottom: 16,
    },
    taskButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderRadius: 12,
      borderWidth: 1.5,
      minHeight: 56,
      gap: 4,
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
      fontSize: 16,
      fontWeight: '600',
      color: '#0A84FF',
      marginLeft: 0,
      textAlign: 'center',
    },
    addTaskButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#28a745',
      marginLeft: 8,
      textAlign: 'center',
    },
    advancedOptionsSection: {
      marginTop: 8,
    },
    advancedOptionsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: '#f8f9fa',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#e9ecef',
    },
    advancedOptionsHeaderPressed: {
      backgroundColor: '#e9ecef',
    },
    advancedOptionsHeaderContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    advancedOptionsTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: '#6c757d',
      marginLeft: 8,
    },
    advancedOptionsContent: {
      marginTop: 12,
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
    modalOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 10,
      paddingTop: 0,
      paddingBottom: 200, // Push content up from bottom
    },
    passwordModal: {
      backgroundColor: 'white',
      borderRadius: 16,
      padding: 24,
      width: '85%',
      maxWidth: 400,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 10,
      elevation: 10,
    },
    passwordModalHeader: {
      alignItems: 'center',
      marginBottom: 20,
    },
    passwordModalTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: '#1a1a1a',
      marginBottom: 4,
    },
    passwordModalSubtitle: {
      fontSize: 14,
      color: '#6c757d',
      textAlign: 'center',
    },
    passwordInput: {
      width: '100%',
      height: 50,
      borderWidth: 1,
      borderColor: '#e9ecef',
      borderRadius: 12,
      paddingHorizontal: 16,
      fontSize: 16,
      color: '#1a1a1a',
      marginBottom: 20,
    },
    passwordModalButtons: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      width: '100%',
    },
    passwordModalButton: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#0A84FF',
    },
    cancelButton: {
      backgroundColor: '#f8f9fa',
      borderColor: '#e9ecef',
    },
    confirmButton: {
      backgroundColor: '#0A84FF',
    },
    cancelButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#0A84FF',
    },
    confirmButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: 'white',
    },
  }); 