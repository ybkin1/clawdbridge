import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AsyncStorage } from 'react-native';

interface OnboardingScreenProps {
  onComplete: () => void;
}

const STEPS = [
  { title: 'Scan QR Code', desc: 'Scan the QR code from your desktop Claude Code to pair your device.' },
  { title: 'GitHub Login', desc: 'Authenticate with GitHub to enable secure cloud agent access.' },
  { title: 'Create Task', desc: 'Start your first task and let Claude help you code anywhere.' },
];

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem('onboarding_done').then((v) => { if (v) onComplete(); });
  }, [onComplete]);

  const next = () => {
    if (step >= STEPS.length - 1) {
      AsyncStorage.setItem('onboarding_done', '1');
      onComplete();
    } else {
      setStep(step + 1);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.step}>{step + 1} / {STEPS.length}</Text>
      <Text style={styles.title}>{STEPS[step].title}</Text>
      <Text style={styles.desc}>{STEPS[step].desc}</Text>
      <View style={styles.dots}>
        {STEPS.map((_, i) => <View key={i} style={[styles.dot, i === step && styles.activeDot]} />)}
      </View>
      <TouchableOpacity style={styles.btn} onPress={next}>
        <Text style={styles.btnText}>{step >= STEPS.length - 1 ? 'Get Started' : 'Next'}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#F9FAFB' },
  step: { fontSize: 14, color: '#9CA3AF', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#111827', marginBottom: 12 },
  desc: { fontSize: 16, color: '#6B7280', textAlign: 'center', marginBottom: 32, lineHeight: 22 },
  dots: { flexDirection: 'row', marginBottom: 32 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D1D5DB', marginHorizontal: 4 },
  activeDot: { backgroundColor: '#D97706', width: 24 },
  btn: { backgroundColor: '#D97706', borderRadius: 8, paddingVertical: 14, paddingHorizontal: 48 },
  btnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});
