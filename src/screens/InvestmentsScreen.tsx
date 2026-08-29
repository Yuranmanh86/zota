import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { InvestmentCard } from '../components/InvestmentCard';
import { BuyInvestmentModal } from '../components/BuyInvestmentModal';
import { ProfitCalculator } from '../components/ProfitCalculator';
import { appTheme } from '../theme/appTheme';
import { getInvestmentPackages, getUserInvestments, PurchaseResult } from '../services/finance';
import { useDashboardSummary } from '../hooks/useDashboardSummary';
import { useQueryClient } from '@tanstack/react-query';

type InvestmentPackage = {
  id: string;
  package_number: number;
  name: string;
  description: string;
  minimum_investment: number;
  daily_profit: number;
  monthly_profit: number;
  yieldPercent: number;
  company: string;
  symbol: string;
  exchange: string;
  country: string;
  category: string;
  purchasePrice: number;
  minimumInvestment: number;
  dailyProfit: number;
  monthlyProfit: number;
};

type UserInvestment = {
  id: string;
  amount: number;
  purchased_at: string;
  status: string;
  package_id: string;
  investment_packages?: {
    name?: string;
    daily_profit?: number;
    monthly_profit?: number;
  };
};

const DAILY_RATE = 3.5;

const fallbackPackages: any[] = [
  { id: 'n1', package_number: 1, name: 'N1 - Pacote Iniciante', description: 'Pacote de investimento nível 1 - ideal para começar', minimum_investment: 300, daily_profit: 10.5, monthly_profit: 315 },
  { id: 'n2', package_number: 2, name: 'N2 - Pacote Básico', description: 'Pacote de investimento nível 2', minimum_investment: 500, daily_profit: 17.5, monthly_profit: 525 },
  { id: 'n3', package_number: 3, name: 'N3 - Pacote Intermediário', description: 'Pacote de investimento nível 3', minimum_investment: 1000, daily_profit: 35, monthly_profit: 1050 },
  { id: 'n4', package_number: 4, name: 'N4 - Pacote Avançado', description: 'Pacote de investimento nível 4', minimum_investment: 5000, daily_profit: 175, monthly_profit: 5250 },
  { id: 'n5', package_number: 5, name: 'N5 - Pacote Premium', description: 'Pacote de investimento nível 5', minimum_investment: 10000, daily_profit: 350, monthly_profit: 10500 },
  { id: 'n6', package_number: 6, name: 'N6 - Pacote Elite', description: 'Pacote de investimento nível 6', minimum_investment: 15000, daily_profit: 525, monthly_profit: 15750 },
  { id: 'n7', package_number: 7, name: 'N7 - Pacote Master', description: 'Pacote de investimento nível 7', minimum_investment: 20000, daily_profit: 700, monthly_profit: 21000 },
  { id: 'n8', package_number: 8, name: 'N8 - Pacote VIP', description: 'Pacote de investimento nível 8', minimum_investment: 25000, daily_profit: 875, monthly_profit: 26250 },
  { id: 'n9', package_number: 9, name: 'N9 - Pacote Imperial', description: 'Pacote de investimento nível 9 - máximo retorno', minimum_investment: 30000, daily_profit: 1050, monthly_profit: 31500 },
];

const FILTER_ALL = 'Todos';
const FILTER_UPTO_1000 = 'Até 1.000 MZN';
const FILTER_1000_10000 = 'De 1.000 a 10.000 MZN';
const FILTER_ABOVE_10000 = 'Acima de 10.000 MZN';
const FILTER_MY_PACKAGES = 'Meus Pacotes';

const filters = [FILTER_ALL, FILTER_UPTO_1000, FILTER_1000_10000, FILTER_ABOVE_10000, FILTER_MY_PACKAGES];

function formatCurrency(value: number): string {
  if (!isFinite(value)) return 'MZN 0,00';
  const fixed = value.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `MZN ${intFormatted},${decPart}`;
}

