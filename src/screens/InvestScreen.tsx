import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { appTheme } from '../theme/appTheme';
import { PrimaryButton } from '../components/PrimaryButton';
import { TransactionList } from '../components/TransactionList';
import { getInvestmentPackages, getUserInvestments } from '../services/finance';

const DAILY_RATE = 3.5;

type PackageSummary = {
  id: string;
  package_number: number;
  name: string;
  minimum: string;
  minimumValue: number;
  returnRate: string;
  estimate: string;
  dailyValue: number;
  monthlyValue: number;
};

function formatCurrency(value: number): string {
  if (Number.isInteger(value)) return `MT ${value.toLocaleString()}`;
  return `MT ${value.toFixed(2).replace('.', ',')}`;
}

function buildPackagesList(pkgs: any[]): PackageSummary[] {
  const source = pkgs && pkgs.length > 0 ? pkgs : [
    { package_number: 1, name: 'N1 - Pacote Iniciante', minimum_investment: 300, daily_profit: 10.5, monthly_profit: 315 },
    { package_number: 2, name: 'N2 - Pacote Básico', minimum_investment: 500, daily_profit: 17.5, monthly_profit: 525 },
    { package_number: 3, name: 'N3 - Pacote Intermediário', minimum_investment: 1000, daily_profit: 35, monthly_profit: 1050 },
    { package_number: 4, name: 'N4 - Pacote Avançado', minimum_investment: 5000, daily_profit: 175, monthly_profit: 5250 },
    { package_number: 5, name: 'N5 - Pacote Premium', minimum_investment: 10000, daily_profit: 350, monthly_profit: 10500 },
    { package_number: 6, name: 'N6 - Pacote Elite', minimum_investment: 15000, daily_profit: 525, monthly_profit: 15750 },
    { package_number: 7, name: 'N7 - Pacote Master', minimum_investment: 20000, daily_profit: 700, monthly_profit: 21000 },
    { package_number: 8, name: 'N8 - Pacote VIP', minimum_investment: 25000, daily_profit: 875, monthly_profit: 26250 },
    { package_number: 9, name: 'N9 - Pacote Imperial', minimum_investment: 30000, daily_profit: 1050, monthly_profit: 31500 },
  ];
  return source.map((pkg: any, idx: number) => {
    const min = Number(pkg.minimum_investment ?? 300 * (idx + 1));
    const daily = Number(pkg.daily_profit ?? (min * DAILY_RATE / 100));
    const monthly = Number(pkg.monthly_profit ?? (daily * 30));
    return {
      id: String(pkg.id ?? `pkg-${idx}`),
      package_number: Number(pkg.package_number ?? idx + 1),
      name: pkg.name ?? `N${idx + 1}`,
      minimumValue: min,
      minimum: formatCurrency(min),
      returnRate: `${DAILY_RATE}% dia`,
      dailyValue: daily,
      monthlyValue: monthly,
      estimate: `+${formatCurrency(monthly)}/mês`,
    };
  });
}

