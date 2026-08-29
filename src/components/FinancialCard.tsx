import React, { ReactNode } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { appTheme } from '../theme/appTheme';

type FinancialCardProps = {
  title: string;
  subtitle?: string;
  value?: string;
  accentLabel?: string;
  iconName?: string;
  children?: ReactNode;
  style?: ViewStyle;
};

export function FinancialCard({ title, subtitle, value, accentLabel, iconName, children, style }: FinancialCardProps) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.headerRow}>
        {iconName ? (
          <View style={styles.iconWrapper}>
            <Ionicons name={iconName as never} size={18} color={appTheme.primary} />
          </View>
        ) : null}
        <View style={styles.titleColumn}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {accentLabel ? <Text style={styles.accentLabel}>{accentLabel}</Text> : null}
      </View>
      {value ? <Text style={styles.value}>{value}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    padding: 18,
    shadowColor: appTheme.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#FEF1E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  titleColumn: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: appTheme.text,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
  },
  accentLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: appTheme.primary,
  },
  value: {
    fontSize: 28,
    fontWeight: '800',
    color: appTheme.text,
    marginTop: 4,
  },
});
