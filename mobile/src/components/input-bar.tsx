import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

export interface InputBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onVoice?: () => void;
}

export const InputBar: React.FC<InputBarProps> = ({ value, onChangeText, onSend, onVoice }) => {
  const handleSend = () => { if (value.trim()) onSend(); };

  return (
    <View style={styles.bar}>
      {onVoice && <TouchableOpacity style={styles.voiceBtn} onPress={onVoice}><Text style={styles.voiceText}>🎤</Text></TouchableOpacity>}
      <TextInput style={styles.input} value={value} onChangeText={onChangeText} placeholder="Message Claude..." multiline />
      <TouchableOpacity style={[styles.sendBtn, !value.trim() && styles.disabled]} onPress={handleSend} disabled={!value.trim()}>
        <Text style={styles.sendText}>↑</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'flex-end', padding: 8, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  voiceBtn: { padding: 10 },
  voiceText: { fontSize: 22 },
  input: { flex: 1, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 15, maxHeight: 100 },
  sendBtn: { backgroundColor: '#D97706', borderRadius: 20, width: 40, height: 40, justifyContent: 'center', alignItems: 'center', marginLeft: 6 },
  disabled: { opacity: 0.4 },
  sendText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
});
