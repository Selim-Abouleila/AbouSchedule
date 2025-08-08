import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
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

  useEffect(() => {
    loadSettings();
    checkAdminStatus();
  }, [selectedUserId]);

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
      } else {
        // Admin mode: load global settings
        const settings = await getSettingsForUser(undefined);
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

  const resetToGlobalSettings = async () => {
    Alert.alert(
      'Reset to Global Settings',
      'This will reset the selected user\'s settings to match the global default. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              if (selectedUserId) {
                const globalSettings = await getSettings();
                await saveSettings(globalSettings, selectedUserId);
                await loadSettings();
                Alert.alert('Success', 'User settings reset to global defaults');
              }
            } catch (error) {
              console.error('Error resetting settings:', error);
              Alert.alert('Error', 'Failed to reset settings');
            }
          },
        },
      ]
    );
  };

  const handleUserSelect = async (userId: number | null) => {
    setSelectedUserId(userId);
    setShowUserSelector(false);
    await loadSettings();
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
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Settings</Text>
        
        {/* Admin User Selector */}
        {isAdmin && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Admin Controls</Text>
            
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Manage User Settings</Text>
                <Text style={styles.settingDescription}>
                  Select a user to modify their default settings.
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
                    'Select User'
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
                 <Pressable
                   style={[styles.userItem, !selectedUserId && styles.selectedUserItem]}
                   onPress={() => handleUserSelect(null)}
                 >
                   <Text style={[styles.userItemText, !selectedUserId && styles.selectedUserItemText]}>
                     Global Settings
                   </Text>
                   <Text style={styles.userRoleText}>DEFAULT</Text>
                 </Pressable>
                 {users
                   .filter(user => user.role === 'EMPLOYEE') // Only show regular users, not other admins
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

                         {selectedUserId && (
               <Pressable
                 style={styles.resetButton}
                 onPress={resetToGlobalSettings}
               >
                 <Text style={styles.resetButtonText}>Reset to Global Settings</Text>
               </Pressable>
             )}
             

          </View>
        )}
        
                 {/* Only show settings for admins */}
         {isAdmin && (
           <View style={styles.section}>
             <Text style={styles.sectionTitle}>
               {selectedUserId ? 'User Settings' : 'Global Settings'}
             </Text>
             
             <View style={styles.settingRow}>
               <View style={styles.settingInfo}>
                 <Text style={styles.settingLabel}>Default "Label Done" Setting</Text>
                 <Text style={styles.settingDescription}>
                   {selectedUserId 
                     ? `When creating new tasks, this will be the default value for the "Tasker can label done" option for the selected user.`
                     : 'When creating new tasks, this will be the default value for the "Tasker can label done" option for all users.'
                   }
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
           </View>
         )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  content: {
    padding: 20,
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
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
});
