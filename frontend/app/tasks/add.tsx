import { useState } from 'react';
import { View, TextInput, Button, Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import { router } from 'expo-router';

import { endpoints } from '../../src/api';   // adjust path if api.ts lives elsewhere
import { getToken  } from '../../src/auth';

const PRIORITIES = ['IMMEDIATE', 'RECURRENT', 'ONE', 'TWO', 'THREE', 'NONE'] as const;
const STATUSES   = ['PENDING', 'ACTIVE', 'DONE'] as const;

export default function AddTask() {
  const [title, setTitle]    = useState('');
  const [priority, setPrio]  = useState<typeof PRIORITIES[number]>('NONE');
  const [status, setStat]    = useState<typeof STATUSES[number]>('PENDING');
  const [dueAt, setDueAt]    = useState<Date | null>(null);
  const [showIOS, setShowIOS]= useState(false);

  const [img, setImg]        = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [loading, setLoading]= useState(false);

  /* pick image ------------------------------------------------ */
  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (!res.canceled) setImg(res.assets[0]);
  };

  /* pick date ------------------------------------------------- */
  const showPicker = () => {
  if (Platform.OS === 'android') {
    /* first pick a date */
    DateTimePickerAndroid.open({
      value: dueAt ?? new Date(),
      mode: 'date',
      onChange: (_, date) => {
        if (!date) return;
        /* then immediately pick a time */
        DateTimePickerAndroid.open({
          value: date,
          mode: 'time',
          is24Hour: true,
          onChange: (_, time) => time && setDueAt(
            new Date(
              date.getFullYear(), date.getMonth(), date.getDate(),
              time.getHours(), time.getMinutes()
            )
          ),
        });
      },
    });
  } else {
    setShowIOS(true);   // iOS inline picker (mode="datetime")
  }
};


  /* save ------------------------------------------------------ */
  const save = async () => {
    if (!title) return Alert.alert('Please enter a title');
    setLoading(true);

    const jwt  = await getToken();
    const form = new FormData();

    form.append('title',    title);
    form.append('priority', priority);
    form.append('status',   status);
    if (dueAt) form.append('dueAt', dueAt.toISOString());

    if (img) {
      form.append('file', {
        uri:  img.uri,
        name: img.fileName ?? 'photo.jpg',
        type: img.mimeType ?? 'image/jpeg',
      } as any);
    }

    const res = await fetch(endpoints.tasks, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      body:   form,
    });

    setLoading(false);
    if (!res.ok) return Alert.alert('Failed', await res.text());
    router.back();
  };

  /* UI -------------------------------------------------------- */
  return (
    <View style={{ padding: 24, gap: 12 }}>
      <TextInput
        placeholder="Task title"
        value={title}
        onChangeText={setTitle}
        style={{ borderWidth: 1, padding: 10, borderRadius: 6 }}
      />

      <Picker selectedValue={priority} onValueChange={v => setPrio(v)}>
        {PRIORITIES.map(p => <Picker.Item key={p} label={p} value={p} />)}
      </Picker>

      <Picker selectedValue={status} onValueChange={v => setStat(v)}>
        {STATUSES.map(s => <Picker.Item key={s} label={s} value={s} />)}
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

      <Button
        title={img ? 'Change photo' : 'Pick photo'}
        onPress={pickImage}
      />

      <Button
        title={loading ? 'Saving…' : 'Save'}
        onPress={save}
      />
    </View>
  );
}
