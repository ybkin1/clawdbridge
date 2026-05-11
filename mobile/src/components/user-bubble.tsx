import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface UserBubbleProps {
  content: string;
  timestamp: number;
  status: 'sending' | 'sent' | 'failed';
}

export const UserBubble: React.FC<UserBubbleProps> = ({ content, timestamp, status }) => (
  <View style={styles.row}>
    <View style={styles.bubble}>
      <Text style={styles.text}>{content}</Text>
      <Text style={styles.meta}>{formatTime(timestamp)} · {status === 'sending' ? '...' : status === 'failed' ? '!' : '✓'}</Text>
    </View>
  </View>
);

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 },
  bubble: { backgroundColor: '#3B82F6', borderRadius: 16, borderBottomRightRadius: 4, padding: 12, maxWidth: '80%' },
  text: { fontSize: 15, color: '#FFF' },
  meta: { fontSize: 10, color: '#BFDBFE', marginTop: 4, textAlign: 'right' },
});
