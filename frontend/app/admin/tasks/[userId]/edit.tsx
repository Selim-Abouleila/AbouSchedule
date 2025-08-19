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
    Modal,
    BackHandler,
} from "react-native";

import DateTimePicker, {
    DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";

import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from 'expo-document-picker';
import { Video, ResizeMode } from 'expo-av';
import { StyleSheet } from 'react-native';

import { Picker } from "@react-native-picker/picker";
import { useLocalSearchParams, router } from "expo-router";
import { endpoints, API_BASE } from "../../../../src/api";
import { getToken } from "../../../../src/auth";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { compressImages } from "../../../../src/imageCompression";
import { compressVideos } from "../../../../src/videoCompression";

/*  --- enums reused from AddTask ---  */
const PRIORITIES = ["NONE", "ONE", "TWO", "THREE", "IMMEDIATE", "RECURRENT"] as const;
const STATUSES = [ "ACTIVE", "DONE", "PENDING"] as const;
const SIZES = ["SMALL", "NORMAL", "LARGE"] as const;
const RECURRENCES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;

/** A picked‑or‑existing picture kept in state */
type TaskPhoto = ImagePicker.ImagePickerAsset & {
  /** present only for pictures that already exist on the server */
  id?: number;
};

type TaskDoc = DocumentPicker.DocumentPickerAsset & {
  id?: number;          // present for documents that already exist in the DB
};

type TaskVideo = ImagePicker.ImagePickerAsset & {
  id?: number;          // present for videos that already exist in the DB
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
    const { id, userId } = useLocalSearchParams<{ id: string; userId: string }>();

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
    const [labelDone, setLabelDone] = useState<boolean | null>(null);
    const [showIOS, setShowIOS] = useState(false);
    const [showIOSRecEnd, setShowIOSRecEnd] = useState(false);
    const [photos, setPhotos] = useState<TaskPhoto[]>([]);
    // after photos state
    const [docs, setDocs] = useState<TaskDoc[]>([]);
    const [removedDocs, setRemovedDocs] = useState(false);
    const [videos, setVideos] = useState<TaskVideo[]>([]);
    const [removedVideos, setRemovedVideos] = useState(false);

    
    /* selection sets */
    const [selectedPhotos, setSelectedPhotos] = useState<Set<number>>(new Set());
    const [selectedDocs, setSelectedDocs] = useState<Set<number>>(new Set());
    const [selectedVideos, setSelectedVideos] = useState<Set<number>>(new Set());
    const hasSelection = selectedPhotos.size > 0 || selectedDocs.size > 0 || selectedVideos.size > 0;

    const navigation = useNavigation();

    const [userInfo, setUserInfo] = useState<{ username?: string; email: string } | null>(null);

    /** Fetch user information */
    const fetchUserInfo = useCallback(async () => {
        if (!userId) return;
        
        try {
            const jwt = await getToken();
            const response = await fetch(`${API_BASE}/admin/users/${userId}`, {
                headers: { Authorization: `Bearer ${jwt}` },
            });

            if (response.ok) {
                const userData = await response.json();
                setUserInfo(userData);
            }
        } catch (error) {
            console.error('Error fetching user info:', error);
        }
    }, [userId]);

    // Fetch user info when component loads
    useEffect(() => {
        fetchUserInfo();
    }, [fetchUserInfo]);

    // Load task data when component mounts
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                /* Clear stale state immediately */
                setPhotos([]);
                setDocs([]);
                setVideos([]);
                setRemovedDocs(false);
                setRemovedVideos(false);

                const jwt = await getToken();
                const res = await fetch(endpoints.admin.userTask(parseInt(userId), parseInt(id)), {
                    headers: { Authorization: `Bearer ${jwt}` },
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const t = await res.json();
                if (cancelled) return;

                /* Prefill scalars */
                setTitle(t.title);
                setDescription(t.description ?? '');
                setPriority(t.priority);
                setStatus(t.status);
                setSize(t.size);
                setDueAt(t.dueAt ? new Date(t.dueAt) : null);

                // Time cap
                if (t.timeCapMinutes) {
                    setTimeCapH(Math.floor(t.timeCapMinutes / 60));
                    setTimeCapM(t.timeCapMinutes % 60);
                }

                // Recurrence
                setRecurring(t.recurrence !== 'NONE');
                setRecurrence(t.recurrence);
                setRecEvery(t.recurrenceEvery ? String(t.recurrenceEvery) : '1');
                setRecurrenceMonth(t.recurrenceMonth ? String(t.recurrenceMonth) : "1");
                setRecurrenceDom(t.recurrenceDom ? String(t.recurrenceDom) : "1");
                setRecurrenceDow(t.recurrenceDow ? String(t.recurrenceDow) : "1");
                setRecEnd(t.recurrenceEnd ? new Date(t.recurrenceEnd) : null);

                // Label done
                console.log('🔧 Loading labelDone from task:', t.labelDone, 'type:', typeof t.labelDone);
                setLabelDone(Boolean(t.labelDone ?? false));

                setSelectedPhotos(new Set());
                setSelectedDocs(new Set());
                setSelectedVideos(new Set());

                /* Images from the server */
                setPhotos(
                    (Array.isArray(t.images) ? t.images : []).map(
                        (img: { id: number; url: string; mime: string }) => ({
                            id: img.id,
                            uri: img.url,
                            mimeType: img.mime,
                        }) as TaskPhoto
                    )
                );

                /* Documents from the server */
                setDocs(
                    (Array.isArray(t.documents) ? t.documents : []).map(
                        (d: { id: number; url: string; mime: string; name?: string }) => ({
                            id: d.id,
                            uri: d.url,
                            mimeType: d.mime,
                            name: d.name,
                        }) as TaskDoc
                    )
                );

                /* Videos from the server */
                setVideos(
                    (Array.isArray(t.videos) ? t.videos : []).map(
                        (v: { id: number; url: string; mime: string; name?: string }) => ({
                            id: v.id,
                            uri: v.url,
                            mimeType: v.mime,
                            fileName: v.name,
                        }) as TaskVideo
                    )
                );

                /* Store initial state for change detection */
                initial.current = {
                    title: t.title,
                    description: t.description ?? '',
                    status: t.status,
                    priority: t.priority,
                    size: t.size,
                    dueAt: t.dueAt ? new Date(t.dueAt) : null,
                    timeCapH: Math.floor((t.timeCapMinutes || 0) / 60),
                    timeCapM: (t.timeCapMinutes || 0) % 60,
                    labelDone: Boolean(t.labelDone ?? false),
                    photosIds: (Array.isArray(t.images) ? t.images : []).map((img: any) => img.id).sort(),
                    docsIds: (Array.isArray(t.documents) ? t.documents : []).map((doc: any) => doc.id).sort(),
                    videosIds: (Array.isArray(t.videos) ? t.videos : []).map((video: any) => video.id).sort(),
                };

            } catch (error) {
                console.error('Error loading task:', error);
                Alert.alert('Error', 'Failed to load task data');
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [id, userId]);

    /* For reccurance */
    const [recurrenceDow, setRecurrenceDow] = useState("1");  // 0 = Sun … 6 = Sat; default Monday
    const [recurrenceDom, setRecurrenceDom] = useState("1");  // 1 – 31
    const [recurrenceMonth, setRecurrenceMonth] = useState("1");
    const [showYearlyPicker, setShowYearlyPicker] = useState(false);

    /* Reset day selectors whenever the frequency changes */
    /* Reset selectors whenever the user switches frequency */
    useEffect(() => {
        switch (recurrence) {
            case "WEEKLY":   // we care only about DOW
                setRecurrenceDom("1");
                setRecurrenceMonth("1");
                break;

            case "MONTHLY":  // we care only about DOM
                setRecurrenceDow("1");
                setRecurrenceMonth("1");
                break;

            case "YEARLY":   // we care about MONTH + DOM
                setRecurrenceDow("1");
                break;

            default:         // DAILY → nothing else matters
                setRecurrenceDow("1");
                setRecurrenceDom("1");
                setRecurrenceMonth("1");
        }
    }, [recurrence]);


    /* Yearly picker for reccurance */
    const openYearlyPicker = () => {
        if (Platform.OS === "android") {
            DateTimePickerAndroid.open({
                value: new Date(),     // year ignored
                mode: "date",
                onChange: (_, d) => {
                    if (!d) return;
                    setRecurrenceMonth(String(d.getMonth() + 1)); // 0‑based → 1‑based
                    setRecurrenceDom(String(d.getDate()));
                },
            });
        } else {
            setShowYearlyPicker(true);
        }
    };




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
        labelDone: boolean;
        photosIds: number[];   // ids only!
        docsIds: number[];
        videosIds: number[];
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
        if (labelDone === null || labelDone !== snap.labelDone) return true;

        // pictures / docs: ids that remain + new ones
        const currentImgIds = photos.filter(p => p.id).map(p => p.id as number).sort();
        const currentDocIds = docs.filter(d => d.id).map(d => d.id as number).sort();
        const currentVideoIds = videos.filter(v => v.id).map(v => v.id as number).sort();

        if (currentImgIds.join(",") !== snap.photosIds.join(",")) return true;
        if (currentDocIds.join(",") !== snap.docsIds.join(",")) return true;
        if (currentVideoIds.join(",") !== snap.videosIds.join(",")) return true;

        if (photos.some(p => !p.id)) return true;   // new pictures
        if (docs.some(d => !d.id)) return true;   // new docs
        if (videos.some(v => !v.id)) return true;   // new videos

        return false;                               // nothing changed
    }, [
        title, description, status, priority, size,
        dueAt, timeCapH, timeCapM, labelDone,
        photos, docs, videos,
    ]);

    /* Forbidding negative numbers for reccurence */
    const handleEveryChange = (txt: string) => {
        // keep only 0‑9; remove minus signs, spaces, letters, etc.
        const clean = txt.replace(/[^0-9]/g, '');
        setRecEvery(clean);
    };





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

    const toggleVideo = (idx: number) =>
        setSelectedVideos(prev => {
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
        if (selectedVideos.size)
            setVideos(v => v.filter((_, i) => !selectedVideos.has(i)));
        setSelectedPhotos(new Set());
        setSelectedDocs(new Set());
        setSelectedVideos(new Set());
        setRemovedSomething(true);          // keeps your "onlyScalars" logic intact
    };

    const abortDelete = () => {
        setSelectedPhotos(new Set());
        setSelectedDocs(new Set());
        setSelectedVideos(new Set());
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

    /** launch device camera for photos */
    const takePhoto = async () => {
        const { granted } = await ImagePicker.requestCameraPermissionsAsync();
        if (!granted) { Alert.alert('Camera access was denied'); return; }

        if (photos.length >= 6) {
            Alert.alert('Maximum 6 pictures');
            return;
        }

        setPickingCamera(true);
        try {
            const res = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.9,
                allowsEditing: false,
                exif: false,
            });

            if (!res.canceled && res.assets?.length) {
                setPhotos(prev => [...prev, ...res.assets]);
            }
        } finally {
            setPickingCamera(false);
        }
    };

    /** launch device camera for videos */
    const takeVideo = async () => {
        const { granted } = await ImagePicker.requestCameraPermissionsAsync();
        if (!granted) { Alert.alert('Camera access was denied'); return; }

        if (videos.length >= 3) {
            Alert.alert('Maximum 3 videos');
            return;
        }

        setPickingVideo(true);
        try {
            const res = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Videos,
                quality: 0.9,
                allowsEditing: false,
                videoMaxDuration: 60, // 60 seconds max
            });

            if (!res.canceled && res.assets?.length) {
                setVideos(prev => [...prev, ...res.assets]);
            }
        } finally {
            setPickingVideo(false);
        }
    };






    /* pick image(s) */
    const pickImages = async () => {
        setPickingGallery(true);
        try {
            const res = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.All,
                allowsMultipleSelection: true,
                selectionLimit: 6,
            });

            if (!res.canceled && res.assets?.length) {
                const images: TaskPhoto[] = [];
                const newVideos: TaskVideo[] = [];
                
                res.assets.forEach(asset => {
                    if (asset.type === 'video') {
                        newVideos.push(asset as TaskVideo);
                    } else {
                        images.push(asset as TaskPhoto);
                    }
                });
                
                setPhotos(prev => [...prev, ...images]);
                setVideos(prev => [...prev, ...newVideos]);
            }
        } finally {
            setPickingGallery(false);
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


    const [loading, setLoad] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [uploadProgress, setUploadProgress] = useState<string>('');
    const [pickingPhotos, setPickingPhotos] = useState(false);
    const [pickingCamera, setPickingCamera] = useState(false);
    const [pickingVideo, setPickingVideo] = useState(false);
    const [pickingGallery, setPickingGallery] = useState(false);
    const [pickingDocs, setPickingDocs] = useState(false);
    const [playingVideo, setPlayingVideo] = useState<string | null>(null);

    /* --------- fetch current task once (runs whenever `id` changes) ----- */
    useEffect(() => {
        let cancelled = false;                 // avoid setState after unmount / remount
        (async () => {
            try {
                /* ① CLEAR stale state immediately */
                setPhotos([]);          // <── wipe local picks from the previous task
                setDocs([]);            // <── same for docs
                setVideos([]);          // <── same for videos
                setRemovedDocs(false);
                setRemovedVideos(false);
                setRemovedSomething(false);

                setInitialLoading(true);          // show spinner while we fetch

                const jwt = await getToken();
                const endpoint = endpoints.admin.userTask(parseInt(userId), parseInt(id));
                console.log('Admin edit: Fetching task from endpoint:', endpoint);
                console.log('Admin edit: User ID:', userId, 'Task ID:', id);
                const res = await fetch(endpoint, {
                    headers: { Authorization: `Bearer ${jwt}` },
                });
                console.log('Admin edit: Response status:', res.status);
                if (!res.ok) {
                    const errorText = await res.text();
                    console.error('Admin edit: Error response:', errorText);
                    throw new Error(`HTTP ${res.status}: ${errorText}`);
                }
                const t = await res.json();
                console.log('Admin edit: Task data received:', t);
                console.log('Admin edit: Recurrence data:', {
                    recurrence: t.recurrence,
                    recurrenceEvery: t.recurrenceEvery,
                    recurrenceDow: t.recurrenceDow,
                    recurrenceDom: t.recurrenceDom,
                    recurrenceMonth: t.recurrenceMonth,
                    recurrenceEnd: t.recurrenceEnd
                });
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
                setRecurrenceMonth(t.recurrenceMonth ? String(t.recurrenceMonth) : "1");
                setRecurrenceDom(t.recurrenceDom ? String(t.recurrenceDom) : "1");
                setRecurrenceDow(t.recurrenceDow ? String(t.recurrenceDow) : "1");
                setRecEnd(t.recurrenceEnd ? new Date(t.recurrenceEnd) : null);
                
                console.log('Admin edit: Setting recurrence state:', {
                    recurring: t.recurrence !== 'NONE',
                    recurrence: t.recurrence,
                    recurrenceEvery: t.recurrenceEvery,
                    recurrenceDow: t.recurrenceDow,
                    recurrenceDom: t.recurrenceDom,
                    recurrenceMonth: t.recurrenceMonth,
                    recurrenceEnd: t.recurrenceEnd
                });
                console.log('🔧 Loading labelDone from task:', t.labelDone, 'type:', typeof t.labelDone);
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
                console.log('Admin edit: Loading documents from server:', t.documents);
                setDocs(
                    (Array.isArray(t.documents) ? t.documents : []).map(
                        (d: { id: number; url: string; mime: string; name?: string }) => {
                            console.log('Admin edit: Processing document:', d);
                            // Get the proper filename using the same logic as task detail view
                            const getDisplayName = () => {
                                if (d.name && d.name !== `doc-${d.id}`) {
                                    // Use the name from database if it's not a generic doc-id
                                    return decodeURIComponent(d.name);
                                } else {
                                    // Extract filename from URL
                                    const getDocFileName = (url: string): string => {
                                        try {
                                            const urlObj = new URL(url);
                                            const pathParts = urlObj.pathname.split('/');
                                            const filename = pathParts[pathParts.length - 1];
                                            
                                            if (!filename || !filename.includes('.')) {
                                                const fallback = url.split('/').pop()!.split('?')[0];
                                                return decodeURIComponent(fallback);
                                            }
                                            
                                            return decodeURIComponent(filename);
                                        } catch (error) {
                                            const fallback = url.split('/').pop()!.split('?')[0];
                                            return decodeURIComponent(fallback);
                                        }
                                    };
                                    
                                    const filename = getDocFileName(d.url);
                                    // Remove UUID prefix if present (format: uuid_filename.pdf)
                                    const cleanName = filename.includes('_') ? filename.split('_').slice(1).join('_') : filename;
                                    // Decode any remaining URL encoding (like %20 for spaces)
                                    return decodeURIComponent(cleanName) || `Document ${d.id}`;
                                }
                            };
                            
                            return {
                                id: d.id,
                                uri: d.url,  // This is fine for display purposes
                                name: getDisplayName(),
                                mimeType: d.mime,
                            } as TaskDoc;
                        }
                    )
                );

                /* ⑤ videos from the server */
                setVideos(
                    (Array.isArray(t.videos) ? t.videos : []).map(
                        (v: { id: number; url: string; mime: string; fileName?: string; duration?: number; thumbnail?: string }) => ({
                            id: v.id,
                            uri: v.url,
                            mimeType: v.mime,
                            fileName: v.fileName,
                            duration: v.duration,
                        }) as TaskVideo
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
                    labelDone: Boolean(t.labelDone ?? false),
                    photosIds: (t.images ?? []).map((img: any) => img.id).sort(),
                    docsIds: (t.documents ?? []).map((d: any) => d.id).sort(),
                    videosIds: (t.videos ?? []).map((v: any) => v.id).sort(),
                };
            } catch (e) {
                if (!cancelled) {
                    Alert.alert('Failed to load task', String(e));
                    router.back();
                }
            } finally {
                if (!cancelled) setInitialLoading(false);
            }

            
        })();

        /* cleanup in case the component unmounts before fetch finishes */
        return () => {
            cancelled = true;
        };
    }, [id]);            // ← runs every time you navigate to /tasks/[other‑id]/edit




    function isPositiveInt(value: string) {
        return /^\d+$/.test(value) && Number(value) > 0;
    }

    /* true whenever user long‑pressed a thumbnail at least once */
    const [removedSomething, setRemovedSomething] = useState(false);




    /* ----------- submit PATCH ------------------------------- */
const save = async () => {
  /* validate inputs here as before … */

  setLoad(true);
  setUploadProgress('Preparing upload...');

  const jwt = await getToken();

  // ----- images -----
  const keepImgIds = photos.filter(p => p.id).map(p => p.id as number);
  const newPhotos  = photos.filter(p => !p.id);

  // ----- documents -----
  const keepDocIds = docs.filter(d => d.id).map(d => d.id as number);
  const newDocs    = docs.filter(d => !d.id);

  // ----- videos -----
  const keepVideoIds = videos.filter(v => v.id).map(v => v.id as number);
  const newVideos = videos.filter(v => !v.id);

  // decide if we can use JSON
  const isOnlyScalars =
    newPhotos.length === 0 &&
    newDocs.length   === 0 &&
    newVideos.length === 0 &&
    removedSomething === false &&
    removedDocs      === false &&
    removedVideos    === false;

  //Time cap
  const totalMinutes = timeCapH * 60 + timeCapM;

      if (isOnlyScalars) {
      /* ❶ simple JSON PATCH */
      console.log('🔧 Saving labelDone (JSON):', labelDone, 'type:', typeof labelDone);
      const body: any = {
        title, description, priority, status, size,
        dueAt: dueAt ? dueAt.toISOString() : null,
        timeCapMinutes: totalMinutes > 0 ? totalMinutes : null,
        recurrence: recurring ? recurrence : 'NONE',
        recurrenceEvery: recurring ? Number(recEvery) : null,
        recurrenceEnd: recurring && recEnd ? recEnd.toISOString() : null,
        labelDone: String(labelDone ?? false),
        keep:      keepImgIds.join(','),     // images
        keepDocs:  keepDocIds.join(','),     // documents
        keepVideos: keepVideoIds.join(','),  // videos
      };

      if (recurring) {
          if (recurrence === "DAILY") {
            // DAILY doesn't need any specific fields, just recurrence and recurrenceEvery
          }
          if (recurrence === "WEEKLY") {
            body.recurrenceDow = Number(recurrenceDow);
          }
          if (recurrence === "MONTHLY") {
            body.recurrenceDom = Number(recurrenceDom);
          }
          if (recurrence === "YEARLY") {
            body.recurrenceMonth = Number(recurrenceMonth);
            body.recurrenceDom   = Number(recurrenceDom);
          }
        }

      console.log('Admin edit: Sending recurrence data to backend:', {
        recurring,
        recurrence,
        recEvery,
        recurrenceDow,
        recurrenceDom,
        recurrenceMonth,
        recEnd,
        body
      });


    const res = await fetch(endpoints.admin.userTask(parseInt(userId), parseInt(id)), {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return Alert.alert('Failed', `HTTP ${res.status}`);
    
    setLoad(false);
    setUploadProgress('');
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

    /* Append for recurring */
    if (recurring) {
      form.append('recurrenceEvery', recEvery);

      if (recurrence === "DAILY") {
        // DAILY doesn't need any specific fields, just recurrence and recurrenceEvery
      }
      if (recurrence === "WEEKLY") {
        form.append("recurrenceDow", recurrenceDow);
      }
      if (recurrence === "MONTHLY") {
        form.append("recurrenceDom", recurrenceDom);
      }
      if (recurrence === "YEARLY") {
        form.append("recurrenceMonth", recurrenceMonth);
        form.append("recurrenceDom", recurrenceDom);
      }

      if (recEnd) form.append('recurrenceEnd', recEnd.toISOString());
    }



    console.log('🔧 Saving labelDone:', labelDone, 'type:', typeof labelDone);
    form.append('labelDone', String(labelDone ?? false));

    form.append('keep',     keepImgIds.join(','));   // images to keep
    form.append('keepDocs', keepDocIds.join(','));   // docs to keep
    form.append('keepVideos', keepVideoIds.join(','));   // videos to keep

    // Compress new images before uploading
    if (newPhotos.length > 0) {
      setUploadProgress('Compressing images...');
      const imageUris = newPhotos.map(p => p.uri);
      const compressedImages = await compressImages(imageUris);
      
      // Use compressed images for upload
      compressedImages.forEach((compressed, idx) => {
        const originalPhoto = newPhotos[idx];
        form.append(`photo${idx}`, {
          uri: compressed.uri,
          name: originalPhoto.fileName ?? `photo${idx}.jpg`,
          type: originalPhoto.mimeType ?? 'image/jpeg',
        } as any);
      });
    }

    // Only append new documents (those without id)
    newDocs.forEach((d, idx) =>
      form.append(`doc${idx}`, {
        uri:  d.uri,
        name: d.name ?? `doc${idx}`,
        type: (d as any).mimeType ?? 'application/octet-stream',
      } as any)
    );

    // Compress and append new videos
    if (newVideos.length > 0) {
      setUploadProgress('Compressing videos...');
      const videoUris = newVideos.map(v => v.uri);
      const compressedVideos = await compressVideos(videoUris);
      
      // Use compressed videos for upload
      compressedVideos.forEach((compressed, idx) => {
        const originalVideo = newVideos[idx];
        form.append(`video${idx}`, {
          uri: compressed.uri,
          name: originalVideo.fileName ?? `video${idx}.mp4`,
          type: originalVideo.mimeType ?? 'video/mp4',
        } as any);
      });
    }

    setUploadProgress('Uploading files...');
    
    const res = await fetch(endpoints.admin.userTask(parseInt(userId), parseInt(id)), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${jwt}` },
      body: form,
    });
    if (!res.ok) return Alert.alert('Failed', `HTTP ${res.status}`);
    
    setLoad(false);
    setUploadProgress('');
  }

  router.push('/admin');
};

const handleBack = useCallback(() => {
    if (!hasUnsavedChanges) {           // ⬅️  let React Navigation do its thing
      router.push('/admin');
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
  }, [hasUnsavedChanges, save]);

  // Android back button handler - behaves exactly like the pressable back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      console.log('🔙 Android back button pressed - navigating to admin');
      if (hasUnsavedChanges) {
        handleBack();
        return true; // Prevent default back behavior
      }
      router.push('/admin');
      return true; // Prevent default back behavior
    });

    return () => backHandler.remove();
  }, [hasUnsavedChanges, handleBack]);



    /* ------------- UI --------------------------------------- */
    if (initialLoading) {
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
                contentContainerStyle={{ padding: 24, gap: 12, paddingBottom: Platform.OS === 'android' ? 120 : 100 }}
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
                           Editing task:
                         </Text>
                                                   <Text style={{ fontSize: 16, fontWeight: '600', color: '#1a1a1a' }}>
                            {userInfo?.username || userInfo?.email || 'Unknown User'}
                          </Text>
                       </View>
                    </View>

                    {/* Title */}
                    <View>
                        <TextInput
                            placeholder="Task title"
                            value={title}
                            onChangeText={setTitle}
                            maxLength={70}
                            style={{ borderWidth: 1, padding: 10, borderRadius: 6 }}
                        />
                        <Text style={{ fontSize: 12, color: '#666', textAlign: 'right', marginTop: 4 }}>
                            {title.length}/70
                        </Text>
                    </View>

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
                    <View style={{ marginTop: 8 }}>
                        {/* First row: ONE TWO THREE */}
                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                            {(['ONE', 'TWO', 'THREE'] as const).map(p => (
                                <Pressable
                                    key={p}
                                    onPress={() => setPriority(p)}
                                    style={{
                                        flex: 1,
                                        paddingHorizontal: 16,
                                        paddingVertical: 12,
                                        borderRadius: 8,
                                        borderWidth: 2,
                                        borderColor: priority === p ? '#0A84FF' : '#e9ecef',
                                        backgroundColor: priority === p ? '#0A84FF' : 'white',
                                        alignItems: 'center',
                                    }}
                                >
                                    <Text style={{
                                        fontSize: 14,
                                        fontWeight: '600',
                                        color: priority === p ? 'white' : '#1a1a1a',
                                    }}>
                                        {p}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                        {/* Second row: NONE IMMEDIATE */}
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            {(['NONE', 'IMMEDIATE'] as const).map(p => (
                                <Pressable
                                    key={p}
                                    onPress={() => setPriority(p)}
                                    style={{
                                        flex: 1,
                                        paddingHorizontal: 16,
                                        paddingVertical: 12,
                                        borderRadius: 8,
                                        borderWidth: 2,
                                        borderColor: priority === p ? (p === 'IMMEDIATE' ? '#dc3545' : '#0A84FF') : '#e9ecef',
                                        backgroundColor: priority === p ? (p === 'IMMEDIATE' ? '#dc3545' : '#0A84FF') : 'white',
                                        alignItems: 'center',
                                    }}
                                >
                                    <Text style={{
                                        fontSize: 14,
                                        fontWeight: '600',
                                        color: priority === p ? 'white' : '#1a1a1a',
                                    }}>
                                        {p}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>

                    {/* Status */}
                    <Text style={{ fontWeight: "bold", marginTop: 8 }}>STATUS</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        {(['ACTIVE', 'PENDING', 'DONE'] as const).map(s => (
                            <Pressable
                                key={s}
                                onPress={() => setStatus(s)}
                                style={{
                                    flex: 1,
                                    paddingHorizontal: 12,
                                    paddingVertical: 12,
                                    borderRadius: 8,
                                    borderWidth: 2,
                                    borderColor: status === s ? '#0A84FF' : '#e9ecef',
                                    backgroundColor: status === s ? '#0A84FF' : 'white',
                                    alignItems: 'center',
                                    minWidth: 0,
                                }}
                            >
                                <Text style={{
                                    fontSize: 13,
                                    fontWeight: '600',
                                    color: status === s ? 'white' : '#1a1a1a',
                                    textAlign: 'center',
                                }}>
                                    {s}
                                </Text>
                            </Pressable>
                        ))}
                    </View>

                                         {/* Size */}
                     <Text style={{ fontWeight: "bold", marginTop: 8 }}>SIZE</Text>
                     <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                         {SIZES.map(s => (
                             <Pressable
                                 key={s}
                                 onPress={() => setSize(s)}
                                 style={{
                                     flex: 1,
                                     paddingHorizontal: 12,
                                     paddingVertical: 12,
                                     borderRadius: 8,
                                     borderWidth: 2,
                                     borderColor: size === s ? '#0A84FF' : '#e9ecef',
                                     backgroundColor: size === s ? '#0A84FF' : 'white',
                                     alignItems: 'center',
                                     minWidth: 0,
                                 }}
                             >
                                 <Text style={{
                                     fontSize: 13,
                                     fontWeight: '600',
                                     color: size === s ? 'white' : '#1a1a1a',
                                     textAlign: 'center',
                                 }}>
                                     {s}
                                 </Text>
                             </Pressable>
                         ))}
                     </View>

                                         {/* Time-cap */}
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

                    <View style={{ gap: 12 }}>

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

                                                 {/* RECURRING */}
                         <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                             <Text style={{ fontWeight: "bold", marginRight: 8 }}>RECURRING</Text>
                             <Pressable
                                 onPress={() =>
                                     !recurring ? confirmRecurring() : setRecurring(false)
                                 }
                                 style={{
                                     width: 24,
                                     height: 24,
                                     borderRadius: 12,
                                     backgroundColor: recurring ? "#0A84FF" : "#CCC",
                                     justifyContent: "center",
                                     alignItems: "center",
                                 }}
                             >
                                 {recurring && (
                                     <View
                                         style={{
                                             width: 8,
                                             height: 8,
                                             borderRadius: 4,
                                             backgroundColor: "white",
                                         }}
                                     />
                                 )}
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

                            {/* EVERY X */}
                            <TextInput
                                keyboardType="number-pad"
                                value={recEvery}
                                onChangeText={handleEveryChange}   // ← updated
                                placeholder="e.g. 2"
                                style={{ borderWidth: 1, borderRadius: 6, padding: 10 }}
                            />

                            {/* Warn */}
                            {recurrence === "MONTHLY" && Number(recurrenceDom) > 28 && (
                                <Text style={{ fontSize: 12, color: "#FF9F0A", marginTop: 4 }}>
                                    Note: Months without a {recurrenceDom}‑day will roll over to the next month.
                                </Text>
                            )}


                            {/* ⬇️  WARNING when ‘every’ = 0 */}
                            {recurring && recEvery === "0" && (
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

                              {/* VIDEOS ---------------------------------------------------- */}
                              <View style={styles.thumbRow}>
                                  {videos.map((v, i) => (
                                      <Pressable
                                          key={i}
                                          onPress={() => {
                                              if (hasSelection) {
                                                  toggleVideo(i);
                                              } else {
                                                  setPlayingVideo(v.uri);
                                              }
                                          }}
                                          onLongPress={() =>
                                              Alert.alert('Remove video', 'Delete this video?', [
                                                  { text: 'Cancel', style: 'cancel' },
                                                  {
                                                      text: 'Delete', style: 'destructive',
                                                      onPress: () => {
                                                          setVideos(prev => prev.filter((_, j) => j !== i));
                                                          setRemovedSomething(true);
                                                      },
                                                  },
                                              ])
                                          }
                                          style={{ position: 'relative' }}
                                      >
                                          <View
                                              style={[
                                                  styles.thumb,
                                                  {
                                                      backgroundColor: '#f0f0f0',
                                                      justifyContent: 'center',
                                                      alignItems: 'center',
                                                  },
                                                  selectedVideos.has(i) && {
                                                      opacity: 0.4,
                                                      borderWidth: 2,
                                                      borderColor: '#0A84FF',
                                                  },
                                              ]}
                                          >
                                              <Text style={{ fontSize: 24, color: '#666' }}>🎬</Text>
                                          </View>
                                          {/* Play button overlay */}
                                          <View style={{
                                              position: 'absolute',
                                              top: '50%',
                                              left: '50%',
                                              transform: [{ translateX: -12 }, { translateY: -12 }],
                                              width: 24,
                                              height: 24,
                                              backgroundColor: 'rgba(0, 0, 0, 0.7)',
                                              borderRadius: 12,
                                              justifyContent: 'center',
                                              alignItems: 'center',
                                          }}>
                                              <Text style={{ color: 'white', fontSize: 12 }}>▶</Text>
                                          </View>
                                          {/* Duration overlay */}
                                          {v.duration && (
                                              <View style={{
                                                  position: 'absolute',
                                                  bottom: 4,
                                                  right: 4,
                                                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                                                  paddingHorizontal: 4,
                                                  paddingVertical: 2,
                                                  borderRadius: 4,
                                              }}>
                                                  <Text style={{ color: 'white', fontSize: 10 }}>
                                                      {Math.floor(v.duration / 1000)}s
                                                  </Text>
                                              </View>
                                          )}
                                      </Pressable>
                                  ))}
                              </View>
                    
                              {/* PICKERS  (camera / video / gallery / doc) ----------------------------- */}
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <View style={{ alignItems: 'center' }}>
                                  <Pressable 
                                    onPress={takePhoto} 
                                    style={[styles.pickerBox, pickingCamera && { opacity: 0.5 }]}
                                    disabled={pickingCamera}
                                  >
                                    {pickingCamera ? (
                                      <ActivityIndicator size="small" color="#555" />
                                    ) : (
                                      <Ionicons name="camera" size={28} color="#555" />
                                    )}
                                    <Ionicons 
                                      name="add-circle" 
                                      size={16} 
                                      color="#0A84FF" 
                                      style={{ 
                                        position: 'absolute', 
                                        top: 2, 
                                        left: 2 
                                      }} 
                                    />
                                  </Pressable>
                                  <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Camera</Text>
                                </View>

                                <View style={{ alignItems: 'center' }}>
                                  <Pressable 
                                    onPress={takeVideo} 
                                    style={[styles.pickerBox, pickingVideo && { opacity: 0.5 }]}
                                    disabled={pickingVideo}
                                  >
                                    {pickingVideo ? (
                                      <ActivityIndicator size="small" color="#555" />
                                    ) : (
                                      <Ionicons name="videocam" size={28} color="#555" />
                                    )}
                                    <Ionicons 
                                      name="add-circle" 
                                      size={16} 
                                      color="#0A84FF" 
                                      style={{ 
                                        position: 'absolute', 
                                        top: 2, 
                                        left: 2 
                                      }} 
                                    />
                                  </Pressable>
                                  <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Video</Text>
                                </View>
                                      
                                <View style={{ alignItems: 'center' }}>
                                  <Pressable 
                                    onPress={pickImages} 
                                    style={[styles.pickerBox, pickingGallery && { opacity: 0.5 }]}
                                    disabled={pickingGallery}
                                  >
                                    {pickingGallery ? (
                                      <ActivityIndicator size="small" color="#555" />
                                    ) : (
                                      <Ionicons name="image" size={28} color="#555" />
                                    )}
                                    <Ionicons 
                                      name="add-circle" 
                                      size={16} 
                                      color="#0A84FF" 
                                      style={{ 
                                        position: 'absolute', 
                                        top: 2, 
                                        left: 2 
                                      }} 
                                    />
                                  </Pressable>
                                  <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Gallery</Text>
                                </View>
                                      
                                <View style={{ alignItems: 'center' }}>
                                  <Pressable 
                                    onPress={pickDocs} 
                                    style={[styles.pickerBox, pickingDocs && { opacity: 0.5 }]}
                                    disabled={pickingDocs}
                                  >
                                    {pickingDocs ? (
                                      <ActivityIndicator size="small" color="#555" />
                                    ) : (
                                      <Ionicons name="document" size={28} color="#555" />
                                    )}
                                    <Ionicons 
                                      name="add-circle" 
                                      size={16} 
                                      color="#0A84FF" 
                                      style={{ 
                                        position: 'absolute', 
                                        top: 2, 
                                        left: 2 
                                      }} 
                                    />
                                  </Pressable>
                                  <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Document</Text>
                                </View>
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
                                {d.mimeType?.startsWith('image/') && d.uri ? (
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
                                        onError={(error) => {
                                            console.log('Image load error for document:', d.name, error);
                                        }}
                                        onLoadStart={() => {
                                            console.log('Loading document image:', d.name, d.uri);
                                        }}
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
                                         {/* Document name preview */}
                                         <Text style={{
                                             fontSize: 10,
                                             color: '#666',
                                             textAlign: 'center',
                                             marginTop: 2,
                                             fontWeight: '500',
                                         }}>
                                             {d.name ? 
                                                 `${d.name.substring(0, 3)}${d.name.includes('.') ? d.name.substring(d.name.lastIndexOf('.')) : ''}`
                                                 : 'doc'
                                             }
                                         </Text>
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
                                title={`Delete ${selectedPhotos.size + selectedDocs.size + selectedVideos.size} selected`}
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




                </View>
            </ScrollView>

            {/* Pinned Save Button */}
            <View style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: 'white',
                borderTopWidth: 1,
                borderTopColor: '#e9ecef',
                paddingHorizontal: 24,
                paddingVertical: 16,
                paddingBottom: Platform.OS === 'android' ? 50 : 16,
            }}>
                <Button 
                    title={loading ? "Saving…" : "Save"} 
                    onPress={save} 
                    disabled={loading}
                    color="#0A84FF"
                />
            </View>

            {/* Video Playback Modal */}
            <Modal
                visible={playingVideo !== null}
                animationType="slide"
                presentationStyle="fullScreen"
            >
                <View style={{ flex: 1, backgroundColor: 'black' }}>
                    <View style={{
                        position: 'absolute',
                        top: 50,
                        right: 20,
                        zIndex: 1,
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        borderRadius: 20,
                        padding: 8,
                    }}>
                        <Pressable onPress={() => setPlayingVideo(null)}>
                            <Text style={{ color: 'white', fontSize: 24 }}>✕</Text>
                        </Pressable>
                    </View>
                    {playingVideo && (
                        <Video
                            source={{ uri: playingVideo }}
                            style={{ flex: 1 }}
                            useNativeControls
                            resizeMode={ResizeMode.CONTAIN}
                            shouldPlay
                        />
                    )}
                </View>
            </Modal>

            {/* Loading Overlay */}
            <Modal
              transparent
              visible={loading}
              animationType="fade"
            >
              <View style={{
                flex: 1,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                justifyContent: 'center',
                alignItems: 'center',
              }}>
                <View style={{
                  backgroundColor: 'white',
                  borderRadius: 12,
                  padding: 24,
                  alignItems: 'center',
                  minWidth: 200,
                }}>
                  <ActivityIndicator size="large" color="#0A84FF" style={{ marginBottom: 16 }} />
                  <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
                    Saving Task
                  </Text>
                  <Text style={{ fontSize: 14, color: '#666', textAlign: 'center' }}>
                    {uploadProgress}
                  </Text>
                </View>
              </View>
            </Modal>
        </KeyboardAvoidingView>
    );
}
