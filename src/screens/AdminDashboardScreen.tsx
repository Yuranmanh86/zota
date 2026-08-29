import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  isCurrentUserAdmin,
  getAdminStats,
  getPendingDeposits,
  getPendingWithdrawals,
  fmtMZN,
  type AdminStats,
  type DepositRow,
  type WithdrawalRow,
} from '../services/admin';
import { signOut } from '../services/auth';
import { useAppStore } from '../store/appStore';
import { shadow, appTheme } from '../theme/appTheme';
import { backend } from '../services/backendClient';
import { invalidateFinanceCache } from '../services/finance';

const ZORA_ORANGE = '#FF6A2B';
const ZORA_ORANGE_DARK = '#E55B1F';
const ZORA_ORANGE_LIGHT = 'rgba(255, 106, 43, 0.10)';
const ZORA_GREEN = '#16A34A';
const ZORA_GREEN_LIGHT = 'rgba(22, 163, 74, 0.12)';
const ZORA_RED = '#DC2626';
const ZORA_RED_LIGHT = 'rgba(220, 38, 38, 0.10)';
const ZORA_BLUE = '#2563EB';
const ZORA_BLUE_LIGHT = 'rgba(37, 99, 235, 0.10)';
const ZORA_PURPLE = '#7C3AED';
const ZORA_PURPLE_LIGHT = 'rgba(124, 58, 237, 0.10)';
const ZORA_TEAL = '#0D9488';
const ZORA_TEAL_LIGHT = 'rgba(13, 148, 136, 0.10)';

