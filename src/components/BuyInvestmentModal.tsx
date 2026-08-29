import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { appTheme } from '../theme/appTheme';
import {
  getWallet,
  purchaseInvestment,
  PurchaseResult,
  normalizeMZNUnits,
} from '../services/finance';

type BuyInvestmentModalProps = {
  visible: boolean;
  item: {
    id: string;
    package_number?: number;
    name?: string;
    company?: string;
    exchange?: string;
    purchasePrice?: number;
    dailyProfit?: number;
    monthlyProfit?: number;
    minimumInvestment?: number;
    minimum_investment?: number;
    daily_profit?: number;
    monthly_profit?: number;
    description?: string;
  } | null;
  amount: number;
  onClose: () => void;
  onAmountChange?: (value: number) => void;
  onPurchaseSuccess?: (result: PurchaseResult) => void;
};

const DAILY_RATE = 3.5;

function formatMZN(value: number, refValue?: number): string {
  if (!isFinite(value)) return 'MZN 0,00';
  // Usa a mesma regra centralizada de finance.ts
  const num = normalizeMZNUnits(value, refValue);

  const fixed = (Math.round(num * 100) / 100).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `MZN ${intFormatted},${decPart}`;
}

function parseMZN(text: string): number {
  const digits = text.replace(/[^\d,]/g, '').replace(',', '.');
  const num = parseFloat(digits);
  return isFinite(num) ? num : 0;
}

// Formatação "inline" usada em "Rendimento do pacote: diário X • mensal Y"
// (sem prefixo "MZN" no meio do texto; equivalente a formatMZN sem o prefixo)
function fmtPlain(value: number, refValue?: number): string {
  const raw = formatMZN(value, refValue);
  return raw.replace(/^MZN\s*/i, '').trim();
}

