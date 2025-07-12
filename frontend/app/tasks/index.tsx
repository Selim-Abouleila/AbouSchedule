import { useCallback, useState } from 'react';
import { View, FlatList, Text, Pressable, ActivityIndicator } from 'react-native';
import { useFocusEffect, router } from 'expo-router';

import { endpoints } from '../../src/api';
import { getToken }  from '../../src/auth';

type Task = {
  id:       number;
  title:    string;
  status:   'PENDING' | 'ACTIVE' | 'DONE';
  images:   { id:number; url:string }[];
};

/** Maps server status → accent colour */
const statusColor: Record<Task['status'], string> = {
  PENDING: '#FFD60A',   // yellow
  ACTIVE:  '#FF453A',   // red
  DONE:    '#32D74B',   // green
};

export default function TaskList() {
  const [tasks,   setTasks] = useState<Task[]>([]);
  const [loading, setLoad]  = useState(false);

  /** Fetch tasks in the order the API already returns (priority + size). */
  const load = async () => {
    setLoad(true);
    try {
      const jwt = await getToken();
      const res = await fetch(endpoints.tasks, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      const json = await res.json();
      setTasks(json as Task[]);
    } finally {
      setLoad(false);
    }
  };

  /** Reload whenever the screen gets focus (pull‑to‑refresh style). */
  useFocusEffect(useCallback(() => { load(); }, []));

  const renderItem = ({ item }: { item: Task }) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderColor: '#E1E4E8',
      }}
    >
      {/* coloured status bar */}
      <View
        style={{
          width: 6,
          height: 40,
          marginRight: 12,
          borderRadius: 3,
          backgroundColor: statusColor[item.status],
        }}
      />

      {/* main text area */}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '600' }}>{item.title}</Text>
        {item.images.length > 0 && (
          <Text style={{ color: '#6e6e6e', fontSize: 13 }}>
            {item.images.length} image{item.images.length > 1 ? 's' : ''}
          </Text>
        )}
      </View>

      {/* placeholder action button */}
      <Pressable
        onPress={() => router.push(`/tasks/${item.id}`)}   /* opens TaskLoader */
        style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.5 : 1 })}
      >
        <Text style={{ fontSize: 18, color: '#0A84FF' }}>⟩</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {loading && tasks.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(task) => String(task.id)}
          refreshing={loading}
          onRefresh={load}
          renderItem={renderItem}
        />
      )}

      {/* floating add‑task button */}
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
