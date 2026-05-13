import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../theme/theme-provider';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  elevated?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  variant?: 'default' | 'outline';
}

export const Card: React.FC<CardProps> = ({ 
  children, 
  style, 
  elevated = true,
  padding = 'md',
  variant = 'default'
}) => {
  const theme = useTheme();
  
  const paddingStyle = {
    none: 0,
    sm: theme.spacing.sm,
    md: theme.spacing.md,
    lg: theme.spacing.lg,
  }[padding];

  if (variant === 'outline') {
    return (
      <View
        style={[
          styles.base,
          {
            backgroundColor: 'transparent',
            borderRadius: theme.borderRadius.lg,
            padding: paddingStyle,
            borderWidth: 1,
            borderColor: theme.colors.border,
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  // Default variant
  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: elevated ? theme.colors.surfaceElevated : theme.colors.surface,
          borderRadius: theme.borderRadius.lg,
          padding: paddingStyle,
        },
        elevated ? theme.shadows.md : null,
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});
