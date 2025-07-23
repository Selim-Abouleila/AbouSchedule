import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Button,
  Pressable,
  Alert,
} from "react-native";

import { Picker } from "@react-native-picker/picker";
import { useLocalSearchParams, router } from "expo-router";
import { endpoints } from "../../src/api";
import { getToken } from "../../src/auth";

/*  --- enums reused from AddTask ---  */
const PRIORITIES = ["NONE", "ONE", "TWO", "THREE", "IMMEDIATE", "RECURRENT"] as const;
const STATUSES   = ["PENDING", "ACTIVE", "DONE"]               as const;
const SIZES      = ["SMALL", "LARGE"]                          as const;
const RECURRENCES= ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]    as const;

export default function EditTask() {
  const { id } = useLocalSearchParams<{ id: string }>();

  /* ------- state (same shape as AddTask) ------------------ */
  const [title,        setTitle]        = useState("");
  const [description,  setDescription]  = useState("");
  const [priority,     setPriority]     = useState<typeof PRIORITIES[number]>("NONE");
  const [status,       setStatus]       = useState<typeof STATUSES[number]>("PENDING");
  const [size,         setSize]         = useState<typeof SIZES[number]>("LARGE");
  const [dueAt,        setDueAt]        = useState<Date | null>(null);
  const [timeCap,      setTimeCap]      = useState("");           // string for TextInput
  const [recurring,    setRecurring]    = useState(false);
  const [recurrence,   setRecurrence]   = useState<typeof RECURRENCES[number]>("DAILY");
  const [recEvery,     setRecEvery]     = useState("1");
  const [recEnd,       setRecEnd]       = useState<Date | null>(null);
  const [labelDone,    setLabelDone]    = useState(false);

  const [loading, setLoad] = useState(true);

  /* --------- fetch current task once ---------------------- */
  useEffect(() => {
    (async () => {
      try {
        const jwt = await getToken();
        const res = await fetch(`${endpoints.tasks}/${id}`, {
          headers: { Authorization: `Bearer ${jwt}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const t = await res.json();

        /* pre‑fill */
        setTitle(t.title);
        setDescription(t.description ?? "");
        setPriority(t.priority);
        setStatus(t.status);
        setSize(t.size);
        setDueAt(t.dueAt ? new Date(t.dueAt) : null);
        setTimeCap(t.timeCapMinutes ? String(t.timeCapMinutes) : "");
        setRecurring(t.recurrence !== "NONE");
        setRecurrence(t.recurrence);
        setRecEvery(t.recurrenceEvery ? String(t.recurrenceEvery) : "1");
        setRecEnd(t.recurrenceEnd ? new Date(t.recurrenceEnd) : null);
        setLabelDone(Boolean(t.labelDone));
      } catch (e) {
        Alert.alert("Failed to load task", String(e));
        router.back();
      } finally {
        setLoad(false);
      }
    })();
  }, [id]);

  /* ----------- submit PATCH ------------------------------- */
  const save = async () => {
    try {
      const jwt = await getToken();
      const body: any = {
        title,
        description,
        priority,
        status,
        size,
        dueAt: dueAt ? dueAt.toISOString() : null,
        timeCapMinutes: timeCap ? Number(timeCap) : null,
        recurrence: recurring ? recurrence : "NONE",
        recurrenceEvery: recurring ? Number(recEvery) : null,
        recurrenceEnd: recurring && recEnd ? recEnd.toISOString() : null,
        labelDone,
      };

      const res = await fetch(`${endpoints.tasks}/${id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      router.back();           // back to /tasks/[id]
    } catch (e) {
      Alert.alert("Failed to save", String(e));
    }
  };

  /* ------------- UI --------------------------------------- */
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Edit Task</Text>

      <TextInput
        placeholder="Title"
        value={title}
        onChangeText={setTitle}
        style={{ borderWidth: 1, borderRadius: 6, padding: 10 }}
      />

      <TextInput
        placeholder="Description"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={4}
        style={{
          borderWidth: 1,
          borderRadius: 6,
          padding: 10,
          minHeight: 120,
          textAlignVertical: "top",
        }}
      />

      {/* Priority */}
      <Text style={{ fontWeight: "600" }}>Priority</Text>
      <Picker selectedValue={priority} onValueChange={setPriority}>
        {PRIORITIES.map((p) => (
          <Picker.Item key={p} label={p} value={p} />
        ))}
      </Picker>

      {/* Status */}
      <Text style={{ fontWeight: "600" }}>Status</Text>
      <Picker selectedValue={status} onValueChange={setStatus}>
        {STATUSES.map((s) => (
          <Picker.Item key={s} label={s} value={s} />
        ))}
      </Picker>

      {/* Size */}
      <Text style={{ fontWeight: "600" }}>Size</Text>
      <Picker selectedValue={size} onValueChange={setSize}>
        {SIZES.map((s) => (
          <Picker.Item key={s} label={s} value={s} />
        ))}
      </Picker>

      {/* Time cap */}
      <Text style={{ fontWeight: "600" }}>Time Limit (min)</Text>
      <TextInput
        keyboardType="number-pad"
        value={timeCap}
        onChangeText={setTimeCap}
        style={{ borderWidth: 1, borderRadius: 6, padding: 10 }}
      />

      {/* Simple “done” toggle */}
      <Pressable
        onPress={() => setLabelDone(!labelDone)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginTop: 12,
        }}
      >
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: labelDone ? "#32D74B" : "#CCC",
          }}
        />
        <Text>Mark as done</Text>
      </Pressable>

      <Button title="Save" onPress={save} />
      <Button title="Cancel" onPress={() => router.back()} />
    </ScrollView>
  );
}
