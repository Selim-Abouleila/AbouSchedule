import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

import { endpoints } from '../../src/api';
import { getToken }  from '../../src/auth';
import { useFocusEffect } from "@react-navigation/native";

/*
  Place this file at:         app/tasks/[id].tsx
  The list screen already navigates via router.push(`/tasks/${id}`)
  so this component will be shown when a task row is tapped.
*/

type Task = {
  id:       number;
  title:    string;
  status:   'PENDING' | 'ACTIVE' | 'DONE';
  priority: string;
  size:     string;
  dueAt:    string | null;
  createdAt:string;
  images:   { id:number; url:string; mime:string }[];
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
      <Text style={{ color: '#6e6e6e', marginBottom: 12 }}>
        Created: {new Date(task.createdAt).toLocaleString()}
      </Text>

      {/* Images */}
      {task.images.length > 0 && (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontWeight: '600', marginBottom: 8 }}>Images</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {task.images.map((img) => (
              <Image
                key={img.id}
                source={{ uri: img.url }}
                style={{ width: 180, height: 180, borderRadius: 12, marginRight: 12 }}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Edit button */}
      <Pressable
        onPress={() => router.push(`../${id}/edit`)}
        style={{
          alignSelf: "center",
          marginTop: 15,
          paddingHorizontal: 24,
          paddingVertical: 10,
          backgroundColor: "#FF9F0A",   // orange
          borderRadius: 8,
        }}
      >
        <Text style={{ color: "white", fontWeight: "600" }}>Edit</Text>
      </Pressable>


      {/* Delete button */}
      <Pressable
        onPress={deleteTask}
        style={{
          alignSelf: "center",
          marginTop: 15,
          paddingHorizontal: 24,
          paddingVertical: 10,
          backgroundColor: "#FF3B30",   // red
          borderRadius: 8,
        }}
      >
        <Text style={{ color: "white", fontWeight: "600" }}>Delete</Text>
      </Pressable>


      {/* Back button */}
      <Pressable
        onPress={() => router.back()}
        style={{
          alignSelf: 'center',
          marginTop: 15,
          paddingHorizontal: 24,
          paddingVertical: 10,
          backgroundColor: '#0A84FF',
          borderRadius: 8,
        }}
      >
        <Text style={{ color: 'white', fontWeight: '600' }}>Back</Text>
      </Pressable>
    </ScrollView>
  );
}
