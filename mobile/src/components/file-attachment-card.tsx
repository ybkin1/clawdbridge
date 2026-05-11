import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface FileAttachmentCardProps {
  fileName: string;
  size: number;
  onDownload: () => void;
  onPreview: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export const FileAttachmentCard: React.FC<FileAttachmentCardProps> = ({ fileName, size, onDownload, onPreview }) => (
  <View style={styles.card}>
    <Text style={styles.icon}>📎</Text>
    <View style={styles.info}>
      <Text style={styles.name} numberOfLines={1}>{fileName}</Text>
      <Text style={styles.size}>{formatSize(size)}</Text>
    </View>
    <View style={styles.actions}>
      <TouchableOpacity style={styles.btn} onPress={onPreview}><Text style={styles.btnText}>Preview</Text></TouchableOpacity>
      <TouchableOpacity style={styles.btn} onPress={onDownload}><Text style={styles.btnText}>Download</Text></TouchableOpacity>
    </View>
  </View>
);

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, marginVertical: 4, borderWidth: 1, borderColor: '#BFDBFE' },
  icon: { fontSize: 20, marginRight: 10 },
  info: { flex: 1 },
  name: { fontSize: 14, color: '#1E40AF', fontWeight: '500' },
  size: { fontSize: 12, color: '#60A5FA', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 6 },
  btn: { backgroundColor: '#3B82F6', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10 },
  btnText: { color: '#FFF', fontSize: 12, fontWeight: '500' },
});
