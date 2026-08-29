import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { appTheme } from '../theme/appTheme';

type InvestmentCardProps = {
  item: {
    id: string;
    company?: string;
    symbol?: string;
    exchange?: string;
    country?: string;
    category?: string;
    purchasePrice?: number;
    minimumInvestment?: number;
    dailyProfit?: number;
    monthlyProfit?: number;
    yieldPercent?: number;
    featured?: boolean;

    package_number?: number | string;
    name?: string;
    description?: string;
    minimum_investment?: number;
    daily_profit?: number;
    monthly_profit?: number;
  };
  index: number;
  onBuy: () => void;
};

export function InvestmentCard({ item, index, onBuy }: InvestmentCardProps) {
  const packageNumber = item.package_number ?? (index + 1);
  const packageName = item.name ?? item.company ?? `N${packageNumber}`;
  const description = item.description ?? `${item.exchange} • ${item.country}`;
  const category = item.category ?? 'Investimento';
  const minimumInvestment = Number(item.minimumInvestment ?? item.minimum_investment ?? 0);
  const dailyProfit = Number(item.dailyProfit ?? item.daily_profit ?? minimumInvestment * 3.5 / 100);
  const monthlyProfit = Number(item.monthlyProfit ?? item.monthly_profit ?? dailyProfit * 30);
  const yieldPercent = Number(item.yieldPercent ?? 3.5);
  const purchasePrice = Number(item.purchasePrice ?? minimumInvestment);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderWithNumber}>
        <View style={styles.numberBadge}>
          <Text style={styles.numberBadgeText}>N{packageNumber}</Text>
        </View>
        <View style={styles.cardHeader}>
        <View style={styles.brandRow}>
          <View style={styles.exchangeBadge}>
            <Text style={styles.exchangeText}>ZORA</Text>
          </View>
          <View style={styles.companyBadge}>
            <Text style={styles.companyText}>N{packageNumber}</Text>
          </View>
        </View>
        <View style={styles.statusBadge}>
          <MaterialCommunityIcons name="trending-up" size={14} color="#FF7A00" />
          <Text style={styles.statusText}>+{yieldPercent}%</Text>
        </View>
        </View>
      </View>

      <View style={styles.infoRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.companyName} numberOfLines={1}>{packageName}</Text>
          <Text style={styles.metaText} numberOfLines={1}>{description}</Text>
        </View>
        <View style={styles.dotBadge}>
          <Text style={styles.dotBadgeText}>{category}</Text>
        </View>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statBlock}>
          <Text style={styles.statLabel}>Valor do pacote</Text>
          <Text style={styles.statValue}>MZN {minimumInvestment.toLocaleString()}</Text>
        </View>
        <View style={styles.statBlock}>
          <Text style={styles.statLabel}>Mín. inv.</Text>
          <Text style={styles.statValue}>MZN {minimumInvestment.toLocaleString()}</Text>
        </View>
      </View>

      <View style={styles.profitRow}>
        <View style={styles.profitBox}>
          <Text style={styles.profitLabel}>Lucro diário</Text>
          <Text style={styles.profitValue}>+MZN {dailyProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Text>
        </View>
        <View style={styles.profitBox}>
          <Text style={styles.profitLabel}>Lucro mensal</Text>
          <Text style={styles.profitValue}>+MZN {monthlyProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.buyButton} activeOpacity={0.9} onPress={onBuy}>
        <MaterialCommunityIcons name="shopping-outline" size={16} color="#FFF" />
        <Text style={styles.buyButtonText}>Investir</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#F5E2D2',
    shadowColor: '#FF7A00',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardHeaderWithNumber: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  numberBadge: {
    backgroundColor: '#FF7A00',
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 0,
    flexShrink: 0,
  },
  numberBadgeText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    fontFamily: appTheme.fontFamily,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flex: 1,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  exchangeBadge: {
    backgroundColor: '#FFF4E8',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginRight: 8,
  },
  exchangeText: { color: '#FF7A00', fontSize: 11, fontWeight: '700', fontFamily: appTheme.fontFamily },
  companyBadge: {
    backgroundColor: '#111827',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  companyText: { color: '#FFF', fontSize: 11, fontWeight: '700', fontFamily: appTheme.fontFamily },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E8',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusText: { color: '#FF7A00', fontSize: 11, fontWeight: '700', marginLeft: 4, fontFamily: appTheme.fontFamily },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  companyName: { color: '#1A1A1A', fontSize: 16, fontWeight: '800', fontFamily: appTheme.fontFamily },
  metaText: { color: '#6B7280', fontSize: 12, marginTop: 2, fontFamily: appTheme.fontFamily },
  dotBadge: {
    backgroundColor: '#F7F7F7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  dotBadgeText: { color: '#6B7280', fontSize: 11, fontFamily: appTheme.fontFamily },
  statsGrid: { flexDirection: 'row', marginBottom: 10 },
  statBlock: { flex: 1, paddingRight: 8 },
  statLabel: { color: '#6B7280', fontSize: 11, fontFamily: appTheme.fontFamily },
  statValue: { color: '#111827', fontSize: 13, fontWeight: '700', marginTop: 4, fontFamily: appTheme.fontFamily },
  profitRow: { flexDirection: 'row', marginBottom: 12 },
  profitBox: { flex: 1, backgroundColor: '#FFF7ED', borderRadius: 12, padding: 10, marginRight: 8 },
  profitLabel: { color: '#9A4D00', fontSize: 10, fontFamily: appTheme.fontFamily },
  profitValue: { color: '#C2410C', fontSize: 13, fontWeight: '800', marginTop: 3, fontFamily: appTheme.fontFamily },
  buyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF7A00',
    paddingVertical: 12,
    borderRadius: 14,
  },
  buyButtonText: { color: '#FFF', fontSize: 14, fontWeight: '700', marginLeft: 6, fontFamily: appTheme.fontFamily },
});
