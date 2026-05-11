import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Session } from '../stores/use-session-store';

export { Session };

export interface SessionCardProps {
  session: Session;
  isActive: boolean;
  onPress: () => void;
}

export const SessionCard: React.FC<SessionCardProps> = ({ session, isActive, onPress }) => (
  <View style={[styles.card, isActive && styles.active]}>
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: session.deviceStatus === 'online' ? '#10B981' : '#9CA3AF' }]} />
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>{session.title || 'New Chat'}</Text>
        <Text style={styles.meta}>{session.deviceName} · {formatTime(session.lastMessageAt)}</Text>
      </View>
      {session.pendingApprovals > 0 && <Text style={styles.badge}>⚠ {session.pendingApprovals}</Text>}
      {session.unreadCount > 0 && <View style={styles.unread}><Text style={styles.unreadText}>{session.unreadCount}</Text></View>}
    </View>
  </View>
);

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  active: { borderColor: '#D97706', borderWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  content: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: '#111827' },
  meta: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  badge: { fontSize: 12, color: '#EF4444', marginLeft: 4 },
  unread: { backgroundColor: '#EF4444', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 6, paddingHorizontal: 6 },
  unreadText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
});
