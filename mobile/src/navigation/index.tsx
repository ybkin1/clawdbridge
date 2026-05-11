import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const AuthScreen = () => <Text>Auth</Text>;
const SessionListScreen = () => <Text>Sessions</Text>;
const TaskDashboardScreen = () => <Text>Tasks</Text>;
const ProfileScreen = () => <Text>Profile</Text>;

const MainTabNavigator = () => (
  <Tab.Navigator>
    <Tab.Screen name="Chat" component={SessionListScreen} options={{ tabBarLabel: '\u5BF9\u8BDD' }} />
    <Tab.Screen name="Task" component={TaskDashboardScreen} options={{ tabBarLabel: '\u4EFB\u52A1' }} />
    <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: '\u6211\u7684' }} />
  </Tab.Navigator>
);

export const RootNavigator: React.FC = () => (
  <NavigationContainer>
    <Stack.Navigator>
      <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Main" component={MainTabNavigator} options={{ headerShown: false }} />
    </Stack.Navigator>
  </NavigationContainer>
);
