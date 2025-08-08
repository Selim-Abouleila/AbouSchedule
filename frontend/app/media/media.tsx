// src/screens/Media.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, FlatList, Image, Text, Pressable, ActivityIndicator, StyleSheet, Share, Button, Platform, Alert, ScrollView} from 'react-native';
import ImageViewing from 'react-native-image-viewing';
import { syncMedia, getLocalMediaUris, getLocalDocumentUris, clearMediaCache, syncAllMedia, getAllLocalMediaUris, getAllLocalDocumentUris } from '../../src/mediaCache';
import { Ionicons } from '@expo/vector-icons'
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { endpoints, API_BASE } from '../../src/api';
import { getToken, addAuthListener, removeAuthListener } from '../../src/auth';
import { useFocusEffect } from '@react-navigation/native';

// Smart image component with progressive loading
const ProgressiveImage = ({ uri, style }: { uri: string, style: any }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Generate a thumbnail URL by adding a size parameter
  const thumbnailUri = uri.includes('?') 
    ? `${uri}&size=thumbnail` 
    : `${uri}?size=thumbnail`;

  return (
    <View style={[style, styles.imageContainer]}>
      {/* Low quality thumbnail */}
      <Image
        source={{ uri: thumbnailUri }}
        style={[style, styles.image, styles.thumbnailImage]}
        resizeMode="cover"
      />
      
      {/* High quality image */}
      <Image
        source={{ uri }}
        style={[
          style,
          styles.image,
          styles.fullImage,
          { opacity: isLoading ? 0 : 1 }
        ]}
        onLoadStart={() => setIsLoading(true)}
        onLoad={() => setIsLoading(false)}
        onError={() => setHasError(true)}
        resizeMode="cover"
      />
      
      {/* Loading indicator */}
      {isLoading && (
        <View style={styles.imageLoadingOverlay}>
          <ActivityIndicator size="small" color="#0A84FF" />
        </View>
      )}
      
      {/* Error indicator */}
      {hasError && (
        <View style={styles.imageErrorOverlay}>
          <Ionicons name="alert-circle-outline" size={24} color="#FF3B30" />
        </View>
      )}
    </View>
  );
};

