import { useState, useEffect, useCallback } from "react";
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
  Platform,
} from "react-native";

import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Picker } from "@react-native-picker/picker";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";

import { endpoints } from "../../../src/api";
import { getToken } from "../../../src/auth";
import { useFocusEffect } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useMemo, useRef } from "react";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";


const PRIORITIES = [
  "NONE",
  "ONE",
  "TWO",
  "THREE",
  "IMMEDIATE",
  "RECURRENT"
] as const;


  /* Stylesheet for Image picker */
  const styles = StyleSheet.create({
  
  pickerBox: {
    width: 70,
    height: 70,
    borderRadius: 8,
    backgroundColor: '#E9E9E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  pickerIcon: { fontSize: 28, color: '#555' },

  /* thumbnails */
  thumbRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 12,
  },
  thumb: { width: 70, height: 70, borderRadius: 8 },

  /* picker buttons row */
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },

  docRow: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 8,
  justifyContent: 'center',
  marginBottom: 12,
},

infoBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: '#0008',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    zIndex: 10,
  },
  infoText: { fontSize: 10, color: '#fff' },

});






/* helper badge component — place it near the top of this file */
/* helper — now returns a Pressable */
const InfoBadge = ({ onPress }: { onPress: () => void }) => (
  <Pressable onPress={onPress} style={styles.infoBadge}>
    <Text style={styles.infoText}>ⓘ</Text>
  </Pressable>
);





const STATUSES = ["ACTIVE", "DONE", "PENDING"] as const;
const SIZES = ["SMALL", "LARGE"] as const;
const RECURRENCES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;

export default function AddTask() {
  const params = useLocalSearchParams();
  const userId = params.userId ? parseInt(params.userId as string) : null;
  const userDisplayName = params.userDisplayName as string;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPrio] = useState("NONE" as typeof PRIORITIES[number]);
  const [status, setStat] = useState("PENDING" as typeof STATUSES[number]);
  const [size, setSize] = useState("LARGE" as typeof SIZES[number]);
  const [dueAt, setDueAt] = useState<Date | null>(null);
  const [showIOS,     setShowIOS]     = useState(false);  
  const [showCapIOS,  setShowCapIOS]  = useState(false);

  
  const [timeCapH, setTimeCapH] = useState(0);
  const [timeCapM, setTimeCapM] = useState(0);   


  
  const [recurring, setRecurring] = useState(false);         
  const [recurrence, setRecurrence] = useState<typeof RECURRENCES[number]>("DAILY");
  const [recurrenceEvery, setRecurrenceEvery] = useState("1");           
  const [recurrenceEnd, setRecurrenceEnd] = useState<Date | null>(null);
  const [showIOSRecEnd, setShowIOSRecEnd] = useState(false);
  const [labelDone, setLabelDone] = useState(true); 


  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [docs, setDocs] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
  const [loading, setLoad] = useState(false);



const [selectedPhotos, setSelectedPhotos] = useState<Set<number>>(new Set());
const [selectedDocs,   setSelectedDocs]   = useState<Set<number>>(new Set());

/* For reccurance */
const [recurrenceDow, setRecurrenceDow] = useState("1");  // 0 = Sun … 6 = Sat; default Monday
const [recurrenceDom, setRecurrenceDom] = useState("1");  // 1 – 31
const [recurrenceMonth, setRecurrenceMonth] = useState("1");
const [showYearlyPicker, setShowYearlyPicker] = useState(false);

/* Forbidding negative numbers for reccurence */
const handleEveryChange = (txt: string) => {
  // keep only 0‑9; remove minus signs, spaces, letters, etc.
  const clean = txt.replace(/[^0-9]/g, '');
  setRecurrenceEvery(clean);
};



/* This is for yearly recurring tasks */
const openYearlyPicker = () => {
  if (Platform.OS === "android") {
    // any placeholder date; we ignore the year later
    DateTimePickerAndroid.open({
      value: new Date(),                // today
      mode: "date",
      onChange: (_, d) => {
        if (!d) return;
        setRecurrenceMonth(String(d.getMonth() + 1)); // 0‑based → 1‑based
        setRecurrenceDom(String(d.getDate()));
      },
    });
  } else {
    setShowYearlyPicker(true);          // will render inline spinner
  }
};


/* Tool to reset Time cap */

