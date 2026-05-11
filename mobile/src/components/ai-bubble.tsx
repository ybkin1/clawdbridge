import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface AIBubbleProps {
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

export const AIBubble: React.FC<AIBubbleProps> = ({ content, timestamp, isStreaming }) => (
  <View style={styles.row}>
    <View style={styles.bubble}>
      <Text style={styles.text}>{content}{isStreaming && <Text style={styles.cursor}>▌</Text>}</Text>
      <Text style={styles.meta}>{formatTime(timestamp)}</Text>
    </View>
  </View>
);

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 8 },
  bubble: { backgroundColor: '#F3F4F6', borderRadius: 16, borderBottomLeftRadius: 4, padding: 12, maxWidth: '80%' },
  text: { fontSize: 15, color: '#111827' },
  cursor: { color: '#D97706' },
  meta: { fontSize: 10, color: '#9CA3AF', marginTop: 4 },
});
