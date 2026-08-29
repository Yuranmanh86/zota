import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { appTheme } from '../theme/appTheme';

type InvestmentDetailsProps = {
  selectedItem: {
    company: string;
    exchange: string;
    purchasePrice: number;
    dailyProfit: number;
    monthlyProfit: number;
    minimumInvestment: number;
  };
  amount: number;
};

export function InvestmentDetails({ selectedItem, amount }: InvestmentDetailsProps) {
  const DAILY_RATE = 3.5;
  const packageNumber = (selectedItem as any).package_number ?? null;
  const packageName = (selectedItem as any).name ?? selectedItem.company ?? 'Pacote';
  const exchange = (selectedItem as any).exchange ?? 'ZORA';
  const minimumInvestment = Number((selectedItem as any).minimumInvestment ?? (selectedItem as any).minimum_investment ?? selectedItem.purchasePrice ?? 0);
  const purchasePrice = Number(selectedItem.purchasePrice ?? minimumInvestment);
  const dailyProfit = amount * DAILY_RATE / 100;
  const monthlyProfit = dailyProfit * 30;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Resumo da compra</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Pacote</Text>
        <Text style={styles.value}>{packageNumber ? `N${packageNumber} - ${packageName}` : packageName}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Plataforma</Text>
        <Text style={styles.value}>{exchange}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Investimento</Text>
        <Text style={styles.value}>MZN {amount.toLocaleString()}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Ganho diário ({DAILY_RATE}%)</Text>
        <Text style={styles.value}>+MZN {dailyProfit.toFixed(2).replace('.', ',')}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Ganho mensal</Text>
        <Text style={styles.value}>+MZN {monthlyProfit.toFixed(2).replace('.', ',')}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Valor do pacote</Text>
        <Text style={styles.value}>MZN {purchasePrice.toFixed(2).replace('.', ',')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF7ED',
    borderRadius: 18,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#FFE1C2',
  },
  title: { fontSize: 15, fontWeight: '800', color: '#111827', fontFamily: appTheme.fontFamily, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  label: { color: '#9A4D00', fontSize: 12, fontFamily: appTheme.fontFamily },
  value: { color: '#111827', fontSize: 13, fontWeight: '700', fontFamily: appTheme.fontFamily },
});
