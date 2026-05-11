import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

interface ProfileScreenProps {
  user: { login: string; avatarUrl: string } | null;
  cloudAgentStatus: { status: string; uptime: number } | null;
  deviceCount: number;
  repoCount: number;
  onLogout: () => void;
  onNavigateDevices: () => void;
  onNavigateRepos: () => void;
  onNavigateSettings: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  user, cloudAgentStatus, deviceCount, repoCount, onLogout, onNavigateDevices, onNavigateRepos, onNavigateSettings,
}) => (
  <ScrollView style={styles.container}>
    <View style={styles.header}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{user?.login?.[0]?.toUpperCase() || '?'}</Text></View>
      <Text style={styles.name}>{user?.login || 'Guest'}</Text>
      <View style={[styles.statusBadge, { backgroundColor: cloudAgentStatus ? '#10B98120' : '#EF444420' }]}>
        <Text style={[styles.statusText, { color: cloudAgentStatus ? '#10B981' : '#EF4444' }]}>
          Cloud Agent {cloudAgentStatus ? 'Online' : 'Offline'}
        </Text>
      </View>
    </View>

    <View style={styles.stats}>
      <View style={styles.stat}><Text style={styles.statNum}>{deviceCount}</Text><Text style={styles.statLabel}>Devices</Text></View>
      <View style={styles.stat}><Text style={styles.statNum}>{repoCount}</Text><Text style={styles.statLabel}>Repos</Text></View>
      <View style={styles.stat}>
        <Text style={styles.statNum}>{cloudAgentStatus ? `${Math.floor(cloudAgentStatus.uptime / 60)}m` : '-'}</Text>
        <Text style={styles.statLabel}>Uptime</Text>
      </View>
    </View>

    <View style={styles.menu}>
      <TouchableOpacity style={styles.menuItem} onPress={onNavigateDevices}>
        <Text style={styles.menuText}>Devices</Text><Text style={styles.menuArrow}>›</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.menuItem} onPress={onNavigateRepos}>
        <Text style={styles.menuText}>Repositories</Text><Text style={styles.menuArrow}>›</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.menuItem} onPress={onNavigateSettings}>
        <Text style={styles.menuText}>Settings</Text><Text style={styles.menuArrow}>›</Text>
      </TouchableOpacity>
    </View>

    <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
      <Text style={styles.logoutText}>Log Out</Text>
    </TouchableOpacity>
  </ScrollView>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { alignItems: 'center', paddingVertical: 32, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#D97706', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarText: { fontSize: 28, color: '#FFF', fontWeight: 'bold' },
  name: { fontSize: 20, fontWeight: '600', color: '#111827', marginBottom: 8 },
  statusBadge: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: '600' },
  stats: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 20, backgroundColor: '#FFF', marginTop: 12 },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
  statLabel: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  menu: { marginTop: 12, backgroundColor: '#FFF' },
  menuItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  menuText: { fontSize: 16, color: '#111827' },
  menuArrow: { fontSize: 20, color: '#9CA3AF' },
  logoutBtn: { margin: 20, backgroundColor: '#EF4444', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  logoutText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});
