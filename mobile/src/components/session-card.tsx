import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Session } from '../stores/use-session-store';
import { useTheme } from '../theme/theme-provider';
import { Card } from './card';

interface SessionCardProps {
  session: Session;
  isActive: boolean;
  onPress: () => void;
}

export const SessionCard: React.FC<SessionCardProps> = ({ 
  session, 
  isActive, 
  onPress 
}) => {
  const theme = useTheme();
  
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card 
        style={[
          styles.card,
          isActive && {
            borderWidth: 2,
            borderColor: theme.colors.primary,
          }
        ]}
      >
        <View style={styles.cardHeader}>
          <View 
            style={[
              styles.statusDot, 
              { 
                backgroundColor: session.deviceStatus === 'online' 
                  ? theme.colors.success 
                  : theme.colors.textTertiary 
              }
            ]} 
          />
          <Text 
            style={[
              styles.title, 
              { 
                color: theme.colors.text,
                fontWeight: isActive ? '700' : '600'
              }
            ]} 
            numberOfLines={1}
          >
            {session.title || '新对话'}
          </Text>
          {session.pendingApprovals > 0 && (
            <View style={[styles.badge, { backgroundColor: theme.colors.error }]}>
              <Text style={styles.badgeText}>
                {session.pendingApprovals}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.cardMeta}>
          <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>
            {session.deviceName}
          </Text>
          <Text style={[styles.meta, { color: theme.colors.textTertiary }]}>
            · {formatTime(session.lastMessageAt)}
          </Text>
        </View>
      </Card>
    </TouchableOpacity>
  );
};

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return `${Math.floor(diff / 86400000)}天前`;
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
  },
  cardHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 8,
  },
  statusDot: { 
    width: 8, 
    height: 8, 
    borderRadius: 4, 
    marginRight: 12,
  },
  title: { 
    fontSize: 16, 
    flex: 1, 
  },
  badge: { 
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 20,
  },
  meta: { 
    fontSize: 13, 
  },
});
