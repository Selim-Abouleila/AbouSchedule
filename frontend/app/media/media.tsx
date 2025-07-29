// src/screens/Media.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, Image, Text, Pressable, ActivityIndicator, StyleSheet, Share, Button, Platform} from 'react-native';
import ImageViewing from 'react-native-image-viewing';
import { syncMedia, getLocalMediaUris, getLocalDocumentUris } from '../../src/mediaCache';
import { Ionicons } from '@expo/vector-icons'




export default function MediaScreen() {
  const [mode, setMode] = useState<'images' | 'documents'>('images');
  const [uris, setUris] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex]     = useState(0);

  const loadMedia = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      await syncMedia();
      const data = mode === 'images'
        ? await getLocalMediaUris()
        : await getLocalDocumentUris();
      setUris(data);
    } catch (err) {
      console.error('Failed to load media:', err);
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, [mode]);

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
        <ActivityIndicator size="large" />
      </View>
    );
  }

 


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
      // after
      // strip off any path (and protocol) so we get just “MyDoc.pdf”
      const filename = item.replace(/^.*[\\\/]/, '');
      // drop the extension if you want “MyDoc” instead of “MyDoc.pdf”
      const rawName = item.split('/').pop()!;       // e.g. "26a0878f‑cfb1‑408e‑956a‑e90285d28155_MyDoc.pdf"
      const title = rawName.slice(37);           // drops the "26a0878f…_"

      return (
        <View style={styles.docWrapper}>
          <Text style={styles.docIcon}>📄</Text>
          <Text style={styles.docTitle}>{title}</Text>
        </View>
      );
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.toggleRow}>
        <Pressable
          style={[styles.toggleButton, mode === 'images' && styles.activeToggle]}
          onPress={() => setMode('images')}
        >
          <Text style={mode === 'images' ? styles.activeText : styles.inactiveText}>Images</Text>
        </Pressable>
        <Pressable
          style={[styles.toggleButton, mode === 'documents' && styles.activeToggle]}
          onPress={() => setMode('documents')}
        >
          <Text style={mode === 'documents' ? styles.activeText : styles.inactiveText}>Documents</Text>
        </Pressable>
      </View>
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
      />
      {/* Fullscreen viewer for images */}
      <ImageViewing
        images={uris.map(u => ({ uri: u }))}
        imageIndex={viewerIndex}
        visible={viewerVisible}
        onRequestClose={() => setViewerVisible(false)}
      />
      {selected.size > 0 && (
        <View style={styles.bulkToolbar}>
          <Text style={styles.bulkCount}>{selected.size} selected</Text>
          <Button title="Share" onPress={shareSelected} />

          {/* ⬇️ new cancel button – clears the Set and exits selection‑mode */}
          <Button
            title="Cancel"
            onPress={() => setSelected(new Set())}
            color="#FF3B30"      // optional: red so it stands out
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  toggleRow: { flexDirection: 'row', justifyContent: 'center', marginVertical: 8 },
  toggleButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 4, marginHorizontal: 4, backgroundColor: '#eee' },
  activeToggle: { backgroundColor: '#0A84FF' },
  activeText: { color: 'white', fontWeight: '600' },
  inactiveText: { color: '#333' },
  list: { padding: 8 },
  columnWrapper: { justifyContent: 'center' },
    imageWrapper: {
  padding: 4,
  position: 'relative',      // allow absolute children
},
  image: { width: 100, height: 100, borderRadius: 8 },
  docWrapper: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderColor: '#ddd' },
  docIcon: { fontSize: 24, marginRight: 8 },
  docTitle: { fontSize: 16, flexShrink: 1 },
shareButton: {
  position: 'absolute',
  top: 6,
  right: 6,
  backgroundColor: 'rgba(0,0,0,0.6)',
  padding: 4,
  borderRadius: 12,
},
  checkOverlay: {
    position: 'absolute',
    top: 6,
    left: 6,
  },
    bulkToolbar: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#0008',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  bulkCount: { color: '#fff', fontSize: 16 },


});
