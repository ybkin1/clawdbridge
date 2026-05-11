import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Device } from '../stores/use-device-store';

export interface TaskDashboardScreenProps {
  devices: Device[];
}

export const TaskDashboardScreen: React.FC<TaskDashboardScreenProps> = ({ devices }) => (
  <View style={styles.container}>
    <Text style={styles.heading}>Active Tasks</Text>
    {devices.filter(d => d.status === 'online').map((d) => (
      <View key={d.id} style={styles.card}>
        <Text style={styles.deviceName}>{d.name}</Text>
        <Text style={styles.platform}>{d.platform} · {d.status}</Text>
      </View>
    ))}
    {devices.filter(d => d.status === 'online').length === 0 && (
      <Text style={styles.empty}>No active desktop devices connected</Text>
    )}
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB', padding: 16 },
  heading: { fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 16 },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  deviceName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  platform: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  empty: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginTop: 40 },
});
