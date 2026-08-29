import * as React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { appTheme } from '../theme/appTheme';
import {
  createSavingsApplication,
  getUserSavings,
  settleSavingsApplication,
  SavingsCreateResult,
  SavingsSettleResult,
} from '../services/finance';
import { useDashboardSummary } from '../hooks/useDashboardSummary';

const SAVINGS_MINIMUM = 5000;
const SAVINGS_HOURS = 72;
const SAVINGS_RETURN_MULTIPLIER = 2;

type SavingsItem = {
  id: string;
  profile_id: string;
  amount_applied: number;
  amount_to_receive: number;
  status: 'locked' | 'ready' | 'completed' | 'cancelled';
  effective_status?: 'locked' | 'ready' | 'completed' | 'cancelled';
  start_at: string;
  release_at: string;
  settled_at?: string | null;
  remaining_seconds?: number | null;
};

const benefits = [
  { icon: 'shield-check', title: 'Rendimento garantido', desc: '100% de retorno' },
  { icon: 'clock-outline', title: 'Prazo curto', desc: 'Apenas 72 horas' },
  { icon: 'lock-outline', title: 'Segurança total', desc: 'Fundo protegido' },
  { icon: 'flash-outline', title: 'Retorno rápido', desc: 'Dobra o valor' },
];

function fmtMoney(v: number): string {
  if (!isFinite(v)) return '0';
  return v.toLocaleString('pt-MZ');
}

function fmtMoneyFull(v: number): string {
  return `MZN ${fmtMoney(v)}`;
}

function parseAmount(text: string): number {
  const digits = text.replace(/[^\d]/g, '');
  const num = parseInt(digits || '0', 10);
  return isFinite(num) ? num : 0;
}

function getRemainingParts(sec: number) {
  const safe = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return {
    h,
    m,
    s,
    hh: String(h).padStart(2, '0'),
    mm: String(m).padStart(2, '0'),
    ss: String(s).padStart(2, '0'),
  };
}

function getStatusInfo(status: string, effective?: string) {
  const actual = effective || status;
  switch (actual) {
    case 'ready':
      return {
        label: 'Disponível para receber',
        bg: '#ECFDF5',
        text: '#065F46',
        border: '#6EE7B7',
        dot: '#10B981',
      };
    case 'completed':
      return {
        label: 'Recebido',
        bg: '#EFF6FF',
        text: '#1E40AF',
        border: '#93C5FD',
        dot: '#3B82F6',
      };
    case 'cancelled':
      return {
        label: 'Cancelado',
        bg: '#FEF2F2',
        text: '#7F1D1D',
        border: '#FECACA',
        dot: '#EF4444',
      };
    case 'locked':
    default:
      return {
        label: 'Em espera',
        bg: '#FFF7ED',
        text: '#9A4D00',
        border: '#FFD3A7',
        dot: '#FF7A00',
      };
  }
}

function CountdownTimer({ releaseAt }: { releaseAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!releaseAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [releaseAt]);
  const safeSeconds = Math.max(0, Math.floor((releaseAt - now) / 1000));
  if (safeSeconds <= 0) {
    return (
      <View style={styles.countdownWrap}>
        <Text style={styles.countdownNum}>00</Text>
        <Text style={styles.countdownLbl}>horas</Text>
        <Text style={styles.countdownSep}>:</Text>
        <Text style={styles.countdownNum}>00</Text>
        <Text style={styles.countdownLbl}>min</Text>
        <Text style={styles.countdownSep}>:</Text>
        <Text style={styles.countdownNum}>00</Text>
        <Text style={styles.countdownLbl}>seg</Text>
      </View>
    );
  }
  const parts = getRemainingParts(safeSeconds);
  return (
    <View style={styles.countdownWrap}>
      <View style={styles.countdownBox}>
        <Text style={styles.countdownNum}>{parts.hh}</Text>
        <Text style={styles.countdownLbl}>horas</Text>
      </View>
      <Text style={styles.countdownSep}>:</Text>
      <View style={styles.countdownBox}>
        <Text style={styles.countdownNum}>{parts.mm}</Text>
        <Text style={styles.countdownLbl}>min</Text>
      </View>
      <Text style={styles.countdownSep}>:</Text>
      <View style={styles.countdownBox}>
        <Text style={styles.countdownNum}>{parts.ss}</Text>
        <Text style={styles.countdownLbl}>seg</Text>
      </View>
    </View>
  );
}

