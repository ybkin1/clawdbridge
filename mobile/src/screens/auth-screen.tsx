import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';

export interface AuthScreenProps {
  onLogin: (email: string, password: string) => void;
  onOAuth: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin, onOAuth }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ClawdBridge</Text>
      <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
      <TouchableOpacity style={styles.loginBtn} onPress={() => onLogin(email, password)}>
        <Text style={styles.loginText}>Login</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.oauthBtn} onPress={onOAuth}>
        <Text style={styles.oauthText}>Sign in with GitHub</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#F9FAFB' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#D97706', textAlign: 'center', marginBottom: 40 },
  input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 14, marginBottom: 12, fontSize: 16, backgroundColor: '#FFF' },
  loginBtn: { backgroundColor: '#D97706', borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 8 },
  loginText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  oauthBtn: { borderWidth: 1, borderColor: '#D97706', borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 12 },
  oauthText: { color: '#D97706', fontSize: 16, fontWeight: '600' },
});
