import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { appTheme } from '../theme/appTheme';
import {
  WithdrawalRow,
  getPendingWithdrawals,
  getAllWithdrawals,
  adminApproveWithdrawal,
  adminRejectWithdrawal,
  fmtMZN,
  fmtDateTime,
} from '../services/admin';
import { backend } from '../services/backendClient';
import { invalidateFinanceCache } from '../services/finance';

const ZORA_ORANGE = '#FF6A2B';
const ZORA_GREEN = '#16A34A';
const ZORA_RED = '#DC2626';
const ZORA_BLUE = '#2563EB';
const BG = '#FFF8F3';

type FilterKey = 'all' | 'pending' | 'approved' | 'rejected' | 'paid';

const FILTERS: { key: FilterKey; label: string; icon: any }[] = [
  { key: 'all', label: 'Todos', icon: 'layers-outline' },
  { key: 'pending', label: 'Pendentes', icon: 'time-outline' },
  { key: 'approved', label: 'Aprovados', icon: 'checkmark-circle-outline' },
  { key: 'rejected', label: 'Rejeitados', icon: 'close-circle-outline' },
  { key: 'paid', label: 'Pagos', icon: 'card-outline' },
];

function statusStyle(s: string) {
  switch (s) {
    case 'pending':
      return { label: 'Pendente', color: '#92400E', bg: '#FEF3C7', border: '#FDE68A', icon: 'time-outline' };
    case 'approved':
      return { label: 'Aprovado', color: '#166534', bg: '#DCFCE7', border: '#BBF7D0', icon: 'checkmark-circle-outline' };
    case 'rejected':
      return { label: 'Rejeitado', color: '#991B1B', bg: '#FEE2E2', border: '#FECACA', icon: 'close-circle-outline' };
    case 'paid':
      return { label: 'Pago', color: '#1E40AF', bg: '#DBEAFE', border: '#BFDBFE', icon: 'card-outline' };
    case 'cancelled':
      return { label: 'Cancelado', color: '#374151', bg: '#F3F4F6', border: '#E5E7EB', icon: 'remove-circle-outline' };
    default:
      return { label: s || '-', color: '#374151', bg: '#F3F4F6', border: '#E5E7EB', icon: 'ellipse-outline' };
  }
}

function methodIcon(method: string): any {
  const m = (method || '').toLowerCase();
  if (m.includes('mpesa') || m.includes('m-pesa')) return 'cash-outline';
  if (m.includes('emola') || m.includes('e-mola')) return 'wallet-outline';
  if (m.includes('mkesh') || m.includes('m-kesh')) return 'card-outline';
  if (m.includes('banco') || m.includes('bank')) return 'business-outline';
  return 'cash-outline';
}