export function SavingsScreen() {
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const contentPadBottom = Math.max(140, 76 + insets.bottom + 16 + 30);
  const { data: dashboard, isFetching: dashboardFetching } = useDashboardSummary({ requireFocused: false });

  const [amountInput, setAmountInput] = useState('5.000');
  const [creating, setCreating] = useState(false);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [savingsList, setSavingsList] = useState<SavingsItem[]>([]);
  const [nowTick, setNowTick] = useState(Date.now());

  const parseCurrencyToNumber = (s?: string): number => {
    if (!s) return 0;
    const digits = String(s).replace(/[^\d,]/g, '').replace(',', '.');
    const n = parseFloat(digits);
    return isFinite(n) ? n : 0;
  };

  const availableBalance = useMemo(() => {
    if (dashboard?.available) return parseCurrencyToNumber(dashboard.available);
    return 0;
  }, [dashboard?.available]);

  const walletBalance = useMemo(() => {
    if (dashboard?.principal) return parseCurrencyToNumber(dashboard.principal);
    return 0;
  }, [dashboard?.principal]);

  const appliedAmount = useMemo(() => parseAmount(amountInput), [amountInput]);
  const returnAmount = appliedAmount * SAVINGS_RETURN_MULTIPLIER;
  const profitAmount = returnAmount - appliedAmount;

  const meetsMinimum = appliedAmount >= SAVINGS_MINIMUM;
  const hasSufficientBalance = availableBalance >= appliedAmount && appliedAmount > 0;
  const loadingWallet = dashboardFetching && availableBalance === 0;
  const canApply = meetsMinimum && hasSufficientBalance && !creating && !loadingWallet;

  const loadData = useCallback(async (showRefreshSpinner = false) => {
    if (showRefreshSpinner) setRefreshing(true);
    setLoadingList(true);
    try {
      const list = await getUserSavings();
      setSavingsList((list as SavingsItem[]) || []);
    } catch (_e) {
    } finally {
      setLoadingList(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isFocused) {
      loadData();
    }
  }, [isFocused, loadData]);

  useEffect(() => {
    if (!isFocused) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isFocused]);

  const handleAmountChange = useCallback((t: string) => {
    const onlyDigits = t.replace(/[^\d]/g, '').slice(0, 10);
    const num = parseInt(onlyDigits || '0', 10);
    if (!isFinite(num)) {
      setAmountInput('');
      return;
    }
    setAmountInput(num.toLocaleString('pt-MZ'));
  }, []);

  const quickValues = [5000, 10000, 20000, 50000];

  async function handleApply() {
    if (!meetsMinimum) {
      Alert.alert('Valor abaixo do mínimo', `A aplicação mínima é de ${fmtMoneyFull(SAVINGS_MINIMUM)}.`);
      return;
    }
    if (!hasSufficientBalance) {
      Alert.alert(
        'Saldo insuficiente',
        `Saldo disponível: ${fmtMoneyFull(availableBalance)}.\nAplicação pretendida: ${fmtMoneyFull(appliedAmount)}.`
      );
      return;
    }
    setCreating(true);
    try {
      const result: SavingsCreateResult = await createSavingsApplication(appliedAmount);
      if (result.success) {
        Alert.alert(
          'Poupança criada! 🎉',
          `${result.message}\n\nAplicado: ${fmtMoneyFull(appliedAmount)}\nA receber: ${fmtMoneyFull(returnAmount)}\nLiberação em ${SAVINGS_HOURS} horas.`,
          [{ text: 'OK', onPress: () => loadData() }]
        );
      } else {
        Alert.alert('Não foi possível aplicar', result.message || 'Tente novamente em instantes.');
      }
    } catch (err: any) {
      Alert.alert('Erro', err?.message || 'Erro de conexão. Tente novamente.');
    } finally {
      setCreating(false);
    }
  }

  async function handleSettle(s: SavingsItem) {
    const eff = s.effective_status || s.status;
    if (eff !== 'ready') {
      if (eff === 'locked') {
        Alert.alert('Ainda em espera', 'Os 72h ainda não foram cumpridos. Aguarde a liberação automática.');
      } else if (eff === 'completed') {
        Alert.alert('Já recebido', 'Esta poupança já foi paga.');
      }
      return;
    }
    Alert.alert(
      'Receber poupança',
      `Valor a receber: ${fmtMoneyFull(Number(s.amount_to_receive))}\n\nConfirmar recebimento agora?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Receber agora',
          style: 'default',
          onPress: async () => {
            setSettlingId(s.id);
            try {
              const res: SavingsSettleResult = await settleSavingsApplication(s.id);
              if (res.success) {
                Alert.alert('Recebido! 💸', res.message || 'Valor creditado na carteira.', [
                  { text: 'OK', onPress: () => loadData() },
                ]);
              } else {
                Alert.alert('Não foi possível receber', res.message || 'Tente novamente.');
              }
            } catch (e: any) {
              Alert.alert('Erro', e?.message || 'Erro ao receber.');
            } finally {
              setSettlingId(null);
            }
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: contentPadBottom }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor="#FF7A00" />
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        

        <LinearGradient
          colors={['#FF7A00', '#FF9A3A', '#FFB566']}
          start={[0, 0]}
          end={[1, 1]}
          style={styles.heroCard}
        >
          <View style={styles.heroBadge}>
            <Ionicons name="star" size={12} color="#FF7A00" />
            <Text style={styles.heroBadgeText}>Plano garantido</Text>
          </View>
          
          <View style={styles.heroStats}>
            <View style={styles.heroStatBox}>
              <Text style={styles.heroStatLabel}>Prazo</Text>
              <Text style={styles.heroStatValue}>{SAVINGS_HOURS} horas</Text>
            </View>
            <View style={styles.heroStatBox}>
              <Text style={styles.heroStatLabel}>Retorno</Text>
              <Text style={styles.heroStatValue}>100% garantido</Text>
            </View>
            <View style={styles.heroStatBox}>
              <Text style={styles.heroStatLabel}>Mínimo</Text>
              <Text style={styles.heroStatValue}>{fmtMoney(SAVINGS_MINIMUM)} MZN</Text>
            </View>
          </View>
          <View style={styles.securityRow}>
            <Ionicons name="shield-checkmark" size={14} color="#FFF" />
            <Text style={styles.securityText}>Fundo protegido e controlado pela Zora</Text>
          </View>
        </LinearGradient>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View>
              <Text style={styles.cardTitle}>Aplicar agora</Text>
              <Text style={styles.cardHint}>Mínimo de {fmtMoneyFull(SAVINGS_MINIMUM)}</Text>
            </View>
            <View style={styles.returnPill}>
              <Text style={styles.returnPillText}>2x de volta</Text>
            </View>
          </View>

          <View style={[
            styles.inputWrap,
            !meetsMinimum && appliedAmount > 0 ? styles.inputWarn : null,
            !hasSufficientBalance && appliedAmount > 0 ? styles.inputError : null,
          ]}>
            <Text style={styles.inputSymbol}>MZN</Text>
            <TextInput
              style={styles.inputInner}
              keyboardType="numeric"
              value={amountInput}
              onChangeText={handleAmountChange}
              placeholder="0"
              placeholderTextColor="#B8A58F"
              editable={!creating}
            />
          </View>

          <View style={styles.quickRow}>
            {quickValues.map((qv) => {
              const active = appliedAmount === qv;
              return (
                <TouchableOpacity
                  key={qv}
                  style={[styles.quickChip, active ? styles.quickChipActive : null]}
                  onPress={() => handleAmountChange(String(qv))}
                  disabled={creating}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.quickChipText, active ? styles.quickChipTextActive : null]}>
                    {fmtMoney(qv)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.returnBreakdownCard}>
            <View style={styles.breakdownHeader}>
              <Text style={styles.breakdownTitle}>Potencial retorno</Text>
              <View style={[
                styles.breakdownBadge,
                !canApply ? styles.breakdownBadgeDisabled : null,
              ]}>
                <Text style={styles.breakdownBadgeText}>+100%</Text>
              </View>
            </View>

            <View style={styles.breakdownRow}>
              <View style={styles.breakdownCell}>
                <Text style={styles.breakdownLabel}>Valor aplicado</Text>
                <Text style={styles.breakdownValue}>{fmtMoneyFull(appliedAmount)}</Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color="#FF7A00" style={{ alignSelf: 'center', marginHorizontal: 4 }} />
              <View style={styles.breakdownCell}>
                <Text style={styles.breakdownLabel}>Lucro</Text>
                <Text style={styles.breakdownValuePositive}>+ {fmtMoneyFull(profitAmount)}</Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color="#FF7A00" style={{ alignSelf: 'center', marginHorizontal: 4 }} />
              <View style={styles.breakdownCell}>
                <Text style={styles.breakdownLabel}>Receber em {SAVINGS_HOURS}h</Text>
                <Text style={styles.breakdownValueFinal}>{fmtMoneyFull(returnAmount)}</Text>
              </View>
            </View>

            {!meetsMinimum && appliedAmount > 0 ? (
              <View style={styles.hintRowWarn}>
                <Ionicons name="warning" size={14} color="#B45309" />
                <Text style={styles.hintTextWarn}>
                  Aplicação mínima: {fmtMoneyFull(SAVINGS_MINIMUM)}
                </Text>
              </View>
            ) : null}
            {!hasSufficientBalance && appliedAmount > 0 ? (
              <View style={styles.hintRowError}>
                <Ionicons name="alert-circle" size={14} color="#B91C1C" />
                <Text style={styles.hintTextError}>
                  Saldo disponível: {fmtMoneyFull(availableBalance)}. Deposite mais fundos na carteira.
                </Text>
              </View>
            ) : null}
          </View>

          <TouchableOpacity
            style={[styles.applyButton, !canApply ? styles.applyButtonDisabled : null]}
            onPress={handleApply}
            disabled={!canApply}
            activeOpacity={0.9}
          >
            {creating ? (
              <>
                <ActivityIndicator color="#FFF" size="small" style={{ marginRight: 10 }} />
                <Text style={styles.applyButtonText}>A aplicar…</Text>
              </>
            ) : (
              <>
                <Ionicons name="trending-up" size={18} color="#FFF" />
                <Text style={[styles.applyButtonText, { marginLeft: 8 }]}>Confirmar aplicação</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.applyDisclaimer}>
            Ao confirmar, o valor será debitado da carteira e bloqueado até completar {SAVINGS_HOURS} horas.
            Após esse prazo, o valor total + rendimento ficará disponível para receber.
          </Text>
        </View>

        <View style={styles.benefitsRow}>
          {benefits.map((b) => (
            <View key={b.title} style={styles.benefitCard}>
              <View style={styles.benefitIcon}>
                <MaterialCommunityIcons name={b.icon as any} size={16} color="#FF7A00" />
              </View>
              <Text style={styles.benefitTitle}>{b.title}</Text>
              <Text style={styles.benefitDesc}>{b.desc}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.card, { paddingBottom: 18 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <View>
              <Text style={styles.cardTitle}>Minhas poupanças</Text>
              <Text style={styles.cardHint}>
                {savingsList.length === 0 ? 'Ainda sem aplicações' : `${savingsList.length} registo(s)`}
              </Text>
            </View>
            {loadingList ? <ActivityIndicator size="small" color="#FF7A00" /> : null}
          </View>

          {savingsList.length === 0 && !loadingList ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="wallet-outline" size={28} color="#FF7A00" />
              </View>
              <Text style={styles.emptyTitle}>Sem poupanças activas</Text>
              <Text style={styles.emptyDesc}>
                Faça a sua primeira aplicação acima. Em {SAVINGS_HOURS}h, recebe o dobro do valor.
              </Text>
            </View>
          ) : null}

          {savingsList.map((s) => {
            const applied = Number(s.amount_applied ?? 0);
            const toReceive = Number(s.amount_to_receive ?? 0);
            const eff = (s.effective_status || s.status) as any;
            const info = getStatusInfo(s.status || 'locked', eff);
            const releaseAtMs = new Date(s.release_at).getTime();
            const remaining = Math.max(0, Math.floor((releaseAtMs - nowTick) / 1000));
            const isReady = eff === 'ready' || (remaining <= 0 && eff !== 'completed' && eff !== 'cancelled');
            const isCompleted = eff === 'completed';
            const parts = getRemainingParts(remaining);
            return (
              <View key={s.id} style={styles.savingsItem}>
                <View style={styles.savingsItemHeader}>
                  <View style={[styles.statusPill, { backgroundColor: isReady ? '#ECFDF5' : info.bg, borderColor: isReady ? '#6EE7B7' : info.border }]}>
                    <View style={[styles.statusDot, { backgroundColor: isReady ? '#10B981' : info.dot }]} />
                    <Text style={[styles.statusText, { color: isReady ? '#065F46' : info.text }]}>
                      {isReady ? 'Disponível para receber' : info.label}
                    </Text>
                  </View>
                  <Text style={styles.releaseDate}>
                    Liberação: {new Date(s.release_at).toLocaleString('pt-MZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>

                <View style={styles.savingsAmountRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.savingsAmtLabel}>Aplicado</Text>
                    <Text style={styles.savingsAmtValue}>{fmtMoneyFull(applied)}</Text>
                  </View>
                  <Ionicons name="arrow-forward-circle" size={24} color="#FF7A00" />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={styles.savingsAmtLabel}>Receber</Text>
                    <Text style={styles.savingsAmtReceive}>{fmtMoneyFull(toReceive)}</Text>
                  </View>
                </View>

                {remaining > 0 && !isCompleted && !isReady ? (
                  <View style={styles.timerSection}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.timerLabel}>Tempo restante para liberação</Text>
                      <CountdownTimer releaseAt={releaseAtMs} />
                    </View>
                    <View style={styles.progressWrapVertical}>
                      <Text style={styles.progressPct}>
                        {Math.min(100, Math.round((1 - remaining / (SAVINGS_HOURS * 3600)) * 100))}%
                      </Text>
                      <View style={styles.progressBarOuter}>
                        <View
                          style={[
                            styles.progressBarInner,
                            {
                              width: `${Math.min(100, (1 - remaining / (SAVINGS_HOURS * 3600)) * 100)}%`,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  </View>
                ) : null}

                {isReady ? (
                  <View style={styles.readyBanner}>
                    <Ionicons name="checkmark-done-circle" size={18} color="#065F46" />
                    <Text style={styles.readyText}>
                      Prazo cumprido! Receba agora {fmtMoneyFull(toReceive)} na sua carteira.
                    </Text>
                  </View>
                ) : null}

                {eff === 'completed' && s.settled_at ? (
                  <View style={styles.completedBanner}>
                    <Ionicons name="wallet-outline" size={16} color="#1E40AF" />
                    <Text style={styles.completedText}>
                      Recebido em {new Date(s.settled_at).toLocaleString('pt-MZ')}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.savingsActions}>
                  {isReady ? (
                    <TouchableOpacity
                      style={[styles.settleButton, settlingId === s.id ? styles.settleButtonDisabled : null]}
                      onPress={() => handleSettle(s)}
                      disabled={settlingId === s.id}
                      activeOpacity={0.85}
                    >
                      {settlingId === s.id ? (
                        <>
                          <ActivityIndicator color="#FFF" size="small" style={{ marginRight: 8 }} />
                          <Text style={styles.settleButtonText}>A receber…</Text>
                        </>
                      ) : (
                        <>
                          <Ionicons name="wallet" size={16} color="#FFF" />
                          <Text style={[styles.settleButtonText, { marginLeft: 8 }]}>
                            Receber {fmtMoneyFull(toReceive)}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : null}
                  {!isReady && !isCompleted ? (
                    <Text style={styles.waitHint}>
                      {eff === 'locked'
                        ? `⏳ ${parts.hh}h ${parts.mm}m para liberação`
                        : info.label}
                    </Text>
                  ) : null}
                  {isCompleted ? (
                    <View style={styles.completedPill}>
                      <Ionicons name="checkmark" size={14} color="#1E40AF" />
                      <Text style={styles.completedPillText}>Concluído</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            A Poupança Zora cumpre os padrões de segurança da plataforma. Valores bloqueados não podem ser cancelados antes de {SAVINGS_HOURS} horas.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: appTheme.background },
  contentContainer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 160 : 120 },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontSize: 26, fontWeight: '900', color: '#1A1A1A', fontFamily: appTheme.fontFamily, letterSpacing: -0.3 },
  subtitle: { color: '#6B7280', fontSize: 13, marginTop: 4, fontFamily: appTheme.fontFamily },
  iconWrap: {
    width: 48, height: 48, borderRadius: 16, backgroundColor: '#FF7A00',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FF7A00', shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },

  heroCard: {
    borderRadius: 24, padding: 18, marginBottom: 14,
    shadowColor: '#FF7A00', shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, marginBottom: 10,
  },
  heroBadgeText: { color: '#FF7A00', fontWeight: '800', marginLeft: 6, fontSize: 11.5, fontFamily: appTheme.fontFamily, letterSpacing: 0.3 },
  heroTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', lineHeight: 28, fontFamily: appTheme.fontFamily },
  heroHighlight: { color: '#FFF9E6', textDecorationLine: 'underline' },
  heroStats: { flexDirection: 'row', marginTop: 14, marginHorizontal: -4 },
  heroStatBox: {
    flex: 1,
    marginHorizontal: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  heroStatLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 10.5, fontFamily: appTheme.fontFamily, fontWeight: '700' },
  heroStatValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', marginTop: 3, fontFamily: appTheme.fontFamily },
  securityRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  securityText: { color: '#FFFFFF', fontWeight: '700', marginLeft: 6, fontFamily: appTheme.fontFamily, fontSize: 12 },

  walletMiniCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,122,0,0.10)', marginBottom: 14,
    shadowColor: '#FF7A00', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  walletMiniDivider: { width: 1, height: 34, backgroundColor: '#F3E8DA', marginHorizontal: 10 },
  walletMiniLabel: { fontSize: 11, color: '#9A4D00', fontWeight: '700', fontFamily: appTheme.fontFamily, letterSpacing: 0.3 },
  walletMiniValue: { fontSize: 17, fontWeight: '900', color: '#C2410C', marginTop: 3, fontFamily: appTheme.fontFamily },
  walletMiniValueSub: { fontSize: 16, fontWeight: '800', color: '#374151', marginTop: 3, fontFamily: appTheme.fontFamily },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 22, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: '#F5E2D2',
    shadowColor: '#FF7A00', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2,
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#111827', fontFamily: appTheme.fontFamily },
  cardHint: { color: '#6B7280', fontSize: 12, marginTop: 3, fontFamily: appTheme.fontFamily },
  returnPill: {
    backgroundColor: 'rgba(255,122,0,0.10)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(255,122,0,0.20)',
  },
  returnPillText: { color: '#C2410C', fontSize: 11.5, fontWeight: '900', fontFamily: appTheme.fontFamily },

  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, borderWidth: 1.5, borderColor: '#FFD3A7',
    backgroundColor: '#FFF7ED', paddingHorizontal: 14, paddingVertical: 12,
  },
  inputWarn: { borderColor: '#FCD34D', backgroundColor: '#FFFBEB' },
  inputError: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  inputSymbol: { color: '#FF7A00', fontWeight: '900', fontSize: 14, marginRight: 8, fontFamily: appTheme.fontFamily },
  inputInner: { flex: 1, fontSize: 22, fontWeight: '900', color: '#111827', fontFamily: appTheme.fontFamily, padding: 0 },

  quickRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, marginBottom: 14 },
  quickChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#FFD3A7',
    marginRight: 8, marginBottom: 6,
  },
  quickChipActive: { backgroundColor: '#FF7A00', borderColor: '#FF7A00' },
  quickChipText: { fontSize: 12, fontWeight: '700', color: '#C2410C', fontFamily: appTheme.fontFamily },
  quickChipTextActive: { color: '#FFFFFF' },

  returnBreakdownCard: {
    backgroundColor: '#FFFBEB', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: '#FDE68A', marginBottom: 14,
  },
  breakdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  breakdownTitle: { fontSize: 13, fontWeight: '800', color: '#78350F', fontFamily: appTheme.fontFamily, letterSpacing: 0.2 },
  breakdownBadge: {
    backgroundColor: '#10B981', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
  },
  breakdownBadgeDisabled: { backgroundColor: '#9CA3AF' },
  breakdownBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', fontFamily: appTheme.fontFamily },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between' },
  breakdownCell: { flex: 1, justifyContent: 'center' },
  breakdownLabel: { fontSize: 10.5, color: '#9A4D00', fontWeight: '700', fontFamily: appTheme.fontFamily },
  breakdownValue: { fontSize: 13, fontWeight: '800', color: '#111827', marginTop: 3, fontFamily: appTheme.fontFamily },
  breakdownValuePositive: { fontSize: 13, fontWeight: '900', color: '#16A34A', marginTop: 3, fontFamily: appTheme.fontFamily },
  breakdownValueFinal: { fontSize: 14, fontWeight: '900', color: '#C2410C', marginTop: 3, fontFamily: appTheme.fontFamily },

  hintRowWarn: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  hintTextWarn: { fontSize: 12, fontWeight: '600', color: '#B45309', marginLeft: 6, fontFamily: appTheme.fontFamily, flex: 1 },
  hintRowError: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  hintTextError: { fontSize: 12, fontWeight: '600', color: '#B91C1C', marginLeft: 6, fontFamily: appTheme.fontFamily, flex: 1 },

  applyButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FF7A00', borderRadius: 16, paddingVertical: 15,
    shadowColor: '#FF7A00', shadowOpacity: 0.32, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 7,
  },
  applyButtonDisabled: { backgroundColor: '#FBD3A8', shadowOpacity: 0.1 },
  applyButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', fontFamily: appTheme.fontFamily, letterSpacing: 0.2 },
  applyDisclaimer: {
    marginTop: 12, fontSize: 11, color: '#78350F', lineHeight: 16,
    fontFamily: appTheme.fontFamily, fontWeight: '500', textAlign: 'center',
    backgroundColor: 'rgba(251,191,36,0.12)', padding: 10, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.25)',
  },

  benefitsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 14 },
  benefitCard: {
    width: '48%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12,
    borderWidth: 1, borderColor: '#FFE1C2', marginBottom: 10, alignItems: 'center',
    shadowColor: '#FF7A00', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1,
  },
  benefitIcon: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#FFF7ED',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  benefitTitle: { fontSize: 12, fontWeight: '800', color: '#111827', textAlign: 'center', fontFamily: appTheme.fontFamily },
  benefitDesc: { fontSize: 10.5, color: '#9A4D00', marginTop: 3, fontFamily: appTheme.fontFamily, textAlign: 'center' },

  emptyState: { alignItems: 'center', paddingVertical: 28 },
  emptyIcon: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: '#FFF7ED',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14, borderWidth: 1, borderColor: '#FFD3A7',
  },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: '#111827', fontFamily: appTheme.fontFamily },
  emptyDesc: {
    fontSize: 12, color: '#6B7280', textAlign: 'center', marginTop: 6, fontFamily: appTheme.fontFamily, paddingHorizontal: 20,
  },

  savingsItem: {
    backgroundColor: '#FFF7ED', borderRadius: 18, padding: 14,
    borderWidth: 1, borderColor: '#FFE1C2', marginBottom: 12,
  },
  savingsItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  statusPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { fontSize: 11, fontWeight: '800', fontFamily: appTheme.fontFamily },
  releaseDate: { fontSize: 10.5, color: '#6B7280', fontFamily: appTheme.fontFamily, fontWeight: '600' },

  savingsAmountRow: { flexDirection: 'row', alignItems: 'center' },
  savingsAmtLabel: { fontSize: 10.5, color: '#9A4D00', fontWeight: '700', fontFamily: appTheme.fontFamily },
  savingsAmtValue: { fontSize: 14, fontWeight: '800', color: '#111827', marginTop: 3, fontFamily: appTheme.fontFamily },
  savingsAmtReceive: { fontSize: 16, fontWeight: '900', color: '#C2410C', marginTop: 3, fontFamily: appTheme.fontFamily, textAlign: 'right' },

  timerSection: {
    marginTop: 12, padding: 12, borderRadius: 14,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#FFD3A7',
    flexDirection: 'row', alignItems: 'center',
  },
  timerLabel: { fontSize: 11, color: '#9A4D00', fontWeight: '700', fontFamily: appTheme.fontFamily, marginBottom: 8 },
  countdownWrap: { flexDirection: 'row', alignItems: 'center' },
  countdownBox: {
    width: 46, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFF7ED', borderRadius: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#FFD3A7',
  },
  countdownNum: { fontSize: 16, fontWeight: '900', color: '#C2410C', fontFamily: appTheme.fontFamily },
  countdownLbl: { fontSize: 9, color: '#9A4D00', fontWeight: '700', fontFamily: appTheme.fontFamily, marginTop: 2 },
  countdownSep: { fontSize: 16, fontWeight: '900', color: '#FF7A00', marginHorizontal: 4, marginTop: -8 },
  progressWrapVertical: { alignItems: 'center', marginLeft: 10 },
  progressPct: { fontSize: 13, fontWeight: '900', color: '#FF7A00', fontFamily: appTheme.fontFamily },
  progressBarOuter: { width: 70, height: 8, backgroundColor: '#FFE1C2', borderRadius: 999, overflow: 'hidden', marginTop: 6 },
  progressBarInner: { height: '100%', backgroundColor: '#FF7A00', borderRadius: 999 },

  readyBanner: {
    flexDirection: 'row', alignItems: 'center', marginTop: 12,
    backgroundColor: '#ECFDF5', borderRadius: 14, padding: 10,
    borderWidth: 1, borderColor: '#6EE7B7',
  },
  readyText: { fontSize: 12, fontWeight: '700', color: '#065F46', marginLeft: 8, flex: 1, fontFamily: appTheme.fontFamily, lineHeight: 18 },

  completedBanner: {
    flexDirection: 'row', alignItems: 'center', marginTop: 12,
    backgroundColor: '#EFF6FF', borderRadius: 14, padding: 10,
    borderWidth: 1, borderColor: '#93C5FD',
  },
  completedText: { fontSize: 12, fontWeight: '700', color: '#1E40AF', marginLeft: 8, flex: 1, fontFamily: appTheme.fontFamily },

  savingsActions: { marginTop: 12, alignItems: 'center' },
  settleButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch',
    backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 13,
    shadowColor: '#10B981', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 5,
  },
  settleButtonDisabled: { opacity: 0.7 },
  settleButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', fontFamily: appTheme.fontFamily },
  waitHint: { fontSize: 12, fontWeight: '700', color: '#9A4D00', fontFamily: appTheme.fontFamily, marginTop: 4 },
  completedPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    borderWidth: 1, borderColor: '#93C5FD',
  },
  completedPillText: { color: '#1E40AF', fontSize: 12, fontWeight: '800', fontFamily: appTheme.fontFamily, marginLeft: 4 },

  footer: { marginTop: 4, paddingHorizontal: 6 },
  footerText: {
    fontSize: 11, color: '#9CA3AF', lineHeight: 16,
    textAlign: 'center', fontFamily: appTheme.fontFamily, fontWeight: '500',
  },
});
