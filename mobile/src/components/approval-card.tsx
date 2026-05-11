import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ApprovalRequestPayload } from '../hooks/use-approval-handler';

export interface ApprovalCardProps {
  request: ApprovalRequestPayload;
  onApprove: () => void;
  onReject: () => void;
}

export const ApprovalCard: React.FC<ApprovalCardProps> = ({ request, onApprove, onReject }) => (
  <View style={styles.card}>
    <Text style={styles.title}>⚠ Approval Required</Text>
    <View style={styles.detail}>
      <Text style={styles.label}>Operation: <Text style={styles.value}>{request.operation}</Text></Text>
      <Text style={styles.label}>Target: <Text style={styles.value}>{request.target}</Text></Text>
      <Text style={[styles.risk, { color: request.risk === 'high' ? '#EF4444' : request.risk === 'medium' ? '#D97706' : '#10B981' }]}>
        Risk: {request.risk.toUpperCase()}
      </Text>
    </View>
    <View style={styles.buttons}>
      <TouchableOpacity style={styles.rejectBtn} onPress={onReject}><Text style={styles.rejectText}>Reject</Text></TouchableOpacity>
      <TouchableOpacity style={styles.approveBtn} onPress={onApprove}><Text style={styles.approveText}>Allow</Text></TouchableOpacity>
    </View>
  </View>
);

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#D97706', borderRadius: 12, padding: 16, margin: 8 },
  title: { fontSize: 16, fontWeight: 'bold', color: '#92400E', marginBottom: 8 },
  detail: { marginBottom: 12 },
  label: { fontSize: 13, color: '#6B7280', marginBottom: 2 },
  value: { fontWeight: '600', color: '#111827' },
  risk: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  rejectBtn: { backgroundColor: '#EF4444', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24 },
  rejectText: { color: '#FFF', fontWeight: '600', fontSize: 14 },
  approveBtn: { backgroundColor: '#10B981', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24 },
  approveText: { color: '#FFF', fontWeight: '600', fontSize: 14 },
});
