import * as React from 'react';
import { useCallback, useState, useEffect, useRef } from 'react';
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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { appTheme } from '../theme/appTheme';
import {
  createDepositRequest,
  getMyDeposits,
  MyDepositRow,
  invalidateFinanceCache,
} from '../services/finance';
import { backend } from '../services/backendClient';
import { getUserProfile } from '../services/auth';
import { copyToClipboard } from '../services/referrals';


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
      return { label: 'Aprovado', color: '#065F46', bg: '#D1FAE5' };
    case 'rejected':
      return { label: 'Rejeitado', color: '#991B1B', bg: '#FEE2E2' };
    case 'cancelled':
      return { label: 'Cancelado', color: '#374151', bg: '#F3F4F6' };
    default:
      return { label: s || '-', color: '#374151', bg: '#F3F4F6' };
  }
}

export function ReloadScreen() {
  const navigation = useNavigation<any>();
  const [amount, setAmount] = useState('5000');
  const [refreshing, setRefreshing] = useState(false);
  const [history, setHistory] = useState<MyDepositRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState<string | null>(null);
  const accountsAnimation = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const numericAmount = Number(amount.replace(/\D/g, '')) || 0;

  useFocusEffect(
    useCallback(() => {
      accountsAnimation.setValue(0);
      Animated.timing(accountsAnimation, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
      });
      refreshAllInternal();
    }, [])
  );

  const refreshAllInternal = useCallback(async () => {
    try {
      const h = await getMyDeposits();
      setHistory(h || []);
      setHasPendingRequest((h || []).some((item) => item.status === 'pending'));
    } catch (_e) {}
  }, []);

  const refreshAll = refreshAllInternal;

  const depositChannelRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;

    const setupDepositRealtime = async () => {
      try {
        const profile = await getUserProfile().catch(() => null);
        const profileId = profile?.id;
        if (!profileId) return;

        if (depositChannelRef.current) {
          try { backend.removeChannel(depositChannelRef.current); } catch {}
        }

        const ch = backend.channel(`deposits_${profileId}`);
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
            table: 'deposits',
            filter: `profile_id=eq.${profileId}`,
          },
          handleChange
        );

        ch.subscribe();
        depositChannelRef.current = ch;
      } catch {}
    };

    setupDepositRealtime();

    const handleAppState = (next: any) => {
      if (next === 'active' && isMounted) setupDepositRealtime();
    };
    const sub = AppState.addEventListener('change', handleAppState);

    return () => {
      isMounted = false;
      try { sub.remove(); } catch {}
      if (depositChannelRef.current) {
        try { depositChannelRef.current.unsubscribe(); } catch {}
        try { backend.removeChannel(depositChannelRef.current); } catch {}
        depositChannelRef.current = null;
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

  const handleReload = async () => {
    if (numericAmount <= 0) {
      Alert.alert('Valor inválido', 'Informe um valor maior que zero para recarregar.');
      return;
    }
    if (hasPendingRequest) {
      Alert.alert(
        'Pedido pendente',
        'Você já possui um pedido de recarga aguardando aprovação. Aguarde o administrador antes de enviar outro.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createDepositRequest(numericAmount, 'mpesa');
      if (res?.success) {
        Alert.alert(
          'Pedido enviado',
          res.message || 'Seu pedido de recarga foi enviado e aguarda aprovação.'
        );
        setAmount('');
        refreshAll();
      } else {
        Alert.alert('Não foi possível enviar', res?.message || 'Tente novamente em breve.');
      }
    } catch (err: any) {
      Alert.alert('Erro', err?.message || 'Erro de conexão.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyAccount = async (account: string) => {
    const copied = await copyToClipboard(account);
    if (copied) {
      setCopiedAccount(account);
      setTimeout(() => setCopiedAccount(null), 1800);
    } else {
      Alert.alert('Não foi possível copiar', 'Copie o número manualmente e tente novamente.');
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
              <Text style={styles.webHeaderTitle}>Recarregar</Text>
              <Text style={styles.webHeaderSubtitle}>Adicionar saldo à sua carteira</Text>
            </View>
            <View style={{ width: 40 }} />
          </View>
        ) : (
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.screenTitle}>Recarregar</Text>
              <Text style={styles.screenSubtitle}>
                Adicione saldo à sua carteira de forma rápida e segura.
              </Text>
            </View>
            <View style={styles.badge}>
              <Ionicons name="reload" size={20} color="#FFFFFF" />
            </View>
          </View>
        )}

        <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Pedido de recarga</Text>
            <Text style={styles.sectionHint}>
              Primeiro envie o valor para uma das contas abaixo. Depois informe o mesmo valor e envie o pedido. O saldo só será creditado após a aprovação do administrador.
            </Text>

            <Animated.View
              style={[
                styles.accountsBox,
                {
                  opacity: accountsAnimation,
                  transform: [{ translateY: accountsAnimation.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
                },
              ]}
            >
              <View style={styles.accountsTitleRow}>
                <View style={styles.accountsIcon}>
                  <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                </View>
                <View>
                  <Text style={styles.accountsTitle}>Contas para envio</Text>
                  <Text style={styles.accountsSubtitle}>Escolha uma conta para fazer o pagamento</Text>
                </View>
              </View>
              <View style={styles.accountRow}>
                <View style={styles.accountCopy}>
                  <Text style={styles.accountHolder}>Clementina</Text>
                  <Text style={styles.accountNumber}>874974566</Text>
                </View>
                <TouchableOpacity
                  style={styles.copyButton}
                  onPress={() => handleCopyAccount('874974566')}
                  accessibilityLabel="Copiar conta de Clementina"
                >
                  <Ionicons name={copiedAccount === '874974566' ? 'checkmark' : 'copy-outline'} size={16} color="#C2410C" />
                  <Text style={styles.copyButtonText}>{copiedAccount === '874974566' ? 'Copiado' : 'Copiar'}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.accountRow}>
                <View style={styles.accountCopy}>
                  <Text style={styles.accountHolder}>Zora</Text>
                  <Text style={styles.accountNumber}>866554441</Text>
                </View>
                <TouchableOpacity
                  style={styles.copyButton}
                  onPress={() => handleCopyAccount('866554441')}
                  accessibilityLabel="Copiar conta Zora"
                >
                  <Ionicons name={copiedAccount === '866554441' ? 'checkmark' : 'copy-outline'} size={16} color="#C2410C" />
                  <Text style={styles.copyButtonText}>{copiedAccount === '866554441' ? 'Copiado' : 'Copiar'}</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.accountsNote}>Após o envio, faça o pedido abaixo e aguarde a conferência do administrador.</Text>
            </Animated.View>

            <Text style={styles.sectionTitle}>Valor do pedido</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="cash-outline" size={18} color="#FF7A00" />
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder="Ex: 5000"
                placeholderTextColor="#A1A1AA"
                editable={!hasPendingRequest}
              />
            </View>

            <View style={styles.summaryBox}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Valor do pedido</Text>
                <Text style={styles.summaryValue}>{formatMoney(numericAmount)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Status do pedido</Text>
                <Text style={styles.summaryValueStrong}>
                  {hasPendingRequest ? 'Aguardando aprovação' : 'Pronto para enviar'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.submitButton,
                (isSubmitting || hasPendingRequest) && styles.submitButtonDisabled,
              ]}
              activeOpacity={0.9}
              onPress={handleReload}
              disabled={isSubmitting || hasPendingRequest}
            >
              {isSubmitting ? (
                <>
                  <ActivityIndicator color="#FFF" size="small" style={{ marginRight: 10 }} />
                  <Text style={styles.submitButtonText}>Enviando pedido...</Text>
                </>
              ) : (
                <Text style={styles.submitButtonText}>
                  {hasPendingRequest ? 'Pedido pendente' : 'Enviar pedido'}
                </Text>
              )}
            </TouchableOpacity>
        </View>

        <View style={styles.historyCard}>
          <View style={styles.historyHeader}>
            <View>
              <Text style={styles.historyTitle}>Histórico de recargas</Text>
              <Text style={styles.historyMeta}>Últimos pedidos</Text>
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
              <Text style={styles.historyEmptyText}>Ainda não tem pedidos de recarga.</Text>
            </View>
          ) : (
            history.map((item) => {
              const s = statusLabel(item.status);
              return (
                <View key={item.id} style={styles.historyItem}>
                  <View style={styles.historyItemIconWrap}>
                    <Ionicons name="arrow-down-outline" size={16} color="#065F46" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.historyItemTitle}>
                      Recarga via {item.payment_method || 'mpesa'}
                    </Text>
                    <Text style={styles.historyItemSubtitle}>
                      {new Date(item.created_at).toLocaleString('pt-PT')}
                      {item.admin_notes ? ` • ${item.admin_notes}` : ''}
                    </Text>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={styles.historyAmount}>+{formatMoney(item.amount)}</Text>
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
  heroCard: { borderRadius: 24, padding: 18, marginBottom: 16 },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    fontFamily: appTheme.fontFamily,
  },
  heroValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 4,
    fontFamily: appTheme.fontFamily,
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  heroPillText: {
    color: '#FF7A00',
    marginLeft: 4,
    fontWeight: '700',
    fontSize: 11,
    fontFamily: appTheme.fontFamily,
  },
  heroSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 10,
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
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
    marginTop: 6,
    fontFamily: appTheme.fontFamily,
  },
  sectionHint: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 12,
    lineHeight: 18,
    fontFamily: appTheme.fontFamily,
  },
  accountsBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#86EFAC',
    padding: 12,
    marginBottom: 12,
    shadowColor: '#16A34A',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  accountsTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  accountsIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  accountsTitle: { color: '#166534', fontSize: 13, fontWeight: '900', fontFamily: appTheme.fontFamily },
  accountsSubtitle: { color: '#4D7C0F', fontSize: 10.5, marginTop: 2, fontFamily: appTheme.fontFamily },
  accountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, marginTop: 7, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#BBF7D0' },
  accountCopy: { flex: 1 },
  accountHolder: { color: '#166534', fontSize: 12, fontWeight: '800', fontFamily: appTheme.fontFamily },
  accountNumber: { color: '#15803D', fontSize: 19, fontWeight: '900', letterSpacing: 1.2, marginTop: 2, fontFamily: appTheme.fontFamily },
  copyButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: '#DCFCE7', borderWidth: 1, borderColor: '#4ADE80' },
  copyButtonText: { color: '#166534', fontSize: 11, fontWeight: '800', marginLeft: 5, fontFamily: appTheme.fontFamily },
  accountsNote: { color: '#166534', fontSize: 11, lineHeight: 16, marginTop: 10, fontWeight: '600', fontFamily: appTheme.fontFamily },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFD3A7',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 2,
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
    marginBottom: 4,
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
  methodsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
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
  methodHeader: { flexDirection: 'row', alignItems: 'center' },
  methodName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    marginLeft: 4,
    fontFamily: appTheme.fontFamily,
  },
  methodNameActive: { color: '#FF7A00' },
  methodSubtitle: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 4,
    textAlign: 'center',
    fontFamily: appTheme.fontFamily,
  },
  methodBadge: {
    marginTop: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  methodBadgeActive: { backgroundColor: '#FFE1C2' },
  methodBadgeText: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '700',
    fontFamily: appTheme.fontFamily,
  },
  methodBadgeTextActive: { color: '#C2410C' },
  summaryBox: {
    backgroundColor: '#FFF7ED',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FFD3A7',
    marginVertical: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  summaryLabel: {
    color: '#9A4D00',
    fontSize: 12,
    fontFamily: appTheme.fontFamily,
  },
  summaryValue: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: appTheme.fontFamily,
  },
  summaryValueStrong: {
    color: '#FF7A00',
    fontSize: 13,
    fontWeight: '800',
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
  historyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
  },
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
  historyEmpty: {
    alignItems: 'center',
    paddingVertical: 24,
  },
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
  badgePill: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: appTheme.fontFamily,
  },
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
