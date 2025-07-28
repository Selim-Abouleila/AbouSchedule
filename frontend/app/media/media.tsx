import React, { useEffect, useState, useCallback, useRef } from 'react';
import { FlatList, View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { localUri, pruneMediaCache } from '../../src/mediaCache';
import { endpoints } from '../../src/api';
import { getToken } from '../../src/auth';

/* ---------- types ---------- */
type Item = { id: number; url: string; mime: string; taskId: number; local?: string };
type Filter = 'images' | 'documents' | 'all';


export default function MediaScreen() {
  const [items, setItems]     = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<Filter>('images');   // ⬅️ default = pictures
  const localMap              = useRef<Record<string, string>>({});

  /* ---------- fetch list once ---------- */
  useEffect(() => {
    (async () => {
      await pruneMediaCache();
      const jwt = await getToken();
      const res = await fetch(endpoints.media, { headers: { Authorization: `Bearer ${jwt}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json(); // { images, documents }
      setItems([...data.images, ...data.documents]);
      setLoading(false);
    })();
  }, []);

  /* ---------- lazy‑download visible rows ---------- */
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: { item: Item }[] }) => {
      viewableItems.forEach(({ item }) => {
        if (!item.local && !localMap.current[item.url]) {
          localUri(item.url).then(local => {
            localMap.current[item.url] = local;
            setItems(prev => prev.map(it => (it.url === item.url ? { ...it, local } : it)));
          });
        }
      });
    },
    []
  );
  const viewabilityConfig = { itemVisiblePercentThreshold: 50 };

  /* ---------- derive filtered list ---------- */
  const filtered = items.filter(it =>
    filter === 'all'
      ? true
      : filter === 'images'
      ? it.mime.startsWith('image/')
      : !it.mime.startsWith('image/')
  );

  /* ---------- cell renderer ---------- */
  const render = useCallback(
    ({ item }: { item: Item }) => {
      const isImg = item.mime.startsWith('image/');
      const src   = { uri: item.local || item.url };

      return (
        <Pressable onPress={() => {}} style={{ width: 110, margin: 4 }}>
          {isImg ? (
            <ExpoImage
              source={src}
              style={{ width: 110, height: 110, borderRadius: 8 }}
              contentFit="cover"
              transition={0}
              cachePolicy="memory-disk"
              priority="low"
            />
          ) : (
            <View
              style={{
                width: 110,
                height: 110,
                borderRadius: 8,
                backgroundColor: '#E7E7E7',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 38 }}>📄</Text>
            </View>
          )}
        </Pressable>
      );
    },
    []
  );

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;

  /* ---------- filter bar pill ---------- */
  const Pill = ({ label, value }: { label: string; value: Filter }) => (
    <Pressable
      onPress={() => setFilter(value)}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginHorizontal: 4,
        borderRadius: 20,
        backgroundColor: filter === value ? '#007aff' : '#f0f0f0',
      }}
    >
      <Text style={{ color: filter === value ? '#fff' : '#333' }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1 }}>
      {/* filter bar */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginVertical: 8 }}>
        <Pill label="Pictures"  value="images"   />
        <Pill label="Documents" value="documents"/>
        <Pill label="All"       value="all"      />
      </View>

      {/* grid */}
      <FlatList
        data={filtered}
        keyExtractor={it => `${it.mime.startsWith('image/') ? 'i' : 'd'}-${it.id}`}
        numColumns={3}
        renderItem={render}
        pagingEnabled 
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        contentContainerStyle={{ padding: 8 }}
      />
    </View>
  );
}
