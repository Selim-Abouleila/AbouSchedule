// src/screens/Media.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, Image, Text, Pressable, ActivityIndicator, StyleSheet, Share, Button, Platform, Alert, ScrollView} from 'react-native';
import ImageViewing from 'react-native-image-viewing';
import { syncMedia, getLocalMediaUris, getLocalDocumentUris, clearMediaCache } from '../../src/mediaCache';
import { Ionicons } from '@expo/vector-icons'
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import * as Linking from 'expo-linking';
import { endpoints, API_BASE } from '../../src/api';
import { getToken, addAuthListener, removeAuthListener } from '../../src/auth';
import { useFocusEffect } from '@react-navigation/native';

export default function MediaScreen() {
  const [mode, setMode] = useState<'images' | 'documents'>('images');
  const [uris, setUris] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex]     = useState(0);

  // Admin functionality
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [users, setUsers] = useState<Array<{ id: number; email: string; username?: string; role: string }>>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: number; email: string; username?: string; role: string } | null>(null);
  const [showUserSelector, setShowUserSelector] = useState<boolean>(false);

  const loadMedia = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      console.log('Loading media for selectedUserId:', selectedUserId);
      await syncMedia(selectedUserId || undefined);
      const data = mode === 'images'
        ? await getLocalMediaUris(selectedUserId || undefined)
        : await getLocalDocumentUris(selectedUserId || undefined);
      console.log('Loaded media URIs:', data.length);
      setUris(data);
    } catch (err) {
      console.error('Failed to load media:', err);
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, [mode, selectedUserId]);

  const handleClearCache = async () => {
    Alert.alert(
      'Refresh Media Cache',
      'Are you sure you want to refresh? This will redownload all media files and may take some time.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Refresh',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await clearMediaCache();
              await loadMedia(true);
              Alert.alert('Success', 'Media cache refreshed successfully');
            } catch (error) {
              console.error('Error clearing cache:', error);
              Alert.alert('Error', 'Failed to refresh media cache');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  // Check if user is admin and load users list
  const checkAdminStatus = useCallback(async () => {
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
  }, []);

  // Load users when component mounts and when auth changes
  useEffect(() => {
    checkAdminStatus();
    
    // Add auth listener
    const authListener = async (isAuthenticated: boolean) => {
      if (!isAuthenticated) {
        // User logged out, clear admin state
        setIsAdmin(false);
        setUsers([]);
        setSelectedUserId(null);
      } else {
        // User logged in, check admin status
        await checkAdminStatus();
      }
    };
    
    addAuthListener(authListener);
    
    // Cleanup
    return () => {
      removeAuthListener(authListener);
    };
  }, [checkAdminStatus]);

  // Check admin status when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      checkAdminStatus();
    }, [checkAdminStatus])
  );

  useEffect(() => {
    loadMedia();
  }, [loadMedia, mode]);

  /* TO be able to share*/
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // NEW: share all selected URIs (just as newline‑separated text)
  /* …inside the component… */
  const shareSelected = async () => {
    const files = Array.from(selected).map(i => uris[i]);   // absolute file‑URIs
    if (files.length === 0) return;

    try {
      if (Platform.OS === 'android') {
        // Android can handle many files at once
        await Share.share({ urls: files } as any);
      } else {
        // iOS: one file per call
        for (const uri of files) {
          await Share.share({ url: uri });
        }
      }
    } catch (e) {
      console.warn('share failed', e);
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0A84FF" />
      </View>
    );
  }

  const getCleanFileName = (filename: string): string => {
    // Remove the UUID prefix if it exists (format: uuid_filename.pdf)
    const decodedName = decodeURIComponent(filename);
    return decodedName.includes('_') ? decodedName.split('_').slice(1).join('_') : decodedName;
  };

  const openDocument = async (fileUri: string) => {
    try {
      // Get file info
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (!fileInfo.exists) {
        Alert.alert('Error', 'File not found');
        return;
      }

      // Get the filename from the path
      const filename = fileUri.split('/').pop()!;
      const cleanFileName = getCleanFileName(filename);

      if (Platform.OS === 'ios') {
        // iOS: Use sharing with clean filename
        const tempDir = FileSystem.cacheDirectory!;
        const tempFileUri = `${tempDir}${cleanFileName}`;
        
        // Copy file to temp location with clean name
        await FileSystem.copyAsync({
          from: fileUri,
          to: tempFileUri,
        });

        // Share the temp file
        await Sharing.shareAsync(tempFileUri, {
          mimeType: getUTIForExtension(cleanFileName.split('.').pop() || ''),
          dialogTitle: `Share ${cleanFileName}`,
        });

        // Clean up temp file
        await FileSystem.deleteAsync(tempFileUri, { idempotent: true });
      } else {
        // Android: Use intent launcher
        const result = await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: fileUri,
          flags: 1,
        });
        
        if (result.resultCode !== 0) {
          Alert.alert('Error', 'No app found to open this file');
        }
      }
    } catch (error) {
      console.error('Error opening document:', error);
      Alert.alert('Error', 'Failed to open document');
    }
  };

  const getUTIForExtension = (extension: string): string => {
    const utiMap: { [key: string]: string } = {
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'ppt': 'application/vnd.ms-powerpoint',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'txt': 'text/plain',
      'rtf': 'application/rtf',
    };
    return utiMap[extension.toLowerCase()] || 'application/octet-stream';
  };

  const renderItem = ({ item, index }: { item: string; index: number }) => {
    if (mode === 'images') {
      const inSelection = selected.size > 0;

      return (
        <Pressable
          style={styles.imageWrapper}
          onPress={() => {
            if (inSelection) {
              // toggle selection on tap
              setSelected(s => {
                const next = new Set(s);
                next.has(index) ? next.delete(index) : next.add(index);
                return next;
              });
            } else {
              // open fullscreen when not selecting
              setViewerIndex(index);
              setViewerVisible(true);
            }
          }}
          onLongPress={() => {
            if (!inSelection) {
              // start selection‑mode on first long press
              setSelected(s => {
                const next = new Set(s);
                next.add(index);
                return next;
              });
            }
          }}
        >
          <Image source={{ uri: item }} style={styles.image} />
          {selected.has(index) && (
            <View style={styles.checkOverlay}>
              <Ionicons name="checkmark-circle" size={24} color="#0A84FF" />
            </View>
          )}

          {/* share button overlay */}
          <Pressable
            style={styles.shareButton}
            onPress={() => Share.share({ url: item })}
          >
            <Ionicons name="share-outline" size={18} color="#fff" />
          </Pressable>
        </Pressable>
      );
    } else {
      // Extract title from filename
      const filename = item.replace(/^.*[\\\/]/, '');
      const rawName = item.split('/').pop()!;
      const decodedName = decodeURIComponent(filename);
      const title = decodedName.includes('_') ? decodedName.split('_').slice(1).join('_') : decodedName;

      const inSelection = selected.size > 0;

      return (
        <Pressable
          style={styles.docWrapper}
          onPress={() => {
            if (inSelection) {
              // toggle selection on tap
              setSelected(s => {
                const next = new Set(s);
                next.has(index) ? next.delete(index) : next.add(index);
                return next;
              });
            } else {
              // open document when not selecting
              openDocument(item);
            }
          }}
          onLongPress={() => {
            if (!inSelection) {
              // start selection‑mode on first long press
              setSelected(s => {
                const next = new Set(s);
                next.add(index);
                return next;
              });
            }
          }}
        >
          <View style={styles.docIconContainer}>
            <Ionicons name="document-outline" size={24} color="#6c757d" />
          </View>
          <View style={styles.docContent}>
            <Text style={styles.docTitle}>{title}</Text>
          </View>
          {selected.has(index) && (
            <View style={styles.checkOverlay}>
              <Ionicons name="checkmark-circle" size={24} color="#0A84FF" />
            </View>
          )}
          {!inSelection && (
            <Ionicons name="open-outline" size={20} color="#6c757d" style={styles.openIcon} />
          )}
        </Pressable>
      );
    }
  };

  return (
    <View style={styles.container}>
      {/* Header Section */}
      <View style={styles.header}>
        <View style={styles.toggleRow}>
          <Pressable
            style={[styles.toggleButton, mode === 'images' && styles.activeToggle]}
            onPress={() => setMode('images')}
          >
            <Ionicons name="images-outline" size={18} color={mode === 'images' ? 'white' : '#6c757d'} style={{ marginRight: 6 }} />
            <Text style={mode === 'images' ? styles.activeText : styles.inactiveText}>Images</Text>
          </Pressable>
          <Pressable
            style={[styles.toggleButton, mode === 'documents' && styles.activeToggle]}
            onPress={() => setMode('documents')}
          >
            <Ionicons name="document-outline" size={18} color={mode === 'documents' ? 'white' : '#6c757d'} style={{ marginRight: 6 }} />
            <Text style={mode === 'documents' ? styles.activeText : styles.inactiveText}>Documents</Text>
          </Pressable>
        </View>
        
        <Pressable
          style={styles.refreshButton}
          onPress={handleClearCache}
        >
          <Ionicons name="refresh" size={20} color="#0A84FF" />
        </Pressable>
      </View>

      {/* Admin User Selector */}
      {isAdmin && (
        <View style={styles.adminSection}>
          <View style={styles.adminHeader}>
            <Text style={styles.adminTitle}>Admin View</Text>
            <Pressable
              style={styles.userSelectorButton}
              onPress={() => setShowUserSelector(!showUserSelector)}
            >
              <Ionicons name="people" size={18} color="#0A84FF" />
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
            <ScrollView style={styles.userList} showsVerticalScrollIndicator={false}>
              <Pressable
                style={[styles.userItem, !selectedUserId && styles.selectedUserItem]}
                onPress={() => {
                  setSelectedUserId(null);
                  setShowUserSelector(false);
                }}
              >
                <Text style={[styles.userItemText, !selectedUserId && styles.selectedUserItemText]}>
                  My Media
                </Text>
              </Pressable>
              {users.map((user) => (
                <Pressable
                  key={user.id}
                  style={[styles.userItem, selectedUserId === user.id && styles.selectedUserItem]}
                  onPress={() => {
                    setSelectedUserId(user.id);
                    setShowUserSelector(false);
                  }}
                >
                  <Text style={[styles.userItemText, selectedUserId === user.id && styles.selectedUserItemText]}>
                    {user.username || user.email}
                  </Text>
                  <Text style={styles.userRoleText}>
                    {user.role === 'EMPLOYEE' ? 'USER' : user.role}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Content */}
      <FlatList
        key={mode} // force remount when mode changes
        data={uris}
        keyExtractor={(uri) => uri}
        numColumns={mode === 'images' ? 3 : 1}
        contentContainerStyle={styles.list}
        columnWrapperStyle={mode === 'images' ? styles.columnWrapper : undefined}
        renderItem={renderItem}
        refreshing={refreshing}
        onRefresh={() => loadMedia(true)}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      />

      {/* Fullscreen viewer for images */}
      <ImageViewing
        images={uris.map(u => ({ uri: u }))}
        imageIndex={viewerIndex}
        visible={viewerVisible}
        onRequestClose={() => setViewerVisible(false)}
      />

      {/* Bulk Actions Toolbar */}
      {selected.size > 0 && (
        <View style={styles.bulkToolbar}>
          <View style={styles.bulkInfo}>
            <Text style={styles.bulkCount}>{selected.size} selected</Text>
          </View>
          <View style={styles.bulkActions}>
            <Pressable
              style={styles.bulkButton}
              onPress={shareSelected}
            >
              <Ionicons name="share-outline" size={18} color="white" style={{ marginRight: 6 }} />
              <Text style={styles.bulkButtonText}>Share</Text>
            </Pressable>
            <Pressable
              style={[styles.bulkButton, styles.cancelButton]}
              onPress={() => setSelected(new Set())}
            >
              <Ionicons name="close" size={18} color="white" style={{ marginRight: 6 }} />
              <Text style={styles.bulkButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f8f9fa' 
  },
  center: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  toggleRow: { 
    flexDirection: 'row', 
    alignItems: 'center' 
  },
  toggleButton: { 
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16, 
    paddingVertical: 10, 
    borderRadius: 8, 
    marginRight: 8, 
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  activeToggle: { 
    backgroundColor: '#0A84FF',
    borderColor: '#0A84FF',
  },
  refreshButton: { 
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  activeText: { 
    color: 'white', 
    fontWeight: '600',
    fontSize: 14,
  },
  inactiveText: { 
    color: '#6c757d', 
    fontWeight: '500',
    fontSize: 14,
  },
  list: { 
    padding: 8 
  },
  columnWrapper: { 
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  imageWrapper: {
    flex: 1,
    margin: 4,
    position: 'relative',
  },
  image: { 
    width: '100%', 
    height: 120, 
    borderRadius: 12,
    backgroundColor: '#f8f9fa',
  },
  docWrapper: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 16, 
    backgroundColor: 'white',
    marginBottom: 8,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  docIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  docContent: {
    flex: 1,
  },
  docTitle: { 
    fontSize: 16, 
    fontWeight: '600',
    color: '#1a1a1a',
    lineHeight: 20,
  },
  openIcon: { 
    marginLeft: 'auto',
    padding: 8,
  },
  shareButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 6,
    borderRadius: 12,
  },
  checkOverlay: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'white',
    borderRadius: 12,
  },
  bulkToolbar: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    flexDirection: 'row',
    padding: 16,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bulkInfo: {
    flex: 1,
  },
  bulkCount: { 
    color: '#1a1a1a', 
    fontSize: 16,
    fontWeight: '600',
  },
  bulkActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bulkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginLeft: 8,
    backgroundColor: '#0A84FF',
  },
  cancelButton: {
    backgroundColor: '#FF3B30',
  },
  bulkButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  // Admin styles
  adminSection: {
    backgroundColor: 'white',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  adminHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  adminTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
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
    marginLeft: 8,
    marginRight: 8,
    fontSize: 14,
    color: '#0A84FF',
    fontWeight: '500',
  },
  userList: {
    maxHeight: 200,
    marginTop: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
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
});
