import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Alert,
  Platform,
  Modal,
  BackHandler,
} from 'react-native';

import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { endpoints, API_BASE } from '../../../../src/api';
import { getToken } from '../../../../src/auth';
import { useFocusEffect } from "@react-navigation/native";
import ImageViewing from 'react-native-image-viewing';
import { Image as ExpoImage } from 'expo-image';
import { Image as RNImage } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import * as Linking from 'expo-linking';
import { Video, ResizeMode } from 'expo-av';

/*
  Admin Task Detail Page
  Place this file at: app/admin/tasks/[userId]/[id].tsx
  This component will be shown when an admin taps on a task in the admin task list.
*/



type Task = {
  id: number;
  title: string;
  description: string | null;
  status: 'PENDING' | 'ACTIVE' | 'DONE';
  priority: string;
  size: string;
  dueAt: string | null;
  timeCapMinutes: number | null;
  createdAt: string;
  recurrence: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  recurrenceEvery: number | null;
  recurrenceDow?: number | null;
  recurrenceDom?: number | null;
  recurrenceMonth?: number | null;
  lastOccurrence: string | null;
  nextOccurrence: string | null;
  recurrenceEnd: string | null;
  readByUser?: boolean;
  readAt?: string;
  requiresCompletionApproval?: boolean;
  runNotification?: boolean;
  images: { id: number; url: string; mime: string }[];
  documents: { id: number; url: string; mime: string; fileName?: string }[];
  videos: { id: number; url: string; mime: string; fileName?: string; duration?: number; thumbnail?: string }[];
  user?: {
    id: number;
    email: string;
    username?: string;
    role: string;
  };
};

const statusColor: Record<Task['status'], string> = {
  PENDING: '#FFD60A',
  ACTIVE: '#FF9F0A',
  DONE: '#32D74B',
};

