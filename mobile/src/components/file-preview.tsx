import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

interface FilePreviewProps {
  uri: string;
  mimeType: string;
}

export const FilePreview: React.FC<FilePreviewProps> = ({ uri, mimeType }) => {
  if (mimeType.startsWith('image/')) {
    return <Image source={{ uri }} style={styles.image} resizeMode="contain" />;
  }
  if (mimeType === 'application/pdf') {
    return <View style={styles.unsupported}><Text style={styles.unsupportedText}>📄 PDF Preview not available</Text></View>;
  }
  if (mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('javascript')) {
    return <View style={styles.codeBox}><Text style={styles.codeText}>// Code preview: {uri}</Text></View>;
  }
  return <View style={styles.unsupported}><Text style={styles.unsupportedText}>❓ Unsupported file type: {mimeType}</Text></View>;
};

const styles = StyleSheet.create({
  image: { width: '100%', height: 300, borderRadius: 12 },
  unsupported: { padding: 24, alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 12 },
  unsupportedText: { color: '#6B7280', fontSize: 14 },
  codeBox: { backgroundColor: '#1F2937', borderRadius: 12, padding: 16 },
  codeText: { color: '#34D399', fontFamily: 'monospace', fontSize: 13 },
});
