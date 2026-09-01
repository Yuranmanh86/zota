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
import { LinearGradient } from 'expo-linear-gradient';
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
import { showUserMessage } from '../utils/feedback';

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
      return { label: 'A aprovar', color: '#B45309', bg: '#FEF3C7', dot: '#F59E0B' };
    case 'approved':
      return { label: 'Aprovado', color: '#065F46', bg: '#D1FAE5', dot: '#10B981' };
    case 'rejected':
      return { label: 'Rejeitado', color: '#991B1B', bg: '#FEE2E2', dot: '#EF4444' };
    case 'cancelled':
      return { label: 'Cancelado', color: '#374151', bg: '#F3F4F6', dot: '#9CA3AF' };
    default:
      return { label: s || '-', color: '#374151', bg: '#F3F4F6', dot: '#9CA3AF' };
  }
}

const ONLY_ACCOUNT = {
  number: '870023591',
  holder: 'Helena Isaque',
  method: 'e-Mola',
};

const QUICK_AMOUNTS = [500, 1000, 2500, 5000];

export function ReloadScreen() {
  const navigation = useNavigation<any>();
  const [amount, setAmount] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [history, setHistory] = useState<MyDepositRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState<boolean>(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const accountsAnimation = useRef(new Animated.Value(0)).current;
  const bannerAnimation = useRef(new Animated.Value(0)).current;
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

  const flashBanner = useCallback((msg: string) => {
    setSuccessBanner(msg);
    bannerAnimation.setValue(0);
    Animated.parallel([
      Animated.timing(bannerAnimation, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
    const t = setTimeout(() => {
      Animated.timing(bannerAnimation, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => setSuccessBanner(null));
    }, 3600);
    return () => clearTimeout(t);
  }, [bannerAnimation]);

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
      showUserMessage('Valor inválido', 'Informe um valor maior que zero para recarregar.');
      return;
    }
    if (hasPendingRequest) {
      showUserMessage(
        'Pedido pendente',
        'Você já possui um pedido de recarga aguardando aprovação. Aguarde o administrador antes de enviar outro.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createDepositRequest(numericAmount, 'e-Mola');
      if (res?.success) {
        const msg = res.message || 'Seu pedido de recarga foi enviado e aguarda aprovação.';
        showUserMessage('Pedido enviado', msg);
        flashBanner('Pedido de recarga submetido com sucesso! Aguardando aprovação.');
        setAmount('');
        refreshAll();
      } else {
        showUserMessage('Não foi possível enviar', res?.message || 'Tente novamente em breve.');
      }
    } catch (err: any) {
      showUserMessage('Erro', err?.message || 'Erro de conexão.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyAccount = async () => {
    const copied = await copyToClipboard(ONLY_ACCOUNT.number);
    if (copied) {
      setCopiedAccount(true);
      setTimeout(() => setCopiedAccount(false), 2000);
    } else {
      showUserMessage('Não foi possível copiar', 'Copie o número manualmente e tente novamente.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {successBanner ? (
        <Animated.View
          style={[
            styles.successBanner,
            {
              opacity: bannerAnimation,
              transform: [{
                translateY: bannerAnimation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-24, 0],
                }),
              }],
            },
          ]}
        >
          <View style={styles.successBannerIconBox}>
            <Ionicons name="checkmark" size={16} color="#FFF" />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.successBannerTitle}>Pedido submetido</Text>
            <Text style={styles.successBannerText}>{successBanner}</Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setSuccessBanner(null)}
            hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
          >
            <Ionicons name="close" size={16} color="#065F46" />
          </TouchableOpacity>
        </Animated.View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.contentContainer,
          successBanner ? { paddingTop: 8 } : null,
        ]}
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
           
          </View>
        )}

        <LinearGradient
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          colors={['#FF8A3D', '#FF6A2B', '#FF5A1F']}
          style={styles.heroGradient}
        >
          <View style={styles.heroTop}>
            <View style={styles.heroPill}>
              <Ionicons name="wallet" size={14} color="#FF7A00" />
              <Text style={styles.heroPillText}>Carteira Zora</Text>
            </View>
            {hasPendingRequest ? (
              <View style={styles.heroPendingBadge}>
                <Ionicons name="time" size={12} color="#B45309" />
                <Text style={styles.heroPendingText}>1 pedido a aprovar</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.heroMainText}>Envie para a conta</Text>
          <Text style={styles.heroHighlight}>e-Mola oficial da Zora</Text>
          <Text style={styles.heroHint}>
            Copie o número, faça a transferência e depois envie seu pedido abaixo.
          </Text>
        </LinearGradient>

        <Animated.View
          style={[
            styles.formCard,
            {
              opacity: accountsAnimation,
              transform: [{
                translateY: accountsAnimation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [14, 0],
                }),
              }],
            },
          ]}
        >
          <View style={styles.accountCard}>
            <View style={styles.accountCardIconWrap}>
              <View style={styles.accountCardIcon}>
                <Ionicons name="person" size={22} color="#FFF" />
              </View>
              <View style={styles.accountCardVerified}>
                <Ionicons name="checkmark" size={10} color="#16A34A" />
              </View>
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <View style={styles.accountCardTitleRow}>
                <Text style={styles.accountCardHolder}>{ONLY_ACCOUNT.holder}</Text>
                <View style={styles.accountMethodChip}>
                  <Ionicons name="phone-portrait-outline" size={11} color="#9A4D00" />
                  <Text style={styles.accountMethodText}>{ONLY_ACCOUNT.method}</Text>
                </View>
              </View>
              <Text style={styles.accountCardNumber}>{ONLY_ACCOUNT.number}</Text>
              <Text style={styles.accountCardHint}>Conta oficial • Verificada</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.copyButtonBig,
              copiedAccount && styles.copyButtonBigCopied,
            ]}
            activeOpacity={0.85}
            onPress={handleCopyAccount}
          >
            <Ionicons
              name={copiedAccount ? 'checkmark-circle' : 'copy-outline'}
              size={18}
              color={copiedAccount ? '#166534' : '#C2410C'}
            />
            <Text style={[
              styles.copyButtonBigText,
              copiedAccount && { color: '#166534' },
            ]}>
              {copiedAccount ? 'Número copiado!' : 'Copiar número da conta'}
            </Text>
          </TouchableOpacity>

          <View style={styles.stepsRow}>
            <View style={styles.stepItem}>
              <View style={styles.stepDot}>
                <Text style={styles.stepDotText}>1</Text>
              </View>
              <Text style={styles.stepText}>Copie o número e envie o valor</Text>
            </View>
            <View style={styles.stepDivider} />
            <View style={styles.stepItem}>
              <View style={styles.stepDot}>
                <Text style={styles.stepDotText}>2</Text>
              </View>
              <Text style={styles.stepText}>Informe o mesmo valor abaixo</Text>
            </View>
            <View style={styles.stepDivider} />
            <View style={styles.stepItem}>
              <View style={styles.stepDot}>
                <Text style={styles.stepDotText}>3</Text>
              </View>
              <Text style={styles.stepText}>Aguarde a aprovação da Zora</Text>
            </View>
          </View>
        </Animated.View>

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Valor do pedido</Text>

          <View style={styles.inputWrapper}>
            <View style={styles.inputCurrencyTag}>
              <Text style={styles.inputCurrencyText}>MT</Text>
            </View>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="Ex: 5 000"
              placeholderTextColor="#A1A1AA"
              editable={!hasPendingRequest && !isSubmitting}
            />
            {amount ? (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setAmount('')}
                hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={18} color="#CBD5E1" />
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={styles.quickLabel}>Valores rápidos</Text>
          <View style={styles.quickAmountRow}>
            {QUICK_AMOUNTS.map((v) => (
              <TouchableOpacity
                key={v}
                activeOpacity={0.75}
                style={[
                  styles.quickAmountBtn,
                  Number(amount) === v ? styles.quickAmountBtnActive : null,
                  (hasPendingRequest || isSubmitting) ? { opacity: 0.55 } : null,
                ]}
                onPress={() => {
                  if (hasPendingRequest || isSubmitting) return;
                  setAmount(String(v));
                }}
              >
                <Text style={[
                  styles.quickAmountText,
                  Number(amount) === v ? styles.quickAmountTextActive : null,
                ]}>
                  {v.toLocaleString('pt-MZ')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.summaryBox}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Valor do pedido</Text>
              <Text style={styles.summaryValue}>{formatMoney(numericAmount)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Método de envio</Text>
              <Text style={styles.summaryValue}>{ONLY_ACCOUNT.method}</Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryRowStrong]}>
              <Text style={styles.summaryLabel}>Status</Text>
              <Text
                style={[
                  styles.summaryValueStrong,
                  hasPendingRequest ? { color: '#B45309' } : null,
                ]}
              >
                {hasPendingRequest
                  ? '⏳ Pedido a aprovar'
                  : numericAmount > 0
                    ? 'Pronto para enviar'
                    : 'Informe o valor'}
              </Text>
            </View>
          </View>

          {hasPendingRequest ? (
            <TouchableOpacity
              style={styles.infoBanner}
              activeOpacity={0.9}
              onPress={() => {
                try { scrollRef.current?.scrollToEnd({ animated: true }); } catch {}
              }}
            >
              <Ionicons name="information-circle" size={18} color="#92400E" />
              <Text style={styles.infoBannerText}>
                Pedido pendente — aguarde aprovação antes de enviar outro.
              </Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[
              styles.submitButton,
              (isSubmitting || hasPendingRequest || numericAmount <= 0) &&
                styles.submitButtonDisabled,
            ]}
            activeOpacity={0.9}
            onPress={handleReload}
            disabled={isSubmitting || hasPendingRequest || numericAmount <= 0}
          >
            {isSubmitting ? (
              <>
                <ActivityIndicator color="#FFF" size="small" style={{ marginRight: 10 }} />
                <Text style={styles.submitButtonText}>Enviando pedido...</Text>
              </>
            ) : hasPendingRequest ? (
              <>
                <Ionicons name="time-outline" size={18} color="#FFF" />
                <Text style={styles.submitButtonText}>  Pedido pendente</Text>
              </>
            ) : (
              <>
                <Ionicons name="send-outline" size={18} color="#FFF" />
                <Text style={styles.submitButtonText}>  Enviar pedido de recarga</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.historyCard}>
          <View style={styles.historyHeader}>
            <View>
              <Text style={styles.historyTitle}>Histórico de recargas</Text>
              <Text style={styles.historyMeta}>
                {history.length === 0
                  ? 'Ainda sem pedidos'
                  : `${history.length} pedido${history.length === 1 ? '' : 's'}`}
              </Text>
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
              <View style={styles.historyEmptyIcon}>
                <Ionicons name="file-tray-outline" size={26} color="#CBD5E1" />
              </View>
              <Text style={styles.historyEmptyTitle}>Sem pedidos ainda</Text>
              <Text style={styles.historyEmptyText}>
                Seu histórico de recargas aparecerá aqui após enviar um pedido.
              </Text>
            </View>
          ) : (
            history.map((item) => {
              const s = statusLabel(item.status);
              return (
                <View key={item.id} style={styles.historyItem}>
                  <View style={[styles.historyItemIconWrap, { backgroundColor: s.bg }]}>
                    <Ionicons
                      name="arrow-down-outline"
                      size={16}
                      color={s.color}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.historyItemTitle}>
                      Recarga via {item.payment_method || ONLY_ACCOUNT.method}
                    </Text>
                    <Text style={styles.historyItemSubtitle}>
                      {new Date(item.created_at).toLocaleString('pt-PT')}
                      {item.admin_notes ? ` • ${item.admin_notes}` : ''}
                    </Text>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={styles.historyAmount}>+{formatMoney(item.amount)}</Text>
                    <View style={[styles.badgePill, { backgroundColor: s.bg }]}>
                      <View style={[styles.badgeDot, { backgroundColor: s.dot }]} />
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

  successBanner: {
    position: 'absolute',
    top: 0,
    left: 12,
    right: 12,
    zIndex: 50,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#6EE7B7',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 10,
    shadowColor: '#059669',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  successBannerIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successBannerTitle: {
    color: '#065F46',
    fontWeight: '900',
    fontSize: 13,
    fontFamily: appTheme.fontFamily,
  },
  successBannerText: {
    color: '#047857',
    fontSize: 11.5,
    marginTop: 2,
    lineHeight: 16,
    fontFamily: appTheme.fontFamily,
    fontWeight: '600',
  },

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

  heroGradient: {
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#FF6A2B',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
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
    fontWeight: '800',
    fontSize: 11,
    fontFamily: appTheme.fontFamily,
  },
  heroPendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  heroPendingText: {
    color: '#92400E',
    marginLeft: 4,
    fontWeight: '800',
    fontSize: 11,
    fontFamily: appTheme.fontFamily,
  },
  heroMainText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: appTheme.fontFamily,
  },
  heroHighlight: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 4,
    fontFamily: appTheme.fontFamily,
  },
  heroHint: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 12.5,
    marginTop: 8,
    lineHeight: 18,
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
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 12,
    fontFamily: appTheme.fontFamily,
  },

  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#86EFAC',
    marginBottom: 12,
  },
  accountCardIconWrap: {
    position: 'relative',
  },
  accountCardIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16A34A',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  accountCardVerified: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  accountCardHolder: {
    color: '#166534',
    fontSize: 16,
    fontWeight: '900',
    fontFamily: appTheme.fontFamily,
  },
  accountMethodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#FFD3A7',
  },
  accountMethodText: {
    color: '#9A4D00',
    fontSize: 10.5,
    fontWeight: '800',
    marginLeft: 4,
    fontFamily: appTheme.fontFamily,
  },
  accountCardNumber: {
    color: '#15803D',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1.4,
    fontFamily: appTheme.fontFamily,
  },
  accountCardHint: {
    color: '#4D7C0F',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '700',
    fontFamily: appTheme.fontFamily,
  },

  copyButtonBig: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFD3A7',
    marginBottom: 14,
  },
  copyButtonBigCopied: {
    backgroundColor: '#DCFCE7',
    borderColor: '#4ADE80',
  },
  copyButtonBigText: {
    marginLeft: 8,
    color: '#C2410C',
    fontWeight: '800',
    fontSize: 13,
    fontFamily: appTheme.fontFamily,
  },

  stepsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: '#FFFDF9',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FEE7CC',
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFE1C2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  stepDotText: {
    color: '#9A4D00',
    fontSize: 11,
    fontWeight: '900',
    fontFamily: appTheme.fontFamily,
  },
  stepText: {
    color: '#7C2D12',
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 14,
    fontWeight: '700',
    fontFamily: appTheme.fontFamily,
  },
  stepDivider: {
    width: 8,
    height: 1.5,
    backgroundColor: '#FED7AA',
    marginTop: 10,
    borderRadius: 2,
  },

  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FFD3A7',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  inputCurrencyTag: {
    backgroundColor: '#FF7A00',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  inputCurrencyText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
    fontFamily: appTheme.fontFamily,
  },
  input: {
    flex: 1,
    marginLeft: 10,
    color: '#111827',
    fontSize: 17,
    fontWeight: '800',
    fontFamily: appTheme.fontFamily,
  },
  quickLabel: {
    color: '#9A4D00',
    fontSize: 11.5,
    fontWeight: '700',
    marginBottom: 8,
    fontFamily: appTheme.fontFamily,
  },
  quickAmountRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  quickAmountBtn: {
    minWidth: 80,
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFD3A7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAmountBtnActive: {
    backgroundColor: '#FFE8D4',
    borderColor: '#FF7A00',
    shadowColor: '#FF7A00',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  quickAmountText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#9A4D00',
    fontFamily: appTheme.fontFamily,
  },
  quickAmountTextActive: {
    color: '#C2410C',
  },

  summaryBox: {
    backgroundColor: '#FFF7ED',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FFD3A7',
    marginVertical: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryRowStrong: {
    borderTopWidth: 1,
    borderTopColor: '#FED7AA',
    paddingTop: 10,
    marginTop: 2,
    marginBottom: 0,
  },
  summaryLabel: {
    color: '#9A4D00',
    fontSize: 12.5,
    fontWeight: '600',
    fontFamily: appTheme.fontFamily,
  },
  summaryValue: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
    fontFamily: appTheme.fontFamily,
  },
  summaryValueStrong: {
    color: '#FF7A00',
    fontSize: 13.5,
    fontWeight: '900',
    fontFamily: appTheme.fontFamily,
  },

  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  infoBannerText: {
    flex: 1,
    marginLeft: 8,
    color: '#92400E',
    fontSize: 12,
    fontWeight: '800',
    fontFamily: appTheme.fontFamily,
    lineHeight: 16,
  },

  submitButton: {
    backgroundColor: '#FF7A00',
    paddingVertical: 14,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF7A00',
    shadowOpacity: 0.26,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  submitButtonDisabled: { opacity: 0.65 },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
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
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  historyEmptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  historyEmptyTitle: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '800',
    fontFamily: appTheme.fontFamily,
  },
  historyEmptyText: {
    marginTop: 4,
    fontSize: 11.5,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 16,
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
    borderRadius: 14,
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
    fontSize: 13,
    fontWeight: '900',
    color: '#065F46',
    fontFamily: appTheme.fontFamily,
  },
  badgePill: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: '800',
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