export default function AdminTaskDetail() {
  const { userId, id } = useLocalSearchParams<{ userId: string; id: string }>();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);

  console.log('Admin task view: Component rendered with params:', { userId, id });
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerNonce, setViewerNonce] = useState(0);
  // Video player state
  const [playingVideo, setPlayingVideo] = useState<{ uri: string; index: number } | null>(null);
  // Loading states
  const [openingDocument, setOpeningDocument] = useState(false);
  const [openingDocumentName, setOpeningDocumentName] = useState('');
  const [sharingDocument, setSharingDocument] = useState(false);
  const [sharingDocumentName, setSharingDocumentName] = useState('');

  const openViewer = (idx: number) => {
    setViewerIndex(idx);
    setViewerNonce(prev => prev + 1);
    setViewerOpen(true);
  };

  const openDocument = async (doc: { url: string; fileName?: string }) => {
    try {
      // Set loading state
      const filename = doc.fileName || doc.url.split('/').pop() || 'document';
      const cleanFilename = getCleanFileName(filename);
      const decodedFilename = decodeURIComponent(cleanFilename);
      setOpeningDocumentName(decodedFilename);
      setOpeningDocument(true);

      // Download the document first
      const fileUri = `${FileSystem.documentDirectory}${cleanFilename}`;
      
      // Check if file exists locally
      const info = await FileSystem.getInfoAsync(fileUri);
      
      if (!info.exists) {
        // Download the file
        console.log('Downloading document:', doc.url, 'to:', fileUri);
        const downloadResumable = FileSystem.createDownloadResumable(
          doc.url,
          fileUri,
          {},
          (downloadProgress) => {
            const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
            console.log(`Downloaded: ${progress * 100}%`);
          }
        );

        const result = await downloadResumable.downloadAsync();
        if (!result) {
          throw new Error('Failed to download document');
        }
      }

      // Use Sharing to open the document (works on both iOS and Android)
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri, {
          mimeType: getMimeType(filename),
          dialogTitle: 'Open Document',
        });
      } else {
        // Fallback to Linking for iOS
        if (Platform.OS === 'ios') {
          await Linking.openURL(doc.url);
        } else {
          Alert.alert('Error', 'Sharing is not available on this device');
        }
      }
    } catch (error) {
      console.error('Error opening document:', error);
      Alert.alert('Error', 'Could not open document');
    } finally {
      setOpeningDocument(false);
      setOpeningDocumentName('');
    }
  };

  const getMimeType = (filename: string): string => {
    const extension = filename.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'pdf':
        return 'application/pdf';
      case 'doc':
        return 'application/msword';
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'xls':
        return 'application/vnd.ms-excel';
      case 'xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'ppt':
        return 'application/vnd.ms-powerpoint';
      case 'pptx':
        return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      case 'txt':
        return 'text/plain';
      default:
        return 'application/octet-stream';
    }
  };

  const shareDocument = async (doc: { url: string; fileName?: string }) => {
    try {
      // Set loading state
      const filename = doc.fileName || doc.url.split('/').pop() || 'document';
      const cleanFilename = getCleanFileName(filename);
      const decodedFilename = decodeURIComponent(cleanFilename);
      setSharingDocumentName(decodedFilename);
      setSharingDocument(true);

      if (Platform.OS === 'ios') {
        await Sharing.shareAsync(doc.url);
      } else {
        // Android: download first, then share
        const fileUri = `${FileSystem.documentDirectory}${cleanFilename}`;
        
        // Check if file exists locally
        const info = await FileSystem.getInfoAsync(fileUri);
        
        if (!info.exists) {
          // Download the file
          console.log('Downloading document for sharing:', doc.url, 'to:', fileUri);
          const downloadResumable = FileSystem.createDownloadResumable(
            doc.url,
            fileUri,
          );
          const result = await downloadResumable.downloadAsync();
          if (!result) {
            throw new Error('Failed to download document');
          }
        }
        
        await Sharing.shareAsync(fileUri);
      }
    } catch (error) {
      console.error('Error sharing document:', error);
      Alert.alert('Error', 'Could not share document');
    } finally {
      setSharingDocument(false);
      setSharingDocumentName('');
    }
  };

  const shareImage = async (image: { url: string; mime: string }) => {
    try {
      // Extract a clean filename from the URL
      const filename = getImageFileName(image);
      const downloadResumable = FileSystem.createDownloadResumable(
        image.url,
        FileSystem.documentDirectory + filename,
      );
      const result = await downloadResumable.downloadAsync();
      
      if (result) {
        await Sharing.shareAsync(result.uri);
      } else {
        throw new Error('Failed to download image');
      }
    } catch (error) {
      console.error('Error sharing image:', error);
      Alert.alert('Error', 'Could not share image');
    }
  };

  const getDocFileName = (doc: { url: string; fileName?: string }): string => {
    // Use fileName if available, otherwise extract from URL
    if (doc.fileName) {
      return getCleanFileName(doc.fileName);
    }
    const filename = doc.url.split('/').pop() || 'document';
    return getCleanFileName(filename);
  };

  const getCleanFileName = (filename: string): string => {
    // Remove query parameters and decode URL
    const cleanName = decodeURIComponent(filename.split('?')[0]);
    return cleanName.length > 30 ? cleanName.substring(0, 30) + '...' : cleanName;
  };

  const getImageFileName = (image: { url: string; mime: string }): string => {
    const filename = image.url.split('/').pop() || 'image';
    return getCleanFileName(filename);
  };

  const getUTIForExtension = (extension: string): string => {
    const utiMap: Record<string, string> = {
      '.pdf': 'com.adobe.pdf',
      '.doc': 'com.microsoft.word.doc',
      '.docx': 'org.openxmlformats.wordprocessingml.document',
      '.xls': 'com.microsoft.excel.xls',
      '.xlsx': 'org.openxmlformats.spreadsheetml.sheet',
      '.ppt': 'com.microsoft.powerpoint.ppt',
      '.pptx': 'org.openxmlformats.presentationml.presentation',
      '.txt': 'public.plain-text',
    };
    return utiMap[extension.toLowerCase()] || 'public.data';
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getReadableFileType = (mimeType: string): string => {
    const typeMap: Record<string, string> = {
      'application/pdf': 'PDF Document',
      'application/msword': 'Word Document',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word Document',
      'application/vnd.ms-excel': 'Excel Spreadsheet',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel Spreadsheet',
      'application/vnd.ms-powerpoint': 'PowerPoint Presentation',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint Presentation',
      'text/plain': 'Text Document',
      'application/zip': 'ZIP Archive',
      'application/x-zip-compressed': 'ZIP Archive',
    };
    return typeMap[mimeType] || 'Document';
  };

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const loadTask = async () => {
        if (!id || !userId) return;
        
        console.log('Admin task view: Loading task data...', { id, userId });
        setLoad(true);
                 try {
           const jwt = await getToken();
           const endpoint = endpoints.admin.userTask(parseInt(userId), parseInt(id));
           console.log('Fetching task from endpoint:', endpoint);
           console.log('User ID:', userId, 'Task ID:', id);
           const res = await fetch(endpoint, {
             headers: { Authorization: `Bearer ${jwt}` },
           });
           if (cancelled) return;
           console.log('Response status:', res.status);
           if (!res.ok) {
             const errorText = await res.text();
             console.error('Error response:', errorText);
             throw new Error(`HTTP ${res.status}: ${errorText}`);
           }
           const taskData = await res.json();
           console.log('Task data received:', taskData); // Debug log
           console.log('User data:', taskData.user); // Debug user data specifically
           console.log('User email:', taskData.user?.email); // Debug user email
           console.log('Recurrence data:', {
             recurrence: taskData.recurrence,
             recurrenceEvery: taskData.recurrenceEvery,
             nextOccurrence: taskData.nextOccurrence,
             lastOccurrence: taskData.lastOccurrence
           });
           setTask(taskData);
           setError(null);
         } catch (e: any) {
          if (!cancelled) setError(e.message ?? 'Unknown error');
        } finally {
          if (!cancelled) setLoad(false);
        }
      };

      loadTask();

      return () => { cancelled = true; };
    }, [id, userId])
  );

  /* Prewarm cache as soon as image arrives */
  useEffect(() => {
    if (task?.images.length) {
      task.images.forEach(img =>
        RNImage.prefetch(`${img.url}?w=1200`)
      );
    }
  }, [task]);

  /* Debug recurrence data */
  useEffect(() => {
    if (task) {
      console.log('Recurrence check:', { 
        recurrence: task.recurrence, 
        isNotNone: task.recurrence !== 'NONE',
        recurrenceEvery: task.recurrenceEvery,
        nextOccurrence: task.nextOccurrence
      });
    }
  }, [task]);

  /* Clear task data on mount to ensure fresh load */
  useEffect(() => {
    console.log('Admin task view: Clearing task data on mount');
    setTask(null);
    setError(null);
  }, []);

  // Android back button handler - navigate back to admin tasks list (replace)
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      console.log('🔙 Android back button pressed - navigating to admin tasks list (replace)');
      router.replace(`/admin/tasks/${userId}`);
      return true; // Prevent default back behavior
    });

    return () => backHandler.remove();
  }, [userId]);

  const deleteTask = () => {
    Alert.alert(
      "Delete task",
      "This cannot be undone. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const jwt = await getToken();
              const res = await fetch(endpoints.admin.userTask(parseInt(userId), parseInt(id)), {
                method: "DELETE",
                headers: { Authorization: `Bearer ${jwt}` },
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              router.push('/admin');
            } catch (e: any) {
              Alert.alert("Failed to delete", e.message);
            }
          },
        },
      ]
    );
  };

  const markTaskAsDone = async () => {
    try {
      const jwt = await getToken();
      const res = await fetch(`${API_BASE}/admin/tasks/${id}/mark-done`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }
      
      const result = await res.json();
      Alert.alert("Success", result.message || "Task marked as done");
      
      // Reload the task to reflect the changes
      setLoad(true);
      const loadTask = async () => {
        try {
          const jwt = await getToken();
          const res = await fetch(endpoints.admin.userTask(parseInt(userId), parseInt(id)), {
            headers: { Authorization: `Bearer ${jwt}` },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const taskData = await res.json();
          setTask(taskData);
        } catch (e: any) {
          setError(e.message);
        } finally {
          setLoad(false);
        }
      };
      loadTask();
    } catch (e: any) {
      Alert.alert("Failed to mark task as done", e.message);
    }
  };

  const toggleNotifications = async () => {
    if (!task) return;
    
    try {
      const jwt = await getToken();
      const res = await fetch(`${API_BASE}/admin/tasks/${id}/toggle-notifications`, {
        method: "POST",
        headers: { 
          Authorization: `Bearer ${jwt}`,
        },
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }
      
      const result = await res.json();
      
      // Update the task state
      setTask(prev => prev ? { ...prev, runNotification: result.runNotification } : null);
      
      Alert.alert("Success", result.message);
    } catch (e: any) {
      Alert.alert("Failed to toggle notifications", e.message);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#0A84FF" />
      </View>
    );
  }

  if (error || !task) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Ionicons name="alert-circle" size={48} color="#dc3545" />
        <Text style={{ fontSize: 16, color: '#dc3545', marginTop: 8, textAlign: 'center' }}>
          Failed to load task{error ? `: ${error}` : ''}
        </Text>
        <Pressable
          onPress={() => router.push('/admin')}
          style={{
            marginTop: 16,
            paddingHorizontal: 16,
            paddingVertical: 8,
            backgroundColor: '#0A84FF',
            borderRadius: 8,
          }}>
          <Text style={{ color: 'white', fontWeight: '600' }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  // Additional safety check to ensure task has all required properties
  if (!task.title || !task.status || !task.priority || !task.size) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Ionicons name="alert-circle" size={48} color="#dc3545" />
        <Text style={{ fontSize: 16, color: '#dc3545', marginTop: 8, textAlign: 'center' }}>
          Task data is incomplete
        </Text>
        <Pressable
          onPress={() => router.push('/admin')}
          style={{
            marginTop: 16,
            paddingHorizontal: 16,
            paddingVertical: 8,
            backgroundColor: '#0A84FF',
            borderRadius: 8,
          }}>
          <Text style={{ color: 'white', fontWeight: '600' }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  // Helper function to safely render text
  const safeText = (value: any, fallback: string = '') => {
    if (value === null || value === undefined) {
      console.log('Warning: Attempting to render null/undefined value:', value);
      return fallback;
    }
    const stringValue = String(value);
    if (stringValue === 'undefined' || stringValue === 'null') {
      console.log('Warning: String conversion resulted in undefined/null:', value);
      return fallback;
    }
    return stringValue;
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
      {/* Header with back button and user info */}
      <View style={{
        backgroundColor: 'white',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e9ecef',
        flexDirection: 'row',
        alignItems: 'center',
      }}>
        <Pressable
          onPress={() => router.replace(`/admin/tasks/${userId}`)}
          style={{
            marginRight: 16,
            padding: 8,
          }}>
          <Ionicons name="arrow-back" size={24} color="#0A84FF" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, color: '#6c757d', marginBottom: 4 }}>
            Task for user:
          </Text>
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#1a1a1a' }}>
            {safeText(task.user?.username) || safeText(task.user?.email) || `User ID: ${safeText(userId, 'Unknown')}`}
          </Text>
        </View>
      </View>

      {/* Main scrollable content */}
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: Platform.OS === 'android' ? 120 : 100 }}>
        {/* Header */}
        <View style={{ 
          flexDirection: 'row', 
          alignItems: 'center', 
          marginBottom: 20,
          backgroundColor: 'white',
          padding: 16,
          borderRadius: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
        }}>
          <View
            style={{
              width: 6,
              height: 40,
              marginRight: 16,
              borderRadius: 3,
              backgroundColor: statusColor[task.status],
            }}
          />
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Text style={{ fontSize: 22, fontWeight: '700', flexShrink: 1, color: '#1a1a1a' }}>
                {safeText(task.title)}
              </Text>
              {task.priority === 'IMMEDIATE' && (
                <Ionicons 
                  name="flame" 
                  size={20} 
                  color="#FF453A" 
                  style={{ marginLeft: 8 }} 
                />
              )}
            </View>
            {task.requiresCompletionApproval && (
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#FFD60A15',
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: '#FFD60A30',
                marginLeft: 12,
              }}>
                <View style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: '#FFD60A',
                  marginRight: 6,
                }} />
                <Text style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: '#FFD60A',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}>
                  Requires Approval
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Mute Notifications Button - Only for IMMEDIATE tasks */}
        {task.priority === 'IMMEDIATE' && (
          <View style={{
            backgroundColor: 'white',
            padding: 8,
            borderRadius: 8,
            marginBottom: 12,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 2,
            elevation: 1,
          }}>
            <Pressable
              onPress={toggleNotifications}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 8,
                paddingHorizontal: 12,
                backgroundColor: task.runNotification ? '#FF6B6B' : '#4ECDC4',
                borderRadius: 6,
              }}>
              <Ionicons 
                name={task.runNotification ? "notifications-off" : "notifications"} 
                size={16} 
                color="white" 
                style={{ marginRight: 6 }}
              />
              <Text style={{ 
                fontSize: 14, 
                fontWeight: '600', 
                color: 'white' 
              }}>
                {task.runNotification ? "Mute notifications for this task" : "Unmute notifications for this task"}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Description */}
        {task.description && (
          <View style={{
            backgroundColor: 'white',
            padding: 16,
            borderRadius: 12,
            marginBottom: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 3,
            elevation: 2,
          }}>
            <Text style={{ fontSize: 16, lineHeight: 24, color: '#1a1a1a' }}>
              {safeText(task.description)}
            </Text>
          </View>
        )}

        {/* Meta */}
        <View style={{
          backgroundColor: 'white',
          padding: 16,
          borderRadius: 12,
          marginBottom: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 3,
          elevation: 2,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ fontWeight: '600', color: '#666' }}>Priority</Text>
            <Text style={{ color: '#1a1a1a' }}>{safeText(task.priority)}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ fontWeight: '600', color: '#666' }}>Size</Text>
            <Text style={{ color: '#1a1a1a' }}>{safeText(task.size)}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ fontWeight: '600', color: '#666' }}>Status</Text>
            <Text style={{ color: '#1a1a1a' }}>{safeText(task.status)}</Text>
          </View>
                      {task.timeCapMinutes !== null && task.timeCapMinutes !== undefined && task.timeCapMinutes > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontWeight: '600', color: '#666' }}>Time Cap</Text>
                <Text style={{ color: '#1a1a1a' }}>
                  {safeText(Math.floor(task.timeCapMinutes / 60))}h {safeText(task.timeCapMinutes % 60)}min
                </Text>
              </View>
            )}
            {task.dueAt && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '600', color: '#666' }}>Due</Text>
                <Text style={{ color: '#1a1a1a' }}>{safeText(new Date(task.dueAt).toLocaleString())}</Text>
              </View>
            )}
        </View>

        {/* Read Status */}
        <View style={{
          backgroundColor: 'white',
          padding: 16,
          borderRadius: 12,
          marginBottom: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 3,
          elevation: 2,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Ionicons 
              name={task.readByUser ? "checkmark-circle" : "time"} 
              size={18} 
              color={task.readByUser ? "#32D74B" : "#FF453A"} 
              style={{ marginRight: 8 }} 
            />
            <Text style={{ fontWeight: '600', fontSize: 16, color: '#1a1a1a' }}>Read Status</Text>
          </View>
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ fontWeight: '600', color: '#666' }}>Status</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: task.readByUser ? '#32D74B' : '#FF453A',
                  marginRight: 8,
                }}
              />
              <Text style={{ 
                color: task.readByUser ? '#32D74B' : '#FF453A',
                fontWeight: '600',
                fontSize: 12,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}>
                {task.readByUser ? 'READ' : 'NOT READ'}
              </Text>
            </View>
          </View>
          
          {task.readAt && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontWeight: '600', color: '#666' }}>Read At</Text>
              <Text style={{ color: '#1a1a1a' }}>
                {new Date(task.readAt).toLocaleString()}
              </Text>
            </View>
          )}
          
          {task.requiresCompletionApproval && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontWeight: '600', color: '#666' }}>Approval</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: '#FFD60A',
                    marginRight: 8,
                  }}
                />
                                  <Text style={{ 
                    color: '#FFD60A',
                    fontWeight: '600',
                    fontSize: 12,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}>
                    REQUIRES APPROVAL
                  </Text>
                </View>
              </View>
            )}
            

          </View>

        {/* Recurrence (only when the task is a template) */}
        {task.recurrence !== 'NONE' && (
          <View style={{
            backgroundColor: 'white',
            padding: 16,
            borderRadius: 12,
            marginBottom: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 3,
            elevation: 2,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Ionicons name="repeat" size={18} color="#6c757d" style={{ marginRight: 8 }} />
              <Text style={{ fontWeight: '600', fontSize: 16, color: '#1a1a1a' }}>Recurrence</Text>
            </View>

            {/* type & frequency */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontWeight: '600', color: '#666' }}>Type</Text>
              <Text style={{ color: '#1a1a1a', textTransform: 'capitalize' }}>{safeText(task.recurrence).toLowerCase()}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontWeight: '600', color: '#666' }}>Every</Text>
              <Text style={{ color: '#1a1a1a' }}>{safeText(task.recurrenceEvery !== null && task.recurrenceEvery !== undefined ? task.recurrenceEvery : 1)}</Text>
            </View>

            {/* next occurrence */}
            {task.nextOccurrence && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontWeight: '600', color: '#666' }}>Next</Text>
                <Text style={{ color: '#1a1a1a' }}>{safeText(new Date(task.nextOccurrence).toLocaleDateString())}</Text>
              </View>
            )}
            {/* recurrence end */}
            {task.recurrenceEnd && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '600', color: '#666' }}>Ends</Text>
                <Text style={{ color: '#1a1a1a' }}>{safeText(new Date(task.recurrenceEnd).toLocaleDateString())}</Text>
              </View>
            )}
          </View>
        )}

        {/* Images */}
        {task.images.length > 0 && (
          <View style={{
            backgroundColor: 'white',
            padding: 16,
            borderRadius: 12,
            marginBottom: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 3,
            elevation: 2,
          }}>
            <Text style={{ fontWeight: '600', fontSize: 16, marginBottom: 12, color: '#1a1a1a' }}>
              Images ({task.images.length})
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {task.images.map((image, index) => (
                <View key={image.id} style={{ marginRight: 12, position: 'relative' }}>
                  <Pressable
                    onPress={() => openViewer(index)}
                    style={{ position: 'relative' }}>
                    <ExpoImage
                      source={{ uri: image.url }}
                      style={{ width: 120, height: 120, borderRadius: 8 }}
                      contentFit="cover"
                    />
                  </Pressable>
                  <Pressable
                    onPress={() => shareImage(image)}
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      backgroundColor: '#0008',
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 4,
                      zIndex: 10,
                    }}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>Share</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Videos */}
        {task.videos && task.videos.length > 0 && (
          <View style={{
            backgroundColor: 'white',
            padding: 16,
            borderRadius: 12,
            marginBottom: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 3,
            elevation: 2,
          }}>
            <Text style={{ fontWeight: '600', fontSize: 16, marginBottom: 12, color: '#1a1a1a' }}>
              Videos ({task.videos.length})
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {task.videos.map((video, idx) => (
                <Pressable
                  key={video.id}
                  onPress={() => setPlayingVideo({ uri: video.url, index: idx })}
                  style={{ position: 'relative', marginRight: 12 }}
                >
                  <View style={{ position: 'relative' }}>
                    <View
                      style={{
                        width: 160,
                        height: 160,
                        borderRadius: 8,
                        backgroundColor: '#f0f0f0',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 48, color: '#666' }}>🎬</Text>
                    </View>
                    
                    {/* Play button overlay */}
                    <View style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: [{ translateX: -20 }, { translateY: -20 }],
                      width: 40,
                      height: 40,
                      backgroundColor: 'rgba(0, 0, 0, 0.7)',
                      borderRadius: 20,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}>
                      <Text style={{ color: '#fff', fontSize: 16 }}>▶️</Text>
                    </View>
                    
                    {/* Duration overlay */}
                    {video.duration && (
                      <View style={{
                        position: 'absolute',
                        bottom: 8,
                        right: 8,
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        paddingHorizontal: 6,
                        paddingVertical: 3,
                        borderRadius: 12,
                      }}>
                        <Text style={{ color: '#fff', fontSize: 10 }}>
                          {Math.round(video.duration / 1000)}s
                        </Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Documents */}
        {task.documents.length > 0 && (
          <View style={{
            backgroundColor: 'white',
            padding: 16,
            borderRadius: 12,
            marginBottom: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 3,
            elevation: 2,
          }}>
            <Text style={{ fontWeight: '600', fontSize: 16, marginBottom: 12, color: '#1a1a1a' }}>
              Documents ({task.documents.length})
            </Text>
            {task.documents.map((doc) => (
              <View key={doc.id} style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 12,
                backgroundColor: '#f8f9fa',
                borderRadius: 8,
                marginBottom: 8,
              }}>
                <Ionicons name="document" size={24} color="#6c757d" style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', color: '#1a1a1a' }}>
                    {getDocFileName(doc)}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#6c757d' }}>
                    {getReadableFileType(doc.mime)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => openDocument(doc)}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      backgroundColor: '#0A84FF',
                      borderRadius: 4,
                    }}>
                    <Text style={{ color: 'white', fontSize: 12 }}>Open</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => shareDocument(doc)}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      backgroundColor: '#28a745',
                      borderRadius: 4,
                    }}>
                    <Text style={{ color: 'white', fontSize: 12 }}>Share</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}



      </ScrollView>

      {/* Pinned Action Buttons */}
      <View style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'white',
        borderTopWidth: 1,
        borderTopColor: '#e9ecef',
        paddingHorizontal: 20,
        paddingVertical: 16,
        paddingBottom: Platform.OS === 'android' ? 50 : 16,
      }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => router.push(`/admin/tasks/${userId}/edit?id=${id}`)}
            style={{
              flex: 0.8,
              backgroundColor: '#0A84FF',
              paddingVertical: 12,
              borderRadius: 8,
              alignItems: 'center',
            }}>
            <Text style={{ color: 'white', fontWeight: '600', fontSize: 14 }}>Edit Task</Text>
          </Pressable>
          {task.status !== 'DONE' && (
            <Pressable
              onPress={markTaskAsDone}
              style={{
                flex: 1.2,
                backgroundColor: '#32D74B',
                paddingVertical: 12,
                borderRadius: 8,
                alignItems: 'center',
              }}>
              <Text style={{ color: 'white', fontWeight: '600', fontSize: 13, textAlign: 'center' }}>
                {task.requiresCompletionApproval ? 'Approve Done' : 'Mark Done'}
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={deleteTask}
            style={{
              flex: 0.8,
              backgroundColor: '#dc3545',
              paddingVertical: 12,
              borderRadius: 8,
              alignItems: 'center',
            }}>
            <Text style={{ color: 'white', fontWeight: '600', fontSize: 14 }}>Delete Task</Text>
          </Pressable>
        </View>
      </View>

      {/* Image Viewer */}
      {task.images.length > 0 && (
        <ImageViewing
          images={task.images.map(img => ({ uri: img.url }))}
          imageIndex={viewerIndex}
          visible={viewerOpen}
          onRequestClose={() => setViewerOpen(false)}
          key={viewerNonce}
        />
      )}

      {/* Video Player Modal */}
      <Modal
        visible={playingVideo !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setPlayingVideo(null)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'black',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <View style={{
            position: 'absolute',
            top: 50,
            left: 20,
            zIndex: 10,
          }}>
            <Pressable
              onPress={() => setPlayingVideo(null)}
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                borderRadius: 20,
                padding: 10,
              }}
            >
              <Text style={{ color: 'white', fontSize: 18 }}>✕</Text>
            </Pressable>
          </View>
          
          {playingVideo && (
            <Video
              source={{ uri: playingVideo.uri }}
              style={{
                width: '100%',
                height: '100%',
              }}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
              isLooping={false}
            />
          )}
        </View>
      </Modal>

      {/* Document Loading Overlay */}
      <Modal
        visible={openingDocument}
        transparent
        animationType="fade"
        onRequestClose={() => setOpeningDocument(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <View style={{
            backgroundColor: 'white',
            borderRadius: 12,
            padding: 24,
            alignItems: 'center',
            minWidth: 200,
          }}>
            <ActivityIndicator size="large" color="#0A84FF" style={{ marginBottom: 16 }} />
            <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
              Opening Document
            </Text>
            <Text style={{ fontSize: 14, color: '#666', textAlign: 'center' }}>
              {openingDocumentName}
            </Text>
            <Text style={{ fontSize: 12, color: '#999', textAlign: 'center', marginTop: 8 }}>
              Please wait...
            </Text>
          </View>
        </View>
      </Modal>

      {/* Document Sharing Loading Overlay */}
      <Modal
        visible={sharingDocument}
        transparent
        animationType="fade"
        onRequestClose={() => setSharingDocument(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <View style={{
            backgroundColor: 'white',
            borderRadius: 12,
            padding: 24,
            alignItems: 'center',
            minWidth: 200,
          }}>
            <ActivityIndicator size="large" color="#28a745" style={{ marginBottom: 16 }} />
            <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
              Sharing Document
            </Text>
            <Text style={{ fontSize: 14, color: '#666', textAlign: 'center' }}>
              {sharingDocumentName}
            </Text>
            <Text style={{ fontSize: 12, color: '#999', textAlign: 'center', marginTop: 8 }}>
              Please wait...
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}
