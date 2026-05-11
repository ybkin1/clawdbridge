import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface ErrorCardProps {
  code: string;
  message: string;
  onRetry?: () => void;
}

export const ErrorCard: React.FC<ErrorCardProps> = ({ code, message, onRetry }) => (
  <View style={styles.card}>
    <Text style={styles.icon}>⚠</Text>
    <Text style={styles.code}>{code}</Text>
    <Text style={styles.message}>{message}</Text>
    {onRetry && (
      <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
        <Text style={styles.retryText}>Retry</Text>
      </TouchableOpacity>
    )}
  </View>
);

const styles = StyleSheet.create({
  card: { backgroundColor: '#FEF2F2', borderRadius: 12, padding: 16, marginVertical: 4, borderWidth: 1, borderColor: '#FECACA', alignItems: 'center' },
  icon: { fontSize: 24, marginBottom: 4 },
  code: { fontSize: 13, fontWeight: 'bold', color: '#991B1B', marginBottom: 2 },
  message: { fontSize: 13, color: '#B91C1C', textAlign: 'center', marginBottom: 8 },
  retryBtn: { backgroundColor: '#EF4444', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 24 },
  retryText: { color: '#FFF', fontWeight: '600' },
});
