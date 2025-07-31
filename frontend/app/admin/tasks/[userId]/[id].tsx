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

/*
  Admin Task Detail Page
  Place this file at: app/admin/tasks/[userId]/[id].tsx
  This component will be shown when an admin taps on a task in the admin task list.
*/

/* Info Badge */
const InfoBadge = ({ onPress }: { onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    style={{
      position: 'absolute',
      top: 6,
      left: 6,
      backgroundColor: '#0008',
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 6,
      zIndex: 10,
    }}>
    <Text style={{ color: '#fff', fontSize: 12 }}>ⓘ</Text>
  </Pressable>
);

type Task = {
  id: number;
  title: string;
  description: string | null;
  status: 'PENDING' | 'ACTIVE' | 'DONE';
  priority: string;
  size: string;
  dueAt: string | null;
  createdAt: string;
  recurrence: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  recurrenceEvery: number | null;
  recurrenceDow?: number | null;
  recurrenceDom?: number | null;
  recurrenceMonth?: number | null;
  lastOccurrence: string | null;
  nextOccurrence: string | null;
  images: { id: number; url: string; mime: string }[];
  documents: { id: number; url: string; mime: string; name?: string }[];
  user?: {
    id: number;
    email: string;
    role: string;
  };
};

const statusColor: Record<Task['status'], string> = {
  PENDING: '#FFD60A',
  ACTIVE: '#FF453A',
  DONE: '#32D74B',
};

export default function AdminTaskDetail() {
  const { userId, id } = useLocalSearchParams<{ userId: string; id: string }>();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerNonce, setViewerNonce] = useState(0);

  const openViewer = (idx: number) => {
    setViewerIndex(idx);
    setViewerNonce(prev => prev + 1);
    setViewerOpen(true);
  };

  const openDocument = async (url: string) => {
    try {
      if (Platform.OS === 'ios') {
        await Linking.openURL(url);
      } else {
        // Android: download and open
        const filename = url.split('/').pop() || 'document';
        const downloadResumable = FileSystem.createDownloadResumable(
          url,
          FileSystem.documentDirectory + filename,
          {},
          (downloadProgress) => {
            const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
            console.log(`Downloaded: ${progress * 100}%`);
          }
        );

        const result = await downloadResumable.downloadAsync();
        if (result) {
          await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
            data: result.uri,
            flags: 1,
          });
        }
      }
    } catch (error) {
      console.error('Error opening document:', error);
      Alert.alert('Error', 'Could not open document');
    }
  };

  const shareDocument = async (url: string) => {
    try {
      if (Platform.OS === 'ios') {
        await Sharing.shareAsync(url);
      } else {
        // Android: download first, then share
        const filename = url.split('/').pop() || 'document';
        const downloadResumable = FileSystem.createDownloadResumable(
          url,
          FileSystem.documentDirectory + filename,
        );
        const result = await downloadResumable.downloadAsync();
        if (result) {
          await Sharing.shareAsync(result.uri);
        }
      }
    } catch (error) {
      console.error('Error sharing document:', error);
      Alert.alert('Error', 'Could not share document');
    }
  };

  const getDocFileName = (url: string): string => {
    const filename = url.split('/').pop() || 'document';
    return getCleanFileName(filename);
  };

  const getCleanFileName = (filename: string): string => {
    // Remove query parameters and decode URL
    const cleanName = decodeURIComponent(filename.split('?')[0]);
    return cleanName.length > 30 ? cleanName.substring(0, 30) + '...' : cleanName;
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
        
        setLoad(true);
        try {
          const jwt = await getToken();
          const res = await fetch(`${API_BASE}/admin/users/${userId}/tasks/${id}`, {
            headers: { Authorization: `Bearer ${jwt}` },
          });
          if (cancelled) return;
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
                     const taskData = await res.json();
           console.log('Task data received:', taskData); // Debug log
           console.log('User data:', taskData.user); // Debug user data specifically
           console.log('User email:', taskData.user?.email); // Debug user email
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
              const res = await fetch(`${API_BASE}/admin/users/${userId}/tasks/${id}`, {
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
          onPress={() => router.push('/admin')}
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
             {task.user?.email || `User ID: ${userId}`}
           </Text>
        </View>
      </View>

      {/* Main scrollable content */}
      <ScrollView contentContainerStyle={{ padding: 20 }}>
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
          <Text style={{ fontSize: 22, fontWeight: '700', flexShrink: 1, color: '#1a1a1a' }}>
            {task.title}
          </Text>
        </View>

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
              {task.description}
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
            <Text style={{ color: '#1a1a1a' }}>{task.priority}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ fontWeight: '600', color: '#666' }}>Size</Text>
            <Text style={{ color: '#1a1a1a' }}>{task.size}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ fontWeight: '600', color: '#666' }}>Status</Text>
            <Text style={{ color: '#1a1a1a' }}>{task.status}</Text>
          </View>
          {task.dueAt && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '600', color: '#666' }}>Due</Text>
              <Text style={{ color: '#1a1a1a' }}>{new Date(task.dueAt).toLocaleString()}</Text>
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
              <Text style={{ color: '#1a1a1a', textTransform: 'capitalize' }}>{task.recurrence.toLowerCase()}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontWeight: '600', color: '#666' }}>Every</Text>
              <Text style={{ color: '#1a1a1a' }}>{task.recurrenceEvery ?? 1}</Text>
            </View>

            {/* next occurrence */}
            {task.nextOccurrence && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '600', color: '#666' }}>Next</Text>
                <Text style={{ color: '#1a1a1a' }}>{new Date(task.nextOccurrence).toLocaleDateString()}</Text>
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
                <Pressable
                  key={image.id}
                  onPress={() => openViewer(index)}
                  style={{ marginRight: 12, position: 'relative' }}>
                  <ExpoImage
                    source={{ uri: image.url }}
                    style={{ width: 120, height: 120, borderRadius: 8 }}
                    contentFit="cover"
                  />
                  <InfoBadge onPress={() => openViewer(index)} />
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
                    {getDocFileName(doc.url)}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#6c757d' }}>
                    {getReadableFileType(doc.mime)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => openDocument(doc.url)}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      backgroundColor: '#0A84FF',
                      borderRadius: 4,
                    }}>
                    <Text style={{ color: 'white', fontSize: 12 }}>Open</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => shareDocument(doc.url)}
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

        {/* Action Buttons */}
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
          <Pressable
            onPress={() => router.push(`/admin/tasks/${userId}/${id}/edit`)}
            style={{
              flex: 1,
              backgroundColor: '#0A84FF',
              paddingVertical: 12,
              borderRadius: 8,
              alignItems: 'center',
            }}>
            <Text style={{ color: 'white', fontWeight: '600' }}>Edit Task</Text>
          </Pressable>
          <Pressable
            onPress={deleteTask}
            style={{
              flex: 1,
              backgroundColor: '#dc3545',
              paddingVertical: 12,
              borderRadius: 8,
              alignItems: 'center',
            }}>
            <Text style={{ color: 'white', fontWeight: '600' }}>Delete Task</Text>
          </Pressable>
        </View>
      </ScrollView>

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
    </View>
  );
}
