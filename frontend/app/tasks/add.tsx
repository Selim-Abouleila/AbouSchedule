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
  ActivityIndicator,
  Modal,
  BackHandler,
} from "react-native";


import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Video, ResizeMode } from 'expo-av';
import { Picker } from "@react-native-picker/picker";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { router } from "expo-router";

import { endpoints } from "../../src/api";
import { getToken } from "../../src/auth";
import { useFocusEffect } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useMemo, useRef } from "react";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { getDefaultLabelDone } from "../../src/settings";
import { getCurrentUserId } from "../../src/auth";
import { compressImages } from "../../src/imageCompression";
import { compressVideos } from "../../src/videoCompression";


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





const STATUSES = ["ACTIVE", "PENDING"] as const;
const SIZES = ["SMALL", "NORMAL", "LARGE"] as const;
const RECURRENCES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;

export default function AddTask() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPrio] = useState("NONE" as typeof PRIORITIES[number]);
  const [status, setStat] = useState("PENDING" as typeof STATUSES[number]);
  const [size, setSize] = useState<typeof SIZES[number]>("NORMAL");
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
  const [videos, setVideos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [loading, setLoad] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
      const [pickingPhotos, setPickingPhotos] = useState(false);
    const [pickingCamera, setPickingCamera] = useState(false);
    const [pickingVideo, setPickingVideo] = useState(false);
    const [pickingGallery, setPickingGallery] = useState(false);
    const [pickingDocs, setPickingDocs] = useState(false);



  const [selectedPhotos, setSelectedPhotos] = useState<Set<number>>(new Set());
  const [selectedDocs,   setSelectedDocs]   = useState<Set<number>>(new Set());
  const [selectedVideos, setSelectedVideos] = useState<Set<number>>(new Set());
  const [playingVideo, setPlayingVideo] = useState<{ uri: string; index: number } | null>(null);

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
    videos.length > 0 ||
    dueAt !== null ||
    recurring ||                       // anything else you care about
    timeCapH !== 0 || timeCapM !== 0,
  [
    title,
    description,
    photos,
    docs,
    videos,
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

const toggleVideo = (idx: number) =>
  setSelectedVideos(prev => {
    const next = new Set(prev);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    return next;
  });

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
};

const abortDelete = () => {
  setSelectedPhotos(new Set());
  setSelectedDocs(new Set());
  setSelectedVideos(new Set());
};

const hasSelection = selectedPhotos.size > 0 || selectedDocs.size > 0 || selectedVideos.size > 0;
const scrollRef = useRef<ScrollView>(null);

  

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

  /** open device camera, then push the result into `photos` or `videos` */
  /** launch device camera for photos */
  const takePhoto = async () => {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) {
      Alert.alert('Camera access was denied');
      return;
    }

    // Also check photo library permissions for iOS
    if (Platform.OS === 'ios') {
      const { granted: libraryGranted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!libraryGranted) {
        Alert.alert('Photo library access was denied');
        return;
      }
    }

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
        console.log('📸 Photo captured:', res.assets[0]);
        setPhotos(prev => [...prev, res.assets[0]]);
      }
    } finally {
      setPickingCamera(false);
    }
  };

  /** launch device camera for videos */
  const takeVideo = async () => {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) {
      Alert.alert('Camera access was denied');
      return;
    }

    // Also check photo library permissions for iOS
    if (Platform.OS === 'ios') {
      const { granted: libraryGranted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!libraryGranted) {
        Alert.alert('Photo library access was denied');
        return;
      }
    }

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
        console.log('📹 Video captured:', res.assets[0]);
        setVideos(prev => [...prev, res.assets[0]]);
      }
    } finally {
      setPickingVideo(false);
    }
  };

  /* pick image(s) and video(s) */
  const pickImages = async () => {
    // Check photo library permissions
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      Alert.alert('Photo library access was denied');
      return;
    }

    setPickingGallery(true);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: true,
        selectionLimit: 6,
        videoMaxDuration: 60, // 60 seconds max
        // iOS-specific options
        ...(Platform.OS === 'ios' && {
          allowsEditing: false,
          aspect: [1, 1], // Square aspect ratio for consistency
        }),
      });
      
      if (!res.canceled && res.assets?.length) {
        console.log('📹 Media selected from gallery:', res.assets);
        
        // Separate images and videos based on MIME type
        const images = res.assets.filter(asset => 
          asset.mimeType?.startsWith('image/')
        );
        const videos = res.assets.filter(asset => 
          asset.mimeType?.startsWith('video/')
        );
        
        // Add to respective state arrays
        if (images.length > 0) {
          setPhotos((prev) => [...prev, ...images]);
        }
        if (videos.length > 0) {
          setVideos((prev) => [...prev, ...videos]);
        }
      }
    } finally {
      setPickingGallery(false);
    }
  };

  /* pick Doc(s) */
  const pickDocs = async () => {
    setPickingDocs(true);
    try {
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
    } finally {
      setPickingDocs(false);
    }
  };

  useFocusEffect(
  useCallback(() => {
    const resetForm = async () => {
      setPhotos([]);
      setDocs([]);
      setVideos([]);
      setTitle('');
      setDescription('');
      setPrio('NONE');
      setStat('ACTIVE');
      setSize('NORMAL');
      setDueAt(null);
      setTimeCapH(0);
      setTimeCapM(0);
      setShowCapIOS(false);
      setRecurring(false);
      setRecurrence('DAILY');
      setRecurrenceEvery('1');
      setRecurrenceEnd(null);
      
      // Load the default label done setting
      try {
        const currentUserId = await getCurrentUserId();
        const defaultLabelDone = await getDefaultLabelDone(currentUserId || undefined);
        setLabelDone(defaultLabelDone);
      } catch (error) {
        console.error('Error loading default label done setting:', error);
        setLabelDone(true); // fallback to true
      }
      
      setSelectedPhotos(new Set());
      setSelectedDocs(new Set());
      setSelectedVideos(new Set());
      setShowIOS(false);
      setShowIOSRecEnd(false); 
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    };
    
    resetForm();
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


  const resetForm = async () => {
    setTitle("");
    setDescription("");
    setPrio("NONE");
    setStat("ACTIVE");
    setSize("NORMAL");
    setDueAt(null);
    setRecurring(false);
    setRecurrence("DAILY");
    setRecurrenceEvery("1");
    setRecurrenceEnd(null);
    
    // Load the default label done setting
    try {
      const currentUserId = await getCurrentUserId();
      const defaultLabelDone = await getDefaultLabelDone(currentUserId || undefined);
      setLabelDone(defaultLabelDone);
    } catch (error) {
      console.error('Error loading default label done setting:', error);
      setLabelDone(true); // fallback to true
    }
    
    setShowIOS(false);
    setShowIOSRecEnd(false);
  };


  /* save */
  const save = async () => {
    if (!title) return Alert.alert("Please enter a title");
    setLoad(true);
    setUploadProgress('Preparing upload...');

    const jwt = await getToken();
    const form = new FormData();

    form.append("title", title);
    form.append("description", description);
    form.append("priority", priority);
    form.append("status", status);
    form.append("size", size);
    if (dueAt) form.append("dueAt", dueAt.toISOString());

    // Compress images before uploading
    setUploadProgress('Compressing images...');
    const imageUris = photos.map(p => p.uri);
    const compressedImages = await compressImages(imageUris);
    
    // Use compressed images for upload
    compressedImages.forEach((compressed, idx) => {
      const originalPhoto = photos[idx];
      form.append(`photo${idx}`, {
        uri: compressed.uri,
        name: originalPhoto.fileName ?? `photo${idx}.jpg`,
        type: originalPhoto.mimeType ?? "image/jpeg",
      } as any);
    });

    docs.forEach((d, idx) =>
      form.append(`doc${idx}`, {
        uri: d.uri,
        name: d.name ?? `doc${idx}`,
        type: (d as any).mimeType ?? 'application/octet-stream',
      } as any)
    );

    // Add videos to form
    videos.forEach((v, idx) =>
      form.append(`video${idx}`, {
        uri: v.uri,
        name: v.fileName ?? `video${idx}.mp4`,
        type: v.mimeType ?? 'video/mp4',
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

    setUploadProgress('Uploading files...');
    
    console.log('📤 Sending request to backend with:', {
      photos: photos.length,
      videos: videos.length,
      docs: docs.length,
      endpoint: endpoints.tasks
    });
    
    const res = await fetch(endpoints.tasks, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: form,
    });
    
    console.log('📥 Backend response:', {
      status: res.status,
      ok: res.ok
    });

    setLoad(false);
    setUploadProgress('');
    if (!res.ok) {
      return Alert.alert("Failed", await res.text());
    }
    await resetForm();
    router.push('/tasks');
  };

  const handleBack = useCallback(() => {
    console.log('🔙 handleBack called in add.tsx, hasUnsavedChanges:', hasUnsavedChanges);
    if (!hasUnsavedChanges) {           // If no changes, go back to tasks list
      console.log('🔙 Navigating to /tasks');
      router.push('/tasks');
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
                  onPress: async () => {
                    await resetForm();
                    router.push('/tasks');
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

  // Android back button handler
  useEffect(() => {
    const backAction = () => {
      console.log('🔙 Android back button pressed in add.tsx');
      handleBack();
      return true; // Always prevent default behavior and use custom navigation
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [handleBack]);

  /* UI */
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 24, gap: 12, paddingBottom: Platform.OS === 'android' ? 120 : 100 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ padding: 24, gap: 12 }}>
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
                  onPress={() => setPrio(p)}
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
                  onPress={() => setPrio(p)}
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
            {STATUSES.map(s => (
              <Pressable
                key={s}
                onPress={() => setStat(s)}
                style={{
                  flex: 1,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderRadius: 8,
                  borderWidth: 2,
                  borderColor: status === s ? '#0A84FF' : '#e9ecef',
                  backgroundColor: status === s ? '#0A84FF' : 'white',
                  alignItems: 'center',
                }}
              >
                <Text style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: status === s ? 'white' : '#1a1a1a',
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

            {videos.map((v, i) => (
              <Pressable
                key={`video-${i}`}
                onPress={() => setPlayingVideo({ uri: v.uri, index: i })}
                onLongPress={() =>
                  Alert.alert('Remove video', 'Delete this video?', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => setVideos(prev => prev.filter((_, j) => j !== i)),
                    },
                  ])
                }>
                <View style={{ position: 'relative' }}>
                  <Image
                    source={{ uri: v.uri }}
                    style={[
                      styles.thumb,
                      selectedVideos.has(i) && {
                        opacity: 0.4,
                        borderWidth: 2,
                        borderColor: '#0A84FF',
                      },
                    ]}
                  />
                  {/* Play button overlay */}
                  <View style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: [{ translateX: -15 }, { translateY: -15 }],
                    width: 30,
                    height: 30,
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    borderRadius: 15,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}>
                    <Text style={{ color: '#fff', fontSize: 16 }}>▶️</Text>
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
                      <Text style={{ color: '#fff', fontSize: 10 }}>
                        {v.duration ? Math.round(v.duration / 1000) : 0}s
                      </Text>
                    </View>
                  )}
                </View>
              </Pressable>
            ))}

            {/* ✂️ REMOVED docs.map() here — docs now show only in the bottom grid */}
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
                    <Ionicons name="document" size={28} color="#555" />
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
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable 
            onPress={() => router.push('/tasks')}
            style={{ 
              flex: 1, 
              backgroundColor: '#f8f9fa', 
              padding: 12, 
              borderRadius: 8, 
              alignItems: 'center',
              borderWidth: 1,
              borderColor: '#dee2e6'
            }}
          >
            <Text style={{ color: '#6c757d', fontWeight: '600' }}>← Back</Text>
          </Pressable>
          <Pressable 
            onPress={save}
            disabled={loading}
            style={{ 
              flex: 1, 
              backgroundColor: loading ? '#6c757d' : '#0A84FF', 
              padding: 12, 
              borderRadius: 8, 
              alignItems: 'center'
            }}
          >
            <Text style={{ color: 'white', fontWeight: '600' }}>
              {loading ? "Saving…" : "Save"}
            </Text>
          </Pressable>
        </View>
      </View>

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
              Uploading Task
            </Text>
            <Text style={{ fontSize: 14, color: '#666', textAlign: 'center' }}>
              {uploadProgress}
            </Text>
          </View>
        </View>
      </Modal>

      {/* Video Player Modal */}
      <Modal
        visible={playingVideo !== null}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <View style={{
          flex: 1,
          backgroundColor: 'black',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <View style={{
            position: 'absolute',
            top: 50,
            left: 20,
            zIndex: 10,
          }}>
            <Pressable
              onPress={() => setPlayingVideo(null)}
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                borderRadius: 20,
                padding: 10,
              }}
            >
              <Text style={{ color: 'white', fontSize: 18 }}>✕</Text>
            </Pressable>
          </View>
          
          {playingVideo && (
            <Video
              source={{ uri: playingVideo.uri }}
              style={{
                width: '100%',
                height: '100%',
              }}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
              isLooping={false}
            />
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );

}
