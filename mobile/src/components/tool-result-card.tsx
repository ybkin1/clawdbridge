import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface ToolResultCardProps {
  success: boolean;
  output?: string;
  error?: string;
}

export const ToolResultCard: React.FC<ToolResultCardProps> = ({ success, output, error }) => (
  <View style={[styles.card, success ? styles.success : styles.fail]}>
    <Text style={styles.status}>{success ? '✓ Success' : '✗ Failed'}</Text>
    {output && <Text style={styles.output} numberOfLines={3}>{output}</Text>}
    {error && <Text style={styles.err} numberOfLines={2}>{error}</Text>}
  </View>
);

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 12, marginVertical: 4, borderWidth: 1 },
  success: { backgroundColor: '#ECFDF5', borderColor: '#10B981' },
  fail: { backgroundColor: '#FEF2F2', borderColor: '#EF4444' },
  status: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  output: { fontSize: 12, color: '#065F46', fontFamily: 'monospace' },
  err: { fontSize: 12, color: '#991B1B', fontFamily: 'monospace' },
});
