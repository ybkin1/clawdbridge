import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface ApprovalItem {
  requestId: string;
  operation: string;
  target: string;
  risk: 'low' | 'medium' | 'high';
}

interface BatchApprovalCardProps {
  items: ApprovalItem[];
  onApproveAll: () => void;
  onRejectAll: () => void;
  onItemRespond: (requestId: string, decision: 'approved' | 'rejected') => void;
}

export const BatchApprovalCard: React.FC<BatchApprovalCardProps> = ({ items, onApproveAll, onRejectAll, onItemRespond }) => (
  <View style={styles.container}>
    <Text style={styles.title}>⚠ {items.length} Approvals Pending</Text>
    <View style={styles.batchActions}>
      <TouchableOpacity style={styles.approveAllBtn} onPress={onApproveAll}><Text style={styles.approveAllText}>Allow All</Text></TouchableOpacity>
      <TouchableOpacity style={styles.rejectAllBtn} onPress={onRejectAll}><Text style={styles.rejectAllText}>Reject All</Text></TouchableOpacity>
    </View>
    {items.map((item) => (
      <View key={item.requestId} style={styles.item}>
        <View style={styles.info}>
          <Text style={styles.op}>{item.operation}</Text>
          <Text style={styles.target}>{item.target}</Text>
          <Text style={[styles.risk, { color: item.risk === 'high' ? '#EF4444' : item.risk === 'medium' ? '#D97706' : '#10B981' }]}>{item.risk}</Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.allowBtn} onPress={() => onItemRespond(item.requestId, 'approved')}><Text style={styles.allowText}>Allow</Text></TouchableOpacity>
          <TouchableOpacity style={styles.denyBtn} onPress={() => onItemRespond(item.requestId, 'rejected')}><Text style={styles.denyText}>Deny</Text></TouchableOpacity>
        </View>
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  container: { backgroundColor: '#FFFBEB', borderRadius: 12, padding: 16, margin: 8, borderWidth: 1, borderColor: '#FCD34D' },
  title: { fontSize: 16, fontWeight: 'bold', color: '#92400E', marginBottom: 12 },
  batchActions: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  approveAllBtn: { flex: 1, backgroundColor: '#10B981', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  approveAllText: { color: '#FFF', fontWeight: '600' },
  rejectAllBtn: { flex: 1, backgroundColor: '#EF4444', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  rejectAllText: { color: '#FFF', fontWeight: '600' },
  item: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#FDE68A' },
  info: { flex: 1 },
  op: { fontSize: 13, fontWeight: '600', color: '#78350F' },
  target: { fontSize: 12, color: '#92400E' },
  risk: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 6 },
  allowBtn: { backgroundColor: '#10B981', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12 },
  allowText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  denyBtn: { backgroundColor: '#EF4444', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12 },
  denyText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
});
