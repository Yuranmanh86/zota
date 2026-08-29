import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
  getAllDeposits,
  getPendingDeposits,
  adminApproveDeposit,
  adminRejectDeposit,
  fmtMZN,
  fmtDateTime,
  type DepositRow,
} from '../services/admin';
import { copyToClipboard } from '../services/referrals';
import { shadow } from '../theme/appTheme';
import { backend } from '../services/backendClient';
import { invalidateFinanceCache } from '../services/finance';

const ZORA_ORANGE = '#FF6A2B';
const ZORA_GREEN = '#16A34A';
const ZORA_RED = '#DC2626';
const ZORA_BLUE = '#2563EB';
const ZORA_ORANGE_LIGHT = 'rgba(255, 106, 43, 0.10)';
const ZORA_GREEN_LIGHT = 'rgba(22, 163, 74, 0.10)';
const ZORA_RED_LIGHT = 'rgba(220, 38, 38, 0.10)';
const ZORA_YELLOW_LIGHT = 'rgba(250, 204, 21, 0.15)';

type FilterKey = 'all' | 'pending' | 'approved' | 'rejected';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'pending', label: 'Pendentes' },
  { key: 'approved', label: 'Aprovados' },
  { key: 'rejected', label: 'Rejeitados' },
];

export function AdminDepositsScreen() {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('pending');
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadData = useCallback(async (forceFresh = false) => {
    try {
      const [pendingList, filtered] = await Promise.all([
        getPendingDeposits().catch(() => []),
        filter === 'pending'
          ? Promise.resolve(null)
          : getAllDeposits(filter === 'all' ? undefined : filter).catch(() => []),
      ]);

      setPendingCount(pendingList.length);

      if (filter === 'pending') {
        setDeposits(pendingList);
      } else if (Array.isArray(filtered)) {
        setDeposits(filtered);
      }
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Não foi possível carregar os depósitos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  const adminDepChannelRef = useRef<any>(null);

  useEffect(() => {
    setLoading(true);
    loadData(true);
  }, [loadData]);

  useEffect(() => {
    let isMounted = true;

    const setupRealtime = async () => {
      try {
        if (adminDepChannelRef.current) {
          try { backend.removeChannel(adminDepChannelRef.current); } catch {}
        }
        const ch = backend.channel('admin_deposits_global');
        const handleChange = async () => {
          if (!isMounted) return;
          try {
            invalidateFinanceCache();
            await loadData(true);
          } catch {}
        };
        ch.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'deposits' },
          handleChange
        );
        ch.subscribe();
        adminDepChannelRef.current = ch;
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
      if (adminDepChannelRef.current) {
        try { adminDepChannelRef.current.unsubscribe(); } catch {}
        try { backend.removeChannel(adminDepChannelRef.current); } catch {}
        adminDepChannelRef.current = null;
      }
    };
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData(true);
  };

  const flashCopied = (key: string) => {
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1600);
  };

  const handleCopy = async (text: string, key: string) => {
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) {
      flashCopied(key);
    } else {
      Alert.alert('Erro', 'Não foi possível copiar.');
    }
  };

  const pendingTotalToday = useMemo(() => {
    if (filter !== 'pending') return 0;
    return deposits.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  }, [filter, deposits]);

  const handleApprove = (row: DepositRow) => {
    Alert.alert(
      'Confirmar aprovação',
      `Deseja APROVAR o depósito de ${fmtMZN(row.amount)} para ${row.full_name || 'Cliente'}?\n\nEsta ação creditará o valor na carteira do utilizador.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sim, aprovar',
          style: 'default',
          onPress: async () => {
            setActionLoadingId(row.id);
            try {
              const r = await adminApproveDeposit(row.id);
              if (r.success) {
                Alert.alert('Sucesso', r.message);
                await loadData(true);
              } else {
                Alert.alert('Aviso', r.message);
              }
            } catch (e: any) {
              Alert.alert('Erro', e?.message || 'Erro ao aprovar depósito.');
            } finally {
              setActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  const handleReject = (row: DepositRow) => {
    Alert.alert(
      'Confirmar rejeição',
      `Deseja REJEITAR o depósito de ${fmtMZN(row.amount)} de ${row.full_name || 'Cliente'}?\n\nEsta ação não creditará valor e o depósito ficará marcado como rejeitado.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sim, rejeitar',
          style: 'destructive',
          onPress: async () => {
            setActionLoadingId(row.id);
            try {
              const r = await adminRejectDeposit(row.id);
              if (r.success) {
                Alert.alert('Sucesso', r.message);
                await loadData(true);
              } else {
                Alert.alert('Aviso', r.message);
              }
            } catch (e: any) {
              Alert.alert('Erro', e?.message || 'Erro ao rejeitar depósito.');
            } finally {
              setActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Depósitos</Text>
          {pendingCount > 0 && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>{pendingCount}</Text>
            </View>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={ZORA_ORANGE}
            colors={[ZORA_ORANGE]}
          />
        }
      >
        <View style={styles.filterRow}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(f.key)}
                activeOpacity={0.75}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {f.label}
                </Text>
                {active && filter === 'pending' && pendingCount > 0 && (
                  <View style={styles.filterCountDot}>
                    <Text style={styles.filterCountText}>{pendingCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {filter === 'pending' && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryIconWrap}>
              <Ionicons name="hourglass-outline" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.summaryLabel}>Valor pendente hoje</Text>
              <Text style={styles.summaryValue}>{fmtMZN(pendingTotalToday)}</Text>
              <Text style={styles.summaryHint}>
                {deposits.length} {deposits.length === 1 ? 'depósito aguarda' : 'depósitos aguardam'} revisão.
              </Text>
            </View>
          </View>
        )}

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={ZORA_ORANGE} size="large" />
            <Text style={styles.loadingText}>A carregar depósitos...</Text>
          </View>
        ) : deposits.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="file-tray-outline" size={40} color={ZORA_ORANGE} />
            </View>
            <Text style={styles.emptyTitle}>Sem depósitos</Text>
            <Text style={styles.emptySub}>
              Não existem depósitos com o estado
              {' '}
              <Text style={{ fontWeight: '700', color: '#111827' }}>
                {FILTERS.find((f) => f.key === filter)?.label.toLowerCase()}
              </Text>
              .
            </Text>
            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={() => { setRefreshing(true); loadData(true); }}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh-outline" size={16} color="#fff" />
              <Text style={styles.refreshBtnText}>Atualizar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.listWrap}>
            {deposits.map((row) => (
              <DepositCard
                key={row.id}
                row={row}
                actionLoading={actionLoadingId === row.id}
                onCopy={handleCopy}
                copiedKey={copiedKey}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            ))}
            <View style={{ height: 24 }} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DepositCard({
  row,
  actionLoading,
  onCopy,
  copiedKey,
  onApprove,
  onReject,
}: {
  row: DepositRow;
  actionLoading: boolean;
  onCopy: (text: string, key: string) => void;
  copiedKey: string | null;
  onApprove: (r: DepositRow) => void;
  onReject: (r: DepositRow) => void;
}) {
  const status = row.status;
  const statusInfo = useMemo(() => {
    switch (status) {
      case 'approved':
        return { label: 'APROVADO', bg: ZORA_GREEN_LIGHT, fg: ZORA_GREEN, icon: 'checkmark-circle' as const };
      case 'rejected':
        return { label: 'REJEITADO', bg: ZORA_RED_LIGHT, fg: ZORA_RED, icon: 'close-circle' as const };
      case 'cancelled':
        return { label: 'CANCELADO', bg: 'rgba(107,114,128,0.12)', fg: '#6B7280', icon: 'remove-circle' as const };
      case 'pending':
      default:
        return { label: 'PENDENTE', bg: ZORA_YELLOW_LIGHT, fg: '#B45309', icon: 'time-outline' as const };
    }
  }, [status]);

  const pmKey = `pm-${row.id}`;
  const proofKey = `proof-${row.id}`;
  const phoneKey = `phone-${row.id}`;
  const contactKey = `contact-${row.id}`;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <TouchableOpacity
            style={styles.nameRow}
            activeOpacity={0.7}
            onPress={() => row.full_name && onCopy(row.full_name, `name-${row.id}`)}
          >
            <Text style={styles.clientName} numberOfLines={1}>
              {row.full_name || 'Cliente'}
            </Text>
            {copiedKey === `name-${row.id}` && (
              <View style={styles.copiedMiniBadge}>
                <Ionicons name="checkmark" size={10} color="#fff" />
                <Text style={styles.copiedMiniText}>Copiado</Text>
              </View>
            )}
          </TouchableOpacity>

          {row.phone_number ? (
            <TouchableOpacity
              style={styles.phoneRow}
              activeOpacity={0.7}
              onPress={() => row.phone_number && onCopy(row.phone_number, phoneKey)}
            >
              <Ionicons name="call-outline" size={13} color="#6B7280" />
              <Text style={styles.clientPhone}>{row.phone_number}</Text>
              <Ionicons
                name={copiedKey === phoneKey ? 'checkmark' : 'copy-outline'}
                size={12}
                color={copiedKey === phoneKey ? ZORA_GREEN : '#9CA3AF'}
                style={{ marginLeft: 4 }}
              />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
          <Ionicons name={statusInfo.icon} size={12} color={statusInfo.fg} />
          <Text style={[styles.statusText, { color: statusInfo.fg }]}>{statusInfo.label}</Text>
        </View>
      </View>

      <View style={styles.amountSection}>
        <Text style={styles.amountLabel}>Valor do depósito</Text>
        <Text style={styles.amountValue}>{fmtMZN(row.amount)}</Text>
      </View>

      <View style={styles.infoGrid}>
        <InfoBlock
          icon="card-outline"
          label="Método"
          value={row.payment_method?.toUpperCase() || '—'}
          copyable={!!row.payment_method}
          copiedKey={copiedKey}
          myKey={pmKey}
          onCopy={() => row.payment_method && onCopy(row.payment_method, pmKey)}
          valueTint={ZORA_BLUE}
        />
        <InfoBlock
          icon="receipt-outline"
          label="Comprovativo"
          value={row.proof_reference || '—'}
          copyable={!!row.proof_reference}
          copiedKey={copiedKey}
          myKey={proofKey}
          onCopy={() => row.proof_reference && onCopy(row.proof_reference, proofKey)}
        />
        <InfoBlock
          icon="call"
          label="Contacto pgto."
          value={row.contact || '—'}
          copyable={!!row.contact}
          copiedKey={copiedKey}
          myKey={contactKey}
          onCopy={() => row.contact && onCopy(row.contact, contactKey)}
        />
        <InfoBlock
          icon="calendar-outline"
          label="Criado em"
          value={fmtDateTime(row.created_at)}
        />
        {row.reviewed_at ? (
          <InfoBlock
            icon="checkmark-done-outline"
            label="Revisado em"
            value={fmtDateTime(row.reviewed_at)}
            valueTint={ZORA_GREEN}
          />
        ) : null}
      </View>

      {row.admin_notes ? (
        <View style={styles.notesBox}>
          <Ionicons name="document-text-outline" size={14} color={ZORA_ORANGE} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.notesLabel}>Nota admin</Text>
            <Text style={styles.notesText} selectable>{row.admin_notes}</Text>
          </View>
        </View>
      ) : null}

      {row.status === 'pending' && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.btnApprove, actionLoading && styles.btnDisabled]}
            onPress={() => onApprove(row)}
            disabled={actionLoading}
            activeOpacity={0.8}
          >
            {actionLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="checkmark" size={18} color="#fff" />
            )}
            <Text style={styles.btnApproveText}>Aprovar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnReject, actionLoading && styles.btnDisabled]}
            onPress={() => onReject(row)}
            disabled={actionLoading}
            activeOpacity={0.8}
          >
            {actionLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="close" size={18} color="#fff" />
            )}
            <Text style={styles.btnRejectText}>Rejeitar</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function InfoBlock({
  icon, label, value, copyable, myKey, copiedKey, onCopy, valueTint,
}: {
  icon: any;
  label: string;
  value: string;
  copyable?: boolean;
  myKey?: string;
  copiedKey?: string | null;
  onCopy?: () => void;
  valueTint?: string;
}) {
  const isCopied = !!myKey && !!copiedKey && copiedKey === myKey;
  return (
    <View style={styles.infoBlock}>
      <View style={styles.infoBlockHeader}>
        <Ionicons name={icon} size={13} color="#6B7280" />
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <TouchableOpacity
        style={styles.infoValueRow}
        activeOpacity={copyable ? 0.6 : 1}
        onPress={copyable ? onCopy : undefined}
        disabled={!copyable}
      >
        <Text
          style={[styles.infoValue, valueTint && { color: valueTint }]}
          numberOfLines={1}
          selectable
        >
          {value}
        </Text>
        {copyable ? (
          <Ionicons
            name={isCopied ? 'checkmark' : 'copy-outline'}
            size={12}
            color={isCopied ? ZORA_GREEN : '#9CA3AF'}
            style={{ marginLeft: 4, flexShrink: 0 }}
          />
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF8F3' },

  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 14,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFE4C9',
    ...shadow({ color: '#000', offset: { width: 0, height: 2 }, opacity: 0.05, radius: 8, elevation: 1 }),
  },
  headerTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#111827', letterSpacing: -0.3 },
  pendingBadge: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 13,
    backgroundColor: ZORA_ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow({ color: ZORA_ORANGE, offset: { width: 0, height: 4 }, opacity: 0.28, radius: 8, elevation: 3 }),
  },
  pendingBadgeText: { color: '#fff', fontWeight: '900', fontSize: 12 },

  content: { paddingHorizontal: 18, paddingBottom: 40 },

  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FFE4C9',
    gap: 6,
    ...shadow({ color: '#000', offset: { width: 0, height: 1 }, opacity: 0.04, radius: 6, elevation: 1 }),
  },
  filterChipActive: {
    backgroundColor: ZORA_ORANGE,
    borderColor: ZORA_ORANGE,
  },
  filterChipText: { fontSize: 12.5, fontWeight: '700', color: '#6B7280' },
  filterChipTextActive: { color: '#fff' },
  filterCountDot: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  filterCountText: { fontSize: 10.5, color: ZORA_ORANGE, fontWeight: '900' },

  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ZORA_ORANGE,
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    ...shadow({ color: ZORA_ORANGE, offset: { width: 0, height: 10 }, opacity: 0.32, radius: 18, elevation: 7 }),
  },
  summaryIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 11.5, fontWeight: '700' },
  summaryValue: { color: '#fff', fontSize: 26, fontWeight: '900', marginTop: 3 },
  summaryHint: { color: 'rgba(255,255,255,0.85)', fontSize: 11.5, marginTop: 4, fontWeight: '600' },

  loadingWrap: { paddingVertical: 60, alignItems: 'center' },
  loadingText: { marginTop: 14, color: '#6B7280', fontSize: 13, fontWeight: '600' },

  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyIconWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: ZORA_ORANGE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  emptySub: { fontSize: 12.5, color: '#6B7280', textAlign: 'center', marginTop: 8, lineHeight: 18, maxWidth: 280 },
  refreshBtn: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: ZORA_ORANGE,
    ...shadow({ color: ZORA_ORANGE, offset: { width: 0, height: 4 }, opacity: 0.3, radius: 10, elevation: 3 }),
  },
  refreshBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  listWrap: { gap: 14 },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#FFE1C2',
    ...shadow({ color: '#000', offset: { width: 0, height: 3 }, opacity: 0.06, radius: 12, elevation: 2 }),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  clientName: { fontSize: 16, fontWeight: '900', color: '#111827', flexShrink: 1 },
  copiedMiniBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: ZORA_GREEN,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  copiedMiniText: { color: '#fff', fontWeight: '800', fontSize: 9.5 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
  clientPhone: { fontSize: 12, color: '#4B5563', fontWeight: '600' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },

  amountSection: {
    marginTop: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: ZORA_ORANGE_LIGHT,
    borderWidth: 1,
    borderColor: '#FFD4B0',
  },
  amountLabel: { fontSize: 10.5, color: '#9A4D00', fontWeight: '700', letterSpacing: 0.2 },
  amountValue: {
    fontSize: 30,
    fontWeight: '900',
    color: ZORA_ORANGE,
    marginTop: 2,
    letterSpacing: -0.5,
  },

  infoGrid: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  infoBlock: {
    flex: 1,
    minWidth: '46%',
    backgroundColor: '#FAFAF9',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F3F0EC',
  },
  infoBlockHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoLabel: { fontSize: 10.5, color: '#6B7280', fontWeight: '700' },
  infoValueRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, flexShrink: 1 },
  infoValue: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '800',
    color: '#111827',
    flexShrink: 1,
  },

  notesBox: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: ZORA_ORANGE_LIGHT,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FFD4B0',
  },
  notesLabel: { fontSize: 10.5, color: '#9A4D00', fontWeight: '800' },
  notesText: { fontSize: 12, color: '#78350F', marginTop: 2, fontWeight: '500', lineHeight: 17 },

  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  btnApprove: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: ZORA_GREEN,
    borderRadius: 16,
    paddingVertical: 14,
    ...shadow({ color: ZORA_GREEN, offset: { width: 0, height: 4 }, opacity: 0.28, radius: 10, elevation: 3 }),
  },
  btnApproveText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  btnReject: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: ZORA_RED,
    borderRadius: 16,
    paddingVertical: 14,
    ...shadow({ color: ZORA_RED, offset: { width: 0, height: 4 }, opacity: 0.28, radius: 10, elevation: 3 }),
  },
  btnRejectText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  btnDisabled: { opacity: 0.6 },
});
