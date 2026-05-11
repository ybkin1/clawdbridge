import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Message } from '../stores/chat-store';

export interface MessageBubbleProps {
  message: Message;
}

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(({ message }) => {
  const isUser = message.type === 'user';
  const isError = message.type === 'error';
  const isTool = message.type === 'tool_call';

  return (
    <View style={[styles.row, isUser && styles.rowRight]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : isError ? styles.errorBubble : isTool ? styles.toolBubble : styles.aiBubble]}>
        <Text style={[styles.text, isUser && styles.userText, isError && styles.errorText]}>{message.content}</Text>
        {isTool && message.metadata.filePath && <Text style={styles.meta}>📄 {message.metadata.filePath}</Text>}
        {isError && <Text style={styles.fixBtn}>Let AI fix</Text>}
        <Text style={styles.ts}>{message.status === 'sending' ? 'Sending...' : formatTime(message.timestamp)}</Text>
      </View>
    </View>
  );
});

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: 8 },
  rowRight: { flexDirection: 'row-reverse' },
  bubble: { maxWidth: '80%', padding: 12, borderRadius: 16, marginBottom: 4 },
  userBubble: { backgroundColor: '#3B82F6', alignSelf: 'flex-end' },
  aiBubble: { backgroundColor: '#F3F4F6', alignSelf: 'flex-start' },
  errorBubble: { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#EF4444' },
  toolBubble: { backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#D97706' },
  text: { fontSize: 15, color: '#111827' },
  userText: { color: '#FFF' },
  errorText: { color: '#B91C1C' },
  meta: { fontSize: 11, color: '#92400E', marginTop: 4 },
  fixBtn: { fontSize: 13, color: '#D97706', fontWeight: '600', marginTop: 6 },
  ts: { fontSize: 10, color: '#9CA3AF', marginTop: 4, textAlign: 'right' },
});
