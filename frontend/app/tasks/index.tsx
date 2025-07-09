import { useEffect, useState, useCallback } from 'react';
import { View, FlatList, Text, Button, Pressable } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { endpoints } from '../../src/api';
import { getToken } from '../../src/auth';

export default function TaskList() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setL]   = useState(false);

  const load = async () => {
    setL(true);
    const t = await getToken();
    const r = await fetch(endpoints.tasks, { headers:{ Authorization:`Bearer ${t}` } });
    setTasks(await r.json());
    setL(false);
  };

  useFocusEffect(useCallback(()=>{ load(); }, []));

  return (
    <View style={{flex:1}}>
      <FlatList
        data={tasks}
        keyExtractor={t=>String(t.id)}
        refreshing={loading}
        onRefresh={load}
        renderItem={({item})=>(
          <View style={{padding:12,borderBottomWidth:1}}>
            <Text>{item.title}</Text>
            {item.images[0] && <Text style={{color:'gray'}}>{item.images.length} image(s)</Text>}
          </View>
        )}
      />
      <Pressable
        onPress={()=>router.push('/tasks/add')}
        style={{position:'absolute',right:24,bottom:24,backgroundColor:'#0A84FF',borderRadius:32,padding:16}}
      >
        <Text style={{color:'white',fontSize:24}}>＋</Text>
      </Pressable>
    </View>
  );
}