export default function MediaScreen() {
  const [mode, setMode] = useState<'images' | 'documents'>('images');
  const [uris, setUris] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [switchingMode, setSwitchingMode] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const PAGE_SIZE = 30; // Number of items to load per page
  
  // Track visible items for preloading
  const [visibleItems, setVisibleItems] = useState<number[]>([]);
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 300,
  }).current;

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    const visibleIndices = viewableItems.map((item: any) => item.index);
    setVisibleItems(visibleIndices);
  }, []);

  // Preload next batch of images
  useEffect(() => {
    if (visibleItems.length > 0) {
      const lastVisibleIndex = Math.max(...visibleItems);
      if (uris.length - lastVisibleIndex <= 10 && hasMore && !loadingMore) {
        loadMore();
      }
    }
  }, [visibleItems, uris.length, hasMore, loadingMore]);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex]     = useState(0);

  // Admin functionality
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [users, setUsers] = useState<Array<{ id: number; email: string; username?: string; role: string }>>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: number; email: string; username?: string; role: string } | null>(null);
  const [showUserSelector, setShowUserSelector] = useState<boolean>(false);
  const [showAllMedia, setShowAllMedia] = useState<boolean>(false); // Default to user's own media

  // Cache for all loaded data
  const allDataRef = useRef<string[]>([]);

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    
    setLoadingMore(true);
    try {
      const nextPageStart = page * PAGE_SIZE;
      const nextPageEnd = nextPageStart + PAGE_SIZE;
      
      let allData: string[];
      if (allDataRef.current.length > 0) {
        // Use cached data if available
        allData = allDataRef.current;
      } else {
        // Load all data if not cached
        allData = (isAdmin && showAllMedia)
          ? (mode === 'images' ? await getAllLocalMediaUris() : await getAllLocalDocumentUris())
          : (mode === 'images' ? await getLocalMediaUris(selectedUserId || undefined) : await getLocalDocumentUris(selectedUserId || undefined));
        allDataRef.current = allData;
      }
      
      const newItems = allData.slice(nextPageStart, nextPageEnd);
      if (newItems.length > 0) {
        setUris(prev => [...prev, ...newItems]);
        setPage(p => p + 1);
        setHasMore(nextPageEnd < allData.length);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error('Error loading more items:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const loadMedia = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
      setPage(1); // Reset page on refresh
      setHasMore(true);
    } else {
      setLoading(true);
    }
    try {
      console.log('Loading media for selectedUserId:', selectedUserId);
      console.log('Is admin:', isAdmin);
      console.log('Mode:', mode);
      console.log('Show all media:', showAllMedia);
      
      if (isAdmin && showAllMedia) {
        // Load all media for admins only
        await syncAllMedia();
        const allData = mode === 'images'
          ? await getAllLocalMediaUris()
          : await getAllLocalDocumentUris();
        console.log('Loaded all media URIs:', allData.length);
        
        // Apply pagination to the data
        const paginatedData = allData.slice(0, PAGE_SIZE);
        setHasMore(allData.length > PAGE_SIZE);
        setUris(paginatedData);
      } else {
        // Load media for specific user (or current user for regular users)
        await syncMedia(selectedUserId || undefined);
        const allData = mode === 'images'
          ? await getLocalMediaUris(selectedUserId || undefined)
          : await getLocalDocumentUris(selectedUserId || undefined);
        console.log('Loaded media URIs:', allData.length);
        
        // Apply pagination to the data
        const paginatedData = allData.slice(0, PAGE_SIZE);
        setHasMore(allData.length > PAGE_SIZE);
        setUris(paginatedData);
      }
    } catch (err) {
      console.error('Failed to load media:', err);
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, [mode, selectedUserId, isAdmin, showAllMedia, PAGE_SIZE]);

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
        // Only set showAllMedia to true on first load, not during status checks
        if (!isAdmin) {
          setShowAllMedia(true);
        }
      } else {
        setIsAdmin(false);
        setShowAllMedia(false);
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
      setIsAdmin(false);
      setShowAllMedia(false);
    }
  }, [isAdmin]);

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
      // Only reload media if we don't have any loaded
      if (uris.length === 0) {
        loadMedia(true);
      }
    }, [checkAdminStatus, loadMedia, uris.length])
  );

  useEffect(() => {
    loadMedia();
  }, [loadMedia, selectedUserId]);

  // Handle mode changes separately to avoid loading flash
  useEffect(() => {
    const switchMode = async () => {
      setSwitchingMode(true);
      try {
        // Clear current data and cache
        setUris([]);
        setPage(1);
        setHasMore(true);
        allDataRef.current = []; // Clear the cache
        
        const data = mode === 'images'
          ? await getLocalMediaUris(selectedUserId || undefined)
          : await getLocalDocumentUris(selectedUserId || undefined);
        
        // Apply pagination
        const paginatedData = data.slice(0, PAGE_SIZE);
        setHasMore(data.length > PAGE_SIZE);
        setUris(paginatedData);
      } catch (err) {
        console.error('Failed to switch mode:', err);
      } finally {
        setSwitchingMode(false);
      }
    };
    
    switchMode();
  }, [mode, selectedUserId]);

  /* TO be able to share*/


  if (loading && !refreshing && !switchingMode) {
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

  // Get month/year from URI
  const getMonthYear = (uri: string): string => {
    // For now, return a simple date based on file creation time
    // This will be replaced with proper date parsing once we know the file structure
    const now = new Date();
    return now.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long' 
    });
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
        // Android: Use sharing instead of direct intent to avoid FileUriExposedException
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
          dialogTitle: `Open ${cleanFileName}`,
        });

        // Clean up temp file after a delay
        setTimeout(async () => {
          try {
            await FileSystem.deleteAsync(tempFileUri, { idempotent: true });
          } catch (cleanupError) {
            console.log('Cleanup error (expected):', cleanupError);
          }
        }, 5000);
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
      return (
        <Pressable
          style={styles.imageWrapper}
          onPress={() => {
            setViewerIndex(index);
            setViewerVisible(true);
          }}
        >
          <ProgressiveImage uri={item} style={styles.image} />

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

      return (
        <Pressable
          style={styles.docWrapper}
          onPress={() => openDocument(item)}
        >
          <View style={styles.docIconContainer}>
            <Ionicons name="document-outline" size={24} color="#6c757d" />
          </View>
          <View style={styles.docContent}>
            <Text style={styles.docTitle}>{title}</Text>
          </View>
          <Ionicons name="open-outline" size={20} color="#6c757d" style={styles.openIcon} />
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
                {showAllMedia ? 'All Media' :
                  selectedUserId ? 
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
                style={[styles.userItem, showAllMedia && styles.selectedUserItem]}
                onPress={() => {
                  setSelectedUserId(null);
                  setShowAllMedia(true);
                  setShowUserSelector(false);
                }}
              >
                <Text style={[styles.userItemText, showAllMedia && styles.selectedUserItemText]}>
                  All Media
                </Text>
              </Pressable>
              {users.map((user) => (
                <Pressable
                  key={user.id}
                  style={[styles.userItem, selectedUserId === user.id && !showAllMedia && styles.selectedUserItem]}
                  onPress={() => {
                    setSelectedUserId(user.id);
                    setShowAllMedia(false);
                    setShowUserSelector(false);
                  }}
                >
                  <Text style={[styles.userItemText, selectedUserId === user.id && !showAllMedia && styles.selectedUserItemText]}>
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
        ListHeaderComponent={() => (
          uris.length > 0 ? (
            <View style={styles.monthHeader}>
              <Text style={styles.monthHeaderText}>{getMonthYear(uris[0])}</Text>
            </View>
          ) : null
        )}
        ListEmptyComponent={() => (
          !loading && !refreshing && (
            <View style={styles.emptyContainer}>
              <Ionicons 
                name={mode === 'images' ? "images-outline" : "document-outline"} 
                size={48} 
                color="#6c757d" 
              />
              <Text style={styles.emptyText}>
                No {mode === 'images' ? 'images' : 'documents'} found
              </Text>
            </View>
          )
        )}
        ListFooterComponent={() => (
          loadingMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color="#0A84FF" />
              <Text style={styles.footerText}>Loading more...</Text>
            </View>
          ) : hasMore ? (
            <View style={styles.footerLoader}>
              <Text style={styles.footerText}>Pull to load more</Text>
            </View>
          ) : uris.length > 0 ? (
            <View style={styles.footerLoader}>
              <Text style={styles.footerText}>No more items</Text>
            </View>
          ) : null
        )}
        data={uris}
        keyExtractor={(uri, index) => `${uri}-${index}`}
        numColumns={mode === 'images' ? 3 : 1}
        contentContainerStyle={[
          styles.list,
          { paddingTop: 0 } // Remove top padding since header will provide spacing
        ]}
        columnWrapperStyle={mode === 'images' ? styles.columnWrapper : undefined}
        renderItem={renderItem}
        refreshing={refreshing}
        onRefresh={() => loadMedia(true)}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={5}
        updateCellsBatchingPeriod={100}
      />

      {/* Fullscreen viewer for images */}
      <ImageViewing
        key={`viewer-${viewerIndex}`}
        images={uris.map(u => ({ 
          uri: u,
          cache: 'force-cache'
        }))}
        imageIndex={viewerIndex}
        visible={viewerVisible}
        onRequestClose={() => setViewerVisible(false)}
        swipeToCloseEnabled
        presentationStyle="overFullScreen"
        doubleTapToZoomEnabled
      />

      {/* Bulk Actions Toolbar */}

    </View>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: 'white',
    borderRadius: 12,
    margin: 16,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6c757d',
    textAlign: 'center',
  },
  imageContainer: {
    position: 'relative',
    backgroundColor: '#f8f9fa',
    overflow: 'hidden',
  },
  thumbnailImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    filter: 'blur(5px)',
  },
  fullImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  imageLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageErrorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerLoader: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  footerText: {
    marginLeft: 8,
    color: '#6c757d',
    fontSize: 14,
  },
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
  monthHeader: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
    borderRadius: 8,
    marginHorizontal: 8,
    width: '100%',
  },
  monthHeaderText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
    letterSpacing: 0.3,
  },
});
