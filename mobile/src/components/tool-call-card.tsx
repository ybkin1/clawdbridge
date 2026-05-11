import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface ToolCallCardProps {
  toolName: string;
  filePath?: string;
  command?: string;
  diff?: string;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({ toolName, filePath, command, diff }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.card}>
      <TouchableOpacity onPress={() => setExpanded(!expanded)}>
        <View style={styles.header}>
          <Text style={styles.icon}>🔧</Text>
          <Text style={styles.name}>{toolName}</Text>
        </View>
        {filePath && <Text style={styles.file}>📄 {filePath}</Text>}
        {command && <Text style={styles.cmd}>$ {command}</Text>}
      </TouchableOpacity>
      {expanded && diff && (
        <View style={styles.diffBox}>
          <Text style={styles.diff}>{diff}</Text>
        </View>
      )}
      {diff && (
        <TouchableOpacity onPress={() => setExpanded(!expanded)}>
          <Text style={styles.toggle}>{expanded ? 'Collapse' : 'Show diff'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, marginVertical: 4, borderWidth: 1, borderColor: '#FCD34D' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  icon: { fontSize: 14, marginRight: 6 },
  name: { fontSize: 13, fontWeight: '600', color: '#92400E' },
  file: { fontSize: 12, color: '#78350F', marginTop: 2 },
  cmd: { fontSize: 11, color: '#92400E', fontFamily: 'monospace', marginTop: 2 },
  diffBox: { backgroundColor: '#FFFBEB', borderRadius: 6, padding: 8, marginTop: 6 },
  diff: { fontSize: 11, color: '#78350F', fontFamily: 'monospace' },
  toggle: { fontSize: 11, color: '#D97706', marginTop: 4, fontWeight: '500' },
});
