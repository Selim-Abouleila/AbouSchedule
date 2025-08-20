import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, BackHandler } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getSettings, saveSettings, getSettingsForUser, getUserSettings } from '../src/settings';
import { getToken, getCurrentUserId } from '../src/auth';
import { endpoints, API_BASE } from '../src/api';

interface User {
  id: number;
  email: string;
  username?: string;
  role: string;
}

export default function Settings() {
  const [defaultLabelDone, setDefaultLabelDone] = useState(true);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [showUserSelector, setShowUserSelector] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  // Admin registration form state
  const [showRegistrationForm, setShowRegistrationForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [registrationLoading, setRegistrationLoading] = useState(false);
  
  // Refs for form navigation
  const emailInputRef = React.useRef<TextInput>(null);
  const passwordInputRef = React.useRef<TextInput>(null);

  useEffect(() => {
    loadSettings();
    checkAdminStatus();
  }, [selectedUserId]);

  // Android back button handler - prevents default back behavior to stay on same page
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      return true; // Prevent default back behavior - stay on same page
    });

    return () => backHandler.remove();
  }, []);

  const checkAdminStatus = async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`${API_BASE}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const usersData = await res.json();
        setUsers(usersData);
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
      setIsAdmin(false);
    }
  };

  const loadSettings = async () => {
    try {
      if (isAdmin && selectedUserId !== null) {
        // Admin mode: load settings for selected user
        const settings = await getSettingsForUser(selectedUserId);
        setDefaultLabelDone(settings.defaultLabelDone);
      } else if (!isAdmin) {
        // Regular user mode: load settings for current user
        const currentUserId = await getCurrentUserId();
        const settings = await getSettingsForUser(currentUserId || undefined);
        setDefaultLabelDone(settings.defaultLabelDone);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleDefaultLabelDone = async () => {
    const newValue = !defaultLabelDone;
    setDefaultLabelDone(newValue);
    await saveSettings({ defaultLabelDone: newValue }, selectedUserId || undefined);
  };

  const handleUserSelect = async (userId: number | null) => {
    // If clicking on the same user, deselect them
    if (selectedUserId === userId) {
      setSelectedUserId(null);
      setShowUserSelector(false);
      return;
    }
    
    setSelectedUserId(userId);
    setShowUserSelector(false);
    await loadSettings();
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
                await checkAdminStatus();
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

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading settings...</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <Text style={styles.title}>Settings</Text>
        
        {/* Admin User Selector and User Settings (combined in one box) */}
        {isAdmin && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="people-outline" size={24} color="#0A84FF" />
              <Text style={styles.sectionTitle}>Manage User Settings</Text>
            </View>
            
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Select User</Text>
                <Text style={styles.settingDescription}>
                  Choose a user to customize their default task settings
                </Text>
              </View>
              <Pressable
                style={styles.userSelectorButton}
                onPress={() => setShowUserSelector(!showUserSelector)}
              >
                <Text style={styles.userSelectorText}>
                  {selectedUserId ? 
                    users.find(u => u.id === selectedUserId)?.username || 
                    users.find(u => u.id === selectedUserId)?.email || 
                    `User ${selectedUserId}` : 
                    'Choose User'
                  }
                </Text>
                <Ionicons 
                  name={showUserSelector ? "chevron-up" : "chevron-down"} 
                  size={16} 
                  color="#0A84FF" 
                />
              </Pressable>
            </View>

            {showUserSelector && (
              <View style={styles.userList}>
                {users
                  .filter(user => user.role === 'EMPLOYEE')
                  .map((user) => (
                  <Pressable
                    key={user.id}
                    style={[styles.userItem, selectedUserId === user.id && styles.selectedUserItem]}
                    onPress={() => handleUserSelect(user.id)}
                  >
                    <Text style={[styles.userItemText, selectedUserId === user.id && styles.selectedUserItemText]}>
                      {user.username || user.email}
                    </Text>
                    <Text style={styles.userRoleText}>
                      {user.role === 'EMPLOYEE' ? 'USER' : user.role}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* User-specific settings toggle (only shown when user is selected) */}
            {selectedUserId && (
              <>
                <View style={[styles.settingRow, { marginTop: 20 }]}>
                  <View style={styles.settingInfo}>
                    <Text style={styles.settingLabel}>Default "Label Done" Setting</Text>
                    <Text style={styles.settingDescription}>
                      When creating new tasks, this will be the default value for the "Tasker can label done" option for the selected user.
                    </Text>
                  </View>
                  <Pressable
                    onPress={toggleDefaultLabelDone}
                    style={[
                      styles.toggle,
                      { backgroundColor: defaultLabelDone ? "#0A84FF" : "#CCC" }
                    ]}
                  >
                    <View
                      style={[
                        styles.toggleThumb,
                        { alignSelf: defaultLabelDone ? "flex-end" : "flex-start" }
                      ]}
                    />
                  </Pressable>
                </View>
              </>
            )}
          </View>
        )}

                 {/* Admin Registration Form */}
         {isAdmin && (
           <View style={styles.section}>
                           <View style={showRegistrationForm ? styles.registrationSection : styles.registrationSectionCollapsed}>
                <View style={styles.registrationHeader}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.registrationTitleContainer,
                      pressed && styles.buttonPressed
                    ]}
                    onPress={() => setShowRegistrationForm(!showRegistrationForm)}
                  >
                    <Text style={styles.registrationTitle}>Add New Tasker</Text>
                  </Pressable>
                 <Pressable
                   style={({ pressed }) => [
                     styles.toggleRegistrationButton,
                     pressed && styles.buttonPressed
                   ]}
                   onPress={() => setShowRegistrationForm(!showRegistrationForm)}
                 >
                   <Text style={styles.toggleRegistrationText}>
                     {showRegistrationForm ? '−' : '+'}
                   </Text>
                 </Pressable>
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
                         returnKeyType="next"
                         value={newUsername}
                         onChangeText={setNewUsername}
                         onSubmitEditing={() => {
                           // Focus the email input
                           if (emailInputRef.current) {
                             emailInputRef.current.focus();
                           }
                         }}
                       />
                    </View>
                  </View>

                  {/* Email Input */}
                  <View style={styles.formField}>
                    <Text style={styles.formLabel}>Email Address</Text>
                    <View style={styles.inputContainer}>
                      <Ionicons name="mail-outline" size={20} color="#6c757d" style={styles.inputIcon} />
                                             <TextInput
                         ref={emailInputRef}
                         style={styles.textInput}
                         placeholder="Enter email address"
                         placeholderTextColor="#adb5bd"
                         autoCapitalize="none"
                         keyboardType="email-address"
                         returnKeyType="next"
                         value={newEmail}
                         onChangeText={setNewEmail}
                         onSubmitEditing={() => {
                           // Focus the password input
                           if (passwordInputRef.current) {
                             passwordInputRef.current.focus();
                           }
                         }}
                       />
                    </View>
                  </View>

                  {/* Password Input */}
                  <View style={styles.formField}>
                    <Text style={styles.formLabel}>Password</Text>
                    <View style={styles.inputContainer}>
                      <Ionicons name="lock-closed-outline" size={20} color="#6c757d" style={styles.inputIcon} />
                                             <TextInput
                         ref={passwordInputRef}
                         style={styles.textInput}
                         placeholder="Create a password"
                         placeholderTextColor="#adb5bd"
                         secureTextEntry
                         returnKeyType="done"
                         value={newPassword}
                         onChangeText={setNewPassword}
                         onSubmitEditing={handleAdminRegister}
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
             </View>
           </View>
                 )}
       </View>
       </ScrollView>
     </KeyboardAvoidingView>
   );
 }

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: Platform.OS === 'android' ? 100 : 20, // Extra padding for Android navigation buttons
  },
  content: {
    padding: 20,
    paddingBottom: Platform.OS === 'android' ? 40 : 20, // Extra bottom padding for Android
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6c757d',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 24,
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginLeft: 8,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#6c757d',
    lineHeight: 20,
  },
  toggle: {
    width: 50,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    padding: 3,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'white',
  },
  userSelectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  userSelectorText: {
    fontSize: 14,
    color: '#0A84FF',
    fontWeight: '500',
    marginRight: 8,
  },
  userList: {
    marginTop: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    maxHeight: 200,
  },
  userItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  selectedUserItem: {
    backgroundColor: '#0A84FF',
  },
  userItemText: {
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  selectedUserItemText: {
    color: 'white',
    fontWeight: '600',
  },
  userRoleText: {
    fontSize: 12,
    color: '#6c757d',
    textTransform: 'uppercase',
  },
  resetButton: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    alignItems: 'center',
  },
  resetButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  // Registration form styles
  registrationSection: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  registrationSectionCollapsed: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  registrationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    minHeight: 48,
  },
     registrationTitleContainer: {
     flex: 1,
     justifyContent: 'center',
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
  buttonPressed: {
    opacity: 0.7,
  },
  // Modern styles for user selector and settings
  modernUserSelectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  modernUserSelectorText: {
    fontSize: 14,
    color: '#0A84FF',
    fontWeight: '500',
    marginRight: 8,
  },
  modernUserList: {
    marginTop: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    maxHeight: 200,
  },
  modernUserItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  selectedModernUserItem: {
    backgroundColor: '#0A84FF',
  },
  userItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0A84FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userAvatarText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  userInfo: {
    flex: 1,
  },
  modernUserItemText: {
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  selectedModernUserItemText: {
    color: 'white',
    fontWeight: '600',
  },
  modernUserRoleText: {
    fontSize: 12,
    color: '#6c757d',
    textTransform: 'uppercase',
  },
  userSettingsContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  modernToggle: {
    width: 40,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    padding: 2,
  },
  modernToggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'white',
  },
  modernResetButton: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
  },
  modernResetButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
});
