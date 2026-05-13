import React, { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';

interface ThemeColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  primary: string;
  primaryLight: string;
  primaryDark: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  error: string;
  success: string;
  warning: string;
  shadow: string;
}

interface Theme {
  colors: ThemeColors;
  isDark: boolean;
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  borderRadius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  shadows: {
    sm: any[];
    md: any[];
    lg: any[];
  };
}

// Morandi colors with watercolor wash tones - Blue-gray monochromatic palette
const lightTheme: ThemeColors = {
  background: '#F2F4F6',
  surface: '#FFFFFF',
  surfaceElevated: '#F8FAFB',
  primary: '#7A94A8',
  primaryLight: '#A7B8C6',
  primaryDark: '#5D7689',
  text: '#4A5568',
  textSecondary: '#718096',
  textTertiary: '#A0AEC0',
  border: '#E2E8F0',
  error: '#C67A7D',
  success: '#8FAF8F',
  warning: '#D4B68A',
  shadow: '#4A5568',
};

const darkTheme: ThemeColors = {
  background: '#2D3748',
  surface: '#3D4A5C',
  surfaceElevated: '#4A5568',
  primary: '#97A8B8',
  primaryLight: '#B4C1CD',
  primaryDark: '#7A94A8',
  text: '#E2E8F0',
  textSecondary: '#CBD5E0',
  textTertiary: '#A0AEC0',
  border: '#4A5568',
  error: '#D68A8D',
  success: '#9FBF9F',
  warning: '#E4C69A',
  shadow: '#000000',
};

const defaultSpacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

const defaultBorderRadius = {
  sm: 6,
  md: 12,
  lg: 16,
  xl: 24,
};

const defaultShadows = {
  sm: [
    { shadowColor: '#4A5568', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  ],
  md: [
    { shadowColor: '#4A5568', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4 },
  ],
  lg: [
    { shadowColor: '#4A5568', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 8 },
  ],
};

const defaultTheme: Theme = {
  colors: lightTheme,
  isDark: false,
  spacing: defaultSpacing,
  borderRadius: defaultBorderRadius,
  shadows: defaultShadows,
};

const ThemeContext = createContext<Theme>(defaultTheme);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const colors = isDark ? darkTheme : lightTheme;
  return <ThemeContext.Provider value={{ ...defaultTheme, colors, isDark }}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
