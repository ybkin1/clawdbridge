import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

interface AttachmentButtonProps {
  onPick: (uri: string, name: string) => void;
}

export const AttachmentButton: React.FC<AttachmentButtonProps> = ({ onPick }) => {
  const handlePress = () => {
    onPick('mock-file-uri', 'attachment.txt');
  };

  return (
    <TouchableOpacity style={styles.btn} onPress={handlePress}>
      <Text style={styles.icon}>📎</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  btn: { padding: 10 },
  icon: { fontSize: 22 },
});
