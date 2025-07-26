import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
    View,
    Text,
    TextInput,
    ScrollView,
    ActivityIndicator,
    Button,
    Pressable,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Image,
} from "react-native";

import DateTimePicker, {
    DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";

import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from 'expo-document-picker';
import { StyleSheet } from 'react-native';

import { Picker } from "@react-native-picker/picker";
import { useLocalSearchParams, router } from "expo-router";
import { endpoints } from "../../src/api";
import { getToken } from "../../src/auth";
import { useNavigation } from "@react-navigation/native";

/*  --- enums reused from AddTask ---  */
const PRIORITIES = ["NONE", "ONE", "TWO", "THREE", "IMMEDIATE", "RECURRENT"] as const;
const STATUSES = ["PENDING", "ACTIVE", "DONE"] as const;
const SIZES = ["SMALL", "LARGE"] as const;
const RECURRENCES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;

/** A picked‑or‑existing picture kept in state */
type TaskPhoto = ImagePicker.ImagePickerAsset & {
  /** present only for pictures that already exist on the server */
  id?: number;
};

type TaskDoc = DocumentPicker.DocumentPickerAsset & {
  id?: number;          // present for documents that already exist in the DB
};



//Style Sheet for Image and Doc pickers
const styles = StyleSheet.create({
    /* 70 × 70 square for each picker button */
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
        zIndex: 10,
        backgroundColor: '#0008',   // semi‑transparent black
        borderRadius: 8,
        paddingHorizontal: 4,
        paddingVertical: 1,
    },
    infoText: { fontSize: 10, color: '#fff' },

});

/* ── reusable “ⓘ” badge ───────────────────────── */
const InfoBadge = ({ onPress }: { onPress: () => void }) => (
  <Pressable onPress={onPress} style={styles.infoBadge}>
    <Text style={styles.infoText}>ⓘ</Text>
  </Pressable>
);


