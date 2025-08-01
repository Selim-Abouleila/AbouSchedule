import { useCallback, useState, useEffect } from 'react';
import { View, FlatList, Text, Pressable, ActivityIndicator } from 'react-native';
import { useFocusEffect, router, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { endpoints } from '../../src/api';
import { getToken }  from '../../src/auth';
import { Platform } from 'react-native';
import { ActionSheetIOS } from 'react-native';   // iOS native sheet
import { Modal } from 'react-native';
import { startTaskChecking, manualCheckForNewTasks } from '../../src/notificationHelper';

/** Page size we request from the API */
const PAGE_SIZE = 50;

type Task = {
  id:       number;
  title:    string;
  status:   'PENDING' | 'ACTIVE' | 'DONE';
  priority: 'NONE' | 'ONE' | 'TWO' | 'THREE' | 'IMMEDIATE' | 'RECURRENT';
  recurrence: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  images:   { id:number; url:string }[];
  documents: { id:number; url:string }[];
};

const statusColor: Record<Task['status'], string> = {
  PENDING: '#FFD60A',
  ACTIVE:  '#FF453A',
  DONE:    '#32D74B',
};
const statusLabel: Record<Task['status'], { caption: string; color: string }> = {
  PENDING: { caption: 'PENDING', color: '#FFD60A' },
  ACTIVE:  { caption: 'ACTIVE',  color: '#FF453A' },
  DONE:    { caption: 'DONE',    color: '#32D74B' },
};


/* Sort Choices form helper.ts */
export const SORT_CHOICES = [
  { label: 'Priority',        value: 'priority' },
  { label: 'Recently added',  value: 'recent' },
  { label: 'Active first',    value: 'status‑active' },
  { label: 'Done first',      value: 'status‑done' },
  { label: 'Pending first',   value: 'status‑pending' },
] as const;                              

/** All valid sort keys */
type SortPreset = typeof SORT_CHOICES[number]['value'];   // ② no manual list



/* simple vertical list; swap for a Picker/SegmentedControl if you prefer */
export function TaskSortPicker({
  sort,
  onChange,
}: {
  sort: SortPreset;
  onChange: (v: SortPreset) => void;
}) {
  return (
    <View style={{ padding: 12, borderBottomWidth: 1, borderColor: '#E1E4E8' }}>
      {SORT_CHOICES.map(opt => (
        <Pressable key={opt.value} onPress={() => onChange(opt.value)}
          style={{ paddingVertical: 6 }}>
          <Text style={{
            fontWeight: sort === opt.value ? '700' : '400',
            color: sort === opt.value ? '#0A84FF' : '#111',
          }}>
            {opt.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function TaskList() {
  const [tasks,      setTasks]      = useState<Task[]>([]);
  const [loading,    setLoading]    = useState(false);   // initial & pull‑to‑refresh
  const [loadingMore,setLoadingMore]= useState(false);   // infinite scroll
  const [nextCursor, setNextCursor]= useState<number | null>(null);
  /* current sort preset */
  const [sort, setSort] = useState<SortPreset>('priority');
  const nav = useNavigation(); 

  /* Sort MENU STUFF */ 
  const [menuVisible, setMenuVisible] = useState(false);
  const changeSort = (value: SortPreset) => {

    if (value === sort) return;
    setSort(value);
    setNextCursor(null);
    setTasks([]);
  };

  const openSortMenu = () => {
    if (Platform.OS === 'ios') {
      // iOS: native action‑sheet
      // 3 · ActionSheet / Modal: reuse the same SHORT labels
      const labels = SORT_CHOICES.map(o => o.label);      // no “Sort by” prefix
      ActionSheetIOS.showActionSheetWithOptions(
        { title: 'Sort by', options: [...labels, 'Cancel'], cancelButtonIndex: labels.length },
        i => i < labels.length && changeSort(SORT_CHOICES[i].value)
      );
    // Android modal → just render a <Text style={{fontWeight:'700'}}>Sort by</Text> above the buttons

    } else {
      // Android (& others): show our modal
      setMenuVisible(true);
    }
  };

  // 2 · Header title: “Sort by · <Label>”
  useEffect(() => {
    const chosen = SORT_CHOICES.find(c => c.value === sort)!.label;
    nav.setOptions({
      headerTitle: () => (
        <Pressable onPress={openSortMenu} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontWeight: '600' }}>Sort by · </Text>
          <Text style={{ fontWeight: '600' }}>{chosen}</Text>
          <Ionicons name="chevron-down" size={16} style={{ marginLeft: 4 }} />
        </Pressable>
      ),
    });
  }, [nav, sort]);







  /** Hit the API with optional cursor → returns { tasks, nextCursor } */
  const fetchPage = useCallback(
  async (cursor: number | null, replace = false) => {
    cursor ? setLoadingMore(true) : setLoading(true);
    try {
      const jwt = await getToken();

      const url = new URL(endpoints.tasks);
      url.searchParams.set('take', String(PAGE_SIZE));
      url.searchParams.set('sort', sort);     // always the current value
      if (cursor) url.searchParams.set('cursor', String(cursor));

      const res     = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      const payload = await res.json();

      const newTasks: Task[] = (payload.tasks ?? []).map((t: any) => ({
        ...t,
        priority: t.priority ?? 'NONE',
        images: Array.isArray(t.images) ? t.images : [],
        documents:  Array.isArray(t.documents)  ? t.documents  : [],
        recurrence: t.recurrence ?? 'NONE',
      }));

      setTasks(prev => (replace ? newTasks : [...prev, ...newTasks]));
      setNextCursor(payload.nextCursor);
    } finally {
      cursor ? setLoadingMore(false) : setLoading(false);
    }
  },
  [sort],                       // ← recreate when sort changes
);



useEffect(() => {
  fetchPage(null, true);        // first page with new preset
}, [sort]); 

// Start notification checking when component mounts
useEffect(() => {
  const cleanup = startTaskChecking();
  return cleanup;
}, []);

// Check for new tasks when screen comes into focus
useFocusEffect(
  useCallback(() => {
    manualCheckForNewTasks();
  }, [])
);

/** initial load + refresh */
  // reload now returns void
  // ⬇️ replace your current `reload` definition with this
  // ✅ NEW reload – always sees the current fetchPage / sort
  const reload = useCallback(() => {
    (async () => {
      const jwt = await getToken();
      if (!jwt) {
        router.replace('/auth/login');
        return;
      }
      fetchPage(null, true);          // uses the latest fetchPage
    })();
  }, [fetchPage]);                    // depend on fetchPage (and thus sort)

  // ✅ Re‑subscribe; no dependency array needed
  useFocusEffect(reload);


  /** onEndReached → load next page if available */
  const loadMore = () => {
    if (!loadingMore && nextCursor) fetchPage(nextCursor);
  };

  const renderItem = ({ item }: { item: Task }) => {
  const isDone = item.status === 'DONE';
  const isImmediate = item.priority === 'IMMEDIATE';
  const imgCount = item.images?.length ?? 0;
  const docCount = item.documents?.length ?? 0;
  const label    = statusLabel[item.status];

    return (
      <Pressable
        onPress={() => router.push(`/tasks/${item.id}`)}
        android_ripple={{ color: '#0001' }}
        style={({ pressed }) => ({
          backgroundColor: isImmediate && !isDone ? '#FFF5E6' : 'white',
          marginBottom: 12,
          borderRadius: 12,
          padding: 16,
          shadowColor: isImmediate && !isDone ? '#FF9F0A' : '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: isImmediate && !isDone ? 0.15 : 0.05,
          shadowRadius: isImmediate && !isDone ? 6 : 3,
          elevation: isImmediate && !isDone ? 4 : 2,
          opacity: pressed ? 0.7 : 1,
          borderWidth: isImmediate && !isDone ? 1 : 0,
          borderColor: isImmediate && !isDone ? '#FF9F0A' : 'transparent',
        })}
      >
        {/* ②  SIDE BAR  – 4 pt wide, glued to the edge */}
        {/* Status indicator bar */}
        <View
          style={{
            width: 4,
            height: 40,
            position: 'absolute',
            left: 0,
            top: 16,
            backgroundColor: statusColor[item.status],
            borderTopRightRadius: 2,
            borderBottomRightRadius: 2,
          }}
        />

        {/* content column */}
        <View style={{ flex: 1, marginLeft: 12, marginRight: 4 }}>
          {/* ── line 1: badges ── */}
          {/* badge row line 1 */}
          {/* container row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>

            {/* status badge – always shown, sits LEFT */}
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6,
                marginRight: 8,
                backgroundColor: label.color + '20',
              }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: label.color }}>
                {label.caption}
              </Text>
            </View>

            {/* 🔥 IMMEDIATE badge – only if needed, now on the RIGHT */}
            {isImmediate && !isDone && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                  backgroundColor: '#FF9F0A',
                  shadowColor: '#FF9F0A',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.3,
                  shadowRadius: 4,
                  elevation: 3,
                }}>
                <Ionicons name="flame" size={12} color="white" style={{ marginRight: 4 }} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: 'white' }}>
                  IMMEDIATE
                </Text>
              </View>
            )}
          </View>

          {/* ── line 2: title ── */}
          <Text style={{ 
            fontSize: 16, 
            fontWeight: '600', 
            marginBottom: 8, 
            color: isImmediate && !isDone ? '#B45309' : '#1a1a1a',
            lineHeight: 20,
          }}>
            {item.title}
          </Text>

          {/* ── line 3: extras ── */}
            {/* Recurring chip ---------------------------------------------------- */}
            {item.recurrence !== 'NONE' && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                  backgroundColor: isImmediate && !isDone ? '#FFF0D6' : '#f8f9fa',
                  borderWidth: 1,
                  borderColor: isImmediate && !isDone ? '#FFB366' : '#e9ecef',
                  marginBottom: 8,
                }}
              >
                <Ionicons name="repeat" size={14} color={isImmediate && !isDone ? '#B45309' : '#6c757d'} style={{ marginRight: 6 }} />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: isImmediate && !isDone ? '#B45309' : '#495057',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Recurring
                </Text>
              </View>
            )}

          {imgCount > 0 && (
            <Text style={{ color: '#6e6e6e', fontSize: 13, fontWeight: '600' }}>
              {imgCount} image{imgCount > 1 ? 's' : ''}
            </Text>
          )}

          {docCount > 0 && (                                          /* 👈 NEW  */
            <Text style={{ color: '#6e6e6e', fontSize: 13, fontWeight: '600' }}>
              {docCount} doc{docCount > 1 ? 's' : ''}
            </Text>
          )}
        </View>



      </Pressable>
    );
  };

  



  return (
  <View style={{ flex: 1, backgroundColor: '#f8f9fa' }}>

    {/* ───── Task list (pull‑to‑refresh & infinite scroll) ───── */}
    {loading && tasks.length === 0 ? (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#0A84FF" />
      </View>
    ) : (
      <FlatList
        data={tasks}
        keyExtractor={(task) => String(task.id)}
        refreshing={loading}
        onRefresh={reload}
        renderItem={renderItem}
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
        contentContainerStyle={{ padding: 16 }}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          loadingMore ? (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#0A84FF" />
            </View>
          ) : null
        }
      />
    )}

    {/* ───── Floating “add task” button ───── */}
    <Pressable
      onPress={() => router.push('/tasks/add')}
      style={({ pressed }) => ({
        position: 'absolute',
        right: 20,
        bottom: 20,
        backgroundColor: '#0A84FF',
        borderRadius: 28,
        width: 56,
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
        opacity: pressed ? 0.8 : 1,
        shadowColor: '#0A84FF',
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 8,
      })}
    >
      <Ionicons name="add" size={24} color="white" />
    </Pressable>

    {/* ───── Test notification button (temporary) ───── */}
    <Pressable
      onPress={() => manualCheckForNewTasks()}
      style={({ pressed }) => ({
        position: 'absolute',
        right: 20,
        bottom: 90,
        backgroundColor: '#FF6B35',
        borderRadius: 28,
        width: 56,
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
        opacity: pressed ? 0.8 : 1,
        shadowColor: '#FF6B35',
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 8,
      })}
    >
      <Ionicons name="notifications" size={24} color="white" />
    </Pressable>

    {/* ───── Android / fallback sort‑menu modal (new) ───── */}
    <Modal transparent visible={menuVisible} animationType="fade">
      <Pressable style={{ flex: 1 }} onPress={() => setMenuVisible(false)}>
        <View
          style={{
            position: 'absolute',
            top: 60,
            alignSelf: 'center',
            backgroundColor: '#fff',
            borderRadius: 8,
            elevation: 5,
            padding: 8,
          }}
        >
          {SORT_CHOICES.map((opt) => (
            <Pressable
              key={opt.value}
              onPress={() => {
                setMenuVisible(false);
                changeSort(opt.value);
              }}
              style={{ padding: 10 }}
            >
              <Text
                style={{
                  fontWeight: sort === opt.value ? '700' : '400',
                  color: sort === opt.value ? '#0A84FF' : '#111',
                }}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  </View>
);

}
