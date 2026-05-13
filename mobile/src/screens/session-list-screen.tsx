import React from 'react';
import { View, FlatList, Text, StyleSheet } from 'react-native';
import { Session } from '../stores/use-session-store';
import { useTheme } from '../theme/theme-provider';
import { SessionCard } from '../components/session-card';
import { Card } from '../components/card';

export interface SessionListScreenProps {
  sessions: Session[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onSearch: (query: string) => void;
}

export const SessionListScreen: React.FC<SessionListScreenProps> = ({ 
  sessions, 
  activeSessionId, 
  onSelect, 
  onSearch 
}) => {
  const theme = useTheme();
  const sorted = [...sessions].sort((a, b) => b.lastMessageAt - a.lastMessageAt);

  const renderItem = ({ item }: { item: Session }) => (
    <SessionCard
      session={item}
      isActive={item.id === activeSessionId}
      onPress={() => onSelect(item.id)}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
          对话
        </Text>
      </View>
      
      {sorted.length === 0 ? (
        <View style={styles.emptyState}>
          <Card style={styles.emptyCard}>
            <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
              暂无对话
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
              开始一段新的对话吧
            </Text>
          </Card>
        </View>
      ) : (
        <FlatList
          data={sorted}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
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
  list: { 
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
  },
});