export default function EditTask() {
    const { id } = useLocalSearchParams<{ id: string }>();

    /* ------- state (same shape as AddTask) ------------------ */
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [priority, setPriority] = useState<typeof PRIORITIES[number]>("NONE");
    const [status, setStatus] = useState<typeof STATUSES[number]>("PENDING");
    const [size, setSize] = useState<typeof SIZES[number]>("LARGE");
    const [dueAt, setDueAt] = useState<Date | null>(null);
    const [timeCapH, setTimeCapH] = useState(0);     // hours
    const [timeCapM, setTimeCapM] = useState(0);     // minutes (0-59)
    const [showCapIOS, setShowCapIOS] = useState(false);           // string for TextInput
    const [recurring, setRecurring] = useState(false);
    const [recurrence, setRecurrence] = useState<typeof RECURRENCES[number]>("DAILY");
    const [recEvery, setRecEvery] = useState("1");
    const [recEnd, setRecEnd] = useState<Date | null>(null);
    const [labelDone, setLabelDone] = useState(false);
    const [showIOS, setShowIOS] = useState(false);
    const [showIOSRecEnd, setShowIOSRecEnd] = useState(false);
    const [photos, setPhotos] = useState<TaskPhoto[]>([]);
    // after photos state
    const [docs, setDocs] = useState<TaskDoc[]>([]);
    const [removedDocs, setRemovedDocs] = useState(false);

    
    /* selection sets */
    const [selectedPhotos, setSelectedPhotos] = useState<Set<number>>(new Set());
    const [selectedDocs, setSelectedDocs] = useState<Set<number>>(new Set());
    const hasSelection = selectedPhotos.size > 0 || selectedDocs.size > 0;


    /* Back button safety*/
    const initial = useRef<null | {
        title: string;
        description: string;
        status: typeof STATUSES[number];
        priority: typeof PRIORITIES[number];
        size: typeof SIZES[number];
        dueAt: Date | null;
        timeCapH: number;
        timeCapM: number;
        photosIds: number[];   // ids only!
        docsIds: number[];
    }>(null);


    const hasUnsavedChanges = useMemo(() => {
        if (!initial.current) return false;            // still loading

        const snap = initial.current;

        // scalars
        if (title.trim() !== snap.title) return true;
        if (description.trim() !== snap.description) return true;
        if (status !== snap.status) return true;
        if (priority !== snap.priority) return true;
        if (size !== snap.size) return true;
        if (
            (dueAt?.toISOString() ?? null) !==
            (snap.dueAt?.toISOString() ?? null)
        ) return true;

        if (timeCapH !== snap.timeCapH || timeCapM !== snap.timeCapM) return true;

        // pictures / docs: ids that remain + new ones
        const currentImgIds = photos.filter(p => p.id).map(p => p.id as number).sort();
        const currentDocIds = docs.filter(d => d.id).map(d => d.id as number).sort();

        if (currentImgIds.join(",") !== snap.photosIds.join(",")) return true;
        if (currentDocIds.join(",") !== snap.docsIds.join(",")) return true;


        if (photos.some(p => !p.id)) return true;   // new pictures
        if (docs.some(d => !d.id)) return true;   // new docs

        return false;                               // nothing changed
    }, [
        title, description, status, priority, size,
        dueAt, timeCapH, timeCapM,
        photos, docs,
    ]);


    /* toggle helpers */
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

    /* bulk‑delete + cancel */
    const deleteChecked = () => {
        if (selectedPhotos.size)
            setPhotos(p => p.filter((_, i) => !selectedPhotos.has(i)));
        if (selectedDocs.size)
            setDocs(d => d.filter((_, i) => !selectedDocs.has(i)));
        setSelectedPhotos(new Set());
        setSelectedDocs(new Set());
        setRemovedSomething(true);          // keeps your “onlyScalars” logic intact
    };

    const abortDelete = () => {
        setSelectedPhotos(new Set());
        setSelectedDocs(new Set());
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

    /* pick time cap */
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
            setShowCapIOS(true);          // show inline spinner
        }
    };

    /** launch device camera and push the result into `photos` */
    const takePhoto = async () => {
        // ask only once – Expo caches the user’s choice
        const { granted } = await ImagePicker.requestCameraPermissionsAsync();
        if (!granted) { Alert.alert('Camera access was denied'); return; }

        if (photos.length >= 6) {             // same limit you use elsewhere
            Alert.alert('Maximum 6 pictures');
            return;
        }

        const res = await ImagePicker.launchCameraAsync({
            quality: 0.9,            // 90 % JPEG
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

        if (!res.canceled && res.assets?.length) {
            setPhotos(prev => [
                ...prev,
                ...(res.assets as TaskPhoto[])
            ]);
        }
    };


    /* pick Doc(s) */
    const pickDocs = async () => {
        const res: any = await DocumentPicker.getDocumentAsync({
            multiple: true,
            copyToCacheDirectory: false,
        });

        if ('canceled' in res) {
            if (res.canceled) return;
            if (res.assets?.length) setDocs(prev => [...prev, ...res.assets]);
            return;
        }
        if (res.type === 'cancel') return;

        // SDK 49
        setDocs(prev => [...prev, { uri: res.uri, name: res.name, mimeType: res.mimeType } as any]);
    };


    /* Recuurrance Confirmation */
    const confirmRecurring = () => {
        Alert.alert(
            "Recurring task",
            "Are you sure you want this task to be recurring?",
            [
                { text: "Back", style: "cancel" },                // stay off
                { text: "Yes", onPress: () => setRecurring(true) } // enable
            ]
        );
    };


    const [loading, setLoad] = useState(true);

    /* --------- fetch current task once (runs whenever `id` changes) ----- */
    useEffect(() => {
        let cancelled = false;                 // avoid setState after unmount / remount
        (async () => {
            try {
                /* ① CLEAR stale state immediately */
                setPhotos([]);          // <── wipe local picks from the previous task
                setDocs([]);            // <── same for docs
                setRemovedDocs(false);
                setRemovedSomething(false);

                setLoad(true);          // show spinner while we fetch

                const jwt = await getToken();
                const res = await fetch(`${endpoints.tasks}/${id}`, {
                    headers: { Authorization: `Bearer ${jwt}` },
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const t = await res.json();
                if (cancelled) return;

                /* ② …prefill scalars exactly as you already do… */
                /* ② …prefill scalars … */
                setTitle(t.title);
                setDescription(t.description ?? '');
                setPriority(t.priority);
                setStatus(t.status);
                setSize(t.size);
                setDueAt(t.dueAt ? new Date(t.dueAt) : null);

                setRecurring(t.recurrence !== 'NONE');
                setRecurrence(t.recurrence);
                setRecEvery(t.recurrenceEvery ? String(t.recurrenceEvery) : '1');
                setRecEnd(t.recurrenceEnd ? new Date(t.recurrenceEnd) : null);
                setLabelDone(Boolean(t.labelDone));
                setSelectedPhotos(new Set());
                setSelectedDocs(new Set());


                /* ③ images from the server */
                setPhotos(
                    (Array.isArray(t.images) ? t.images : []).map(
                        (img: { id: number; url: string; mime: string }) => ({
                            id: img.id,
                            uri: img.url,
                            mimeType: img.mime,
                        }) as TaskPhoto
                    )
                );

                /* ④ documents from the server */
                setDocs(
                    (Array.isArray(t.documents) ? t.documents : []).map(
                        (d: { id: number; url: string; mime: string; name?: string }) => ({
                            id: d.id,
                            uri: d.url,
                            name: d.name ?? `doc-${d.id}`,
                            mimeType: d.mime,
                        }) as TaskDoc
                    )
                );

                /* ─── time‑cap ─── */
                let capH = 0, capM = 0;
                if (t.timeCapMinutes) {
                    capH = Math.floor(t.timeCapMinutes / 60);
                    capM = t.timeCapMinutes % 60;
                }
                setTimeCapH(capH);
                setTimeCapM(capM);

                /* ─── snapshot (must come *after* the setters above!) ─── */
                initial.current = {
                    title: t.title ?? "",
                    description: t.description ?? "",
                    status: t.status,
                    priority: t.priority,
                    size: t.size,
                    dueAt: t.dueAt ? new Date(t.dueAt) : null,
                    timeCapH: capH,
                    timeCapM: capM,
                    photosIds: (t.images ?? []).map((img: any) => img.id).sort(),
                    docsIds: (t.documents ?? []).map((d: any) => d.id).sort(),
                };
            } catch (e) {
                if (!cancelled) {
                    Alert.alert('Failed to load task', String(e));
                    router.back();
                }
            } finally {
                if (!cancelled) setLoad(false);
            }

            
        })();

        /* cleanup in case the component unmounts before fetch finishes */
        return () => {
            cancelled = true;
        };
    }, [id]);            // ← runs every time you navigate to /tasks/[other‑id]/edit


    useEffect(() => {
        if (recurring) setPriority("RECURRENT");
        else if (priority === "RECURRENT") setPriority("NONE");
    }, [recurring, priority]);

    function isPositiveInt(value: string) {
        return /^\d+$/.test(value) && Number(value) > 0;
    }

    /* true whenever user long‑pressed a thumbnail at least once */
    const [removedSomething, setRemovedSomething] = useState(false);




    /* ----------- submit PATCH ------------------------------- */
const save = async () => {
  /* validate inputs here as before … */

  const jwt = await getToken();

  // ----- images -----
  const keepImgIds = photos.filter(p => p.id).map(p => p.id as number);
  const newPhotos  = photos.filter(p => !p.id);

  // ----- documents -----
  const keepDocIds = docs.filter(d => d.id).map(d => d.id as number);
  const newDocs    = docs.filter(d => !d.id);

  // decide if we can use JSON
  const isOnlyScalars =
    newPhotos.length === 0 &&
    newDocs.length   === 0 &&
    removedSomething === false &&
    removedDocs      === false;

  //Time cap
  const totalMinutes = timeCapH * 60 + timeCapM;

  if (isOnlyScalars) {
    /* ❶ simple JSON PATCH */
    const body = {
      title, description, priority, status, size,
      dueAt: dueAt ? dueAt.toISOString() : null,
      timeCapMinutes: totalMinutes > 0 ? totalMinutes : null,
      recurrence: recurring ? recurrence : 'NONE',
      recurrenceEvery: recurring ? Number(recEvery) : null,
      recurrenceEnd: recurring && recEnd ? recEnd.toISOString() : null,
      labelDone,
      keep:      keepImgIds.join(','),     // images
      keepDocs:  keepDocIds.join(','),     // documents
    };

    const res = await fetch(`${endpoints.tasks}/${id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return Alert.alert('Failed', `HTTP ${res.status}`);
  } else {
    /* ❷ multipart PATCH */
    const form = new FormData();

    form.append('title', title);
    form.append('description', description);
    form.append('priority', priority);
    form.append('status', status);
    form.append('size', size);
    if (dueAt) form.append('dueAt', dueAt.toISOString());
    if (totalMinutes > 0) form.append('timeCapMinutes', String(totalMinutes));
    form.append('recurrence', recurring ? recurrence : 'NONE');
    if (recurring) {
      form.append('recurrenceEvery', recEvery);
      if (recEnd) form.append('recurrenceEnd', recEnd.toISOString());
    }
    form.append('labelDone', String(labelDone));

    form.append('keep',     keepImgIds.join(','));   // images to keep
    form.append('keepDocs', keepDocIds.join(','));   // docs to keep

    newPhotos.forEach((p, idx) =>
      form.append(`photo${idx}`, {
        uri:  p.uri,
        name: p.fileName ?? `photo${idx}.jpg`,
        type: p.mimeType ?? 'image/jpeg',
      } as any)
    );

    newDocs.forEach((d, idx) =>
      form.append(`doc${idx}`, {
        uri:  d.uri,
        name: d.name ?? `doc${idx}`,
        type: (d as any).mimeType ?? 'application/octet-stream',
      } as any)
    );

    const res = await fetch(`${endpoints.tasks}/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${jwt}` },
      body: form,
    });
    if (!res.ok) return Alert.alert('Failed', `HTTP ${res.status}`);
  }

  router.back();
};

const handleBack = useCallback(() => {
    if (!hasUnsavedChanges) {           // ⬅️  let React Navigation do its thing
      router.back();
      return;
    }

    Alert.alert(
      "Save task modifications?",
      "Do you want to save before leaving?",
      [
        {
          text: "No",
          style: "destructive",
          onPress: () =>
            Alert.alert(
              "Delete Modifications?",
              "Are you sure? This cannot be undone.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () => {
                    router.back();
                  },
                },
              ],
            ),
        },
        { text: "Yes", onPress: save },
        { text: "Cancel", style: "cancel" },
      ],
    );
  }, [hasUnsavedChanges, save]);



    /* ------------- UI --------------------------------------- */
    if (loading) {
        return (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                <ActivityIndicator />
            </View>
        );
    }

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

                    {/* Priority (hidden if recurring) */}
                    {!recurring && (
                        <>
                            <Text style={{ fontWeight: "bold", marginTop: 8 }}>PRIORITY</Text>
                            <Picker selectedValue={priority} onValueChange={setPriority} enabled={!recurring}>
                                {PRIORITIES
                                    .filter(p => p !== "RECURRENT")   // ← exclude it from the menu
                                    .map(p => <Picker.Item key={p} label={p} value={p} />)}
                            </Picker>
                        </>
                    )}

                    {/* Status */}
                    <Text style={{ fontWeight: "bold", marginTop: 8 }}>STATUS</Text>
                    <Picker selectedValue={status} onValueChange={setStatus}>
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
                                setShowCapIOS(false);
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

                            {/* Every X */}
                            <Text style={{ fontWeight: "bold", marginTop: 8 }}>EVERY</Text>
                            <TextInput
                                keyboardType="number-pad"
                                value={recEvery}
                                onChangeText={setRecEvery}
                                placeholder="e.g. 2"
                                style={{ borderWidth: 1, borderRadius: 6, padding: 10 }}
                            />

                            {/* Recurrence end */}
                            <Button
                                title={recEnd ? `Ends ${recEnd.toLocaleDateString()}` : "End date (optional)"}
                                onPress={() => {
                                    if (Platform.OS === "android") {
                                        DateTimePickerAndroid.open({
                                            value: recEnd ?? new Date(),
                                            mode: "date",
                                            onChange: (_, d) => d && setRecEnd(d),
                                        });
                                    } else {
                                        setShowIOSRecEnd(true);
                                    }
                                }}
                            />
                            {Platform.OS === "ios" && showIOSRecEnd && (
                                <DateTimePicker
                                    value={recEnd ?? new Date()}
                                    mode="date"
                                    display="inline"
                                    onChange={(_, d) => {
                                        setShowIOSRecEnd(false);
                                        d && setRecEnd(d);
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
                    
                    
                    {/* THUMBNAILS ---------------------------------------------------- */}
                    <View style={styles.thumbRow}>
                        {photos.map((p, i) => (
                            <Pressable
                                key={i}
                                onPress={() => togglePhoto(i)}
                                onLongPress={() =>
                                    Alert.alert('Remove picture', 'Delete this photo?', [
                                        { text: 'Cancel', style: 'cancel' },
                                        {
                                            text: 'Delete', style: 'destructive',
                                            onPress: () => {
                                                setPhotos(prev => prev.filter((_, j) => j !== i));
                                                setRemovedSomething(true);
                                            },
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
                    

                    <View style={styles.docRow}>
                        {docs.map((d, i) => (
                            <Pressable
                                key={i}
                                onPress={() => toggleDoc(i)}
                                onLongPress={() =>
                                    Alert.alert('Remove file', d.name ?? 'file', [
                                        { text: 'Cancel', style: 'cancel' },
                                        {
                                            text: 'Delete',
                                            style: 'destructive',
                                            onPress: () => {
                                                setDocs(prev => prev.filter((_, j) => j !== i));
                                                setRemovedDocs(true);
                                            },
                                        },
                                    ])
                                }
                                style={{ position: 'relative' }}   // 🆕 makes absolute overlay work
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
                                        ]}>
                                        <Text style={styles.pickerIcon}>📄</Text>
                                    </View>
                                )}

                                {/* ⓘ overlay — tap shows file name */}
                                <InfoBadge onPress={() => Alert.alert('Document', d.name ?? 'Unnamed file')} />
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
                    <Button title="← Back" onPress={handleBack} />
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