const resetTimeCap = () => {
  setTimeCapH(0);
  setTimeCapM(0);
  setShowCapIOS(false);     // make sure the inline spinner disappears
};


/* Back Button Driling so no task is lost */
const hasUnsavedChanges = useMemo(
  () =>
    title.trim() !== "" ||
    description.trim() !== "" ||
    photos.length > 0 ||
    docs.length > 0 ||
    dueAt !== null ||
    recurring ||                       // anything else you care about
    timeCapH !== 0 || timeCapM !== 0,
  [
    title,
    description,
    photos,
    docs,
    dueAt,
    recurring,
    timeCapH,
    timeCapM,
  ],
);
const navigation = useNavigation();





/* Recurrence reset */
useEffect(() => {
  if (recurrence !== "WEEKLY")  setRecurrenceDow("1");
  if (recurrence !== "MONTHLY") setRecurrenceDom("1");
  if (recurrence !== "YEARLY") {
    setRecurrenceMonth("1");
    setRecurrenceDom("1");
  }
}, [recurrence]);


/* Ability to delete multiple pictures */

const togglePhoto = (idx: number) =>
  setSelectedPhotos(prev => {
    const next = new Set(prev);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    return next;
  });

const toggleDoc = (idx: number) =>
  setSelectedDocs(prev => {
    const next = new Set(prev);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    return next;
  });

const deleteChecked = () => {
  if (selectedPhotos.size)
    setPhotos(p => p.filter((_, i) => !selectedPhotos.has(i)));
  if (selectedDocs.size)
    setDocs(d => d.filter((_, i) => !selectedDocs.has(i)));
  setSelectedPhotos(new Set());
  setSelectedDocs(new Set());
};

const abortDelete = () => {
  setSelectedPhotos(new Set());
  setSelectedDocs(new Set());
};

