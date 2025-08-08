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
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [pendingAction, setPendingAction] = useState<{ type: string; userId: number } | null>(null);
  const [currentUserInfo, setCurrentUserInfo] = useState<{ username?: string; email: string } | null>(null);
  
  // Admin registration form state
  const [showRegistrationForm, setShowRegistrationForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [registrationLoading, setRegistrationLoading] = useState(false);

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
        
        // Identify current user from JWT token
        const decoded = jwtDecode<{ sub: number; role: string }>(token);
        const currentUser = usersData.find((user: any) => user.id === decoded.sub);
        
        if (currentUser) {
          setCurrentUserId(currentUser.id);
          setCurrentUserInfo({
            username: currentUser.username,
            email: currentUser.email
          });
          
          // Filter out current user from the list
          const otherUsers = usersData.filter((user: any) => user.id !== currentUser.id);
          setUsers(otherUsers);
          
          // Set the first other user as selected by default
          if (otherUsers.length > 0) {
            setSelectedUserId(otherUsers[0].id);
          }
        } else {
          // Fallback: if current user not found, show all users
          setUsers(usersData);
          if (usersData.length > 0) {
            setSelectedUserId(usersData[0].id);
          }
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

  const handleChangePassword = async (userId: number, userDisplayName: string) => {
    try {
      const token = await getToken();
      if (!token) return;

      // Prompt for new password
      Alert.prompt(
        'Enter New Password',
        `Enter a new password for ${userDisplayName}:`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Change Password', 
            style: 'default', 
            onPress: async (newPassword) => {
              if (!newPassword || newPassword.trim().length < 6) {
                Alert.alert('Error', 'Password must be at least 6 characters long');
                return;
              }

              try {
                const response = await fetch(`${API_BASE}/admin/users/${userId}/change-password`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    newPassword: newPassword.trim(),
                  }),
                });

                if (response.ok) {
                  Alert.alert('Success', `Password changed successfully for ${userDisplayName}`);
                } else {
                  const errorText = await response.text();
                  Alert.alert('Error', errorText || 'Failed to change password');
                }
              } catch (error) {
                console.error('Error changing password:', error);
                Alert.alert('Error', 'Failed to change password');
              }
            }
          }
        ],
        'secure-text'
      );
    } catch (error) {
      console.error('Error in handleChangePassword:', error);
      Alert.alert('Error', 'Failed to change password');
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
        if (pendingAction.type === 'user-actions') {
          const selectedUser = getSelectedUser();
          if (!selectedUser) return;
          
          Alert.alert(
            'User Actions',
            `Choose an action for ${selectedUser.username ? selectedUser.username : selectedUser.email}:`,
            [
              { text: 'Cancel', style: 'cancel' },
              { 
                text: `Toggle Role (${selectedUser.role === 'EMPLOYEE' ? 'Make Admin' : 'Make Tasker'})`, 
                style: 'default', 
                onPress: () => {
                  Alert.alert(
                    'Toggle User Role',
                    `Are you sure you want to change ${selectedUser.username ? selectedUser.username : selectedUser.email}'s role from ${selectedUser.role === 'EMPLOYEE' ? 'tasker' : selectedUser.role} to ${selectedUser.role === 'ADMIN' ? 'tasker' : 'ADMIN'}?`,
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
              },
              { 
                text: 'Change Password', 
                style: 'default', 
                onPress: () => {
                  Alert.alert(
                    'Change User Password',
                    `Are you sure you want to change the password for ${selectedUser.username ? selectedUser.username : selectedUser.email}?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { 
                        text: 'Change Password', 
                        style: 'default', 
                        onPress: () => handleChangePassword(pendingAction.userId, selectedUser.username ? selectedUser.username : selectedUser.email) 
                      }
                    ]
                  );
                }
              },
              { 
                text: 'Delete User', 
                style: 'destructive', 
                onPress: () => {
                  Alert.alert(
                    'Delete User',
                    `Are you sure you want to delete ${selectedUser.username ? selectedUser.username : selectedUser.email}? This action cannot be undone and will also delete all their tasks.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { 
                        text: 'Delete', 
                        style: 'destructive', 
                        onPress: () => handleUserAction(pendingAction.userId, 'delete') 
                      }
                    ]
                  );
                }
              }
            ]
          );
        } else if (pendingAction.type === 'toggle-role') {
          Alert.alert(
            'Toggle User Role',
            `Are you sure you want to change ${selectedUser?.username ? selectedUser.username : selectedUser?.email}'s role from ${selectedUser?.role === 'EMPLOYEE' ? 'tasker' : selectedUser?.role} to ${selectedUser?.role === 'ADMIN' ? 'tasker' : 'ADMIN'}?`,
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

  const handleAdminRegister = async () => {
    if (!newUsername || !newEmail || !newPassword) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }

    // Show confirmation dialog before creating account
    Alert.alert(
      'Create Tasker Account',
      `Are you sure you want to create a new tasker account for ${newUsername} (${newEmail})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Create Account', 
          style: 'default', 
          onPress: async () => {
            setRegistrationLoading(true);
            try {
              const token = await getToken();
              if (!token) {
                Alert.alert('Error', 'Authentication required');
                return;
              }

              const response = await fetch(endpoints.register, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                  username: newUsername,
                  email: newEmail,
                  password: newPassword,
                }),
              });

              if (response.ok) {
                Alert.alert('Success', 'Tasker account created successfully');
                // Clear form
                setNewUsername('');
                setNewEmail('');
                setNewPassword('');
                setShowRegistrationForm(false);
                // Refresh the users list
                loadData();
              } else {
                const errorText = await response.text();
                Alert.alert('Error', errorText || 'Failed to create account');
              }
            } catch (error) {
              console.error('Error creating account:', error);
              Alert.alert('Error', 'Failed to create account');
            } finally {
              setRegistrationLoading(false);
            }
          }
        }
      ]
    );
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
            <Text style={styles.headerTitle}>
              User {currentUserInfo?.username || currentUserInfo?.email || 'Admin'}
            </Text>
            <Text style={styles.headerSubtitle}>Manage taskers and their tasks</Text>
          </View>
        </View>
      </View>

      {/* Scrollable Content Area */}
      <View style={styles.scrollContainer}>
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={true}
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
                <Text style={styles.dropdownLabel}>Select Tasker</Text>
                <View style={styles.dropdownContainer}>
                  {sortedUsers.map((user) => (
                    <Pressable
                      key={user.id}
                      style={({ pressed }) => [
                        styles.userListItem,
                        selectedUserId === user.id && styles.selectedUserListItem,
                        pressed && styles.userListItemPressed
                      ]}
                      onPress={() => handleUserSelect(user.id)}
                    >
                      <View style={styles.userListItemContent}>
                        <View style={styles.userListItemAvatar}>
                          <Ionicons 
                            name={user.role === 'ADMIN' ? 'shield-checkmark' : 'person'} 
                            size={20} 
                            color={user.role === 'ADMIN' ? '#0A84FF' : '#6c757d'} 
                          />
                        </View>
                        <View style={styles.userListItemDetails}>
                          <Text style={styles.userListItemName}>
                            {user.username || user.email}
                          </Text>
                          <View style={styles.userListItemRole}>
                            <View style={[
                              styles.roleBadge,
                              { backgroundColor: user.role === 'ADMIN' ? '#0A84FF20' : '#6c757d20' }
                            ]}>
                                                          <Text style={[
                              styles.userRole,
                              { color: user.role === 'ADMIN' ? '#0A84FF' : '#6c757d' }
                            ]}>
                              {user.role === 'EMPLOYEE' ? 'tasker' : user.role}
                            </Text>
                            </View>
                          </View>
                        </View>
                        {selectedUserId === user.id && (
                          <Ionicons name="checkmark-circle" size={24} color="#0A84FF" />
                        )}
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>

                          {/* Admin Registration Form */}
            <Pressable
              style={({ pressed }) => [
                showRegistrationForm ? styles.registrationSection : styles.registrationSectionCollapsed,
                pressed && styles.buttonPressed
              ]}
              onPress={() => setShowRegistrationForm(!showRegistrationForm)}
            >
                <View style={styles.registrationHeader}>
                  <Text style={styles.registrationTitle}>Add New Tasker</Text>
                  <View style={styles.toggleRegistrationButton}>
                    <Text style={styles.toggleRegistrationText}>
                      {showRegistrationForm ? '−' : '+'}
                    </Text>
                  </View>
                </View>

                {showRegistrationForm && (
                  <View style={styles.registrationForm}>
                    {/* Username Input */}
                    <View style={styles.formField}>
                      <Text style={styles.formLabel}>Username</Text>
                      <View style={styles.inputContainer}>
                        <Ionicons name="person-outline" size={20} color="#6c757d" style={styles.inputIcon} />
                        <TextInput
                          style={styles.textInput}
                          placeholder="Choose a username"
                          placeholderTextColor="#adb5bd"
                          autoCapitalize="none"
                          autoCorrect={false}
                          value={newUsername}
                          onChangeText={setNewUsername}
                        />
                      </View>
                    </View>

                    {/* Email Input */}
                    <View style={styles.formField}>
                      <Text style={styles.formLabel}>Email Address</Text>
                      <View style={styles.inputContainer}>
                        <Ionicons name="mail-outline" size={20} color="#6c757d" style={styles.inputIcon} />
                        <TextInput
                          style={styles.textInput}
                          placeholder="Enter email address"
                          placeholderTextColor="#adb5bd"
                          autoCapitalize="none"
                          keyboardType="email-address"
                          value={newEmail}
                          onChangeText={setNewEmail}
                        />
                      </View>
                    </View>

                    {/* Password Input */}
                    <View style={styles.formField}>
                      <Text style={styles.formLabel}>Password</Text>
                      <View style={styles.inputContainer}>
                        <Ionicons name="lock-closed-outline" size={20} color="#6c757d" style={styles.inputIcon} />
                        <TextInput
                          style={styles.textInput}
                          placeholder="Create a password"
                          placeholderTextColor="#adb5bd"
                          secureTextEntry
                          value={newPassword}
                          onChangeText={setNewPassword}
                        />
                      </View>
                    </View>

                    {/* Register Button */}
                    <Pressable
                      style={({ pressed }) => [
                        styles.registerButton,
                        pressed && styles.buttonPressed
                      ]}
                      onPress={handleAdminRegister}
                      disabled={registrationLoading}
                    >
                      {registrationLoading ? (
                        <ActivityIndicator color="white" size="small" />
                      ) : (
                        <>
                          <Ionicons name="person-add" size={18} color="white" />
                          <Text style={styles.registerButtonText}>Create Tasker Account</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                )}
            </Pressable>
              
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

      {/* Sticky User Actions Section */}
      {selectedUser && selectedUser.id !== currentUserId && (
        <View style={styles.stickyUserActions}>
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
                      {selectedUser.role === 'EMPLOYEE' ? 'tasker' : selectedUser.role}
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
                  setPendingAction({ type: 'user-actions', userId: selectedUser.id });
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
    scrollContainer: {
      flex: 1,
    },
    content: {
      flex: 1,
    },
    contentContainer: {
      paddingBottom: 250, // Increased padding to ensure content doesn't get hidden behind sticky panel
      minHeight: '120%', // Ensure content is always taller than screen to enable scrolling
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
      marginBottom: 12,
    },
    dropdownContainer: {
      backgroundColor: 'white',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#e9ecef',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
    userListItem: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: '#f8f9fa',
      minHeight: 64,
    },
    selectedUserListItem: {
      backgroundColor: '#0A84FF15',
      borderLeftWidth: 3,
      borderLeftColor: '#0A84FF',
    },
    userListItemPressed: {
      backgroundColor: '#f8f9fa',
      opacity: 0.8,
    },
    userListItemContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    userListItemAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: '#f8f9fa',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 16,
    },
    userListItemDetails: {
      flex: 1,
    },
    userListItemName: {
      fontSize: 16,
      fontWeight: '600',
      color: '#1a1a1a',
      marginBottom: 4,
    },
    userListItemRole: {
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
    stickyUserActions: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: 'white',
      borderTopWidth: 1,
      borderTopColor: '#e9ecef',
      paddingHorizontal: 20,
      paddingVertical: 16,
      paddingBottom: 80, // Increased padding to account for Android navigation buttons
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 8,
    },
    userCard: {
      backgroundColor: 'white',
      borderRadius: 16,
      padding: 20,
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
    advancedOptionsGear: {
      marginLeft: 16,
      padding: 8,
    },
    advancedOptionsGearPressed: {
      opacity: 0.7,
    },
    taskButtonsContainer: {
      flexDirection: 'row',
      gap: 16,
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
      paddingBottom: 200,
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
    registrationSection: {
      marginTop: 24,
      marginBottom: 24,
      backgroundColor: 'white',
      borderRadius: 16,
      padding: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
    registrationSectionCollapsed: {
      marginTop: 24,
      backgroundColor: 'white',
      borderRadius: 16,
      padding: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
    registrationHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
      minHeight: 48,
      paddingLeft: 17, // Align with user icons (20px container padding + 40px avatar width + 16px margin)
    },
    registrationTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: '#1a1a1a',
      lineHeight: 24,
    },
    toggleRegistrationButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      width: 48,
      height: 48,
    },
    toggleRegistrationText: {
      fontSize: 24,
      fontWeight: '600',
      color: '#0A84FF',
      textAlignVertical: 'center',
      lineHeight: 24,
      includeFontPadding: false,
      textAlign: 'center',
    },
    registrationForm: {
      width: '100%',
    },
    formField: {
      marginBottom: 16,
    },
    formLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: '#6c757d',
      marginBottom: 8,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#f8f9fa',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#e9ecef',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    inputIcon: {
      marginRight: 12,
    },
    textInput: {
      flex: 1,
      fontSize: 16,
      color: '#1a1a1a',
      paddingVertical: 0,
    },
    registerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#0A84FF',
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderRadius: 12,
      borderWidth: 1.5,
      minHeight: 56,
      gap: 8,
    },
    registerButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: 'white',
    },
  }); 