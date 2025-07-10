import { useState } from 'react';
import { View, Text, TextInput, Button, Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';

import { endpoints } from '../../src/api';
import { getToken } from '../../src/auth';

const PRIORITIES = ['IMMEDIATE', 'RECURRENT', 'ONE', 'TWO', 'THREE', 'NONE'] as const;
const STATUSES   = ['PENDING', 'ACTIVE', 'DONE'] as const;
const SIZES = ['SMALL', 'LARGE'] as const;

export default function AddTask() {
  const [title,    setTitle]   = useState('');
  // ← no more useState<…> generics!
  const [priority, setPrio]    = useState('NONE' as typeof PRIORITIES[number]);
  const [status,   setStat]    = useState('PENDING' as typeof STATUSES[number]);
  const [size,   setSize]    = useState('LARGE' as typeof SIZES[number]);
  const [dueAt,    setDueAt]   = useState<Date | null>(null);
  const [showIOS,  setShowIOS] = useState(false);

  const [img,     setImg]      = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [loading, setLoad]     = useState(false);

  /* pick image */
  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (!res.canceled) setImg(res.assets[0]);
  };

  /* pick date */
  const showPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: dueAt ?? new Date(),
        mode: 'date',
        onChange: (_, date) => {
          if (!date) return;
          DateTimePickerAndroid.open({
            value: date,
            mode: 'time',
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
    if (!title) return Alert.alert('Please enter a title');
    setLoad(true);

    const jwt = await getToken();
    const form = new FormData();

    form.append('title',    title);
    form.append('priority', priority);
    form.append('status',   status);
    form.append('size',   size);
    if (dueAt) form.append('dueAt', dueAt.toISOString());

    if (img) {
      form.append('photo', {
        uri:  img.uri,
        name: img.fileName ?? 'photo.jpg',
        type: img.mimeType ?? 'image/jpeg',
      } as any);
    }

    const res = await fetch(endpoints.tasks, {
      method:  'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      body:    form,
    });

    setLoad(false);
    if (!res.ok) {
      const msg = await res.text();
      return Alert.alert('Failed', msg);
    }
    router.back();
  };

  /* UI */
  return (
    <View style={{ padding: 24, gap: 12 }}>
      <TextInput
        placeholder="Task title"
        value={title}
        onChangeText={setTitle}
        style={{ borderWidth: 1, padding: 10, borderRadius: 6 }}
      />

      {/* PRIORITY header */}
      <Text style={{ fontWeight: 'bold', color: '#000', marginTop: 8 }}>
        PRIORITY
      </Text>
      <Picker selectedValue={priority} onValueChange={setPrio}>
        {PRIORITIES.map((p) => (
          <Picker.Item key={p} label={p} value={p} />
        ))}
      </Picker>

      {/* STATUS header */}
      <Text style={{ fontWeight: 'bold', color: '#000', marginTop: 8 }}>
        STATUS
      </Text>
      <Picker selectedValue={status} onValueChange={setStat}>
        {STATUSES.map((s) => (
          <Picker.Item key={s} label={s} value={s} />
        ))}
      </Picker>

      {/* SIZE header */}
      <Text style={{ fontWeight: 'bold', color: '#000', marginTop: 8 }}>
        SIZE
      </Text>
      <Picker selectedValue={size} onValueChange={setSize}>
        {SIZES.map((s) => (
          <Picker.Item key={s} label={s} value={s} />
        ))}
      </Picker>

      <Button
        title={dueAt ? dueAt.toLocaleString() : 'Pick due date'}
        onPress={showPicker}
      />

      {Platform.OS === 'ios' && showIOS && (
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

      <Button title={img ? 'Change photo' : 'Pick photo'} onPress={pickImage} />

      <Button
        title={loading ? 'Saving…' : 'Save'}
        onPress={save}
        disabled={loading}
      />

      <Button 
    title = "← Back"
    onPress={() => router.back()}
    />
    </View>

    
  );

  
}