export function InvestScreen() {
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [exampleAmount, setExampleAmount] = useState(1000);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [pkgs, investments] = await Promise.all([
          getInvestmentPackages().catch(() => []),
          getUserInvestments().catch(() => []),
        ]);
        if (cancelled) return;
        setPackages(buildPackagesList(pkgs));
        setHistory(investments.map((inv: any, idx: number) => {
          const pkg = inv.investment_packages || {};
          const amount = Number(inv.amount ?? 0);
          return {
            id: String(inv.id ?? `inv-${idx}`),
            title: `Investido em ${pkg.name ?? 'Pacote'}`,
            subtitle: inv.purchased_at ? new Date(inv.purchased_at).toLocaleDateString('pt-MZ') : 'Recente',
            amount: `-${formatCurrency(amount)}`,
            status: inv.status === 'active' ? 'Ativo' : inv.status ?? 'Ativo',
          };
        }));
        if (pkgs && pkgs.length > 0) {
          const firstMin = Number(pkgs[0].minimum_investment ?? 1000);
          setExampleAmount(firstMin);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const dailyEstimate = exampleAmount * DAILY_RATE / 100;
  const weeklyEstimate = dailyEstimate * 7;
  const monthlyEstimate = dailyEstimate * 30;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.contentContainer}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.screenTitle}>Investir</Text>
            <Text style={styles.screenSubtitle}>Oportunidades inteligentes para seu capital crescer com {DAILY_RATE}% ao dia.</Text>
          </View>
          <View style={styles.badge}>
            <Ionicons name="trending-up" size={18} color="#FFFFFF" />
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoIconBox}>
            <Ionicons name="trending-up-outline" size={22} color="#FF7A00" />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.infoCardTitle}>Investimentos Inteligentes</Text>
            <Text style={styles.infoCardSubtitle}>
              Aplique seu capital e receba {DAILY_RATE}% de rendimento diário garantido. Os lucros são creditados automaticamente no seu Saldo Principal.
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Oportunidades</Text>
        {loading ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#FF7A00" />
          </View>
        ) : (
          packages.map((item) => (
            <View key={item.id} style={styles.opportunityCard}>
              <View style={{ flex: 1 }}>
                <View style={styles.pkgHeaderRow}>
                  <View style={styles.pkgBadge}>
                    <Text style={styles.pkgBadgeText}>N{item.package_number}</Text>
                  </View>
                  <Text style={styles.opportunityTitle}>{item.name}</Text>
                </View>
                <Text style={styles.opportunitySubtitle}>Min. {item.minimum} • Retorno {item.returnRate}</Text>
              </View>
              <View style={styles.opportunityRight}>
                <Text style={styles.opportunityEstimate}>{item.estimate}</Text>
                <PrimaryButton label="Investir agora" onPress={() => null} style={styles.opportunityButton} />
              </View>
            </View>
          ))
        )}

        <View style={styles.returnsCard}>
          <Text style={styles.returnsLabel}>Rendimento estimado (Exemplo: {formatCurrency(exampleAmount)})</Text>
          <View style={styles.returnsRow}>
            <View style={styles.returnBlock}>
              <Text style={styles.returnValue}>{formatCurrency(dailyEstimate)}</Text>
              <Text style={styles.returnLabel}>Diário</Text>
            </View>
            <View style={styles.returnBlock}>
              <Text style={styles.returnValue}>{formatCurrency(weeklyEstimate)}</Text>
              <Text style={styles.returnLabel}>Semanal</Text>
            </View>
            <View style={styles.returnBlock}>
              <Text style={styles.returnValue}>{formatCurrency(monthlyEstimate)}</Text>
              <Text style={styles.returnLabel}>Mensal</Text>
            </View>
          </View>
        </View>

        <TransactionList title="Histórico de investimentos" items={history.length > 0 ? history : [
          { id: 'ph1', title: 'Sem investimentos ainda', subtitle: 'Comece agora a investir', amount: 'MT 0,00', status: 'Novo' },
        ]} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: appTheme.background },
  contentContainer: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 160 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 },
  screenTitle: { fontSize: 28, fontWeight: '800', color: appTheme.text, marginBottom: 4 },
  screenSubtitle: { fontSize: 14, color: '#6B7280', maxWidth: '70%' },
  badge: { width: 48, height: 48, borderRadius: 16, backgroundColor: appTheme.primary, alignItems: 'center', justifyContent: 'center' },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF7ED',
    borderRadius: 20,
    padding: 18,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: '#FFD3A7',
    alignItems: 'center',
  },
  infoIconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#FFE4CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCardTitle: { fontSize: 15, fontWeight: '800', color: '#9A4D00', marginBottom: 4 },
  infoCardSubtitle: { fontSize: 13, color: '#9A4D00', lineHeight: 18, opacity: 0.85 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: appTheme.text, marginBottom: 16 },
  opportunityCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#F3F4F6', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pkgHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  pkgBadge: { backgroundColor: appTheme.primary, width: 34, height: 22, borderRadius: 6, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  pkgBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  opportunityTitle: { fontSize: 15, fontWeight: '700', color: appTheme.text },
  opportunitySubtitle: { marginTop: 6, color: '#6B7280' },
  opportunityRight: { alignItems: 'flex-end', width: 120 },
  opportunityEstimate: { fontSize: 14, fontWeight: '800', color: appTheme.primary, marginBottom: 10 },
  opportunityButton: { width: '100%' },
  returnsCard: { marginTop: 20, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: '#F3F4F6' },
  returnsLabel: { fontSize: 14, fontWeight: '700', color: appTheme.text, marginBottom: 14 },
  returnsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  returnBlock: { alignItems: 'center', flex: 1 },
  returnValue: { fontSize: 18, fontWeight: '800', color: appTheme.text },
  returnLabel: { marginTop: 6, color: '#6B7280', fontSize: 12 },
});
