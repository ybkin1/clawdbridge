import React, { useState } from 'react';
import { View, FlatList, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

interface TaskItem {
  id: string;
  title: string;
  repo: string;
  status: 'pending' | 'in_progress' | 'paused' | 'completed' | 'error';
  updatedAt: number;
}

interface TaskListScreenProps {
  tasks: TaskItem[];
  onSelect: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRetry: (id: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#9CA3AF', in_progress: '#10B981', paused: '#D97706', completed: '#3B82F6', error: '#EF4444',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending', in_progress: 'Running', paused: 'Paused', completed: 'Done', error: 'Error',
};

export const TaskListScreen: React.FC<TaskListScreenProps> = ({ tasks, onSelect, onPause, onResume, onRetry }) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string | null>(null);
  const filtered = tasks.filter((t) => {
    if (filter && t.status !== filter) return false;
    if (query) return t.title.toLowerCase().includes(query.toLowerCase()) || t.repo.toLowerCase().includes(query.toLowerCase());
    return true;
  });

  const renderItem = ({ item }: { item: TaskItem }) => (
    <TouchableOpacity style={styles.card} onPress={() => onSelect(item.id)}>
      <View style={styles.row}>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        <View style={[styles.badge, { backgroundColor: STATUS_COLORS[item.status] + '20' }]}>
          <Text style={[styles.badgeText, { color: STATUS_COLORS[item.status] }]}>{STATUS_LABELS[item.status]}</Text>
        </View>
      </View>
      <Text style={styles.repo}>{item.repo}</Text>
      <View style={styles.actions}>
        {item.status === 'in_progress' && <TouchableOpacity style={styles.actionBtn} onPress={() => onPause(item.id)}><Text style={styles.actionText}>Pause</Text></TouchableOpacity>}
        {item.status === 'paused' && <TouchableOpacity style={styles.actionBtn} onPress={() => onResume(item.id)}><Text style={styles.actionText}>Resume</Text></TouchableOpacity>}
        {item.status === 'error' && <TouchableOpacity style={styles.actionBtn} onPress={() => onRetry(item.id)}><Text style={styles.actionText}>Retry</Text></TouchableOpacity>}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <TextInput style={styles.search} placeholder="Search tasks..." value={query} onChangeText={setQuery} />
      <View style={styles.filters}>
        {['in_progress', 'paused', 'error', 'completed'].map((s) => (
          <TouchableOpacity key={s} style={[styles.filterBtn, filter === s && styles.filterActive]} onPress={() => setFilter(filter === s ? null : s)}>
            <Text style={[styles.filterText, filter === s && styles.filterTextActive]}>{STATUS_LABELS[s]}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList data={filtered} renderItem={renderItem} keyExtractor={(t) => t.id} contentContainerStyle={styles.list} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  search: { margin: 12, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFF', fontSize: 15 },
  filters: { flexDirection: 'row', paddingHorizontal: 12, marginBottom: 8, gap: 8 },
  filterBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#F3F4F6' },
  filterActive: { backgroundColor: '#D97706' },
  filterText: { fontSize: 12, color: '#6B7280' },
  filterTextActive: { color: '#FFF', fontWeight: '600' },
  list: { padding: 12 },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1 },
  badge: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  repo: { fontSize: 13, color: '#6B7280', marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 6, backgroundColor: '#F3F4F6' },
  actionText: { fontSize: 13, color: '#374151', fontWeight: '500' },
});
