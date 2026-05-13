import React, { useEffect, useState } from 'react';
import { StatusBar, View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/theme/theme-provider';
import { RootNavigator } from './src/navigation';
import { initDatabase } from './src/db/database';
import { Card } from './src/components/card';

function AppContent() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const theme = useTheme();

  useEffect(() => {
    async function bootstrap() {
      try {
        await initDatabase();
        // 添加一个小延迟让加载动画更自然
        setTimeout(() => {
          setReady(true);
        }, 600);
      } catch (e) {
        setError(String(e));
      }
    }
    bootstrap();
  }, []);

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.center}>
            <Card style={styles.errorCard}>
              <Text style={[styles.errorIcon, { color: theme.colors.error }]}>
                ⚠️
              </Text>
              <Text style={[styles.error, { color: theme.colors.text }]}>
                初始化失败
              </Text>
              <Text style={[styles.errorDetail, { color: theme.colors.textSecondary }]}>
                {error}
              </Text>
            </Card>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.center}>
            <Card style={styles.loadingCard}>
              <View style={styles.loadingContent}>
                <Text style={[styles.appName, { color: theme.colors.primary }]}>
                  Clawd
                </Text>
                <Text style={[styles.appTagline, { color: theme.colors.textSecondary }]}>
                  您的智能助手
                </Text>
              </View>
              <ActivityIndicator 
                size="large" 
                color={theme.colors.primary} 
                style={styles.loader}
              />
              <Text style={[styles.loading, { color: theme.colors.textTertiary }]}>
                准备中...
              </Text>
            </Card>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <SafeAreaView style={styles.safeArea}>
        <RootNavigator />
      </SafeAreaView>
    </View>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ThemedStatusBar />
      <AppContent />
    </ThemeProvider>
  );
}

function ThemedStatusBar() {
  const theme = useTheme();
  return (
    <StatusBar 
      barStyle={theme.isDark ? 'light-content' : 'dark-content'} 
      backgroundColor={theme.colors.background} 
      translucent={true}
    />
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
  },
  safeArea: {
    flex: 1,
  },
  center: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
  },
  loadingCard: {
    alignItems: 'center',
    paddingHorizontal: 48,
    paddingVertical: 40,
    minWidth: 240,
  },
  loadingContent: {
    alignItems: 'center',
    marginBottom: 32,
  },
  appName: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  appTagline: {
    fontSize: 14,
    marginTop: 4,
  },
  loader: {
    marginBottom: 16,
  },
  loading: { 
    fontSize: 14, 
    letterSpacing: 0.5,
  },
  errorCard: {
    marginHorizontal: 32,
    alignItems: 'center',
    paddingVertical: 32,
  },
  errorIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  error: { 
    fontSize: 18, 
    fontWeight: '600',
    marginBottom: 8,
  },
  errorDetail: { 
    fontSize: 14, 
    textAlign: 'center',
    lineHeight: 20,
  },
});
