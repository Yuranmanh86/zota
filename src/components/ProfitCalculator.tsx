import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { appTheme } from '../theme/appTheme';

type ProfitCalculatorProps = {
  amount: number;
};

export function ProfitCalculator({ amount }: ProfitCalculatorProps) {
  const DAILY_RATE = 3.5;
  const dailyProfit = amount * DAILY_RATE / 100;
  const weeklyProfit = dailyProfit * 7;
  const monthlyProfit = dailyProfit * 30;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Calculadora de rentabilidade ({DAILY_RATE}% dia)</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Investimento</Text>
        <Text style={styles.value}>MZN {amount.toLocaleString()}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Lucro diário</Text>
        <Text style={styles.value}>+MZN {dailyProfit.toFixed(2).replace('.', ',')}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Lucro semanal</Text>
        <Text style={styles.value}>+MZN {weeklyProfit.toFixed(2).replace('.', ',')}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Lucro mensal</Text>
        <Text style={styles.value}>+MZN {monthlyProfit.toFixed(2).replace('.', ',')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF7ED',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FFE1C2',
    marginTop: 12,
  },
  title: { fontSize: 15, fontWeight: '800', color: '#111827', fontFamily: appTheme.fontFamily, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  label: { color: '#9A4D00', fontSize: 12, fontFamily: appTheme.fontFamily },
  value: { color: '#111827', fontSize: 13, fontWeight: '700', fontFamily: appTheme.fontFamily },
});
