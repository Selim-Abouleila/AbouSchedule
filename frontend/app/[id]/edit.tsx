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
    KeyboardAvoidingView,
    Platform,
    Image,
} from "react-native";

import DateTimePicker, {
    DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";

import * as ImagePicker from "expo-image-picker";

import { Picker } from "@react-native-picker/picker";
import { useLocalSearchParams, router } from "expo-router";
import { endpoints } from "../../src/api";
import { getToken } from "../../src/auth";

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





export default function EditTask() {
    const { id } = useLocalSearchParams<{ id: string }>();

    /* ------- state (same shape as AddTask) ------------------ */
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [priority, setPriority] = useState<typeof PRIORITIES[number]>("NONE");
    const [status, setStatus] = useState<typeof STATUSES[number]>("PENDING");
    const [size, setSize] = useState<typeof SIZES[number]>("LARGE");
    const [dueAt, setDueAt] = useState<Date | null>(null);
    const [timeCap, setTimeCap] = useState("");           // string for TextInput
    const [recurring, setRecurring] = useState(false);
    const [recurrence, setRecurrence] = useState<typeof RECURRENCES[number]>("DAILY");
    const [recEvery, setRecEvery] = useState("1");
    const [recEnd, setRecEnd] = useState<Date | null>(null);
    const [labelDone, setLabelDone] = useState(false);
    const [showIOS, setShowIOS] = useState(false);
    const [showIOSRecEnd, setShowIOSRecEnd] = useState(false);
    const [photos, setPhotos] = useState<TaskPhoto[]>([]);



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
                if (Array.isArray(t.images) && t.images.length) {
                    setPhotos(
                        t.images.map((img: { id: number; url: string; mime: string }) => ({
                            id: img.id,
                            uri: img.url,
                            width: 0,
                            height: 0,
                            fileName: `task-${img.id}.jpg`,
                            mimeType: img.mime,
                        }))
                    );
                }



            } catch (e) {
                Alert.alert("Failed to load task", String(e));
                router.back();
            } finally {
                setLoad(false);
            }
        })();
    }, [id]);

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
        /* … your existing validation stays here … */

        const jwt = await getToken();

        // ✦ images that still have an id are being kept
        const keepIds = photos.filter(p => p.id).map(p => p.id as number);
        // ✦ images without id are newly added and must be uploaded
        const newPhotos = photos.filter(p => !p.id);

        /* ---------- choose payload type ---------- */
        const isOnlyScalars = newPhotos.length === 0 && removedSomething === false /* see note */;
        if (isOnlyScalars) {
            /* ❶ simple JSON PATCH when nothing changed on the image side */
            const body = {
                /* the same scalar fields you already send … */
                title, description, priority, status, size,
                dueAt: dueAt ? dueAt.toISOString() : null,
                timeCapMinutes: timeCap ? Number(timeCap) : null,
                recurrence: recurring ? recurrence : "NONE",
                recurrenceEvery: recurring ? Number(recEvery) : null,
                recurrenceEnd: recurring && recEnd ? recEnd.toISOString() : null,
                labelDone,
                keep: keepIds.join(","),              // tell the backend what to keep
            };

            const res = await fetch(`${endpoints.tasks}/${id}`, {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${jwt}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });
            if (!res.ok) return Alert.alert("Failed", `HTTP ${res.status}`);
        } else {
            /* ❷ multipart PATCH when files were added or removed */
            const form = new FormData();

            form.append("title", title);
            form.append("description", description);
            form.append("priority", priority);
            form.append("status", status);
            form.append("size", size);
            if (dueAt) form.append("dueAt", dueAt.toISOString());
            if (timeCap) form.append("timeCapMinutes", timeCap);
            form.append("recurrence", recurring ? recurrence : "NONE");
            if (recurring) {
                form.append("recurrenceEvery", recEvery);
                if (recEnd) form.append("recurrenceEnd", recEnd.toISOString());
            }
            form.append("labelDone", String(labelDone));
            form.append("keep", keepIds.join(","));          // <‑‑ keep existing ids

            newPhotos.forEach((p, idx) =>
                form.append(`photo${idx}`, {
                    uri: p.uri,
                    name: p.fileName ?? `photo${idx}.jpg`,
                    type: p.mimeType ?? "image/jpeg",
                } as any)                                    // RN FormData typing quirk
            );

            const res = await fetch(`${endpoints.tasks}/${id}`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${jwt}` },
                body: form,
            });
            if (!res.ok) return Alert.alert("Failed", `HTTP ${res.status}`);
        }

        router.back();
    };


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

                    {/* Time‑cap */}
                    <Text style={{ fontWeight: "bold", marginTop: 8 }}>TIME LIMIT (min)</Text>
                    <TextInput
                        keyboardType="number-pad"
                        value={timeCap}
                        onChangeText={setTimeCap}
                        placeholder="e.g. 90"
                        style={{ borderWidth: 1, borderRadius: 6, padding: 10 }}
                    />

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
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {photos.map((p, i) => (
                            <Pressable key={i} onLongPress={() => {
                                setRemovedSomething(true);               // track removal
                                setPhotos(prev => prev.filter((_, j) => j !== i));
                            }}>
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