function methodColor(method: string): { bg: string; color: string; border: string } {
  const m = (method || '').toLowerCase();
  if (m.includes('mpesa') || m.includes('m-pesa')) return { bg: '#ECFDF5', color: '#059669', border: '#A7F3D0' };
  if (m.includes('emola') || m.includes('e-mola')) return { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' };
  if (m.includes('mkesh') || m.includes('m-kesh')) return { bg: '#EEF2FF', color: '#4338CA', border: '#C7D2FE' };
  if (m.includes('banco') || m.includes('bank')) return { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' };
  return { bg: '#F3F4F6', color: '#4B5563', border: '#E5E7EB' };
}

export function AdminWithdrawalsScreen() {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [filter, setFilter] = useState<FilterKey>('pending');

  const loadData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const filterArg: any = filter === 'all' ? 'all' : filter;
      const [pendingList, filtered] = await Promise.all([
        getPendingWithdrawals(),
        getAllWithdrawals(filterArg),
      ]);
      setPendingCount(pendingList.length);
      setWithdrawals(filtered || []);
    } catch (err: any) {
      console.error('Erro ao carregar saques:', err);
      Alert.alert('Erro', err?.message || 'Não foi possível carregar os saques.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  const adminWithChannelRef = useRef<any>(null);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    let isMounted = true;

    const setupRealtime = async () => {
      try {
        if (adminWithChannelRef.current) {
          try { backend.removeChannel(adminWithChannelRef.current); } catch {}
        }
        const ch = backend.channel('admin_withdrawals_global');
        const handleChange = async () => {
          if (!isMounted) return;
          try {
            invalidateFinanceCache();
            await loadData(true);
          } catch {}
        };
        ch.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'withdrawals' },
          handleChange
        );
        ch.subscribe();
        adminWithChannelRef.current = ch;
      } catch {}
    };

    setupRealtime();

    const handleAppState = (next: any) => {
      if (next === 'active' && isMounted) setupRealtime();
    };
    const sub = AppState.addEventListener('change', handleAppState);

    return () => {
      isMounted = false;
      try { sub.remove(); } catch {}
      if (adminWithChannelRef.current) {
        try { adminWithChannelRef.current.unsubscribe(); } catch {}
        try { backend.removeChannel(adminWithChannelRef.current); } catch {}
        adminWithChannelRef.current = null;
      }
    };
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData(true);
  };

  const handleApprove = async (w: WithdrawalRow) => {
    Alert.alert(
      'Confirmar aprovação e pagamento',
      `Confirma APROVAR e marcar como pago este saque?\n\n` +
        `• Valor saque (a enviar ao cliente): ${fmtMZN(w.amount)}\n` +
        `• Taxa (fica retida): ${fmtMZN(w.fee)}\n` +
        `• Total debitado da conta (já bloqueado): ${fmtMZN(w.total_deducted)}\n\n` +
        `Método de envio: ${w.withdrawal_method}\n` +
        `Contacto do destinatário: ${w.contact}\n\n` +
        `⚠️ Importante: Você DEVE enviar manualmente ${fmtMZN(w.amount)} para ${w.contact} via ${w.withdrawal_method}.\n` +
        `Após confirmar, o montante total debitado ${fmtMZN(w.total_deducted)} fica definitivamente descontado (apenas desbloqueia).`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sim, aprovar e marcar pago',
          style: 'destructive',
          onPress: async () => {
            setActionLoadingId(w.id);
            try {
              const res = await adminApproveWithdrawal(w.id);
              if (res?.success) {
                Alert.alert('Sucesso', res.message || 'Saque aprovado e marcado como pago.');
                await loadData(true);
              } else {
                Alert.alert('Erro', res?.message || 'Não foi possível aprovar.');
              }
            } catch (err: any) {
              Alert.alert('Erro', err?.message || 'Erro de conexão.');
            } finally {
              setActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  const handleReject = async (w: WithdrawalRow) => {
    const clientName = w.full_name || 'o cliente';
    Alert.alert(
      'Confirmar rejeição e devolução',
      `Confirma REJEITAR este saque?\n\n` +
        `• Cliente: ${clientName}${w.phone_number ? ` (${w.phone_number})` : ''}\n` +
        `• Valor saque: ${fmtMZN(w.amount)}\n` +
        `• Taxa: ${fmtMZN(w.fee)}\n` +
        `• Total debitado (a DEVOLVER): ${fmtMZN(w.total_deducted)}\n\n` +
        `⚠️ Ao rejeitar, o montante TOTAL debitado ${fmtMZN(w.total_deducted)} será DEVOLVIDO INTEGRALMENTE ao saldo disponível de ${clientName}.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sim, rejeitar e devolver',
          style: 'destructive',
          onPress: async () => {
            setActionLoadingId(w.id);
            try {
              const res = await adminRejectWithdrawal(w.id);
              if (res?.success) {
                Alert.alert(
                  'Valor devolvido',
                  res.message || `Saque rejeitado. ${fmtMZN(w.total_deducted)} devolvido ao cliente.`
                );
                await loadData(true);
              } else {
                Alert.alert('Erro', res?.message || 'Não foi possível rejeitar.');
              }
            } catch (err: any) {
              Alert.alert('Erro', err?.message || 'Erro de conexão.');
            } finally {
              setActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  const renderCard = (w: WithdrawalRow) => {
    const s = statusStyle(w.status);
    const mc = methodColor(w.withdrawal_method);
    const isPending = w.status === 'pending';
    const isActionLoading = actionLoadingId === w.id;
    const clientName = w.full_name || 'Cliente sem nome';
    const clientPhone = w.phone_number || '—';

    return (
      <View key={w.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.clientInfo}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(clientName || 'C')[0].toUpperCase()}</Text>
            </View>
            <View style={styles.clientTextBlock}>
              <Text style={styles.clientName} numberOfLines={1}>{clientName}</Text>
              <View style={styles.phoneRow}>
                <Ionicons name="call-outline" size={12} color="#6B7280" />
                <Text style={styles.clientPhone}>{clientPhone}</Text>
              </View>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: s.bg, borderColor: s.border }]}>
            <Ionicons name={s.icon as never} size={12} color={s.color} />
            <Text style={[styles.statusBadgeText, { color: s.color }]}>{s.label}</Text>
          </View>
        </View>

        <View style={styles.amountsGrid}>
          <View style={styles.amountCell}>
            <Text style={styles.amountLabel}>Valor saque</Text>
            <Text style={[styles.amountValue, styles.amountGreen]}>{fmtMZN(w.amount)}</Text>
            <Text style={styles.amountHint}>↗ Enviar ao cliente</Text>
          </View>
          <View style={styles.amountDivider} />
          <View style={styles.amountCell}>
            <Text style={styles.amountLabel}>Taxa</Text>
            <Text style={[styles.amountValue, styles.amountOrange]}>{fmtMZN(w.fee)}</Text>
            <Text style={styles.amountHint}>Retida Zora</Text>
          </View>
          <View style={styles.amountDivider} />
          <View style={styles.amountCell}>
            <Text style={styles.amountLabel}>Total debitado</Text>
            <Text style={[styles.amountValue, styles.amountRed, styles.amountBold]}>{fmtMZN(w.total_deducted)}</Text>
            <Text style={styles.amountHint}>Bloqueado na conta</Text>
          </View>
        </View>

        <View style={styles.methodBox}>
          <View style={[styles.methodIconBox, { backgroundColor: mc.bg, borderColor: mc.border }]}>
            <Ionicons name={methodIcon(w.withdrawal_method) as never} size={18} color={mc.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.methodLabel}>Método de envio</Text>
            <Text style={[styles.methodName, { color: mc.color }]}>{w.withdrawal_method || '—'}</Text>
          </View>
          <View style={styles.contactBox}>
            <Text style={styles.contactLabel}>Contacto destinatário</Text>
            <View style={styles.contactRow}>
              <Ionicons name="send-outline" size={13} color={ZORA_ORANGE} />
              <Text style={styles.contactValue}>{w.contact || '—'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={13} color="#6B7280" />
            <Text style={styles.metaText}>Criado: {fmtDateTime(w.created_at)}</Text>
          </View>
          {w.reviewed_at ? (
            <View style={styles.metaItem}>
              <Ionicons name="checkmark-done-outline" size={13} color="#6B7280" />
              <Text style={styles.metaText}>Revisto: {fmtDateTime(w.reviewed_at)}</Text>
            </View>
          ) : null}
        </View>

        {w.admin_notes ? (
          <View style={styles.notesBox}>
            <Ionicons name="document-text-outline" size={13} color="#6B7280" />
            <Text style={styles.notesText}>{w.admin_notes}</Text>
          </View>
        ) : null}

        {isPending ? (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.approveBtn, isActionLoading && styles.btnDisabled]}
              activeOpacity={0.8}
              onPress={() => handleApprove(w)}
              disabled={isActionLoading}
            >
              {isActionLoading ? (
                <ActivityIndicator color="#FFF" size="small" style={{ marginRight: 8 }} />
              ) : (
                <Ionicons name="checkmark" size={16} color="#FFF" style={{ marginRight: 8 }} />
              )}
              <Text style={styles.approveBtnText}>Marcar como pago / Aprovar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.rejectBtn, isActionLoading && styles.btnDisabled]}
              activeOpacity={0.8}
              onPress={() => handleReject(w)}
              disabled={isActionLoading}
            >
              {isActionLoading ? (
                <ActivityIndicator color={ZORA_RED} size="small" style={{ marginRight: 8 }} />
              ) : (
                <Ionicons name="arrow-undo-outline" size={16} color={ZORA_RED} style={{ marginRight: 8 }} />
              )}
              <Text style={styles.rejectBtnText}>Rejeitar e devolver</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          activeOpacity={0.7}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerTitleBlock}>
          <Text style={styles.headerTitle}>Saques</Text>
          <Text style={styles.headerSubtitle}>Gestão de pedidos de levantamento</Text>
        </View>
        {pendingCount > 0 ? (
          <View style={styles.pendingBadge}>
            <Ionicons name="time-outline" size={12} color="#FFF" />
            <Text style={styles.pendingBadgeText}>{pendingCount}</Text>
          </View>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[ZORA_ORANGE]}
            tintColor={ZORA_ORANGE}
          />
        }
      >
        <View style={styles.tipBox}>
          <View style={styles.tipIconBox}>
            <Ionicons name="information-circle-outline" size={18} color={ZORA_ORANGE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.tipTitle}>Lembre-se</Text>
            <Text style={styles.tipText}>
              Ao <Text style={styles.tipBold}>aprovar</Text>, você deve enviar o valor manualmente ao cliente.{'\n'}
              Ao <Text style={styles.tipBold}>rejeitar</Text>, o sistema devolve o saldo automaticamente ao cliente.
            </Text>
          </View>
        </View>

        <View style={styles.filtersRow}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const pendingBubble = f.key === 'pending' && pendingCount > 0;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                activeOpacity={0.8}
                onPress={() => setFilter(f.key)}
              >
                <Ionicons
                  name={f.icon as never}
                  size={14}
                  color={active ? '#FFF' : '#6B7280'}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {f.label}
                </Text>
                {pendingBubble ? (
                  <View style={styles.filterBubble}>
                    <Text style={styles.filterBubbleText}>{pendingCount}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={ZORA_ORANGE} />
            <Text style={styles.loadingText}>A carregar saques...</Text>
          </View>
        ) : withdrawals.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="file-tray-outline" size={42} color="#D1D5DB" />
            </View>
            <Text style={styles.emptyTitle}>
              {filter === 'all' ? 'Nenhum saque encontrado' : `Sem saques ${FILTERS.find((x) => x.key === filter)?.label.toLowerCase()}`}
            </Text>
            <Text style={styles.emptySubtitle}>
              Puxe para atualizar ou altere o filtro.
            </Text>
            <TouchableOpacity
              style={styles.emptyRefreshBtn}
              activeOpacity={0.8}
              onPress={onRefresh}
            >
              <Ionicons name="refresh" size={14} color={ZORA_ORANGE} style={{ marginRight: 6 }} />
              <Text style={styles.emptyRefreshText}>Atualizar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.listWrap}>
            {withdrawals.map(renderCard)}
            <Text style={styles.listFooter}>
              {withdrawals.length} {withdrawals.length === 1 ? 'saque encontrado' : 'saques encontrados'}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: BG,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFE4D0',
    shadowColor: appTheme.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  headerTitleBlock: { flex: 1, alignItems: 'center', marginHorizontal: 8 },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 11.5,
    color: '#6B7280',
    fontFamily: appTheme.fontFamily,
    marginTop: 2,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ZORA_ORANGE,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    minWidth: 36,
    justifyContent: 'center',
    shadowColor: ZORA_ORANGE,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  pendingBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '900',
    fontFamily: appTheme.fontFamily,
    marginLeft: 3,
  },

  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 60 },

  tipBox: {
    flexDirection: 'row',
    backgroundColor: '#FFF7ED',
    borderRadius: 20,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFE0C2',
  },
  tipIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  tipTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#9A4D00',
    fontFamily: appTheme.fontFamily,
    marginBottom: 3,
  },
  tipText: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 17,
    fontFamily: appTheme.fontFamily,
    fontWeight: '500',
  },
  tipBold: { fontWeight: '800' },

  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#FFE4D0',
  },
  filterChipActive: {
    backgroundColor: ZORA_ORANGE,
    borderColor: ZORA_ORANGE,
    shadowColor: ZORA_ORANGE,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    fontFamily: appTheme.fontFamily,
  },
  filterChipTextActive: { color: '#FFFFFF' },
  filterBubble: {
    backgroundColor: '#FFF',
    minWidth: 20,
    height: 18,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    marginLeft: 6,
  },
  filterBubbleText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: ZORA_ORANGE,
    fontFamily: appTheme.fontFamily,
  },

  loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  loadingText: {
    marginTop: 14,
    color: '#6B7280',
    fontSize: 13,
    fontFamily: appTheme.fontFamily,
    fontWeight: '600',
  },

  emptyBox: { alignItems: 'center', paddingVertical: 70 },
  emptyIconWrap: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFE4D0',
    marginBottom: 18,
    shadowColor: appTheme.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
    textAlign: 'center',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 12.5,
    color: '#6B7280',
    fontFamily: appTheme.fontFamily,
    textAlign: 'center',
    marginBottom: 18,
    maxWidth: '85%',
  },
  emptyRefreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FFE0C2',
  },
  emptyRefreshText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: ZORA_ORANGE,
    fontFamily: appTheme.fontFamily,
  },

  listWrap: { gap: 14 },
  listFooter: {
    textAlign: 'center',
    marginTop: 8,
    color: '#9CA3AF',
    fontSize: 11.5,
    fontWeight: '600',
    fontFamily: appTheme.fontFamily,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FFE4D0',
    shadowColor: appTheme.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  clientInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ZORA_ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '900',
    fontFamily: appTheme.fontFamily,
  },
  clientTextBlock: { flex: 1, minWidth: 0 },
  clientName: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
    marginBottom: 3,
  },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  clientPhone: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: appTheme.fontFamily,
    fontWeight: '500',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5.5,
    borderRadius: 999,
    borderWidth: 1,
    gap: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: appTheme.fontFamily,
  },

  amountsGrid: {
    flexDirection: 'row',
    backgroundColor: '#FFFBF7',
    borderRadius: 18,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FFEAD7',
  },
  amountCell: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  amountDivider: { width: 1, backgroundColor: '#FFE4D0', marginVertical: 4 },
  amountLabel: {
    fontSize: 10.5,
    color: '#6B7280',
    fontWeight: '700',
    fontFamily: appTheme.fontFamily,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  amountValue: {
    fontSize: 13.5,
    fontWeight: '800',
    fontFamily: appTheme.fontFamily,
    marginBottom: 3,
  },
  amountGreen: { color: ZORA_GREEN },
  amountOrange: { color: ZORA_ORANGE },
  amountRed: { color: ZORA_RED },
  amountBold: { fontWeight: '900' },
  amountHint: {
    fontSize: 9.5,
    color: '#9CA3AF',
    fontWeight: '600',
    fontFamily: appTheme.fontFamily,
    textAlign: 'center',
  },

  methodBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  methodIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
  },
  methodLabel: {
    fontSize: 10.5,
    color: '#6B7280',
    fontWeight: '700',
    fontFamily: appTheme.fontFamily,
    marginBottom: 2,
  },
  methodName: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: appTheme.fontFamily,
  },
  contactBox: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  contactLabel: {
    fontSize: 10.5,
    color: '#6B7280',
    fontWeight: '700',
    fontFamily: appTheme.fontFamily,
    marginBottom: 3,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFE0C2',
    gap: 5,
  },
  contactValue: {
    fontSize: 12.5,
    fontWeight: '800',
    color: ZORA_ORANGE,
    fontFamily: appTheme.fontFamily,
    letterSpacing: 0.2,
  },

  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  } as any,
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
    fontFamily: appTheme.fontFamily,
  },
  notesBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF9C3',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    gap: 6,
  },
  notesText: {
    flex: 1,
    fontSize: 11.5,
    color: '#854D0E',
    fontWeight: '600',
    fontFamily: appTheme.fontFamily,
    lineHeight: 16,
  },

  actionRow: {
    flexDirection: 'column',
    gap: 8,
    marginTop: 4,
  },
  approveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ZORA_GREEN,
    paddingVertical: 13,
    borderRadius: 16,
    shadowColor: ZORA_GREEN,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  approveBtnText: {
    color: '#FFF',
    fontSize: 13.5,
    fontWeight: '800',
    fontFamily: appTheme.fontFamily,
  },
  rejectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  rejectBtnText: {
    color: ZORA_RED,
    fontSize: 13,
    fontWeight: '800',
    fontFamily: appTheme.fontFamily,
  },
  btnDisabled: { opacity: 0.6 },
});
