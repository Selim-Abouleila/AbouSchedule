import { useState } from "react";
import {
  View,
  ScrollView,
  KeyboardAvoidingView,
  Text,
  TextInput,
  Button,
  Pressable,
  Image,
  Alert,
  Platform,         // ← this one
} from "react-native";

import * as ImagePicker from "expo-image-picker";
import { Picker } from "@react-native-picker/picker";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { router } from "expo-router";

import { endpoints } from "../../src/api";
import { getToken } from "../../src/auth";



const PRIORITIES = [
  "IMMEDIATE",
  "RECURRENT",
  "ONE",
  "TWO",
  "THREE",
  "NONE",
] as const;
const STATUSES = ["PENDING", "ACTIVE", "DONE"] as const;
const SIZES = ["SMALL", "LARGE"] as const;
const RECURRENCES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;

export default function AddTask() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPrio] = useState("NONE" as typeof PRIORITIES[number]);
  const [status, setStat] = useState("PENDING" as typeof STATUSES[number]);
  const [size, setSize] = useState("LARGE" as typeof SIZES[number]);
  const [dueAt, setDueAt] = useState<Date | null>(null);
  const [showIOS, setShowIOS] = useState(false);

  const [timeCap, setTimeCap] = useState("");            // minutes (string so TextInput works)
  const [recurring, setRecurring] = useState(false);         // checkbox / switch
  const [recurrence, setRecurrence] = useState<typeof RECURRENCES[number]>("DAILY");
  const [recurrenceEvery, setRecurrenceEvery] = useState("1");           // “every X …”
  const [recurrenceEnd, setRecurrenceEnd] = useState<Date | null>(null);
  const [showIOSRecEnd, setShowIOSRecEnd] = useState(false);

  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [loading, setLoad] = useState(false);

  /* pick image(s) */
  const pickImages = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 6,
    });
    if (!res.canceled) setPhotos((prev) => [...prev, ...res.assets]);
  };

  /* pick date */
  const showPicker = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: dueAt ?? new Date(),
        mode: "date",
        onChange: (_, date) => {
          if (!date) return;
          DateTimePickerAndroid.open({
            value: date,
            mode: "time",
            is24Hour: true,
            onChange: (_, time) => {
              if (!time) return;
              setDueAt(
                new Date(
                  date.getFullYear(),
                  date.getMonth(),
                  date.getDate(),
                  time.getHours(),
                  time.getMinutes()
                )
              );
            },
          });
        },
      });
    } else {
      setShowIOS(true);
    }
  };

  /* save */
  const save = async () => {
    if (!title) return Alert.alert("Please enter a title");
    setLoad(true);

    const jwt = await getToken();
    const form = new FormData();

    form.append("title", title);
    form.append("description", description);
    form.append("priority", priority);
    form.append("status", status);
    form.append("size", size);
    if (dueAt) form.append("dueAt", dueAt.toISOString());

    photos.forEach((p, idx) =>
      form.append(`photo${idx}`, {
        uri: p.uri,
        name: p.fileName ?? `photo${idx}.jpg`,
        type: p.mimeType ?? "image/jpeg",
      } as any)
    );


    /* before fetch() */
    if (timeCap) form.append("timeCapMinutes", timeCap);
    if (recurring) {
      form.append("recurrence", recurrence);
      form.append("recurrenceEvery", recurrenceEvery);
      if (recurrenceEnd) form.append("recurrenceEnd", recurrenceEnd.toISOString());
    }


    const res = await fetch(endpoints.tasks, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: form,
    });

    setLoad(false);
    if (!res.ok) {
      return Alert.alert("Failed", await res.text());
    }
    router.back();
  };



  /* UI */



  /* UI */
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 24, gap: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ padding: 24, gap: 12 }}>
          {/* Title */}
          <TextInput
            placeholder="Task title"
            value={title}
            onChangeText={setTitle}
            style={{ borderWidth: 1, padding: 10, borderRadius: 6 }}
          />

          {/* Description */}
          <TextInput
            placeholder="Description"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            style={{ borderWidth: 1, borderRadius: 6, padding: 10, minHeight: 120, textAlignVertical: "top" }}
          />

          {/* Priority */}
          <Text style={{ fontWeight: "bold", marginTop: 8 }}>PRIORITY</Text>
          <Picker selectedValue={priority} onValueChange={setPrio}>
            {PRIORITIES.map((p) => <Picker.Item key={p} label={p} value={p} />)}
          </Picker>

          {/* Status */}
          <Text style={{ fontWeight: "bold", marginTop: 8 }}>STATUS</Text>
          <Picker selectedValue={status} onValueChange={setStat}>
            {STATUSES.map((s) => <Picker.Item key={s} label={s} value={s} />)}
          </Picker>

          {/* Size */}
          <Text style={{ fontWeight: "bold", marginTop: 8 }}>SIZE</Text>
          <Picker selectedValue={size} onValueChange={setSize}>
            {SIZES.map((s) => <Picker.Item key={s} label={s} value={s} />)}
          </Picker>

          {/* Time‑cap */}
          <Text style={{ fontWeight: "bold", marginTop: 8 }}>TIME LIMIT (min)</Text>
          <TextInput
            keyboardType="number-pad"
            value={timeCap}
            onChangeText={setTimeCap}
            placeholder="e.g. 90"
            style={{ borderWidth: 1, borderRadius: 6, padding: 10 }}
          />

          {/* Recurring switch */}
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}>
            <Text style={{ fontWeight: "bold", marginRight: 12 }}>RECURRING</Text>
            <Pressable
              onPress={() => setRecurring(!recurring)}
              style={{
                width: 50,
                height: 30,
                borderRadius: 15,
                backgroundColor: recurring ? "#0A84FF" : "#CCC",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: "white",
                  alignSelf: recurring ? "flex-end" : "flex-start",
                  margin: 3,
                }}
              />
            </Pressable>
          </View>

          {/* Recurrence details */}
          {recurring && (
            <>
              {/* Frequency */}
              <Text style={{ fontWeight: "bold", marginTop: 8 }}>FREQUENCY</Text>
              <Picker selectedValue={recurrence} onValueChange={setRecurrence}>
                {RECURRENCES.map((r) => <Picker.Item key={r} label={r} value={r} />)}
              </Picker>

              {/* Every X */}
              <Text style={{ fontWeight: "bold", marginTop: 8 }}>EVERY</Text>
              <TextInput
                keyboardType="number-pad"
                value={recurrenceEvery}
                onChangeText={setRecurrenceEvery}
                placeholder="e.g. 2"
                style={{ borderWidth: 1, borderRadius: 6, padding: 10 }}
              />

              {/* Recurrence end */}
              <Button
                title={recurrenceEnd ? `Ends ${recurrenceEnd.toLocaleDateString()}` : "End date (optional)"}
                onPress={() => {
                  if (Platform.OS === "android") {
                    DateTimePickerAndroid.open({
                      value: recurrenceEnd ?? new Date(),
                      mode: "date",
                      onChange: (_, d) => d && setRecurrenceEnd(d),
                    });
                  } else {
                    setShowIOSRecEnd(true);
                  }
                }}
              />
              {Platform.OS === "ios" && showIOSRecEnd && (
                <DateTimePicker
                  value={recurrenceEnd ?? new Date()}
                  mode="date"
                  display="inline"
                  onChange={(_, d) => {
                    setShowIOSRecEnd(false);
                    d && setRecurrenceEnd(d);
                  }}
                />
              )}
            </>
          )}

          {/* Due date */}
          <Button
            title={dueAt ? dueAt.toLocaleString() : "Due date"}
            onPress={showPicker}
          />
          {Platform.OS === "ios" && showIOS && (
            <DateTimePicker
              value={dueAt ?? new Date()}
              mode="datetime"
              display="inline"
              onChange={(_, d) => {
                setShowIOS(false);
                if (d) setDueAt(d);
              }}
            />
          )}

          {/* Photo thumbnails + picker */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {photos.map((p, i) => (
              <Pressable key={i} onLongPress={() => setPhotos(prev => prev.filter((_, j) => j !== i))}>
                <Image source={{ uri: p.uri }} style={{ width: 70, height: 70, borderRadius: 8 }} />
              </Pressable>
            ))}
            <Pressable
              onPress={pickImages}
              style={{
                width: 70,
                height: 70,
                borderRadius: 8,
                backgroundColor: "#E9E9E9",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 28, color: "#555" }}>＋</Text>
            </Pressable>
          </View>

          {/* Action buttons */}
          <Button title={loading ? "Saving…" : "Save"} onPress={save} disabled={loading} />
          <Button title="← Back" onPress={() => router.back()} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

}
