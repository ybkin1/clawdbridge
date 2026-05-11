import React from 'react';
import { View, FlatList, Text, StyleSheet } from 'react-native';
import { Session } from '../stores/use-session-store';

export interface SessionListScreenProps {
  sessions: Session[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onSearch: (query: string) => void;
}

export const SessionListScreen: React.FC<SessionListScreenProps> = ({ sessions, activeSessionId, onSelect, onSearch }) => {
  const sorted = [...sessions].sort((a, b) => b.lastMessageAt - a.lastMessageAt);

  const renderItem = ({ item }: { item: Session }) => (
    <View style={[styles.card, item.id === activeSessionId && styles.activeCard]}>
      <View style={styles.cardHeader}>
        <View style={[styles.statusDot, { backgroundColor: item.deviceStatus === 'online' ? '#10B981' : '#9CA3AF' }]} />
        <Text style={styles.title} numberOfLines={1}>{item.title || 'New Chat'}</Text>
        {item.pendingApprovals > 0 && <Text style={styles.badge}>⚠ {item.pendingApprovals}</Text>}
      </View>
      <Text style={styles.meta}>{item.deviceName} · {formatTime(item.lastMessageAt)}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={sorted}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
      />
    </View>
  );
};

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  list: { padding: 12 },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  activeCard: { borderColor: '#D97706', borderWidth: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  title: { fontSize: 15, fontWeight: '600', flex: 1, color: '#111827' },
  badge: { fontSize: 12, color: '#EF4444' },
  meta: { fontSize: 12, color: '#9CA3AF', marginLeft: 16 },
});
