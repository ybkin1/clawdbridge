import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

interface CameraButtonProps {
  onCapture: (uri: string) => void;
}

export const CameraButton: React.FC<CameraButtonProps> = ({ onCapture }) => {
  const handlePress = () => {
    onCapture('mock-photo-uri');
  };

  return (
    <TouchableOpacity style={styles.btn} onPress={handlePress}>
      <Text style={styles.icon}>📷</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  btn: { padding: 10 },
  icon: { fontSize: 22 },
});
