import React, { useState } from 'react';
import { View, FlatList, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface FileNode {
  path: string;
  type: 'file' | 'dir';
  children?: FileNode[];
}

interface FileTreeScreenProps {
  tree: FileNode[];
  onPreview: (path: string) => void;
}

const FileItem: React.FC<{ node: FileNode; depth: number; onPreview: (p: string) => void }> = ({ node, depth, onPreview }) => {
  const [expanded, setExpanded] = useState(false);
  const indent = depth * 16;

  if (node.type === 'dir') {
    return (
      <View>
        <TouchableOpacity style={[styles.row, { paddingLeft: 12 + indent }]} onPress={() => setExpanded(!expanded)}>
          <Text style={styles.icon}>{expanded ? '📂' : '📁'}</Text>
          <Text style={styles.name}>{node.path.split('/').pop()}</Text>
        </TouchableOpacity>
        {expanded && node.children?.map((c) => <FileItem key={c.path} node={c} depth={depth + 1} onPreview={onPreview} />)}
      </View>
    );
  }

  return (
    <TouchableOpacity style={[styles.row, { paddingLeft: 12 + indent }]} onPress={() => onPreview(node.path)}>
      <Text style={styles.icon}>📄</Text>
      <Text style={[styles.name, styles.fileName]}>{node.path.split('/').pop()}</Text>
    </TouchableOpacity>
  );
};

export const FileTreeScreen: React.FC<FileTreeScreenProps> = ({ tree, onPreview }) => (
  <View style={styles.container}>
    <FlatList data={tree} renderItem={({ item }) => <FileItem node={item} depth={0} onPreview={onPreview} />} keyExtractor={(i) => i.path} />
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  icon: { fontSize: 16, marginRight: 8 },
  name: { fontSize: 14, color: '#374151' },
  fileName: { color: '#111827' },
});
