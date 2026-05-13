import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/theme-provider';
import { SessionListScreen } from '../screens/session-list-screen';
import { Card } from '../components/card';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// 临时占位屏幕
const PlaceholderScreen = ({ title }: { title: string }) => {
  const theme = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
          {title}
        </Text>
      </View>
      <View style={styles.content}>
        <Card style={styles.card}>
          <Text style={[styles.text, { color: theme.colors.textSecondary }]}>
            即将推出...
          </Text>
        </Card>
      </View>
    </View>
  );
};

const AuthScreen = () => <PlaceholderScreen title="登录" />;
const TaskDashboardScreen = () => <PlaceholderScreen title="任务" />;
const ProfileScreen = () => <PlaceholderScreen title="我的" />;

// 临时的会话列表屏幕包装器
const SessionListScreenWrapper = () => {
  return (
    <SessionListScreen
      sessions={[]}
      activeSessionId={null}
      onSelect={() => {}}
      onSearch={() => {}}
    />
  );
};

const MainTabNavigator = () => {
  const theme = useTheme();
  
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textTertiary,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          paddingTop: 8,
          paddingBottom: 8,
          height: 60,
        },
        headerShown: false,
      }}
    >
      <Tab.Screen 
        name="Chat" 
        component={SessionListScreenWrapper} 
        options={{ 
          tabBarLabel: '对话',
        }} 
      />
      <Tab.Screen 
        name="Task" 
        component={TaskDashboardScreen} 
        options={{ 
          tabBarLabel: '任务',
        }} 
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen} 
        options={{ 
          tabBarLabel: '我的',
        }} 
      />
    </Tab.Navigator>
  );
};

export const RootNavigator: React.FC = () => {
  const theme = useTheme();
  
  return (
    <NavigationContainer
      theme={{
        dark: theme.isDark,
        colors: {
          primary: theme.colors.primary,
          background: theme.colors.background,
          card: theme.colors.surface,
          text: theme.colors.text,
          border: theme.colors.border,
          notification: theme.colors.error,
        },
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={MainTabNavigator} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  card: {
    marginTop: 20,
    alignItems: 'center',
    paddingVertical: 32,
  },
  text: {
    fontSize: 16,
  },
});
