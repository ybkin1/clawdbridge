import React, { useState } from 'react';
import { View, FlatList, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

interface RepoItem {
  name: string;
  workDir: string;
  gitRemote: string;
  branches: string[];
}

interface RepoListScreenProps {
  repos: RepoItem[];
  onRegister: (name: string, gitRemote: string) => void;
  onUnregister: (name: string) => void;
  onSelectBranch: (repoName: string, branch: string) => void;
}

export const RepoListScreen: React.FC<RepoListScreenProps> = ({ repos, onRegister, onUnregister, onSelectBranch }) => {
  const [name, setName] = useState('');
  const [remote, setRemote] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <View style={styles.container}>
      <View style={styles.addBox}>
        <TextInput style={styles.input} placeholder="Repo name" value={name} onChangeText={setName} />
        <TextInput style={styles.input} placeholder="Git remote URL" value={remote} onChangeText={setRemote} />
        <TouchableOpacity style={styles.addBtn} onPress={() => { onRegister(name, remote); setName(''); setRemote(''); }}>
          <Text style={styles.addText}>Add Repo</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={repos}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.repoName}>{item.name}</Text>
              <TouchableOpacity onPress={() => onUnregister(item.name)}><Text style={styles.remove}>Remove</Text></TouchableOpacity>
            </View>
            <Text style={styles.remote}>{item.gitRemote}</Text>
            <TouchableOpacity onPress={() => setExpanded(expanded === item.name ? null : item.name)}>
              <Text style={styles.branchToggle}>{expanded === item.name ? 'Hide' : 'Show'} branches ({item.branches.length})</Text>
            </TouchableOpacity>
            {expanded === item.name && item.branches.map((b) => (
              <TouchableOpacity key={b} style={styles.branch} onPress={() => onSelectBranch(item.name, b)}>
                <Text style={styles.branchText}>{b}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        keyExtractor={(item) => item.name}
        contentContainerStyle={styles.list}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  addBox: { padding: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 10, marginBottom: 8, fontSize: 14 },
  addBtn: { backgroundColor: '#D97706', borderRadius: 8, padding: 12, alignItems: 'center' },
  addText: { color: '#FFF', fontWeight: '600' },
  list: { padding: 12 },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  repoName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  remove: { fontSize: 13, color: '#EF4444' },
  remote: { fontSize: 12, color: '#6B7280', marginBottom: 8 },
  branchToggle: { fontSize: 13, color: '#D97706', fontWeight: '500' },
  branch: { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#F3F4F6', borderRadius: 6, marginTop: 4 },
  branchText: { fontSize: 13, color: '#374151' },
});
