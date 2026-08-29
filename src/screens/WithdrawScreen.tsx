import * as React from 'react';
import { useCallback, useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  AppState,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { appTheme } from '../theme/appTheme';
import {
  createWithdrawalRequest,
  getMyWithdrawals,
  MyWithdrawalRow,
  invalidateFinanceCache,
} from '../services/finance';
import { backend } from '../services/backendClient';
import { getUserProfile } from '../services/auth';
import { useDashboardSummary } from '../hooks/useDashboardSummary';

const withdrawMethods = [
  { id: 'emola', name: 'e-Mola', icon: 'wallet-outline', subtitle: 'Até 2 min', placeholder: 'Conta e-Mola' },
  { id: 'mpesa', name: 'M-Pesa', icon: 'cash-outline', subtitle: 'Até 3 min', placeholder: 'Número M-Pesa' },
  { id: 'mkesh', name: 'M-kesh', icon: 'card-outline', subtitle: 'Até 4 min', placeholder: 'Conta M-kesh' },
  { id: 'bank', name: 'Banco', icon: 'business-outline', subtitle: 'Até 24h', placeholder: 'Conta bancária' },
];

function formatMoney(val: number | string | null | undefined): string {
  const n = Number(val ?? 0);
  if (Number.isNaN(n)) return 'MT 0,00';
  const fixed = n.toFixed(2);
  const [intPart, dec] = fixed.split('.');
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `MT ${intFormatted},${dec}`;
}

function statusLabel(s: string) {
  switch (s) {
    case 'pending':
      return { label: 'A aprovar', color: '#B45309', bg: '#FEF3C7' };
    case 'approved':
    case 'paid':
      return { label: s === 'paid' ? 'Pago' : 'Aprovado', color: '#065F46', bg: '#D1FAE5' };
    case 'rejected':
      return { label: 'Rejeitado', color: '#991B1B', bg: '#FEE2E2' };
    case 'cancelled':
      return { label: 'Cancelado', color: '#374151', bg: '#F3F4F6' };
    default:
      return { label: s || '-', color: '#374151', bg: '#F3F4F6' };
  }
}

export function WithdrawScreen() {
  const navigation = useNavigation<any>();
  const [amount, setAmount] = useState('50');
  const [method, setMethod] = useState(withdrawMethods[0].id);
  const [contact, setContact] = useState('841234567');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [history, setHistory] = useState<MyWithdrawalRow[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  const { data: dashboard, isFetching: dashboardFetching } = useDashboardSummary();
  const balanceAnimation = useRef(new Animated.Value(0)).current;

  const parseCurrencyToNumber = (value?: string): number => {
    if (!value) return 0;
    const normalized = value.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const selectedMethod = withdrawMethods.find((item) => item.id === method) ?? withdrawMethods[0];
  const numericAmount = Number(amount.replace(/\D/g, '')) || 0;
  const availableBalance = parseCurrencyToNumber(dashboard?.available);
  const minimumWithdrawal = 50;
  const belowMinimumBalance = availableBalance < minimumWithdrawal;
  const belowMinimumAmount = numericAmount > 0 && numericAmount < minimumWithdrawal;
  const exceedsBalance = numericAmount > availableBalance;
  const withdrawalDisabled = loading || belowMinimumBalance || belowMinimumAmount || exceedsBalance ||
    (dashboardFetching && availableBalance === 0);
  const fee = 0;
  const total = Math.max(numericAmount, 0);

  useFocusEffect(
    useCallback(() => {
      balanceAnimation.setValue(0);
      Animated.timing(balanceAnimation, {
        toValue: 1,
        duration: 550,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
      });
    }, [])
  );

  const refreshAll = useCallback(async () => {
    try {
      const h = await getMyWithdrawals();
      setHistory(h || []);
    } catch (_e) {}
  }, []);

  const withdrawChannelRef = useRef<any>(null);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    let isMounted = true;

    const setupWithdrawRealtime = async () => {
      try {
        const profile = await getUserProfile().catch(() => null);
        const profileId = profile?.id;
        if (!profileId) return;

        if (withdrawChannelRef.current) {
          try { backend.removeChannel(withdrawChannelRef.current); } catch {}
        }

        const ch = backend.channel(`withdrawals_${profileId}`);
        const handleChange = async () => {
          if (!isMounted) return;
          try {
            invalidateFinanceCache();
            await refreshAll();
          } catch {}
        };

        ch.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'withdrawals',
            filter: `profile_id=eq.${profileId}`,
          },
          handleChange
        );

        ch.subscribe();
        withdrawChannelRef.current = ch;
      } catch {}
    };

    setupWithdrawRealtime();

    const handleAppState = (next: any) => {
      if (next === 'active' && isMounted) setupWithdrawRealtime();
    };
    const sub = AppState.addEventListener('change', handleAppState);

    return () => {
      isMounted = false;
      try { sub.remove(); } catch {}
      if (withdrawChannelRef.current) {
        try { withdrawChannelRef.current.unsubscribe(); } catch {}
        try { backend.removeChannel(withdrawChannelRef.current); } catch {}
        withdrawChannelRef.current = null;
      }
    };
  }, [refreshAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshAll();
    } finally {
      setRefreshing(false);
    }
  };

  const handleWithdraw = async () => {
    if (numericAmount <= 0) {
      Alert.alert('Valor inválido', 'Informe um valor igual ou superior a MT 50.');
      return;
    }
    if (numericAmount < minimumWithdrawal) {
      Alert.alert('Valor mínimo', 'O valor mínimo para sacar é MT 50,00.');
      return;
    }
    if (dashboardFetching && availableBalance === 0) {
      Alert.alert('A verificar saldo', 'Aguarde enquanto consultamos o saldo disponível.');
      return;
    }
    if (numericAmount > availableBalance) {
      Alert.alert('Saldo insuficiente', `Disponível para saque: ${formatMoney(availableBalance)}.`);
      return;
    }
    if (!contact || contact.replace(/\D/g, '').length < 6) {
      Alert.alert('Contacto inválido', 'Informe um contacto válido para receber.');
      return;
    }
    setLoading(true);
    try {
      const res = await createWithdrawalRequest(
        numericAmount,
        selectedMethod.id,
        contact,
        fee
      );
      if (res?.success) {
        Alert.alert(
          'Pedido enviado',
          res.message || 'Seu pedido de saque foi enviado e aguarda pela aprovação da Zora, aguarde por favor.'
        );
        setAmount('');
        refreshAll();
      } else {
        Alert.alert('Não foi possível enviar', res?.message || 'Tente novamente.');
      }
    } catch (err: any) {
      Alert.alert('Erro', err?.message || 'Erro de conexão.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.contentContainer}
        {...(Platform.OS === 'web' ? { showsVerticalScrollIndicator: true } : {})}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {Platform.OS === 'web' ? (
          <View style={styles.webHeader}>
            <TouchableOpacity
              style={styles.webBackBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={20} color="#111827" />
            </TouchableOpacity>
            <View style={styles.webHeaderTitleBlock}>
              <Text style={styles.webHeaderTitle}>Sacar</Text>
              <Text style={styles.webHeaderSubtitle}>Levantar saldo da sua carteira</Text>
            </View>
            <View style={{ width: 40 }} />
          </View>
        ) : (
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.screenTitle}>Sacar</Text>
              <Text style={styles.screenSubtitle}>
                Levante o seu saldo de forma segura para a sua conta Móvel ou bancária.
              </Text>
            </View>
            <View style={styles.badge}>
              <Ionicons name="cash-outline" size={20} color="#FFFFFF" />
            </View>
          </View>
        )}

        <View style={styles.infoCard}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={styles.infoIconBox}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#FF7A00" />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.infoTitle}>Solicitação de Saque</Text>
              <Text style={styles.infoSubtitle}>
                Os saques são descontados imediatamente do seu saldo e processados após aprovação do sistema Zora. Em caso de rejeição, o valor é devolvido automaticamente.
              </Text>
            </View>
          </View>
        </View>

        <Animated.View
          style={[
            styles.balanceCard,
            {
              opacity: balanceAnimation,
              transform: [{ translateY: balanceAnimation.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
            },
          ]}
        >
          <View>
            <Text style={styles.balanceLabel}>Saldo disponível para saque</Text>
            <Text style={styles.balanceValue}>{formatMoney(availableBalance)}</Text>
          </View>
          <Ionicons name="wallet" size={24} color="#065F46" />
        </Animated.View>

        <View style={styles.formCard}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Valor do saque</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="wallet-outline" size={18} color="#FF7A00" />
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={(value) => {
                  const nextAmount = Number(value.replace(/\D/g, '')) || 0;
                  if (nextAmount === 0) {
                    setAmount('');
                    return;
                  }
                  const maximum = availableBalance >= minimumWithdrawal ? Math.floor(availableBalance) : minimumWithdrawal;
                  setAmount(String(Math.max(minimumWithdrawal, Math.min(nextAmount, maximum))));
                }}
                keyboardType="numeric"
                placeholder="Ex: 5000"
                placeholderTextColor="#A1A1AA"
              />
            </View>
            {belowMinimumAmount && (
              <Text style={styles.errorText}>
                O valor mínimo para sacar é MT 50,00.
              </Text>
            )}
            {belowMinimumBalance && (
              <Text style={styles.errorText}>
                O saldo disponível é inferior ao mínimo de MT 50,00. Adicione saldo para poder sacar.
              </Text>
            )}
            {!belowMinimumBalance && exceedsBalance && (
              <Text style={styles.errorText}>
                O valor não pode ser superior ao saldo disponível de {formatMoney(availableBalance)}.
              </Text>
            )}
            <View style={styles.quickAmountRow}>
              {[1000, 2500, 5000, 10000].map((v) => (
                <TouchableOpacity
                  key={v}
                  style={styles.quickAmountBtn}
                  activeOpacity={0.8}
                  onPress={() => setAmount(String(Math.max(minimumWithdrawal, Math.min(v, Math.floor(availableBalance))))) }
                >
                  <Text style={styles.quickAmountText}>{v.toLocaleString('pt-MZ')}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          

          <View style={styles.previewCard}>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Valor do saque</Text>
              <Text style={styles.previewValue}>{formatMoney(numericAmount)}</Text>
            </View>
            <View style={[styles.previewRow, styles.previewTotal]}>
              <Text style={[styles.previewLabel, styles.previewLabelStrong]}>
                Valor descontado da carteira
              </Text>
              <Text style={styles.previewValueStrong}>{formatMoney(total)}</Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>A receber no {selectedMethod.name}</Text>
              <Text style={[styles.previewValue, { color: '#065F46', fontWeight: '800' }]}>
                {formatMoney(numericAmount)}
              </Text>
            </View>
            <View style={styles.zeroFeeBanner}>
              <Ionicons name="gift-outline" size={14} color="#065F46" />
              <Text style={styles.zeroFeeText}>Taxa zero • O valor solicitado é o que recebe</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.submitButton, withdrawalDisabled && styles.submitButtonDisabled]}
            activeOpacity={0.9}
            onPress={handleWithdraw}
            disabled={withdrawalDisabled}
          >
            {loading ? (
              <>
                <ActivityIndicator color="#FFF" size="small" style={{ marginRight: 10 }} />
                <Text style={styles.submitButtonText}>A enviar...</Text>
              </>
            ) : (
              <>
                <Text style={styles.submitButtonText}>Solicitar saque</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFF" />
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.historyCard}>
          <View style={styles.historyHeader}>
            <View>
              <Text style={styles.historyTitle}>Histórico de saques</Text>
              <Text style={styles.historyMeta}>Últimas solicitações</Text>
            </View>
            <TouchableOpacity
              style={styles.historyRefreshBtn}
              activeOpacity={0.8}
              onPress={onRefresh}
            >
              <Ionicons name="refresh" size={14} color="#FF7A00" />
              <Text style={styles.historyRefreshText}>Atualizar</Text>
            </TouchableOpacity>
          </View>

          {history.length === 0 ? (
            <View style={styles.historyEmpty}>
              <Ionicons name="file-tray-outline" size={32} color="#D1D5DB" />
              <Text style={styles.historyEmptyText}>Ainda não tem pedidos de saque.</Text>
            </View>
          ) : (
            history.map((item) => {
              const s = statusLabel(item.status);
              return (
                <View key={item.id} style={styles.historyItem}>
                  <View style={[styles.historyItemIconWrap, styles.historyItemIconWrapWithdraw]}>
                    <Ionicons name="arrow-up-outline" size={16} color="#991B1B" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.historyItemTitle}>
                      Saque via{' '}
                      {withdrawMethods.find((m) => m.id === item.withdrawal_method)?.name ??
                        item.withdrawal_method}
                    </Text>
                    <Text style={styles.historyItemSubtitle}>
                      {new Date(item.created_at).toLocaleString('pt-PT')} • Conta:{' '}
                      {item.contact || '-'}
                      {item.admin_notes ? ` • ${item.admin_notes}` : ''}
                    </Text>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={[styles.historyAmount, styles.historyAmountWithdraw]}>
                      -{formatMoney(item.amount)}
                    </Text>
                    <View style={[styles.badgePill, { backgroundColor: s.bg }]}>
                      <Text style={[styles.badgePillText, { color: s.color }]}>{s.label}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0, height: '100%', backgroundColor: '#FFF7ED' },
  scroll: { flex: 1, minHeight: 0, ...(Platform.OS === 'web' ? { height: '100%', overflow: 'scroll' } : {}) },
  contentContainer: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 140 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
    fontFamily: appTheme.fontFamily,
  },
  screenSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    maxWidth: '90%',
    fontFamily: appTheme.fontFamily,
  },
  badge: {
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
  infoCard: {
    backgroundColor: '#FFF7ED',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFD3A7',
  },
  infoIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFE0C2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#9A4D00',
    marginBottom: 4,
    fontFamily: appTheme.fontFamily,
  },
  infoSubtitle: {
    fontSize: 12,
    color: '#7C2D12',
    lineHeight: 18,
    fontFamily: appTheme.fontFamily,
    fontWeight: '500',
  },
  balanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    padding: 16,
    marginBottom: 16,
  },
  balanceLabel: {
    color: '#065F46',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: appTheme.fontFamily,
  },
  balanceValue: {
    color: '#064E3B',
    fontSize: 23,
    fontWeight: '900',
    marginTop: 4,
    fontFamily: appTheme.fontFamily,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
    fontWeight: '700',
    fontFamily: appTheme.fontFamily,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FFE1C2',
    marginBottom: 16,
  },
  inputGroup: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 8, fontFamily: appTheme.fontFamily },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
    marginTop: 6,
    fontFamily: appTheme.fontFamily,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFD3A7',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  input: {
    flex: 1,
    marginLeft: 8,
    color: '#111827',
    fontSize: 15,
    fontFamily: appTheme.fontFamily,
  },
  quickAmountRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  quickAmountBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFD3A7',
  },
  quickAmountText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9A4D00',
    fontFamily: appTheme.fontFamily,
  },
  methodsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  methodCard: {
    width: '23%',
    minWidth: 80,
    backgroundColor: '#FFF7ED',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FFE1C2',
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  methodCardActive: { borderColor: '#FF7A00', backgroundColor: '#FFF3E8' },
  methodName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    marginTop: 6,
    fontFamily: appTheme.fontFamily,
  },
  methodNameActive: { color: '#FF7A00' },
  methodSubtitle: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
    textAlign: 'center',
    fontFamily: appTheme.fontFamily,
  },
  previewCard: {
    backgroundColor: '#FFF7ED',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FFD3A7',
    marginVertical: 14,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  previewTotal: {
    borderTopWidth: 1,
    borderTopColor: '#FFD3A7',
    paddingTop: 8,
    marginTop: 4,
  },
  previewLabel: { color: '#6B7280', fontSize: 12, fontFamily: appTheme.fontFamily },
  previewLabelStrong: { fontWeight: '800', color: '#111827' },
  previewValue: { color: '#111827', fontSize: 12, fontWeight: '700', fontFamily: appTheme.fontFamily },
  previewValueStrong: { color: '#FF7A00', fontSize: 13, fontWeight: '900', fontFamily: appTheme.fontFamily },
  zeroFeeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#6EE7B7',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 10,
  },
  zeroFeeText: {
    marginLeft: 6,
    fontSize: 11.5,
    fontWeight: '800',
    color: '#065F46',
    fontFamily: appTheme.fontFamily,
  },
  submitButton: {
    backgroundColor: '#FF7A00',
    paddingVertical: 14,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF7A00',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  submitButtonDisabled: { opacity: 0.7 },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginRight: 8,
    fontFamily: appTheme.fontFamily,
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FFE1C2',
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  historyTitle: { fontSize: 15, fontWeight: '800', color: '#111827', fontFamily: appTheme.fontFamily },
  historyMeta: {
    fontSize: 11,
    color: '#FF7A00',
    fontWeight: '700',
    fontFamily: appTheme.fontFamily,
    marginTop: 2,
  },
  historyRefreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFD3A7',
  },
  historyRefreshText: {
    marginLeft: 4,
    fontSize: 11,
    fontWeight: '700',
    color: '#FF7A00',
    fontFamily: appTheme.fontFamily,
  },
  historyEmpty: { alignItems: 'center', paddingVertical: 24 },
  historyEmptyText: {
    marginTop: 8,
    fontSize: 12,
    color: '#9CA3AF',
    fontFamily: appTheme.fontFamily,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  historyItemIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ECFDF3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyItemIconWrapWithdraw: { backgroundColor: '#FEE2E2' },
  historyItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
  },
  historyItemSubtitle: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
    fontFamily: appTheme.fontFamily,
  },
  historyRight: { alignItems: 'flex-end' },
  historyAmount: {
    fontSize: 12,
    fontWeight: '800',
    color: '#065F46',
    fontFamily: appTheme.fontFamily,
  },
  historyAmountWithdraw: { color: '#991B1B' },
  historyFeeText: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
    fontFamily: appTheme.fontFamily,
  },
  badgePill: { marginTop: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgePillText: { fontSize: 10, fontWeight: '700', fontFamily: appTheme.fontFamily },
  webHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FFE1C2',
    shadowColor: '#FF7A00',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  webBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFD3A7',
  },
  webHeaderTitleBlock: { flex: 1, alignItems: 'center' },
  webHeaderTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
  },
  webHeaderSubtitle: {
    fontSize: 11.5,
    color: '#9A4D00',
    fontWeight: '600',
    marginTop: 2,
    fontFamily: appTheme.fontFamily,
  },
});
