import { useCallback, useState } from 'react';
import { View, FlatList, Text, Pressable, ActivityIndicator } from 'react-native';
import { useFocusEffect, router } from 'expo-router';

import { endpoints } from '../../src/api';
import { getToken }  from '../../src/auth';

/** Page size we request from the API */
const PAGE_SIZE = 50;

type Task = {
  id:       number;
  title:    string;
  status:   'PENDING' | 'ACTIVE' | 'DONE';
  recurrence: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  images:   { id:number; url:string }[];
};

const statusColor: Record<Task['status'], string> = {
  PENDING: '#FFD60A',
  ACTIVE:  '#FF453A',
  DONE:    '#32D74B',
};

export default function TaskList() {
  const [tasks,      setTasks]      = useState<Task[]>([]);
  const [loading,    setLoading]    = useState(false);   // initial & pull‑to‑refresh
  const [loadingMore,setLoadingMore]= useState(false);   // infinite scroll
  const [nextCursor, setNextCursor]= useState<number | null>(null);

  /** Hit the API with optional cursor → returns { tasks, nextCursor } */
  const fetchPage = async (cursor: number | null, replace = false) => {
    cursor ? setLoadingMore(true) : setLoading(true);

    try {
      const jwt = await getToken();

      const url = new URL(endpoints.tasks);
      url.searchParams.set('take', String(PAGE_SIZE));
      if (cursor) url.searchParams.set('cursor', String(cursor));

      /* 1️⃣ call the API once */
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${jwt}` } });
      const payload = await res.json();

      /* 2️⃣ guarantee every task has an images array */
      const newTasks: Task[] = (payload.tasks ?? []).map((t: any) => ({
        ...t,
        images: Array.isArray(t.images) ? t.images : [],   // never undefined
        recurrence: t.recurrence ?? 'NONE',
      }));

      /* 3️⃣ update state */
      setTasks(prev => (replace ? newTasks : [...prev, ...newTasks]));
      setNextCursor(payload.nextCursor);
    } finally {
      cursor ? setLoadingMore(false) : setLoading(false);
    }
  };


  /** initial load + refresh */
  // reload now returns void
  // ⬇️ replace your current `reload` definition with this
  const reload = useCallback(() => {
    (async () => {
      const jwt = await getToken();

      if (!jwt) {
        // not logged‑in → send the user to /auth/login
        router.replace('/auth/login');
        return;             // ⬅️ stop here, do NOT fetch tasks
      }

      // logged‑in → refresh the list as usual
      fetchPage(null, true);
    })();
  }, []);


  useFocusEffect(reload);


  /** onEndReached → load next page if available */
  const loadMore = () => {
    if (!loadingMore && nextCursor) fetchPage(nextCursor);
  };

  const renderItem = ({ item }: { item: Task }) => {
    const imgCount = item.images?.length ?? 0;

    return (
      <Pressable
        onPress={() => router.push(`/tasks/${item.id}`)}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderColor: "#E1E4E8",
          opacity: pressed ? 0.5 : 1,        // row tap feedback
        })}
      >
        {/* status bar */}
        <View
          style={{
            width: 6,
            height: 40,
            marginRight: 12,
            borderRadius: 3,
            backgroundColor: statusColor[item.status],
          }}
        />

        {/* title + image count (both now clickable as well) */}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "600" }}>{item.title}</Text>
          {/* ① recurring label */}
          {item.recurrence !== 'NONE' && (
            <Text style={{ color: '#6e6e6e', fontSize: 13 }}>Recurring</Text>
          )}

          {imgCount > 0 && (
            <Text style={{ color: "#6e6e6e", fontSize: 13, fontWeight: '600' }}>
              {imgCount} image{imgCount > 1 ? "s" : ""}
            </Text>
          )}
        </View>

        {/* chevron (kept for visual cue, still clickable) */}
        <Text style={{ fontSize: 18, color: "#0A84FF" }}>⟩</Text>
      </Pressable>
    );
  };



  return (
    <View style={{ flex: 1 }}>
      {loading && tasks.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(task) => String(task.id)}
          refreshing={loading}
          onRefresh={reload}
          renderItem={renderItem}
          onEndReachedThreshold={0.4}
          onEndReached={loadMore}
          ListFooterComponent={loadingMore ? (
            <ActivityIndicator style={{ marginVertical: 12 }} />
          ) : null}
        />
      )}

      <Pressable
        onPress={() => router.push('/tasks/add')}
        style={({ pressed }) => ({
          position: 'absolute',
          right: 24,
          bottom: 24,
          backgroundColor: '#0A84FF',
          borderRadius: 32,
          padding: 16,
          opacity: pressed ? 0.7 : 1,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
        })}
      >
        <Text style={{ color: 'white', fontSize: 24, lineHeight: 24 }}>＋</Text>
      </Pressable>
    </View>
  );
}
