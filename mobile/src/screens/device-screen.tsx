import React from 'react';
import { View, FlatList, Text, StyleSheet } from 'react-native';
import { Device } from '../stores/use-device-store';

export interface DeviceScreenProps {
  devices: Device[];
  onPair: (deviceId: string) => void;
  onUnpair: (deviceId: string) => void;
}

export const DeviceScreen: React.FC<DeviceScreenProps> = ({ devices, onPair, onUnpair }) => (
  <View style={styles.container}>
    <FlatList
      data={devices}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: item.status === 'online' ? '#10B981' : '#9CA3AF' }]} />
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.status}>{item.status} · {item.platform}</Text>
          </View>
          {item.authorizedDirs.length > 0 && <Text style={styles.dir}>Authorized: {item.authorizedDirs.join(', ')}</Text>}
          <Text style={styles.unpair} onPress={() => onUnpair(item.id)}>Unpair</Text>
        </View>
      )}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
    />
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  list: { padding: 12 },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginBottom: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  name: { fontSize: 16, fontWeight: '600', flex: 1, color: '#111827' },
  status: { fontSize: 12, color: '#6B7280' },
  dir: { fontSize: 12, color: '#6B7280', marginBottom: 8 },
  unpair: { fontSize: 14, color: '#EF4444', fontWeight: '500' },
});