export function BuyInvestmentModal({
  visible,
  item,
  amount,
  onClose,
  onAmountChange,
  onPurchaseSuccess,
}: BuyInvestmentModalProps) {
  const [localAmount, setLocalAmount] = useState<string>('');
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [availableBalance, setAvailableBalance] = useState<number>(0);
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [resultMessage, setResultMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (visible && amount > 0) {
      setLocalAmount(amount.toString());
      setResultMessage(null);
      loadWallet();
    }
  }, [visible, amount]);

  async function loadWallet() {
    setLoadingWallet(true);
    try {
      const wallet = await getWallet();
      if (wallet) {
        const balance = Number(wallet.balance ?? 0);
        setWalletBalance(balance);
        setAvailableBalance(balance);
      }
    } catch (_e) {
    } finally {
      setLoadingWallet(false);
    }
  }

  const packageNumber = item?.package_number ?? null;
  const packageName = item?.name ?? item?.company ?? 'Pacote de Investimento';
  const exchange = item?.exchange ?? 'ZORA';
  const displayName = packageNumber ? `N${packageNumber} - ${packageName}` : packageName;
  const minimumInvestment = Number(item?.minimumInvestment ?? item?.minimum_investment ?? 300);

  // REGRA UNIFICADA A):
  // packageDailyProfit = lucro diário ESTIMADO que o pacote gera
  // para o seu valor MÍNIMO.
  //
  // Se item.daily_profit já vem com um valor "multiplicado" (ex.: 3500 em
  // vez de 35,00) — problema de centavos — dividimos por 100 quando
  // claramente excede o valor esperado (i.e., daily_profit > minimum).
  const rawPackageDaily = Number(item?.dailyProfit ?? item?.daily_profit ?? 0);
  let packageDailyProfit: number;
  if (rawPackageDaily > 0) {
    // Se daily_profit vier maior que o próprio valor do pacote, é erro.
    const expectedAtLeast = minimumInvestment * 0.001; // 0.1% mínimo
    const expectedAtMost = minimumInvestment * 1; // 100% = impossível para 1 dia
    if (rawPackageDaily > expectedAtMost && rawPackageDaily % 100 === 0) {
      packageDailyProfit = rawPackageDaily / 100;
    } else {
      packageDailyProfit = rawPackageDaily;
    }
  } else {
    packageDailyProfit = minimumInvestment * DAILY_RATE / 100;
  }

  const rawPackageMonthly = Number(item?.monthlyProfit ?? item?.monthly_profit ?? 0);
  let packageMonthlyProfit: number;
  if (rawPackageMonthly > 0) {
    const expectedAtMostMonthly = packageDailyProfit * 60; // limite tolerado
    if (rawPackageMonthly > expectedAtMostMonthly && rawPackageMonthly % 100 === 0) {
      packageMonthlyProfit = rawPackageMonthly / 100;
    } else {
      packageMonthlyProfit = rawPackageMonthly;
    }
  } else {
    packageMonthlyProfit = packageDailyProfit * 30;
  }

  const numericAmount = useMemo(() => {
    const fromText = parseMZN(localAmount);
    return fromText > 0 ? fromText : amount;
  }, [localAmount, amount]);

  const dailyProfit = numericAmount * DAILY_RATE / 100;
  const monthlyProfit = dailyProfit * 30;

  const hasSufficientBalance = availableBalance >= numericAmount && numericAmount > 0;
  const meetsMinimum = numericAmount >= minimumInvestment;
  const canConfirm = hasSufficientBalance && meetsMinimum && !purchasing && item?.id != null;

  const handleAmountChange = (text: string) => {
    setLocalAmount(text);
    const parsed = parseMZN(text);
    if (onAmountChange && parsed > 0) {
      onAmountChange(parsed);
    }
  };

  const quickValues = useMemo(() => {
    const base = minimumInvestment;
    return [base, base * 2, base * 5, base * 10].filter((v, i, arr) => i === arr.indexOf(v));
  }, [minimumInvestment]);

  async function handleConfirm() {
    if (!item?.id) return;
    if (!meetsMinimum) {
      Alert.alert('Valor abaixo do mínimo', `O investimento mínimo para este pacote é ${formatMZN(minimumInvestment)}.`);
      return;
    }
    if (!hasSufficientBalance) {
      setResultMessage({
        type: 'error',
        text: `Saldo insuficiente. Disponível: ${formatMZN(availableBalance)}`,
      });
      return;
    }

    setPurchasing(true);
    setResultMessage(null);
    try {
      const result = await purchaseInvestment(item.id, numericAmount);
      if (result.success) {
        setResultMessage({
          type: 'success',
          text: result.message || 'Investimento realizado com sucesso!',
        });
        if (result.newBalance != null) {
          const balance = Number(result.newBalance);
          setWalletBalance(balance);
          setAvailableBalance(balance);
        }
        if (onPurchaseSuccess) {
          setTimeout(() => onPurchaseSuccess(result), 900);
        }
        setTimeout(() => {
          onClose();
        }, 1400);
      } else {
        setResultMessage({
          type: 'error',
          text: result.message || 'Não foi possível concluir o investimento.',
        });
      }
    } catch (_e) {
      setResultMessage({
        type: 'error',
        text: 'Erro de conexão. Tente novamente.',
      });
    } finally {
      setPurchasing(false);
    }
  }

  if (!item) return null;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
      >
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <LinearGradient
              colors={['#FF6A2B', '#FF8C3A', '#FFB04C']}
              start={[0, 0]}
              end={[1, 1]}
              style={styles.headerGradient}
            >
              <View style={styles.headerTopRow}>
                <View style={styles.iconPill}>
                  <MaterialCommunityIcons name="cash-multiple" size={20} color="#FFF" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.headerTitle} numberOfLines={1}>{displayName}</Text>
                  <Text style={styles.headerSubtitle} numberOfLines={1}>{exchange} • Mínimo {formatMZN(minimumInvestment)}</Text>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeButton} activeOpacity={0.8}>
                  <Ionicons name="close" size={18} color="#FFF" />
                </TouchableOpacity>
              </View>

              <View style={styles.balanceRow}>
                <View style={styles.balanceBox}>
                  <Text style={styles.balanceLabel}>Saldo principal</Text>
                  <Text style={styles.balanceValue}>
                    {loadingWallet ? '...' : formatMZN(walletBalance)}
                  </Text>
                </View>
                <View style={[styles.balanceBox, styles.balanceBoxAccent]}>
                  <Text style={styles.balanceLabelAccent}>Disponível</Text>
                  <Text style={styles.balanceValueAccent}>
                    {loadingWallet ? '...' : formatMZN(availableBalance)}
                  </Text>
                </View>
              </View>
            </LinearGradient>

            <ScrollView
              style={styles.scrollArea}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              <View style={styles.sectionCard}>
                <Text style={styles.sectionLabel}>Valor a investir</Text>
                <View style={[
                  styles.amountInputWrap,
                  !hasSufficientBalance && numericAmount > 0 ? styles.amountInputWrapError : null,
                  !meetsMinimum && numericAmount > 0 ? styles.amountInputWrapWarn : null,
                ]}>
                  <Text style={styles.amountCurrencySymbol}>MZN</Text>
                  <TextInput
                    style={styles.amountInput}
                    value={localAmount}
                    onChangeText={handleAmountChange}
                    placeholder={minimumInvestment.toString()}
                    placeholderTextColor="#9CA3AF"
                    keyboardType="decimal-pad"
                    editable={!purchasing}
                  />
                </View>

                <View style={styles.quickRow}>
                  {quickValues.map((v) => (
                    <TouchableOpacity
                      key={v}
                      style={[
                        styles.quickChip,
                        parseMZN(localAmount) === v || (amount === v && !localAmount) ? styles.quickChipActive : null,
                      ]}
                      onPress={() => handleAmountChange(v.toString())}
                      disabled={purchasing}
                      activeOpacity={0.85}
                    >
                      <Text style={[
                        styles.quickChipText,
                        (parseMZN(localAmount) === v || (amount === v && !localAmount)) ? styles.quickChipTextActive : null,
                      ]}>
                        {v.toLocaleString()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {!meetsMinimum && numericAmount > 0 ? (
                  <View style={styles.hintRowWarn}>
                    <Ionicons name="warning" size={14} color="#B45309" />
                    <Text style={styles.hintTextWarn}>
                      Valor mínimo do pacote: {formatMZN(minimumInvestment)}
                    </Text>
                  </View>
                ) : null}

                {!hasSufficientBalance && numericAmount > 0 ? (
                  <View style={styles.hintRowError}>
                    <Ionicons name="alert-circle" size={14} color="#B91C1C" />
                    <Text style={styles.hintTextError}>
                      Saldo insuficiente. Disponível: {formatMZN(availableBalance)}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionLabel}>Retorno estimado</Text>
                <View style={styles.profitGrid}>
                  <View style={styles.profitBlock}>
                    <Text style={styles.profitLabel}>Diário ({DAILY_RATE}%)</Text>
                    <Text style={styles.profitValuePositive}>+{fmtPlain(dailyProfit)}</Text>
                  </View>
                  <View style={styles.profitBlock}>
                    <Text style={styles.profitLabel}>Mensal</Text>
                    <Text style={styles.profitValuePositive}>+{fmtPlain(monthlyProfit)}</Text>
                  </View>
                </View>
                <View style={styles.packageDivider} />
                <View style={styles.packageRow}>
                  <MaterialCommunityIcons name="chart-timeline-variant" size={16} color="#FF6A2B" />
                  <Text style={styles.packageInfoText}>
                    Rendimento do pacote: diário {fmtPlain(packageDailyProfit)} • mensal {fmtPlain(packageMonthlyProfit)}
                  </Text>
                </View>
              </View>

              {resultMessage ? (
                <View style={[
                  styles.resultBanner,
                  resultMessage.type === 'success' ? styles.resultBannerSuccess : styles.resultBannerError,
                ]}>
                  <Ionicons
                    name={resultMessage.type === 'success' ? 'checkmark-circle' : 'close-circle'}
                    size={18}
                    color={resultMessage.type === 'success' ? '#065F46' : '#7F1D1D'}
                  />
                  <Text style={[
                    styles.resultText,
                    resultMessage.type === 'success' ? styles.resultTextSuccess : styles.resultTextError,
                  ]} numberOfLines={2}>
                    {resultMessage.text}
                  </Text>
                </View>
              ) : null}

              <View style={{ height: 4 }} />
            </ScrollView>

            <View style={styles.footerActions}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={onClose}
                disabled={purchasing}
                activeOpacity={0.85}
              >
                <Text style={styles.secondaryText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, !canConfirm && styles.primaryButtonDisabled]}
                onPress={handleConfirm}
                disabled={!canConfirm}
                activeOpacity={0.85}
              >
                {purchasing ? (
                  <>
                    <ActivityIndicator color="#FFF" size="small" style={{ marginRight: 8 }} />
                    <Text style={styles.primaryText}>A processar...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="checkmark-done-circle-outline" size={16} color="#FFF" />
                    <Text style={[styles.primaryText, { marginLeft: 6 }]}>Confirmar investimento</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.55)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingBottom: Platform.OS === 'ios' ? 34 : 18,
    maxHeight: '100%',
    minHeight: '85%',
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    flexDirection: 'column',
  },
  scrollArea: { flex: 1, minHeight: 0 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
  },
  headerGradient: {
    paddingTop: 18,
    paddingBottom: 18,
    paddingHorizontal: 16,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  headerTopRow: { flexDirection: 'row', alignItems: 'center' },
  iconPill: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#FFF', fontFamily: appTheme.fontFamily },
  headerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.92)', marginTop: 2, fontFamily: appTheme.fontFamily },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  balanceRow: { flexDirection: 'row', marginTop: 14 },
  balanceBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    marginRight: 10,
  },
  balanceBoxAccent: {
    backgroundColor: '#FFFFFF',
    marginRight: 0,
  },
  balanceLabel: { fontSize: 11, color: 'rgba(255,255,255,0.90)', fontWeight: '600', fontFamily: appTheme.fontFamily },
  balanceValue: { fontSize: 14, fontWeight: '800', color: '#FFF', marginTop: 4, fontFamily: appTheme.fontFamily },
  balanceLabelAccent: { fontSize: 11, color: '#9A4D00', fontWeight: '700', fontFamily: appTheme.fontFamily },
  balanceValueAccent: { fontSize: 14, fontWeight: '800', color: '#C2410C', marginTop: 4, fontFamily: appTheme.fontFamily },

  sectionCard: {
    backgroundColor: '#FFF7ED',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FFE1C2',
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9A4D00',
    marginBottom: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    fontFamily: appTheme.fontFamily,
  },
  amountInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.4,
    borderColor: '#FFD3A7',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  amountInputWrapError: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  amountInputWrapWarn: { borderColor: '#FCD34D', backgroundColor: '#FFFBEB' },
  amountCurrencySymbol: {
    color: '#FF6A2B',
    fontWeight: '800',
    fontSize: 14,
    marginRight: 8,
    fontFamily: appTheme.fontFamily,
  },
  amountInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
    padding: 0,
  },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FFD3A7',
    marginRight: 8,
    marginBottom: 6,
  },
  quickChipActive: { backgroundColor: '#FF6A2B', borderColor: '#FF6A2B' },
  quickChipText: { fontSize: 12, fontWeight: '700', color: '#C2410C', fontFamily: appTheme.fontFamily },
  quickChipTextActive: { color: '#FFF' },

  hintRowWarn: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  hintTextWarn: { fontSize: 12, fontWeight: '600', color: '#B45309', marginLeft: 6, fontFamily: appTheme.fontFamily },
  hintRowError: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  hintTextError: { fontSize: 12, fontWeight: '600', color: '#B91C1C', marginLeft: 6, fontFamily: appTheme.fontFamily },

  profitGrid: { flexDirection: 'row' },
  profitBlock: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, marginRight: 8 },
  profitLabel: { fontSize: 11, color: '#9A4D00', fontWeight: '600', fontFamily: appTheme.fontFamily },
  profitValuePositive: { fontSize: 14, fontWeight: '800', color: '#16A34A', marginTop: 4, fontFamily: appTheme.fontFamily },
  packageDivider: { height: 1, backgroundColor: '#FFE1C2', marginVertical: 12 },
  packageRow: { flexDirection: 'row', alignItems: 'center' },
  packageInfoText: { fontSize: 12, color: '#7C2D12', fontWeight: '600', marginLeft: 6, fontFamily: appTheme.fontFamily, flex: 1 },

  resultBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  resultBannerSuccess: { backgroundColor: '#ECFDF5', borderColor: '#6EE7B7' },
  resultBannerError: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  resultText: { flex: 1, fontSize: 13, fontWeight: '700', marginLeft: 8, fontFamily: appTheme.fontFamily },
  resultTextSuccess: { color: '#065F46' },
  resultTextError: { color: '#7F1D1D' },

  footerActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 6 : 2,
    marginTop: 0,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    marginRight: 10,
  },
  secondaryText: { color: '#111827', fontWeight: '700', fontFamily: appTheme.fontFamily },
  primaryButton: {
    flex: 1.5,
    flexDirection: 'row',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6A2B',
    shadowColor: '#FF6A2B',
    shadowOpacity: 0.32,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  primaryButtonDisabled: { opacity: 0.55 },
  primaryText: { color: '#FFF', fontWeight: '800', fontFamily: appTheme.fontFamily },
});
