import React from 'react';
import { View, FlatList, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Message } from '../stores/chat-store';
import { MessageBubble } from '../components/message-bubble';
import { ApprovalCard } from '../components/approval-card';
import { ApprovalRequestPayload } from '../hooks/use-approval-handler';

export interface ChatScreenProps {
  messages: Message[];
  inputValue: string;
  isStreaming: boolean;
  pendingApproval: ApprovalRequestPayload | null;
  onSend: (content: string) => void;
  onInputChange: (text: string) => void;
  onApprove: () => void;
  onReject: () => void;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({ messages, inputValue, isStreaming, pendingApproval, onSend, onInputChange, onApprove, onReject }) => {
  const handleSend = () => { if (inputValue.trim()) { onSend(inputValue.trim()); onInputChange(''); } };

  return (
    <View style={styles.container}>
      <FlatList
        data={messages}
        renderItem={({ item }) => <MessageBubble message={item} />}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        inverted={false}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
      />
      {pendingApproval && <ApprovalCard request={pendingApproval} onApprove={onApprove} onReject={onReject} />}
      <View style={styles.inputBar}>
        <TextInput style={styles.input} value={inputValue} onChangeText={onInputChange} placeholder="Message Claude..." multiline />
        <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={!inputValue.trim()}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  list: { padding: 12 },
  inputBar: { flexDirection: 'row', padding: 8, borderTopWidth: 1, borderTopColor: '#E5E7EB', backgroundColor: '#FFF', alignItems: 'flex-end' },
  input: { flex: 1, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100, backgroundColor: '#F9FAFB' },
  sendBtn: { backgroundColor: '#D97706', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10, marginLeft: 8 },
  sendText: { color: '#FFF', fontWeight: '600' },
});