export function AdminDashboardScreen() {
  const navigation = useNavigation<any>();
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [pendingDeposits, setPendingDeposits] = useState<DepositRow[]>([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<WithdrawalRow[]>([]);

  async function handleLogout() {
    try {
      setSaving(true);
      const { error } = await signOut();
      if (error) throw new Error(error);
      useAppStore.setState({ userName: '' });
      navigation.reset({ index: 0, routes: [{ name: 'Login' as never }] });
    } catch (error: any) {
      Alert.alert('Erro', error.message || 'Não foi possível sair da conta');
    } finally {
      setSaving(false);
    }
  }

  const loadAll = useCallback(async (forceFresh = false) => {
    try {
      const admin = await isCurrentUserAdmin(forceFresh);
      setIsAdmin(admin);
      if (!admin) {
        setCheckingAdmin(false);
        setLoading(false);
        return;
      }
      const [statsData, deposits, withdrawals] = await Promise.all([
        getAdminStats(),
        getPendingDeposits().catch(() => []),
        getPendingWithdrawals().catch(() => []),
      ]);
      setStats(statsData);
      setPendingDeposits(deposits);
      setPendingWithdrawals(withdrawals);
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Não foi possível carregar os dados do painel.');
    } finally {
      setCheckingAdmin(false);
      setLoading(false);
    }
  }, []);

  const adminChannelRef = useRef<any>(null);
  const adminRefreshDebounceRef = useRef<number | null>(null);
  const channelsCreatedRef = useRef<boolean>(false);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const scheduleAdminRefresh = useCallback(() => {
    try {
      if (adminRefreshDebounceRef.current != null) {
        clearTimeout(adminRefreshDebounceRef.current);
      }
      adminRefreshDebounceRef.current = setTimeout(() => {
        adminRefreshDebounceRef.current = null;
        try {
          invalidateFinanceCache();
          loadAll(true).catch((e: any) => {
            console.warn('[AdminDashboard] scheduleAdminRefresh loadAll error:', e?.message);
          });
        } catch (e: any) {
          console.warn('[AdminDashboard] scheduleAdminRefresh error:', e?.message);
        }
      }, 400) as unknown as number;
    } catch {}
  }, [loadAll]);

  useEffect(() => {
    let isMounted = true;

    const setupAdminRealtime = async () => {
      try {
        if (channelsCreatedRef.current && adminChannelRef.current) {
          return;
        }

        if (adminChannelRef.current) {
          try { adminChannelRef.current.unsubscribe(); } catch {}
          try { backend.removeChannel(adminChannelRef.current); } catch {}
          adminChannelRef.current = null;
        }

        const ch = backend.channel('admin_dashboard_global');
        const handleChange = () => {
          if (!isMounted) return;
          scheduleAdminRefresh();
        };

        ch.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'deposits' },
          handleChange
        );
        ch.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'withdrawals' },
          handleChange
        );
        ch.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'user_profiles' },
          handleChange
        );
        ch.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'user_investments' },
          handleChange
        );
        ch.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'wallets' },
          handleChange
        );
        ch.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'savings_applications' },
          handleChange
        );

        ch.subscribe();
        adminChannelRef.current = ch;
        channelsCreatedRef.current = true;
      } catch (e: any) {
        console.warn('[AdminDashboard] setupAdminRealtime error:', e?.message);
      }
    };

    if (isAdmin) {
      setupAdminRealtime();
    }

    const handleAppState = (next: any) => {
      if (next === 'active' && isMounted && isAdmin) {
        scheduleAdminRefresh();
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);

    return () => {
      isMounted = false;
      try { sub.remove(); } catch {}

      if (adminRefreshDebounceRef.current != null) {
        clearTimeout(adminRefreshDebounceRef.current);
        adminRefreshDebounceRef.current = null;
      }

      if (adminChannelRef.current) {
        try { adminChannelRef.current.unsubscribe(); } catch {}
        try { backend.removeChannel(adminChannelRef.current); } catch {}
        adminChannelRef.current = null;
      }
      channelsCreatedRef.current = false;
    };
  }, [loadAll, isAdmin, scheduleAdminRefresh]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadAll(true);
    } finally {
      setRefreshing(false);
    }
  };

  if (checkingAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingScreen}>
          <ActivityIndicator color={ZORA_ORANGE} size="large" />
          <Text style={styles.loadingText}>A verificar permissões...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.lockHeader}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color="#111827" />
          </TouchableOpacity>
        </View>
        <View style={styles.lockScreen}>
          <View style={styles.lockIconWrap}>
            <Ionicons name="lock-closed" size={56} color="#fff" />
          </View>
          <Text style={styles.lockTitle}>Acesso restrito</Text>
          <Text style={styles.lockSub}>
            Esta área é reservada apenas para administradores da plataforma Zora.
            Contacte o suporte se acredita que isto é um erro.
          </Text>
          <TouchableOpacity style={styles.lockBackBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={18} color="#fff" />
            <Text style={styles.lockBackText}>Voltar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ZORA_ORANGE} colors={[ZORA_ORANGE]} />
        }
      >
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color="#111827" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center', marginHorizontal: 8 }}>
            <Text style={styles.headerTitle}>Painel Administrativo</Text>
            <Text style={styles.headerSubtitle}>Visão geral da plataforma Zora</Text>
          </View>
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={handleLogout}
            disabled={saving}
            activeOpacity={0.7}
          >
            {saving ? (
              <ActivityIndicator color="#DC2626" size="small" />
            ) : (
              <Ionicons name="log-out-outline" size={20} color="#DC2626" />
            )}
          </TouchableOpacity>
        </View>

        {loading && !stats ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={ZORA_ORANGE} size="large" />
            <Text style={{ marginTop: 12, color: '#6B7280', fontSize: 13 }}>A carregar estatísticas...</Text>
          </View>
        ) : (
          <>
            {/* GRID DE ESTATÍSTICAS */}
            <View style={styles.statsCard}>
              <View style={styles.cardHead}>
                <View style={[styles.cardHeadIcon, { backgroundColor: ZORA_ORANGE }]}>
                  <Ionicons name="bar-chart" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.cardHeadTitle}>Estatísticas da plataforma</Text>
                  <Text style={styles.cardHeadSub}>Dados agregados em tempo real</Text>
                </View>
              </View>

              <View style={styles.statsGrid}>
                <View style={[styles.statCard, styles.statCardNeutral]}>
                  <View style={[styles.statIconBox, { backgroundColor: ZORA_BLUE_LIGHT }]}>
                    <Ionicons name="people" size={18} color={ZORA_BLUE} />
                  </View>
                  <Text style={styles.statValue}>{stats?.total_users ?? 0}</Text>
                  <Text style={styles.statLabel}>Total de utilizadores</Text>
                  <View style={styles.statBadgeRow}>
                    <Ionicons name="checkmark-circle" size={11} color={ZORA_GREEN} />
                    <Text style={styles.statBadgeText}>{stats?.verified_users ?? 0} verificados</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.statCard, styles.statCardWarn]}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('AdminDeposits')}
                >
                  <View style={[styles.statIconBox, { backgroundColor: ZORA_ORANGE_LIGHT }]}>
                    <Ionicons name="cloud-download-outline" size={18} color={ZORA_ORANGE} />
                  </View>
                  <Text style={styles.statValue}>{pendingDeposits.length}</Text>
                  <Text style={styles.statLabel}>Depósitos pendentes</Text>
                  <View style={styles.statBadgeRow}>
                    <Ionicons name="cash-outline" size={11} color={ZORA_ORANGE_DARK} />
                    <Text style={[styles.statBadgeText, { color: ZORA_ORANGE_DARK }]}>
                      {fmtMZN(pendingDeposits.reduce((s, d) => s + d.amount, 0))}
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.statCard, styles.statCardDanger]}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('AdminWithdrawals')}
                >
                  <View style={[styles.statIconBox, { backgroundColor: ZORA_RED_LIGHT }]}>
                    <Ionicons name="cash-outline" size={18} color={ZORA_RED} />
                  </View>
                  <Text style={styles.statValue}>{pendingWithdrawals.length}</Text>
                  <Text style={styles.statLabel}>Saques pendentes</Text>
                  <View style={styles.statBadgeRow}>
                    <Ionicons name="wallet-outline" size={11} color={ZORA_RED} />
                    <Text style={[styles.statBadgeText, { color: ZORA_RED }]}>
                      {fmtMZN(pendingWithdrawals.reduce((s, w) => s + w.amount, 0))}
                    </Text>
                  </View>
                </TouchableOpacity>

                <View style={[styles.statCard, styles.statCardSuccess]}>
                  <View style={[styles.statIconBox, { backgroundColor: ZORA_GREEN_LIGHT }]}>
                    <Ionicons name="trending-up-outline" size={18} color={ZORA_GREEN} />
                  </View>
                  <Text style={styles.statValue}>{fmtMZN(stats?.total_invested ?? 0)}</Text>
                  <Text style={styles.statLabel}>Total investido</Text>
                  <View style={styles.statBadgeRow}>
                    <Ionicons name="layers-outline" size={11} color={ZORA_GREEN} />
                    <Text style={[styles.statBadgeText, { color: ZORA_GREEN }]}>
                      {stats?.active_investments ?? 0} investimentos activos
                    </Text>
                  </View>
                </View>

                <View style={[styles.statCard, styles.statCardPurple]}>
                  <View style={[styles.statIconBox, { backgroundColor: ZORA_PURPLE_LIGHT }]}>
                    <Ionicons name="wallet" size={18} color={ZORA_PURPLE} />
                  </View>
                  <Text style={styles.statValue}>
                    {fmtMZN((stats?.total_balance ?? 0) + (stats?.total_bonus ?? 0))}
                  </Text>
                  <Text style={styles.statLabel}>Saldo total em carteiras</Text>
                  <View style={styles.statBadgeRow}>
                    <Ionicons name="pricetag-outline" size={11} color={ZORA_PURPLE} />
                    <Text style={[styles.statBadgeText, { color: ZORA_PURPLE }]} numberOfLines={1}>
                      Bónus {fmtMZN(stats?.total_bonus ?? 0)}
                    </Text>
                  </View>
                </View>

                <View style={[styles.statCard, styles.statCardTeal]}>
                  <View style={[styles.statIconBox, { backgroundColor: ZORA_TEAL_LIGHT }]}>
                    <Ionicons name="save-outline" size={18} color={ZORA_TEAL} />
                  </View>
                  <Text style={styles.statValue}>{stats?.total_savings_applications ?? 0}</Text>
                  <Text style={styles.statLabel}>Poupanças activas</Text>
                  <View style={styles.statBadgeRow}>
                    <Ionicons name="cash-outline" size={11} color={ZORA_TEAL} />
                    <Text style={[styles.statBadgeText, { color: ZORA_TEAL }]}>
                      Valor: {fmtMZN(stats?.active_savings_value ?? 0)}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* RESUMO TRANSACCIONAL */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <View style={styles.summaryBlock}>
                  <Text style={styles.summaryLabel}>Depósitos total</Text>
                  <Text style={styles.summaryValue}>{fmtMZN(stats?.total_deposits_value ?? 0)}</Text>
                  <Text style={styles.summaryHint}>{stats?.total_deposits_count ?? 0} transacções</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryBlock}>
                  <Text style={styles.summaryLabel}>Saques total</Text>
                  <Text style={[styles.summaryValue, { color: '#FEE2E2' }]}>{fmtMZN(stats?.total_withdrawals_value ?? 0)}</Text>
                  <Text style={styles.summaryHint}>{stats?.total_withdrawals_count ?? 0} transacções</Text>
                </View>
              </View>
            </View>

            {/* CARDS DE ATALHO */}
            <View style={styles.quickSectionHead}>
              <Text style={styles.sectionTitle}>Atalhos administrativos</Text>
              <Text style={styles.sectionSub}>Acesse rapidamente as áreas de gestão</Text>
            </View>

            <TouchableOpacity
              style={[styles.quickCard, styles.quickCardPrimary]}
              activeOpacity={0.9}
              onPress={() => navigation.navigate('AdminUsers')}
            >
              <View style={styles.quickIconWrap}>
                <Ionicons name="people" size={26} color="#fff" />
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={[styles.quickTitle, { color: '#fff' }]}>Gerir Utilizadores</Text>
                <Text style={[styles.quickSub, { color: 'rgba(255,255,255,0.88)' }]}>
                  Ver, pesquisar e gerir todos os utilizadores registados na plataforma.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickCard, styles.quickCardWarn]}
              activeOpacity={0.9}
              onPress={() => navigation.navigate('AdminDeposits')}
            >
              <View style={[styles.quickIconWrap, { backgroundColor: '#B45309' }]}>
                <Ionicons name="cloud-download" size={26} color="#fff" />
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.quickTitle}>Aprovar Depósitos Pendentes</Text>
                  {pendingDeposits.length > 0 && (
                    <View style={styles.badgeCircle}>
                      <Text style={styles.badgeCircleText}>{pendingDeposits.length}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.quickSub}>
                  Reveja comprovativos, aprove ou rejeite pedidos de depósito.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="#9A4D00" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickCard, styles.quickCardDanger]}
              activeOpacity={0.9}
              onPress={() => navigation.navigate('AdminWithdrawals')}
            >
              <View style={[styles.quickIconWrap, { backgroundColor: '#991B1B' }]}>
                <Ionicons name="cash" size={26} color="#fff" />
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.quickTitle}>Processar Saques Pendentes</Text>
                  {pendingWithdrawals.length > 0 && (
                    <View style={[styles.badgeCircle, styles.badgeCircleDanger]}>
                      <Text style={styles.badgeCircleText}>{pendingWithdrawals.length}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.quickSub}>
                  Autorize pagamentos, valide contactos e processe saques.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="#991B1B" />
            </TouchableOpacity>

            <View style={{ height: 30 }} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF7ED' },
  content: { padding: 20, paddingBottom: 60 },

  loadingScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 14, color: '#6B7280', fontSize: 14, fontFamily: appTheme.fontFamily, fontWeight: '600' },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FED7AA',
    ...shadow({ color: '#000', offset: { width: 0, height: 2 }, opacity: 0.06, radius: 6, elevation: 1 }),
  },
  logoutBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
    ...shadow({ color: '#000', offset: { width: 0, height: 2 }, opacity: 0.06, radius: 6, elevation: 1 }),
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    fontFamily: appTheme.fontFamily,
    fontWeight: '500',
  },

  lockHeader: { paddingHorizontal: 20, paddingTop: 12 },
  lockScreen: { flex: 1, paddingHorizontal: 28, justifyContent: 'center', alignItems: 'center' },
  lockIconWrap: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: ZORA_RED,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow({ color: ZORA_RED, offset: { width: 0, height: 10 }, opacity: 0.3, radius: 16, elevation: 7 }),
  },
  lockTitle: {
    marginTop: 22,
    fontSize: 26,
    fontWeight: '900',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
  },
  lockSub: {
    marginTop: 10,
    fontSize: 13.5,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    fontFamily: appTheme.fontFamily,
    maxWidth: 300,
  },
  lockBackBtn: {
    marginTop: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: ZORA_ORANGE,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 16,
    ...shadow({ color: ZORA_ORANGE, offset: { width: 0, height: 6 }, opacity: 0.3, radius: 12, elevation: 4 }),
  },
  lockBackText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    fontFamily: appTheme.fontFamily,
  },

  statsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#FFE1C2',
    ...shadow({ color: '#000', offset: { width: 0, height: 2 }, opacity: 0.05, radius: 8, elevation: 1 }),
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  cardHeadIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeadTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
  },
  cardHeadSub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    fontFamily: appTheme.fontFamily,
    lineHeight: 16,
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    flex: 1,
    minWidth: '47%',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
  },
  statCardNeutral: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  statCardWarn: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
  },
  statCardDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  statCardSuccess: {
    backgroundColor: '#ECFDF3',
    borderColor: '#BBF7D0',
  },
  statCardPurple: {
    backgroundColor: '#F5F3FF',
    borderColor: '#DDD6FE',
  },
  statCardTeal: {
    backgroundColor: '#F0FDFA',
    borderColor: '#99F6E4',
  },
  statIconBox: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
  },
  statLabel: {
    fontSize: 11.5,
    color: '#374151',
    marginTop: 4,
    fontWeight: '700',
    fontFamily: appTheme.fontFamily,
  },
  statBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  statBadgeText: {
    fontSize: 10.5,
    color: ZORA_GREEN,
    fontWeight: '700',
    fontFamily: appTheme.fontFamily,
  },

  summaryCard: {
    marginTop: 16,
    backgroundColor: ZORA_ORANGE,
    borderRadius: 22,
    padding: 18,
    ...shadow({ color: ZORA_ORANGE, offset: { width: 0, height: 8 }, opacity: 0.3, radius: 14, elevation: 6 }),
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryBlock: { flex: 1 },
  summaryDivider: {
    width: 1,
    height: 54,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginHorizontal: 8,
  },
  summaryLabel: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: appTheme.fontFamily,
  },
  summaryValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 4,
    fontFamily: appTheme.fontFamily,
  },
  summaryHint: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600',
    fontFamily: appTheme.fontFamily,
  },

  quickSectionHead: { marginTop: 22, marginBottom: 12 },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
  },
  sectionSub: {
    fontSize: 12.5,
    color: '#6B7280',
    marginTop: 4,
    fontFamily: appTheme.fontFamily,
  },

  quickCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  quickCardPrimary: {
    backgroundColor: ZORA_ORANGE,
    borderColor: ZORA_ORANGE_DARK,
    ...shadow({ color: ZORA_ORANGE, offset: { width: 0, height: 6 }, opacity: 0.3, radius: 12, elevation: 5 }),
  },
  quickCardWarn: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    ...shadow({ color: '#000', offset: { width: 0, height: 2 }, opacity: 0.05, radius: 8, elevation: 1 }),
  },
  quickCardDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    ...shadow({ color: '#000', offset: { width: 0, height: 2 }, opacity: 0.05, radius: 8, elevation: 1 }),
  },
  quickIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: ZORA_ORANGE_DARK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    fontFamily: appTheme.fontFamily,
    color: '#111827',
  },
  quickSub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    lineHeight: 17,
    fontFamily: appTheme.fontFamily,
    fontWeight: '500',
    maxWidth: 260,
  },
  badgeCircle: {
    marginLeft: 8,
    minWidth: 26,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 13,
    backgroundColor: ZORA_ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow({ color: ZORA_ORANGE, offset: { width: 0, height: 2 }, opacity: 0.35, radius: 4, elevation: 2 }),
  },
  badgeCircleDanger: { backgroundColor: ZORA_RED },
  badgeCircleText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    fontFamily: appTheme.fontFamily,
  },
});