const hasSelection = selectedPhotos.size > 0 || selectedDocs.size > 0;
const scrollRef = useRef<ScrollView>(null);

  /* keep priority in sync with the recurring toggle */
  useEffect(() => {
    if (recurring) setPrio("RECURRENT");
    else if (priority === "RECURRENT") setPrio("NONE");
  }, [recurring, priority]);  

  const [removedSomething, setRemovedSomething] = useState(false);


  /*Time cap picker */
  const showTimeCapPicker = () => {
  const initial = new Date(0, 0, 0, timeCapH, timeCapM);

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: initial,
        mode: 'time',
        is24Hour: true,
        onChange: (_, d) => {
          if (!d) return;
          setTimeCapH(d.getHours());
          setTimeCapM(d.getMinutes());
        },
      });
    } else {
     
      
      setShowCapIOS(true);
    }
  };

  /** open device camera, then push the result into `photos` */
  const takePhoto = async () => {
    
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) {
      Alert.alert('Camera access was denied');
      return;
    }
    if (photos.length >= 6) { Alert.alert('Maximum 6 pictures'); return; }

    const res = await ImagePicker.launchCameraAsync({
      quality: 0.9,        
      allowsEditing: false, 
      exif: false,               
    });

    if (!res.canceled && res.assets?.length) {
      setPhotos(prev => [...prev, ...res.assets]);
    }
  };

  /* pick image(s) */
  const pickImages = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 6,
    });
    if (!res.canceled) setPhotos((prev) => [...prev, ...res.assets]);
  };

  /* pick Doc(s) */
  const pickDocs = async () => {
   
    const result: any = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: false,
    });

    /* ───── SDK 50+ ───── */
    if ('canceled' in result) {
      if (result.canceled) return;                      
      if (Array.isArray(result.assets) && result.assets.length) {
        setDocs(prev => [...prev, ...result.assets]);
      }
      return;
    }

    /* ───── SDK 49 and earlier ───── */
    if (result.type === 'cancel') return;      
    setDocs(prev => [
      ...prev,
      { uri: result.uri, name: result.name, mimeType: result.mimeType } as any,
    ]);
  };

  useFocusEffect(
  useCallback(() => {
    setPhotos([]);
    setDocs([]);
    setTitle('');
    setDescription('');
    setPrio('NONE');
    setStat('ACTIVE');
    setSize('LARGE');
    setDueAt(null);
    setTimeCapH(0);
    setTimeCapM(0);
    setShowCapIOS(false);
    setRecurring(false);
    setRecurrence('DAILY');
    setRecurrenceEvery('1');
    setRecurrenceEnd(null);
    setLabelDone(true);
    setSelectedPhotos(new Set());
    setSelectedDocs(new Set());
    setShowIOS(false);
    setShowIOSRecEnd(false); 
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [])
);

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

  /* Recuurrance Confirmation */
  const confirmRecurring = () => {
    Alert.alert(
      "Recurring task",
      "Are you sure you want this task to be recurring?",
      [
        { text: "Back", style: "cancel" },                
        { text: "Yes", onPress: () => setRecurring(true) } 
      ]
    );
  };


  const resetForm = () => {
    setTitle("");
    setDescription("");
    setPrio("NONE");
    setStat("ACTIVE");
    setSize("LARGE");
    setDueAt(null);
    setRecurring(false);
    setRecurrence("DAILY");
    setRecurrenceEvery("1");
    setRecurrenceEnd(null);
    setLabelDone(true);
    setShowIOS(false);
    setShowIOSRecEnd(false);
  };


  /* save */
  const save = async () => {
    if (!title) return Alert.alert("Please enter a title");
    if (!userId) return Alert.alert("No user selected");
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

    docs.forEach((d, idx) =>
      form.append(`doc${idx}`, {
        uri: d.uri,
        name: d.name ?? `doc${idx}`,
        type: (d as any).mimeType ?? 'application/octet-stream',
      } as any)
    );

    /* before fetch() */
    const totalMinutes = timeCapH * 60 + timeCapM;
    if (totalMinutes > 0) form.append('timeCapMinutes', String(totalMinutes));

    if (recurring) {
      form.append("recurrence", recurrence);
      form.append("recurrenceEvery", recurrenceEvery);

      if (recurrence === "WEEKLY") form.append("recurrenceDow", recurrenceDow);
      if (recurrence === "MONTHLY") form.append("recurrenceDom", recurrenceDom);
      if (recurrence === "YEARLY") {
        form.append("recurrenceMonth", recurrenceMonth);
        form.append("recurrenceDom", recurrenceDom);
      }




      if (recurrenceEnd) form.append("recurrenceEnd", recurrenceEnd.toISOString());
    }
    form.append("labelDone", labelDone.toString());

    const res = await fetch(endpoints.admin.userTasks(userId), {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: form,
    });

    setLoad(false);
    if (!res.ok) {
      return Alert.alert("Failed", await res.text());
    }
    resetForm();
    router.push('/admin');
  };

  const handleBack = useCallback(() => {
    if (!hasUnsavedChanges) {           // ⬅️  let React Navigation do its thing
      router.push('/admin');
      return;
    }

    Alert.alert(
      "Save task?",
      "Do you want to save before leaving?",
      [
        {
          text: "No",
          style: "destructive",
          onPress: () =>
            Alert.alert(
              "Delete draft?",
              "Are you sure? This cannot be undone.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () => {
                    resetForm();
                    router.push('/admin');
                  },
                },
              ],
            ),
        },
        { text: "Yes", onPress: save },
        { text: "Cancel", style: "cancel" },
      ],
    );
  }, [hasUnsavedChanges, save, resetForm]);

  // Navigation listener for back button/gesture
  useEffect(() => {
    const sub = navigation.addListener("beforeRemove", (e) => {
      // stop the default behaviour
      e.preventDefault();
      handleBack();
    });
    return sub;
  }, [navigation, handleBack]);


  /* UI */
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 24, gap: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ padding: 24, gap: 12 }}>
          {/* User info header with back button */}
          <View style={{
            backgroundColor: 'white',
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: '#e9ecef',
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 16,
            borderRadius: 8,
          }}>
            <Pressable
              onPress={handleBack}
              style={{
                marginRight: 16,
                padding: 8,
              }}>
              <Ionicons name="arrow-back" size={24} color="#0A84FF" />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, color: '#6c757d', marginBottom: 4 }}>
                Adding task for:
              </Text>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#1a1a1a' }}>
                {userDisplayName}
              </Text>
            </View>
          </View>

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

          {/* Priority (hidden if recurring) */}
          {!recurring && (
            <>
              <Text style={{ fontWeight: "bold", marginTop: 8 }}>PRIORITY</Text>
              <Picker selectedValue={priority} onValueChange={setPrio}>
                {PRIORITIES
                  .filter(p => p !== "RECURRENT")
                  .map(p => <Picker.Item key={p} label={p} value={p} />)}
              </Picker>
            </>
          )}

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

          {/* Time-cap */}
          <Text style={{ fontWeight: 'bold', marginTop: 8 }}>TIME CAP</Text>

          <Button
            title={
              timeCapH === 0 && timeCapM === 0
                ? 'Set time cap'
                : `${timeCapH} h ${timeCapM} min`
            }
            onPress={showTimeCapPicker}
          />

          {(timeCapH !== 0 || timeCapM !== 0) && (
            <Button
              title="Clear time cap"
              color="#FF3B30"          // red, like other destructive actions
              onPress={resetTimeCap}
            />
          )}


          {/* iOS inline spinner — only visible while picking */}
          {Platform.OS === 'ios' && showCapIOS && (
            <DateTimePicker
              value={new Date(0, 0, 0, timeCapH, timeCapM)}
              mode="time"
              display="spinner"
              is24Hour
              onChange={(_, d) => {
                if (!d) return;
                setTimeCapH(d.getHours());
                setTimeCapM(d.getMinutes());
              }}
            />
          )}

          <View style={{ gap: 12 }}>

            {/* RECURRING */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontWeight: "bold", marginRight: 8 }}>RECURRING</Text>
              <Pressable
                onPress={() =>
                  !recurring ? confirmRecurring() : setRecurring(false)
                }
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

            {/* TASK DONE */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontWeight: "bold", marginRight: 8 }}>TASKER CAN LABEL DONE</Text>
              <Pressable
                onPress={() => setLabelDone(!labelDone)}
                style={{
                  width: 50,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: labelDone ? "#0A84FF" : "#CCC",
                  justifyContent: "center",
                }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: "white",
                    alignSelf: labelDone ? "flex-end" : "flex-start",
                    margin: 3,
                  }}
                />
              </Pressable>
            </View>

          </View>

          {/* Recurrence details */}
          {recurring && (
            <>
            {/* Frequency */}
              <Text style={{ fontWeight: "bold", marginTop: 8 }}>FREQUENCY</Text>
              <Picker selectedValue={recurrence} onValueChange={setRecurrence}>
                {RECURRENCES.map((r) => <Picker.Item key={r} label={r} value={r} />)}
              </Picker>
            

              {/* ─── Target day (weekly / monthly) ─── */}
              {recurrence === "WEEKLY" && (
                <>
                  <Text style={{ fontWeight: "bold", marginTop: 8 }}>DAY OF WEEK</Text>
                  <Picker selectedValue={recurrenceDow} onValueChange={setRecurrenceDow}>
                    {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
                      .map((d, i) => (
                        <Picker.Item key={i} label={d} value={String(i)} />
                      ))}
                  </Picker>
                </>
              )}

              {recurrence === "MONTHLY" && (
                <>
                  <Text style={{ fontWeight: "bold", marginTop: 8 }}>DAY OF MONTH</Text>
                  <Picker
                    selectedValue={recurrenceDom}
                    onValueChange={setRecurrenceDom}
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(n => (
                      <Picker.Item key={n} label={String(n)} value={String(n)} />
                    ))}
                  </Picker>
                </>
              )}

              {/* YEARLY target date ------------------------------------------------ */}
              {recurrence === "YEARLY" && (
                <>
                  <Text style={{ fontWeight: "bold", marginTop: 8 }}>DATE</Text>

                  <Button
                    title={
                      recurrenceMonth && recurrenceDom
                        ? `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug",
                          "Sep", "Oct", "Nov", "Dec"][Number(recurrenceMonth) - 1]} ${recurrenceDom}`
                        : "Pick a date"
                    }
                    onPress={openYearlyPicker}
                  />

                  {/* iOS inline picker */}
                  {Platform.OS === "ios" && showYearlyPicker && (
                    <DateTimePicker
                      value={new Date()}
                      mode="date"
                      display="inline"
                      onChange={(_, d) => {
                        if (!d) return;
                        setShowYearlyPicker(false);
                        setRecurrenceMonth(String(d.getMonth() + 1));
                        setRecurrenceDom(String(d.getDate()));
                      }}
                    />
                  )}

                  {Number(recurrenceDom) > 28 && (
                    <Text style={{ fontSize: 12, color: "#FF9F0A", marginTop: 4 }}>
                      In shorter months the task will recur on the last day available.
                    </Text>
                  )}
                </>
              )}

              {/* Warn */}
              {recurrence === "MONTHLY" && Number(recurrenceDom) > 28 && (
                <Text style={{ fontSize: 12, color: "#FF9F0A", marginTop: 4 }}>
                  Note: Months without a {recurrenceDom}‑day will roll over to the next month.
                </Text>
              )}

              {/* Every X */}
              <Text style={{ fontWeight: "bold", marginTop: 8 }}>EVERY</Text>
              <TextInput
                keyboardType="number-pad"
                value={recurrenceEvery}
                onChangeText={handleEveryChange}   // ← updated
                placeholder="e.g. 2"
                style={{ borderWidth: 1, borderRadius: 6, padding: 10 }}
              />



              {/* ⬇️  WARNING when ‘every’ = 0 */}
              {recurring && recurrenceEvery === "0" && (
                <Text
                  style={{
                    color: "#FF9F0A",          // amber / warning
                    fontSize: 12,
                    marginTop: 4,
                  }}
                >
                  Setting “Every” to 0 will make this task recur automatically at the start
                  of the next&nbsp;
                  {recurrence.toLowerCase()} period&nbsp;
                  (midnight for daily, Monday 00:00 for weekly, the 1st of the month, or
                  1 January for yearly).
                </Text>
              )}

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
          <View style={styles.thumbRow}>
            {photos.map((p, i) => (
              <Pressable
                key={i}
                onPress={() => togglePhoto(i)}
                onLongPress={() =>
                  Alert.alert('Remove picture', 'Delete this photo?', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => setPhotos(prev => prev.filter((_, j) => j !== i)),
                    },
                  ])
                }>
                <Image
                  source={{ uri: p.uri }}
                  style={[
                    styles.thumb,
                    selectedPhotos.has(i) && {
                      opacity: 0.4,
                      borderWidth: 2,
                      borderColor: '#0A84FF',
                    },
                  ]}
                />
              </Pressable>
            ))}

            {/* ✂️ REMOVED docs.map() here — docs now show only in the bottom grid */}
          </View>

          {/* PICKERS  (camera / gallery / doc) ----------------------------- */}
          <View style={styles.pickerRow}>
            <Pressable onPress={takePhoto} style={styles.pickerBox}>
              <Text style={styles.pickerIcon}>📷</Text>
            </Pressable>

            <Pressable onPress={pickImages} style={styles.pickerBox}>
              <Text style={styles.pickerIcon}>🖼️</Text>
            </Pressable>

            <Pressable onPress={pickDocs} style={styles.pickerBox}>
              <Text style={styles.pickerIcon}>📄</Text>
            </Pressable>
          </View>

          {/* Docs shown a single time ------------------------------------------------ */}
          <View style={styles.docRow}>
            {docs.map((d, i) => (
              <Pressable
                key={i}
                onPress={() => toggleDoc(i)}
                onLongPress={() => Alert.alert('Document', d.name ?? 'Unnamed file')}
                style={{ position: 'relative' }}               // 🆕 makes absolute overlay work
              >
                {d.mimeType?.startsWith('image/') ? (
                  <Image
                    source={{ uri: d.uri }}
                    style={[
                      styles.thumb,
                      selectedDocs.has(i) && {
                        opacity: 0.4,
                        borderWidth: 2,
                        borderColor: '#0A84FF',
                      },
                    ]}
                  />
                ) : (
                  <View
                    style={[
                      styles.pickerBox,
                      selectedDocs.has(i) && {
                        opacity: 0.4,
                        borderWidth: 2,
                        borderColor: '#0A84FF',
                      },
                    ]}
                  >
                    <Text style={styles.pickerIcon}>📄</Text>
                  </View>
                )}

                {/* badge now gets its own onPress */}
                <InfoBadge
                  onPress={() => Alert.alert('Document', d.name ?? 'Unnamed file')}
                />
              </Pressable>

            ))}
          </View>

          {hasSelection && (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Button
                title={`Delete ${selectedPhotos.size + selectedDocs.size} selected`}
                color="#FF3B30"
                onPress={() =>
                  Alert.alert('Delete selected', 'Remove all chosen items?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: deleteChecked },
                  ])
                }
              />
              <Button title="Cancel selection" onPress={abortDelete} />
            </View>
          )}
         

          {/* Action buttons */}
          <Button title={loading ? "Saving…" : "Save"} onPress={save} disabled={loading} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

}