function normalizePackage(pkg: any): InvestmentPackage {
  const minimumInvestment = Number(pkg.minimum_investment ?? pkg.minimumInvestment ?? 0);
  const dailyProfit = Number(pkg.daily_profit ?? pkg.dailyProfit ?? (minimumInvestment * DAILY_RATE / 100));
  const monthlyProfit = Number(pkg.monthly_profit ?? pkg.monthlyProfit ?? (dailyProfit * 30));
  const packageNumber = Number(pkg.package_number ?? pkg.packageNumber ?? 1);
  return {
    ...pkg,
    package_number: packageNumber,
    minimum_investment: minimumInvestment,
    daily_profit: dailyProfit,
    monthly_profit: monthlyProfit,
    yieldPercent: DAILY_RATE,
    company: pkg.name ?? `N${packageNumber}`,
    symbol: `N${packageNumber}`,
    exchange: 'ZORA',
    country: 'Moçambique',
    category: 'Investimento',
    purchasePrice: minimumInvestment,
    minimumInvestment: minimumInvestment,
    dailyProfit: dailyProfit,
    monthlyProfit: monthlyProfit,
  };
}

export function InvestmentsScreen() {
  const queryClient = useQueryClient();
  const { data: dashboard, isFetching: dashboardFetching } = useDashboardSummary({ requireFocused: false });
  const [activeFilter, setActiveFilter] = useState<string>(FILTER_ALL);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [investmentAmount, setInvestmentAmount] = useState<number>(300);
  const [packages, setPackages] = useState<any[]>([]);
  const [userInvestments, setUserInvestments] = useState<UserInvestment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  async function loadData(showRefresh = false) {
    if (showRefresh) setRefreshing(true);
    try {
      const [pkgs, investments] = await Promise.all([
        getInvestmentPackages().catch(() => []),
        getUserInvestments().catch(() => []),
      ]);
      setPackages(pkgs && pkgs.length > 0 ? pkgs : fallbackPackages);
      setUserInvestments((investments || []) as UserInvestment[]);
    } catch (_e) {
      setPackages(fallbackPackages);
      setUserInvestments([]);
    } finally {
      setLoading(false);
      if (showRefresh) setRefreshing(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const normalizedPackages = useMemo(() => packages.map(normalizePackage), [packages]);

  const userInvestmentPackageIds = useMemo(() => {
    const ids = new Set<string>();
    userInvestments.forEach((inv) => {
      if (inv.package_id) ids.add(String(inv.package_id));
    });
    return ids;
  }, [userInvestments]);

  const filteredItems = useMemo(() => {
    if (activeFilter === FILTER_MY_PACKAGES) {
      return normalizedPackages.filter((p) => userInvestmentPackageIds.has(String(p.id)));
    }
    if (activeFilter === FILTER_ALL) return normalizedPackages;
    if (activeFilter === FILTER_UPTO_1000) {
      return normalizedPackages.filter((item) => item.minimumInvestment <= 1000);
    }
    if (activeFilter === FILTER_1000_10000) {
      return normalizedPackages.filter((item) => item.minimumInvestment > 1000 && item.minimumInvestment <= 10000);
    }
    return normalizedPackages.filter((item) => item.minimumInvestment > 10000);
  }, [activeFilter, normalizedPackages, userInvestmentPackageIds]);

  const openBuyModal = (item: any) => {
    setSelectedItem(item);
    const minVal = Number(item?.minimumInvestment ?? item?.minimum_investment ?? 300);
    setInvestmentAmount(minVal);
    setModalVisible(true);
  };

  const handlePurchaseSuccess = (result: PurchaseResult) => {
    setModalVisible(false);
    setSelectedItem(null);
    if (result?.success) {
      setSuccessToast('Investimento aplicado! Actualizando os seus dados...');
      setTimeout(() => setSuccessToast(null), 2400);
    }
    queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] }).catch(() => {});
    setTimeout(() => loadData(), 600);
  };

  const totalInvestedFallback = useMemo(() => {
    return userInvestments.reduce((acc, inv) => acc + Number(inv.amount ?? 0), 0);
  }, [userInvestments]);

  const activeInvestmentsFallback = useMemo(() => {
    return userInvestments.filter((inv) => inv.status === 'active').length;
  }, [userInvestments]);

  const displayedTotalInvested = dashboard?.totalInvested ?? formatCurrency(totalInvestedFallback);
  const displayedActiveCount = dashboard?.activeInvestments ?? activeInvestmentsFallback;

  const insets = useSafeAreaInsets();
  const contentPadBottom = Math.max(140, 76 + insets.bottom + 16 + 30);

  return (
    <SafeAreaView style={styles.container}>
      {successToast ? (
        <View style={styles.toastBanner}>
          <Ionicons name="checkmark-circle" size={16} color="#065F46" />
          <Text style={styles.toastText}>{successToast}</Text>
        </View>
      ) : null}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: contentPadBottom }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData(true)}
            tintColor="#FF6A2B"
            colors={['#FF6A2B']}
          />
        }
      >

        
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Aplicado</Text>
            <Text style={styles.summaryValue}>{displayedTotalInvested}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Pacotes ativos</Text>
            <Text style={styles.summaryValue}>{displayedActiveCount}</Text>
          </View>
        </View>

        <View style={styles.filterRow}>
          {filters.map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[styles.filterChip, activeFilter === filter && styles.filterChipActive]}
              onPress={() => setActiveFilter(filter)}
              activeOpacity={0.9}
            >
              <Text style={[styles.filterText, activeFilter === filter && styles.filterTextActive]} numberOfLines={1}>
                {filter}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {activeFilter === FILTER_MY_PACKAGES ? 'Os meus pacotes' : 'Pacotes disponíveis'}
          </Text>
          <Text style={styles.sectionMeta}>Rendimento diário {DAILY_RATE}%</Text>
        </View>

        {loading ? (
          <View style={{ padding: 30, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#FF7A00" />
            <Text style={{ color: '#6B7280', marginTop: 10 }}>A carregar pacotes...</Text>
          </View>
        ) : filteredItems.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconBox}>
              <MaterialCommunityIcons
                name={activeFilter === FILTER_MY_PACKAGES ? 'wallet-membership' : 'package-variant-closed'}
                size={30}
                color="#FF6A2B"
              />
            </View>
            <Text style={styles.emptyTitle}>
              {activeFilter === FILTER_MY_PACKAGES
                ? 'Ainda não tem investimentos'
                : 'Nenhum pacote encontrado'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {activeFilter === FILTER_MY_PACKAGES
                ? 'Escolha um pacote e comece a fazer o seu dinheiro trabalhar por si.'
                : 'Tente outro filtro ou volte mais tarde.'}
            </Text>
          </View>
        ) : (
          filteredItems.map((item) => (
            <InvestmentCard key={item.id} item={item} index={item.package_number - 1} onBuy={() => openBuyModal(item)} />
          ))
        )}

        {activeFilter === FILTER_MY_PACKAGES && userInvestments.length > 0 ? (
          <View style={{ marginTop: 20 }}>
            <Text style={styles.myInvestmentsTitle}>Histórico de investimentos</Text>
            {userInvestments.map((inv) => {
              const pkgName = inv.investment_packages?.name ?? 'Pacote de investimento';
              const dailyProfit = Number(inv.investment_packages?.daily_profit ?? (Number(inv.amount) * DAILY_RATE / 100));
              const amount = Number(inv.amount ?? 0);
              const daysSince = inv.purchased_at
                ? Math.max(0, Math.floor((Date.now() - new Date(inv.purchased_at).getTime()) / (1000 * 60 * 60 * 24)))
                : 0;
              const estimatedProfit = dailyProfit * daysSince;
              return (
                <View key={inv.id} style={styles.myInvCard}>
                  <View style={styles.myInvBadge}>
                    <MaterialCommunityIcons name="trending-up" size={14} color="#FFF" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.myInvName} numberOfLines={1}>{pkgName}</Text>
                    <Text style={styles.myInvMeta}>
                      {inv.purchased_at ? new Date(inv.purchased_at).toLocaleDateString('pt-MZ') : 'Investimento recente'} • D{daysSince}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.myInvAmount}>{formatCurrency(amount)}</Text>
                    <Text style={styles.myInvProfit}>+{formatCurrency(estimatedProfit)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        <ProfitCalculator amount={investmentAmount} />
      </ScrollView>

      <BuyInvestmentModal
        visible={modalVisible}
        item={selectedItem}
        amount={investmentAmount}
        onClose={() => {
          setModalVisible(false);
          setSelectedItem(null);
        }}
        onAmountChange={(v) => setInvestmentAmount(v)}
        onPurchaseSuccess={handlePurchaseSuccess}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { flex: 1 },
  contentContainer: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 160 },

  toastBanner: {
    position: 'absolute',
    zIndex: 20,
    top: 10,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#6EE7B7',
  },
  toastText: { marginLeft: 8, fontSize: 13, fontWeight: '700', color: '#065F46', flex: 1 },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontSize: 26, fontWeight: '800', color: '#1A1A1A', fontFamily: appTheme.fontFamily },
  subtitle: { color: '#6B7280', fontSize: 13, marginTop: 4, fontFamily: appTheme.fontFamily },
  walletIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#FF7A00',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF7A00',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },

  balanceHeroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6A2B',
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#FF6A2B',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  balanceHeroLabel: { fontSize: 11.5, color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontFamily: appTheme.fontFamily, marginBottom: 4 },
  balanceHeroValue: { fontSize: 26, fontWeight: '900', color: '#FFFFFF', fontFamily: appTheme.fontFamily, letterSpacing: -0.3 },
  balanceHeroSubLabel: { fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '700', fontFamily: appTheme.fontFamily, marginTop: 4 },
  balanceHeroIconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },

  summaryRow: { flexDirection: 'row', marginBottom: 16 },
  summaryCard: {
    flex: 1,
    backgroundColor: '#FFF7ED',
    borderRadius: 18,
    padding: 14,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#FFE1C2',
  },
  summaryLabel: { fontSize: 11, color: '#9A4D00', fontWeight: '700', fontFamily: appTheme.fontFamily },
  summaryValue: { fontSize: 16, fontWeight: '800', color: '#111827', marginTop: 6, fontFamily: appTheme.fontFamily },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16, gap: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F7F7F7',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    maxWidth: '48%',
  },
  filterChipActive: { backgroundColor: '#FF7A00', borderColor: '#FF7A00' },
  filterText: { color: '#4B5563', fontSize: 12, fontWeight: '700', fontFamily: appTheme.fontFamily },
  filterTextActive: { color: '#FFF' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { color: '#111827', fontSize: 16, fontWeight: '800', fontFamily: appTheme.fontFamily },
  sectionMeta: { color: '#FF7A00', fontSize: 12, fontWeight: '700', fontFamily: appTheme.fontFamily },

  emptyState: {
    padding: 30,
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    marginBottom: 10,
  },
  emptyIconBox: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: '#FFF4E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: '#111827', textAlign: 'center', fontFamily: appTheme.fontFamily },
  emptySubtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 6, lineHeight: 18, fontFamily: appTheme.fontFamily },

  myInvestmentsTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
    fontFamily: appTheme.fontFamily,
  },
  myInvCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  myInvBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#FF6A2B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  myInvName: { fontSize: 14, fontWeight: '700', color: '#111827', fontFamily: appTheme.fontFamily },
  myInvMeta: { fontSize: 12, color: '#6B7280', marginTop: 2, fontFamily: appTheme.fontFamily },
  myInvAmount: { fontSize: 13, fontWeight: '800', color: '#111827', fontFamily: appTheme.fontFamily },
  myInvProfit: { fontSize: 12, fontWeight: '700', color: '#16A34A', marginTop: 3, fontFamily: appTheme.fontFamily },
});
