import React, { useEffect, useState } from 'react';
import { StatusBar, View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { ThemeProvider } from './src/theme/theme-provider';
import { RootNavigator } from './src/navigation';
import { useAuthStore } from './src/stores/use-auth-store';
import { initDatabase } from './src/db/database';

function AppContent() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function bootstrap() {
      try {
        await initDatabase();
        setReady(true);
      } catch (e) {
        setError(String(e));
      }
    }
    bootstrap();
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>初始化失败: {error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#D97706" />
        <Text style={styles.loading}>正在初始化...</Text>
      </View>
    );
  }

  return <RootNavigator />;
}

export default function App() {
  return (
    <ThemeProvider>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <AppContent />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' },
  loading: { marginTop: 16, fontSize: 16, color: '#6B7280' },
  error: { fontSize: 16, color: '#EF4444', padding: 20, textAlign: 'center' },
});
