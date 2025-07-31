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
    const fileUri = `${FileSystem.documentDirectory}documents/${filename}`;
    
    // Check if file exists locally
    const info = await FileSystem.getInfoAsync(fileUri);
    console.log('File info:', info);
    
    if (!info.exists) {
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
          await Sharing.shareAsync(fileUri, {
            mimeType: mimeType,
            dialogTitle: 'Open Document',
            UTI: getUTIForExtension(extension || '')
          });
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
    <View style={{ flex: 1 }}>
      {/* ── main scrollable content ───────────────────────────── */}
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <View
            style={{
              width: 10,
              height: 50,
              marginRight: 12,
              borderRadius: 4,
              backgroundColor: statusColor[task.status],
            }}
          />
          <Text style={{ fontSize: 24, fontWeight: '700', flexShrink: 1 }}>
            {task.title}
          </Text>
        </View>

        {/* Meta */}
        <Text style={{ marginBottom: 4 }}>
          <Text style={{ fontWeight: '600' }}>Priority: </Text>
          {task.priority}
        </Text>
        <Text style={{ marginBottom: 4 }}>
          <Text style={{ fontWeight: '600' }}>Size: </Text>
          {task.size}
        </Text>
        <Text style={{ marginBottom: 4 }}>
          <Text style={{ fontWeight: '600' }}>Status: </Text>
          {task.status}
        </Text>
        {task.dueAt && (
          <Text style={{ marginBottom: 4 }}>
            <Text style={{ fontWeight: '600' }}>Due: </Text>
            {new Date(task.dueAt).toLocaleString()}
          </Text>
        )}

        {/* Recurrence (only when the task is a template) */}
        {task.recurrence !== 'NONE' && (
          <>
            <Text style={{ fontWeight: '600', marginBottom: 4 }}>Recurrence: </Text>

            {/* type & frequency */}
            <Text style={{ marginBottom: 4 }}>
              <Text style={{ fontWeight: '600' }}>  -Type: </Text>
              {task.recurrence}
            </Text>
            <Text style={{ marginBottom: 4 }}>
              <Text style={{ fontWeight: '600' }}>  -Every: </Text>
              {task.recurrenceEvery ?? 1}
            </Text>

            {/* ─── specific target day/date ─── */}
            {task.recurrence === 'WEEKLY' && (
              <Text style={{ marginBottom: 4 }}>
                <Text style={{ fontWeight: '600' }}>  -Day of week: </Text>
                {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                [task.recurrenceDow ?? 1]}
              </Text>
            )}

            {task.recurrence === 'MONTHLY' && (
              <Text style={{ marginBottom: 4 }}>
                <Text style={{ fontWeight: '600' }}>  -Day of month: </Text>
                {task.recurrenceDom ?? 1}
              </Text>
            )}

            {task.recurrence === 'YEARLY' && (
              <Text style={{ marginBottom: 4 }}>
                <Text style={{ fontWeight: '600' }}>  -Date: </Text>
                {`${[
                  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
                ][(task.recurrenceMonth ?? 1) - 1]} ${task.recurrenceDom ?? 1}`}
              </Text>
            )}

            {/* last / next runs */}
            <Text style={{ marginBottom: 4 }}>
              <Text style={{ fontWeight: '600' }}>  -Last occurrence: </Text>
              {task.lastOccurrence
                ? new Date(task.lastOccurrence).toLocaleString()
                : '—'}
            </Text>
            <Text style={{ marginBottom: 12 }}>
              <Text style={{ fontWeight: '600' }}>  -Next occurrence: </Text>
              {task.nextOccurrence
                ? new Date(task.nextOccurrence).toLocaleString()
                : '—'}
            </Text>
          </>
        )}

        {/* Description */}
        {task.description?.trim() && (
          <View style={{ marginTop: 12, marginBottom: 12 }}>
            <Text style={{ fontWeight: '600', marginBottom: 2 }}>
              Description
            </Text>
            <Text>{task.description}</Text>
          </View>
        )}


        <Text style={{ color: '#6e6e6e', marginBottom: 12 }}>
          Created: {new Date(task.createdAt).toLocaleString()}
        </Text>

        {/* Images */}
        {task.images.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontWeight: '600', marginBottom: 8 }}>Images</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {task.images.map((img, idx) => (
                <Pressable
                  key={img.id}
                  onPress={() => openViewer(idx)}          // opens modal
                  style={{ position: 'relative', marginRight: 12 }}
                >
                  <ExpoImage
                    source={{ uri: img.url, cacheKey: String(img.id) }}
                    style={{ width: 180, height: 180, borderRadius: 12 }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    priority="high"
                    transition={100}
                  />

                  {/* zoom badge */}
                  <View
                    style={{
                      position: 'absolute',
                      top: 6,
                      left: 6,
                      backgroundColor: '#0008',
                      paddingHorizontal: 4,
                      paddingVertical: 1,
                      borderRadius: 6,
                    }}
                  >
                    <Text style={{ color: 'white', fontSize: 12 }}>🔍</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}


        {task.documents.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontWeight: '600', marginBottom: 8 }}>Documents</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {task.documents.map((doc) => {
                const isImg = doc.mime.startsWith('image/');
                const name = doc.name ?? `doc-${doc.id}`;
                const decodedName = decodeURIComponent(name);
                const title = decodedName.includes('_') ? decodedName.split('_').slice(1).join('_') : decodedName;

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
                            width: 180,
                            height: 180,
                            borderRadius: 12,
                            backgroundColor: '#E9E9E9',
                            justifyContent: 'center',
                            alignItems: 'center',
                            position: 'relative',
                          }}
                        >
                          <Text style={{ fontSize: 40 }}>📄</Text>
                          <Text
                            numberOfLines={2}
                            style={{
                              marginTop: 8,
                              maxWidth: 160,
                              textAlign: 'center',
                              fontSize: 12,
                              color: '#666',
                            }}
                          >
                            {title}
                          </Text>
                          {/* Open icon overlay */}
                          <View style={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            backgroundColor: '#0008',
                            borderRadius: 12,
                            width: 24,
                            height: 24,
                            justifyContent: 'center',
                            alignItems: 'center',
                          }}>
                            <Text style={{ color: 'white', fontSize: 12 }}>📂</Text>
                          </View>
                        </View>
                      )}
                    </Pressable>

                    {/* ⓘ badge goes on top of everything */}
                    <InfoBadge onPress={() => Alert.alert('Document Info', `Name: ${title}\nType: ${doc.mime}`)} />
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}



        {/* Action buttons */}
        <View style={{
          flexDirection: 'row',
          justifyContent: 'space-around',
          marginTop: 20,
          paddingHorizontal: 20,
        }}>
          {/* Edit button */}
          <Pressable
            onPress={() => router.push(`../${id}/edit`)}
            style={{
              paddingHorizontal: 20,
              paddingVertical: 10,
              backgroundColor: '#FF9F0A',
              borderRadius: 8,
              minWidth: 80,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: 'white', fontWeight: '600' }}>Edit</Text>
          </Pressable>

          {/* Delete button */}
          <Pressable
            onPress={deleteTask}
            style={{
              paddingHorizontal: 20,
              paddingVertical: 10,
              backgroundColor: '#FF3B30',
              borderRadius: 8,
              minWidth: 80,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: 'white', fontWeight: '600' }}>Delete</Text>
          </Pressable>

          {/* Back button */}
          <Pressable
            onPress={() => router.back()}
            style={{
              paddingHorizontal: 20,
              paddingVertical: 10,
              backgroundColor: '#0A84FF',
              borderRadius: 8,
              minWidth: 80,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: 'white', fontWeight: '600' }}>Back</Text>
          </Pressable>
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
