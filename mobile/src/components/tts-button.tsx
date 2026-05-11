import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

interface TTSButtonProps {
  text: string;
}

type TTSState = 'idle' | 'playing' | 'done';

export const TTSButton: React.FC<TTSButtonProps> = ({ text }) => {
  const [state, setState] = useState<TTSState>('idle');

  const toggle = () => {
    if (state === 'idle') { setState('playing'); setTimeout(() => setState('done'), 2000); }
    else if (state === 'playing') { setState('idle'); }
    else { setState('idle'); }
  };

  return (
    <TouchableOpacity style={styles.btn} onPress={toggle}>
      <Text style={styles.icon}>{state === 'idle' ? '🔊' : state === 'playing' ? '⏸' : '✓'}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  btn: { padding: 4 },
  icon: { fontSize: 14 },
});
