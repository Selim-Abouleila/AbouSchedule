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

import { endpoints } from '../../src/api';
import { getToken }  from '../../src/auth';
import { useFocusEffect } from "@react-navigation/native";
import ImageViewing from 'react-native-image-viewing';
// ⬆️ new import
import { Image as ExpoImage } from 'expo-image';
import { Image as RNImage } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import * as Linking from 'expo-linking';




/*
  Place this file at:         app/tasks/[id].tsx
  The list screen already navigates via router.push(`/tasks/${id}`)
  so this component will be shown when a task row is tapped.
*/






/* Info Badge */
const InfoBadge = ({ onPress }: { onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    style={{
      position: 'absolute',
      top: 6,          // or top: 6
      left: 6,           // or left: 6
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
  /** NEW */
  recurrence: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  recurrenceEvery: number | null;
  recurrenceDow?: number | null;   // 0–6
  recurrenceDom?: number | null;   // 1–31
  recurrenceMonth?: number | null;   // 1–12
  lastOccurrence: string | null;
  nextOccurrence: string | null;
  recurrenceEnd: string | null;

  images:    { id: number; url: string; mime: string }[];
  documents: { id: number; url: string; mime: string; name?: string }[];
};


const statusColor: Record<Task['status'], string> = {
  PENDING: '#FFD60A',
  ACTIVE:  '#FF453A',
  DONE:    '#32D74B',
};

export default function TaskDetail() {
  // /tasks/[id] ⇒ param name is "id"
  const { id } = useLocalSearchParams<{ id: string }>();
  const [task, setTask]     = useState<Task | null>(null);
  const [loading, setLoad]  = useState(true);
  const [error, setError]   = useState<string | null>(null);
  // put near the other state hooks
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  // 🔸 1. keep a counter that we bump on every open
  const [viewerNonce, setViewerNonce] = useState(0);

  // helper so the thumbnail onPress is cleaner
  const openViewer = (idx: number) => {
    setViewerIndex(idx);
    setViewerNonce(n => n + 1);   // forces a fresh mount
    setViewerOpen(true);
  };

  // Document opening functionality
  const openDocument = async (url: string) => {
    console.log('Attempting to open document:', url);
    
    // Get filename from URL
    const filename = getDocFileName(url);
    // Clean filename for sharing by removing AWS S3 key prefix
    const cleanFilename = getCleanFileName(filename);
    const fileUri = `${FileSystem.documentDirectory}documents/${filename}`;
    
    // Check if file exists locally
    const info = await FileSystem.getInfoAsync(fileUri);
    console.log('File info:', info);
    
    if (!info.exists) {
      // Create documents directory if it doesn't exist
      const documentsDir = `${FileSystem.documentDirectory}documents`;
      const dirInfo = await FileSystem.getInfoAsync(documentsDir);
      if (!dirInfo.exists) {
        console.log('Creating documents directory:', documentsDir);
        await FileSystem.makeDirectoryAsync(documentsDir, { intermediates: true });
      }
      
      // Download the file
      console.log('Downloading document:', url, 'to:', fileUri);
      try {
        await FileSystem.downloadAsync(url, fileUri);
        const newInfo = await FileSystem.getInfoAsync(fileUri);
        console.log('Downloaded file size:', 'size' in newInfo ? newInfo.size : 'unknown');
        if ('size' in newInfo && newInfo.size && newInfo.size < 1000) {
          console.warn('Downloaded file is suspiciously small:', newInfo.size);
          Alert.alert('Warning', 'Document appears to be corrupted or incomplete. Size: ' + newInfo.size + ' bytes');
          return;
        }
      } catch (error) {
        console.error('Failed to download document:', error);
        Alert.alert('Error', 'Failed to download document');
        return;
      }
    } else {
      // File exists, check if it's corrupted
      if ('size' in info && info.size && info.size < 1000) {
        console.warn('Existing file is corrupted (small size):', info.size, 'bytes');
        Alert.alert('Warning', 'Document appears to be corrupted. Size: ' + info.size + ' bytes');
        return;
      }
    }

    const extension = filename.split('.').pop()?.toLowerCase();
    let mimeType = 'application/octet-stream';
    
    switch (extension) {
      case 'pdf':
        mimeType = 'application/pdf';
        break;
      case 'doc':
        mimeType = 'application/msword';
        break;
      case 'docx':
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
      case 'xls':
        mimeType = 'application/vnd.ms-excel';
        break;
      case 'xlsx':
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;
      case 'ppt':
        mimeType = 'application/vnd.ms-powerpoint';
        break;
      case 'pptx':
        mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        break;
      case 'txt':
        mimeType = 'text/plain';
        break;
    }
    
    console.log('MIME type:', mimeType);
    
    if (Platform.OS === 'android') {
      console.log('Using Android IntentLauncher');
      const result = await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: fileUri,
        flags: 1,
        type: mimeType,
      });
      if (result.resultCode !== 0) {
        Alert.alert('Error', 'Could not open document');
      }
    } else {
      console.log('Using iOS Sharing');
      try {
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          // Create a copy with clean filename for sharing
          const cleanFileUri = `${FileSystem.documentDirectory}documents/${cleanFilename}`;
          await FileSystem.copyAsync({
            from: fileUri,
            to: cleanFileUri
          });
          
          await Sharing.shareAsync(cleanFileUri, {
            mimeType: mimeType,
            dialogTitle: 'Open Document',
            UTI: getUTIForExtension(extension || '')
          });
          
          // Clean up the temporary file
          await FileSystem.deleteAsync(cleanFileUri, { idempotent: true });
        } else {
          Alert.alert('Error', 'Sharing is not available on this device');
        }
      } catch (error) {
        console.error('Error sharing document on iOS:', error);
        Alert.alert('Error', 'Could not share document');
      }
    }
  };

  // Helper function to get filename from URL
  const getDocFileName = (url: string): string => {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      const filename = pathParts[pathParts.length - 1];
      
      if (!filename || !filename.includes('.')) {
        const fallback = url.split('/').pop()!.split('?')[0];
        return decodeURIComponent(fallback);
      }
      
      return decodeURIComponent(filename);
    } catch (error) {
      const fallback = url.split('/').pop()!.split('?')[0];
      return decodeURIComponent(fallback);
    }
  };

  // Helper function to clean filename by removing AWS S3 key prefix
  const getCleanFileName = (filename: string): string => {
    // Remove UUID prefix if present (format: uuid_filename.pdf)
    if (filename.includes('_')) {
      const parts = filename.split('_');
      // If we have more than 1 part and the first part looks like a UUID (32+ characters)
      if (parts.length > 1 && parts[0].length >= 32) {
        return parts.slice(1).join('_');
      }
    }
    return filename;
  };

  // Helper function to get UTI for iOS sharing
  const getUTIForExtension = (extension: string): string => {
    switch (extension.toLowerCase()) {
      case 'pdf':
        return 'com.adobe.pdf';
      case 'doc':
      case 'docx':
        return 'org.openxmlformats.wordprocessingml.document';
      case 'xls':
      case 'xlsx':
        return 'org.openxmlformats.spreadsheetml.sheet';
      case 'ppt':
      case 'pptx':
        return 'org.openxmlformats.presentationml.presentation';
      case 'txt':
        return 'public.plain-text';
      default:
        return 'public.data';
    }
  };

  // Helper function to format file size in human-readable format
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Helper function to get readable file type from MIME type
  const getReadableFileType = (mimeType: string): string => {
    switch (mimeType.toLowerCase()) {
      case 'application/pdf':
        return 'PDF Document';
      case 'application/msword':
        return 'Word Document (.doc)';
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return 'Word Document (.docx)';
      case 'application/vnd.ms-excel':
        return 'Excel Spreadsheet (.xls)';
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        return 'Excel Spreadsheet (.xlsx)';
      case 'application/vnd.ms-powerpoint':
        return 'PowerPoint Presentation (.ppt)';
      case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
        return 'PowerPoint Presentation (.pptx)';
      case 'text/plain':
        return 'Text Document';
      case 'application/rtf':
        return 'Rich Text Document';
      default:
        return mimeType;
    }
  };

  


  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const loadTask = async () => {
        setLoad(true);                    // show spinner
        try {
          const jwt = await getToken();
          const res = await fetch(`${endpoints.tasks}/${id}`, {
            headers: { Authorization: `Bearer ${jwt}` },
          });
          if (cancelled) return;          // component unmounted / unfocused
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          setTask(await res.json());
          setError(null);
        } catch (e: any) {
          if (!cancelled) setError(e.message ?? 'Unknown error');
        } finally {
          if (!cancelled) setLoad(false); // hide spinner
        }
      };

      loadTask();

      // cleanup ⇒ abort state updates after unmount / blur
      return () => { cancelled = true; };
    }, [id])
  );

  /*Prewarm cache as sonn as image arrives*/

  useEffect(() => {
  if (task?.images.length) {
    task.images.forEach(img =>
      // same 1 200 px variant you pass to the viewer ↓
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
              const res = await fetch(`${endpoints.tasks}/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${jwt}` },
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              router.back();           // return to the list
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
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !task) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#FF453A' }}>Failed to load task{error ? `: ${error}` : ''}</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: '#0A84FF' }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
      {/* ── main scrollable content ───────────────────────────── */}
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
          <Text style={{ fontSize: 22, fontWeight: '700', flexShrink: 1, color: '#1a1a1a' }}>
            {task.title}
          </Text>
        </View>

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

            {/* ─── specific target day/date ─── */}
            {task.recurrence === 'WEEKLY' && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontWeight: '600', color: '#666' }}>Day of week</Text>
                <Text style={{ color: '#1a1a1a' }}>
                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                  [task.recurrenceDow ?? 1]}
                </Text>
              </View>
            )}

            {task.recurrence === 'MONTHLY' && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontWeight: '600', color: '#666' }}>Day of month</Text>
                <Text style={{ color: '#1a1a1a' }}>{task.recurrenceDom ?? 1}</Text>
              </View>
            )}

            {task.recurrence === 'YEARLY' && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontWeight: '600', color: '#666' }}>Date</Text>
                <Text style={{ color: '#1a1a1a' }}>
                  {`${[
                    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
                  ][(task.recurrenceMonth ?? 1) - 1]} ${task.recurrenceDom ?? 1}`}
                </Text>
              </View>
            )}

            {/* last / next runs */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontWeight: '600', color: '#666' }}>Last occurrence</Text>
              <Text style={{ color: '#1a1a1a' }}>
                {task.lastOccurrence
                  ? new Date(task.lastOccurrence).toLocaleDateString()
                  : '—'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontWeight: '600', color: '#666' }}>Next occurrence</Text>
              <Text style={{ color: '#1a1a1a' }}>
                {task.nextOccurrence
                  ? new Date(task.nextOccurrence).toLocaleDateString()
                  : '—'}
              </Text>
            </View>
            {task.recurrenceEnd && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '600', color: '#666' }}>Ends</Text>
                <Text style={{ color: '#1a1a1a' }}>
                  {new Date(task.recurrenceEnd).toLocaleDateString()}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Description */}
        {task.description?.trim() && (
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
            <Text style={{ fontWeight: '600', marginBottom: 8, color: '#1a1a1a' }}>
              Description
            </Text>
            <Text style={{ color: '#666', lineHeight: 20 }}>{task.description}</Text>
          </View>
        )}


        <Text style={{ color: '#999', marginBottom: 16, fontSize: 12, textAlign: 'center' }}>
          Created: {new Date(task.createdAt).toLocaleString()}
        </Text>

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
            <Text style={{ fontWeight: '600', marginBottom: 12, color: '#1a1a1a' }}>Images</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {task.images.map((img, idx) => (
                <Pressable
                  key={img.id}
                  onPress={() => openViewer(idx)}          // opens modal
                  style={{ position: 'relative', marginRight: 12 }}
                >
                  <ExpoImage
                    source={{ uri: img.url, cacheKey: String(img.id) }}
                    style={{ width: 160, height: 160, borderRadius: 8 }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    priority="high"
                    transition={100}
                  />

                  {/* zoom badge */}
                  <View
                    style={{
                      position: 'absolute',
                      top: 8,
                      left: 8,
                      backgroundColor: 'rgba(0,0,0,0.7)',
                      paddingHorizontal: 6,
                      paddingVertical: 3,
                      borderRadius: 12,
                    }}
                  >
                    <Text style={{ color: 'white', fontSize: 10 }}>🔍</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}


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
            <Text style={{ fontWeight: '600', marginBottom: 12, color: '#1a1a1a' }}>Documents</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                             {task.documents.map((doc) => {
                 const isImg = doc.mime.startsWith('image/');
                 
                                   // Get the proper filename from the URL if name is not available
                  const getDisplayName = () => {
                    if (doc.name && doc.name !== `doc-${doc.id}`) {
                      // Use the name from database if it's not a generic doc-id
                      return decodeURIComponent(doc.name);
                    } else {
                      // Extract filename from URL
                      const filename = getDocFileName(doc.url);
                      // Remove UUID prefix if present (format: uuid_filename.pdf)
                      const cleanName = filename.includes('_') ? filename.split('_').slice(1).join('_') : filename;
                      // Decode any remaining URL encoding (like %20 for spaces)
                      return decodeURIComponent(cleanName) || `Document ${doc.id}`;
                    }
                  };
                 
                 const title = getDisplayName();

                return (
                  <View /* wrapper lets us layer the badge */
                    key={doc.id}
                    style={{ marginRight: 12, position: 'relative' }}
                  >
                    <Pressable
                      onPress={() => {
                        if (isImg) {
                          // For images, you could open in the image viewer
                          Alert.alert('Image Document', 'Image documents can be viewed in the image viewer');
                        } else {
                          // For documents, open with the document opener
                          openDocument(doc.url);
                        }
                      }}
                    >
                      {isImg ? (
                        <Image
                          source={{ uri: doc.url }}
                          style={{ width: 180, height: 180, borderRadius: 12 }}
                        />
                      ) : (
                        <View
                          style={{
                            width: 160,
                            height: 160,
                            borderRadius: 8,
                            backgroundColor: '#f8f9fa',
                            justifyContent: 'center',
                            alignItems: 'center',
                            position: 'relative',
                            borderWidth: 1,
                            borderColor: '#e9ecef',
                          }}
                        >
                          <Text style={{ fontSize: 36 }}>📄</Text>
                          <Text
                            numberOfLines={2}
                            style={{
                              marginTop: 8,
                              maxWidth: 140,
                              textAlign: 'center',
                              fontSize: 11,
                              color: '#666',
                              lineHeight: 14,
                            }}
                          >
                            {title}
                          </Text>
                          {/* Open icon overlay */}
                          <View style={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            backgroundColor: 'rgba(0,0,0,0.7)',
                            borderRadius: 12,
                            width: 24,
                            height: 24,
                            justifyContent: 'center',
                            alignItems: 'center',
                          }}>
                            <Text style={{ color: 'white', fontSize: 10 }}>📂</Text>
                          </View>
                        </View>
                      )}
                    </Pressable>

                    {/* ⓘ badge goes on top of everything */}
                    <InfoBadge onPress={async () => {
                      try {
                        console.log('Getting file size for:', doc.url);
                        
                        // Try HEAD request first (more efficient)
                        let response = await fetch(doc.url, { 
                          method: 'HEAD',
                          headers: {
                            'Accept': '*/*'
                          }
                        });
                        
                        let fileSize = 'Unknown size';
                        const contentLength = response.headers.get('content-length');
                        
                        console.log('Content-Length header:', contentLength);
                        
                        if (contentLength && contentLength !== '0') {
                          fileSize = formatFileSize(parseInt(contentLength));
                        } else {
                          // If HEAD doesn't work, try GET but abort quickly
                          console.log('HEAD failed, trying GET...');
                          const controller = new AbortController();
                          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
                          
                          try {
                            response = await fetch(doc.url, { 
                              signal: controller.signal,
                              headers: {
                                'Accept': '*/*'
                              }
                            });
                            
                            clearTimeout(timeoutId);
                            const getContentLength = response.headers.get('content-length');
                            
                            if (getContentLength && getContentLength !== '0') {
                              fileSize = formatFileSize(parseInt(getContentLength));
                            } else {
                              // Last resort: get size from response body
                              const blob = await response.blob();
                              fileSize = formatFileSize(blob.size);
                            }
                          } catch (getError) {
                            console.error('GET request failed:', getError);
                            fileSize = 'Unable to determine';
                          }
                        }
                        
                        console.log('Final file size:', fileSize);
                        
                        Alert.alert('Document Info', 
                          `Name: ${title}\n` +
                          `Type: ${getReadableFileType(doc.mime)}\n` +
                          `Size: ${fileSize}`
                        );
                      } catch (error) {
                        console.error('Error getting file size:', error);
                        // Fallback if we can't get file size
                        Alert.alert('Document Info', 
                          `Name: ${title}\n` +
                          `Type: ${getReadableFileType(doc.mime)}\n` +
                          `Size: Unable to determine`
                        );
                      }
                    }} />
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}



        {/* Action buttons */}
        <View style={{
          backgroundColor: 'white',
          marginTop: 24,
          marginHorizontal: 20,
          padding: 20,
          borderRadius: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 4,
        }}>
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: 12,
          }}>
            {/* Edit button */}
            <Pressable
              onPress={() => router.push(`/${id}/edit`)}
              style={{
                flex: 1,
                paddingVertical: 16,
                backgroundColor: '#FF9F0A',
                borderRadius: 12,
                alignItems: 'center',
                shadowColor: '#FF9F0A',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2,
                shadowRadius: 8,
                elevation: 6,
              }}
            >
              <Text style={{ color: 'white', fontWeight: '700', fontSize: 16 }}>Edit</Text>
            </Pressable>

            {/* Back button */}
            <Pressable
              onPress={() => router.push('/tasks')}
              style={{
                flex: 1,
                paddingVertical: 16,
                backgroundColor: '#0A84FF',
                borderRadius: 12,
                alignItems: 'center',
                shadowColor: '#0A84FF',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2,
                shadowRadius: 8,
                elevation: 6,
              }}
            >
              <Text style={{ color: 'white', fontWeight: '700', fontSize: 16 }}>Back</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>


      {viewerOpen && (
        <ImageViewing
          key={`viewer-${viewerNonce}`}
          images={task.images.map(i => ({
            uri: `${i.url}?w=1200`,
            cache: 'force-cache',      // ← always look in cache first
          }))}
          imageIndex={viewerIndex}
          visible
          onRequestClose={() => setViewerOpen(false)}
          swipeToCloseEnabled
          presentationStyle="overFullScreen"
        />
      )}


    </View>
  );

}
