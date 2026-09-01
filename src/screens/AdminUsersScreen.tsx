import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  getAdminUsers,
  adminAdjustWallet,
  fmtMZN,
  fmtDateTime,
  getUserDeposits,
  getUserWithdrawals,
  getUserInvestmentsAdmin,
  getUserSavingsAdmin,
  type AdminUserRow,
  type DepositRow,
  type WithdrawalRow,
  type UserInvestmentLite,
  type UserSavingsLite,
} from '../services/admin';
import { appTheme, shadow } from '../theme/appTheme';
import { backend } from '../services/backendClient';
import { invalidateFinanceCache } from '../services/finance';

const ZORA_ORANGE = '#FF6A2B';
const ZORA_ORANGE_DARK = '#E55B1F';
const ZORA_GREEN = '#16A34A';
const ZORA_RED = '#DC2626';
const BG = '#FFF8F3';

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function packageBadgeColor(n: number | null): { bg: string; fg: string; border: string } {
  if (n == null) return { bg: '#F3F4F6', fg: '#6B7280', border: '#E5E7EB' };
  const tints: Record<number, { bg: string; fg: string; border: string }> = {
    1: { bg: '#FEF3C7', fg: '#92400E', border: '#FDE68A' },
    2: { bg: '#FFEDD5', fg: '#9A3412', border: '#FED7AA' },
    3: { bg: '#FFE4E6', fg: '#9F1239', border: '#FECDD3' },
    4: { bg: '#FCE7F3', fg: '#9D174D', border: '#FBCFE8' },
    5: { bg: '#F3E8FF', fg: '#6B21A8', border: '#E9D5FF' },
    6: { bg: '#E0E7FF', fg: '#3730A3', border: '#C7D2FE' },
    7: { bg: '#DBEAFE', fg: '#1E40AF', border: '#BFDBFE' },
    8: { bg: '#CFFAFE', fg: '#155E75', border: '#A5F3FC' },
    9: { bg: '#DCFCE7', fg: '#166534', border: '#BBF7D0' },
  };
  return tints[n] ?? tints[1];
}

export function AdminUsersScreen() {
  const navigation = useNavigation<any>();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searching, setSearching] = useState(false);

  const [adjustVisible, setAdjustVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustDescription, setAdjustDescription] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  const [actionsVisible, setActionsVisible] = useState(false);
  const [actionsUser, setActionsUser] = useState<AdminUserRow | null>(null);
  const [actionsTab, setActionsTab] = useState<'deposits' | 'withdrawals' | 'investments' | 'savings'>('deposits');
  const [actionsLoading, setActionsLoading] = useState(false);
  const [userDeposits, setUserDeposits] = useState<DepositRow[]>([]);
  const [userWithdrawals, setUserWithdrawals] = useState<WithdrawalRow[]>([]);
  const [userInvestments, setUserInvestments] = useState<UserInvestmentLite[]>([]);
  const [userSavings, setUserSavings] = useState<UserSavingsLite[]>([]);

  const loadUsers = useCallback(async (force = false, q?: string) => {
    try {
      const rows = await getAdminUsers(500, 0, q && q.trim() ? q.trim() : null);
      setUsers(rows);
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Não foi possível carregar os utilizadores.');
    }
  }, []);

  const adminUsersChannelRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await loadUsers(false, '');
      } finally {
        setLoading(false);
      }
    })();
  }, [loadUsers]);

  useEffect(() => {
    let isMounted = true;

    const setupRealtime = async () => {
      try {
        if (adminUsersChannelRef.current) {
          try { backend.removeChannel(adminUsersChannelRef.current); } catch {}
        }
        const ch = backend.channel('admin_users_global');
        const handleChange = async () => {
          if (!isMounted) return;
          try {
            invalidateFinanceCache();
            await loadUsers(true, search);
          } catch {}
        };
        ch.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'user_profiles' },
          handleChange
        );
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
        ch.subscribe();
        adminUsersChannelRef.current = ch;
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
      if (adminUsersChannelRef.current) {
        try { adminUsersChannelRef.current.unsubscribe(); } catch {}
        try { backend.removeChannel(adminUsersChannelRef.current); } catch {}
        adminUsersChannelRef.current = null;
      }
    };
  }, [loadUsers, search]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadUsers(true, search);
    } finally {
      setRefreshing(false);
    }
  };

  const onChangeSearch = (text: string) => {
    setSearch(text);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        await loadUsers(false, text);
      } finally {
        setSearching(false);
      }
    }, 350);
  };

  const openAdjust = (u: AdminUserRow) => {
    setSelectedUser(u);
    setAdjustAmount('');
    setAdjustDescription('');
    setAdjustVisible(true);
  };

  const closeAdjust = () => {
    if (adjusting) return;
    setAdjustVisible(false);
    setSelectedUser(null);
  };

  const doAdjust = async () => {
    if (!selectedUser) return;
    const amt = Number(String(adjustAmount).replace(',', '.'));
    if (!Number.isFinite(amt) || amt === 0) {
      Alert.alert('Valor inválido', 'Insira um valor numérico diferente de zero. Positivo para adicionar, negativo para subtrair.');
      return;
    }
    setAdjusting(true);
    try {
      const desc = adjustDescription.trim() || null;
      const r = await adminAdjustWallet(selectedUser.id, amt, true, desc);
      Alert.alert(r.success ? 'Sucesso' : 'Aviso', r.message);
      if (r.success) {
        setAdjustVisible(false);
        setSelectedUser(null);
        await loadUsers(false, search);
      }
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Não foi possível ajustar o saldo.');
    } finally {
      setAdjusting(false);
    }
  };

  const openActions = async (u: AdminUserRow) => {
    setActionsUser(u);
    setActionsTab('deposits');
    setActionsVisible(true);
    setActionsLoading(true);
    setUserDeposits([]);
    setUserWithdrawals([]);
    setUserInvestments([]);
    setUserSavings([]);
    try {
      const [deps, withs, invs, savs] = await Promise.all([
        getUserDeposits(u.id).catch(() => []),
        getUserWithdrawals(u.id).catch(() => []),
        getUserInvestmentsAdmin(u.id).catch(() => []),
        getUserSavingsAdmin(u.id).catch(() => []),
      ]);
      setUserDeposits(deps);
      setUserWithdrawals(withs);
      setUserInvestments(invs);
      setUserSavings(savs);
    } catch (e: any) {
      console.warn('[AdminUsers] loadUserActions error:', e?.message);
    } finally {
      setActionsLoading(false);
    }
  };

  const closeActions = () => {
    if (actionsLoading) return;
    setActionsVisible(false);
    setActionsUser(null);
    setUserDeposits([]);
    setUserWithdrawals([]);
    setUserInvestments([]);
    setUserSavings([]);
  };

  const totalCount = users.length;
  const countLabel = useMemo(
    () => `${totalCount} ${totalCount === 1 ? 'cadastrado' : 'cadastrados'}`,
    [totalCount]
  );

  const renderItem = ({ item }: { item: AdminUserRow }) => (
    <UserCard user={item} onAdjust={() => openAdjust(item)} onActions={() => openActions(item)} />
  );

  const keyExtractor = (item: AdminUserRow) => item.id;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-back-outline" size={22} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>Utilizadores</Text>
          <Text style={styles.headerCount}>{countLabel}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color="#6B7280" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Nome, telefone ou código..."
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={onChangeSearch}
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <TouchableOpacity
              onPress={() => {
                setSearch('');
                loadUsers(false, '');
              }}
              style={styles.searchClear}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          ) : null}
          {searching && <ActivityIndicator color={ZORA_ORANGE} size="small" style={{ marginLeft: 6 }} />}
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={ZORA_ORANGE} size="large" />
          <Text style={styles.loadingText}>A carregar utilizadores...</Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={ZORA_ORANGE}
              colors={[ZORA_ORANGE]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <Ionicons name="people-outline" size={36} color={ZORA_ORANGE} />
              </View>
              <Text style={styles.emptyTitle}>Sem utilizadores</Text>
              <Text style={styles.emptySub}>
                {search.trim()
                  ? 'Nenhum utilizador corresponde à pesquisa. Tente outros termos.'
                  : 'Ainda não existem utilizadores cadastrados.'}
              </Text>
              {search.trim() ? (
                <TouchableOpacity
                  style={styles.resetSearchBtn}
                  onPress={() => {
                    setSearch('');
                    loadUsers(false, '');
                  }}
                >
                  <Ionicons name="refresh-outline" size={14} color="#fff" />
                  <Text style={styles.resetSearchBtnText}>Limpar pesquisa</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
        />
      )}

      <Modal
        visible={adjustVisible}
        transparent
        animationType="fade"
        onRequestClose={closeAdjust}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <View style={styles.modalIconBox}>
                <Ionicons name="wallet-outline" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.modalTitle}>Ajustar saldo</Text>
                <Text style={styles.modalSub} numberOfLines={1}>
                  {selectedUser?.full_name ?? '—'}
                </Text>
              </View>
              <TouchableOpacity style={styles.modalClose} onPress={closeAdjust} disabled={adjusting}>
                <Ionicons name="close-outline" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalDivider} />

            <View style={styles.modalInfoGrid}>
              <MiniInfo label="Principal" value={fmtMZN(selectedUser?.wallet_balance ?? 0)} tint={ZORA_ORANGE} />
              <MiniInfo label="Bónus" value={fmtMZN(selectedUser?.wallet_bonus ?? 0)} tint="#7C3AED" />
            </View>

            <View style={{ marginTop: 14 }}>
              <Text style={styles.fieldLabel}>Valor <Text style={{ color: '#9CA3AF' }}>(positivo adiciona, negativo subtrai)</Text></Text>
              <View style={styles.amountBox}>
                <Text style={styles.amountPrefix}>MZN</Text>
                <TextInput
                  style={styles.amountInput}
                  placeholder="0,00"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                  value={adjustAmount}
                  onChangeText={(t) => setAdjustAmount(t.replace(/[^0-9,\-]/g, ''))}
                  editable={!adjusting}
                />
              </View>
              <View style={styles.quickRow}>
                <QuickBtn label="+100" onPress={() => setAdjustAmount('100')} />
                <QuickBtn label="+500" onPress={() => setAdjustAmount('500')} />
                <QuickBtn label="+1000" onPress={() => setAdjustAmount('1000')} />
                <QuickBtn label="-100" onPress={() => setAdjustAmount('-100')} danger />
              </View>
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={styles.fieldLabel}>Descrição <Text style={{ color: '#9CA3AF' }}>(opcional)</Text></Text>
              <TextInput
                style={styles.descInput}
                placeholder="Ex: Bónus especial, correção manual..."
                placeholderTextColor="#9CA3AF"
                value={adjustDescription}
                onChangeText={setAdjustDescription}
                editable={!adjusting}
                multiline
                maxLength={120}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.cancelBtn, adjusting && styles.btnDisabled]}
                onPress={closeAdjust}
                disabled={adjusting}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, adjusting && styles.btnDisabled]}
                onPress={doAdjust}
                disabled={adjusting}
              >
                {adjusting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                    <Text style={styles.confirmBtnText}>Confirmar ajuste</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={actionsVisible}
        transparent
        animationType="slide"
        onRequestClose={closeActions}
      >
        <View style={styles.actionsModalOverlay}>
          <View style={styles.actionsModalCard}>
            <View style={styles.actionsModalHead}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                <View style={styles.actionsAvatar}>
                  <Text style={styles.actionsAvatarText}>{getInitials(actionsUser?.full_name ?? '')}</Text>
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={styles.actionsModalTitle} numberOfLines={1}>
                    {actionsUser?.full_name ?? '—'}
                  </Text>
                  <Text style={styles.actionsModalSub} numberOfLines={1}>
                    {actionsUser?.phone_number ?? '—'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={styles.actionsCloseBtn} onPress={closeActions} disabled={actionsLoading}>
                <Ionicons name="close-outline" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.actionsTabsRow}>
              {([
                { key: 'deposits', label: 'Depósitos', icon: 'cloud-upload-outline', count: userDeposits.length },
                { key: 'withdrawals', label: 'Saques', icon: 'cloud-download-outline', count: userWithdrawals.length },
                { key: 'investments', label: 'Investimentos', icon: 'trending-up-outline', count: userInvestments.length },
                { key: 'savings', label: 'Poupanças', icon: 'save-outline', count: userSavings.length },
              ] as const).map((tab) => (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.actionTab, actionsTab === tab.key && styles.actionTabActive]}
                  onPress={() => setActionsTab(tab.key)}
                  activeOpacity={0.85}
                  disabled={actionsLoading}
                >
                  <Ionicons
                    name={tab.icon as any}
                    size={14}
                    color={actionsTab === tab.key ? '#FFF' : '#6B7280'}
                  />
                  <Text
                    style={[
                      styles.actionTabLabel,
                      actionsTab === tab.key && styles.actionTabLabelActive,
                    ]}
                    numberOfLines={1}
                  >
                    {tab.label}
                  </Text>
                  <View style={[styles.actionTabCount, actionsTab === tab.key && styles.actionTabCountActive]}>
                    <Text
                      style={[
                        styles.actionTabCountText,
                        actionsTab === tab.key && styles.actionTabCountTextActive,
                      ]}
                    >
                      {tab.count}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flex: 1, marginTop: 10 }}>
              {actionsLoading ? (
                <View style={styles.actionsLoadingWrap}>
                  <ActivityIndicator color={ZORA_ORANGE} size="large" />
                  <Text style={styles.actionsLoadingText}>A carregar ações...</Text>
                </View>
              ) : (
                <ScrollView
                  contentContainerStyle={{ paddingBottom: 20 }}
                  showsVerticalScrollIndicator={false}
                >
                  {actionsTab === 'deposits' ? (
                    userDeposits.length === 0 ? (
                      <EmptySection
                        icon="cloud-upload-outline"
                        title="Sem depósitos"
                        subtitle="Este utilizador ainda não efetuou nenhum depósito."
                      />
                    ) : (
                      userDeposits.map((d) => (
                        <ActivityRow
                          key={d.id}
                          icon="cloud-upload-outline"
                          iconBg="#ECFDF3"
                          iconTint="#059669"
                          title={`Depósito via ${d.payment_method || '—'}`}
                          subtitle={fmtDateTime(d.created_at)}
                          amount={`+ ${fmtMZN(d.amount)}`}
                          amountTint={d.status === 'approved' ? '#16A34A' : d.status === 'rejected' ? '#DC2626' : '#B45309'}
                          status={d.status}
                        />
                      ))
                    )
                  ) : null}

                  {actionsTab === 'withdrawals' ? (
                    userWithdrawals.length === 0 ? (
                      <EmptySection
                        icon="cloud-download-outline"
                        title="Sem saques"
                        subtitle="Este utilizador ainda não solicitou nenhum saque."
                      />
                    ) : (
                      userWithdrawals.map((w) => (
                        <ActivityRow
                          key={w.id}
                          icon="cloud-download-outline"
                          iconBg="#FEF2F2"
                          iconTint="#DC2626"
                          title={`Saque via ${w.withdrawal_method || '—'}`}
                          subtitle={`${fmtDateTime(w.created_at)} • Contacto: ${w.contact || '—'}`}
                          amount={`- ${fmtMZN(w.total_deducted)}`}
                          amountTint="#DC2626"
                          status={w.status}
                        />
                      ))
                    )
                  ) : null}

                  {actionsTab === 'investments' ? (
                    userInvestments.length === 0 ? (
                      <EmptySection
                        icon="trending-up-outline"
                        title="Sem investimentos"
                        subtitle="Este utilizador ainda não investiu em nenhum pacote."
                      />
                    ) : (
                      userInvestments.map((inv) => (
                        <ActivityRow
                          key={inv.id}
                          icon="trending-up-outline"
                          iconBg="#FFF7ED"
                          iconTint="#C2410C"
                          title={inv.package_name || 'Investimento'}
                          subtitle={fmtDateTime(inv.purchased_at)}
                          amount={`- ${fmtMZN(inv.amount)}`}
                          amountTint="#C2410C"
                          status={inv.status}
                        />
                      ))
                    )
                  ) : null}

                  {actionsTab === 'savings' ? (
                    userSavings.length === 0 ? (
                      <EmptySection
                        icon="save-outline"
                        title="Sem poupanças"
                        subtitle="Este utilizador ainda não aderiu a nenhuma poupança."
                      />
                    ) : (
                      userSavings.map((s) => (
                        <ActivityRow
                          key={s.id}
                          icon="save-outline"
                          iconBg="#EFF6FF"
                          iconTint="#2563EB"
                          title={`Poupança • Receber ${fmtMZN(s.amount_to_receive)}`}
                          subtitle={`Aplicado: ${fmtDateTime(s.start_at)} • Liberação: ${fmtDateTime(s.release_at)}`}
                          amount={`- ${fmtMZN(s.amount_applied)}`}
                          amountTint="#2563EB"
                          status={s.status}
                        />
                      ))
                    )
                  ) : null}
                </ScrollView>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function MiniInfo({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <View style={styles.miniInfoCard}>
      <View style={[styles.miniDot, { backgroundColor: tint }]} />
      <Text style={styles.miniInfoLabel}>{label}</Text>
      <Text style={styles.miniInfoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function QuickBtn({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.quickBtn, danger && styles.quickBtnDanger]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.quickBtnText, danger && styles.quickBtnTextDanger]}>{label}</Text>
    </TouchableOpacity>
  );
}

function UserCard({ user, onAdjust, onActions }: { user: AdminUserRow; onAdjust: () => void; onActions: () => void }) {
  const pkg = user.active_package_number;
  const pkgTint = packageBadgeColor(pkg);
  const initials = getInitials(user.full_name);

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.headRight}>
          <View style={styles.nameRow}>
            <Text style={styles.userName} numberOfLines={1}>{user.full_name || 'Sem nome'}</Text>
          </View>
          <View style={styles.badgeRow}>
            {user.is_admin ? (
              <View style={styles.adminBadge}>
                <Ionicons name="shield-checkmark" size={10} color="#fff" />
                <Text style={styles.adminBadgeText}>Admin</Text>
              </View>
            ) : null}
            {user.is_verified ? (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={10} color="#fff" />
                <Text style={styles.verifiedBadgeText}>Verificado</Text>
              </View>
            ) : (
              <View style={styles.unverifiedBadge}>
                <Ionicons name="help-circle-outline" size={10} color="#92400E" />
                <Text style={styles.unverifiedBadgeText}>Não verificado</Text>
              </View>
            )}
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="call-outline" size={12} color="#6B7280" />
            <Text style={styles.metaText}>{user.phone_number || '—'}</Text>
          </View>
        </View>
      </View>

      <View style={styles.cardDivider} />

      <View style={styles.infoRows}>
        <InfoLine icon="calendar-outline" label="Cadastro" value={fmtDateTime(user.joined_at)} />
        {user.referred_by_name ? (
          <InfoLine icon="people-outline" label="Indicado por" value={user.referred_by_name} />
        ) : null}
        {user.referral_code ? (
          <InfoLine icon="gift-outline" label="Código de indicação" value={user.referral_code} />
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
        <View style={[styles.packageBadge, { backgroundColor: pkgTint.bg, borderColor: pkgTint.border }]}>
          <Text style={[styles.packageBadgeText, { color: pkgTint.fg }]}>
            {pkg != null ? `N${pkg}` : 'Sem pacote'}
          </Text>
        </View>
        {user.active_package_name ? (
          <Text style={styles.packageName} numberOfLines={1}>{user.active_package_name}</Text>
        ) : (
          <Text style={styles.packageName}>Utilizador sem pacote ativo</Text>
        )}
      </View>

      <View style={styles.cardDivider} />

      <View style={styles.grid2x2}>
        <StatTile
          icon="wallet-outline"
          label="Saldo principal"
          value={fmtMZN(user.wallet_balance)}
          tint={ZORA_ORANGE}
        />
        <StatTile
          icon="gift-outline"
          label="Saldo bónus"
          value={fmtMZN(user.wallet_bonus)}
          tint="#7C3AED"
        />
        <StatTile
          icon="trending-up-outline"
          label="Total investido"
          value={fmtMZN(user.total_invested)}
          tint={ZORA_ORANGE}
        />
        <StatTile
          icon="briefcase-outline"
          label="Investimentos ativos"
          value={`${user.active_investments}`}
          tint="#2563EB"
          numeric
        />
      </View>

      <View style={styles.cardDivider} />

      <View style={styles.savingsRow}>
        <View style={[styles.savingsIcon, { backgroundColor: 'rgba(22,163,74,0.10)' }]}>
          <Ionicons name="save-outline" size={16} color={ZORA_GREEN} />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.savingsTitle}>Poupanças</Text>
          <Text style={styles.savingsSub}>
            {user.savings_count || 0} {user.savings_count === 1 ? 'poupança' : 'poupanças'} •{' '}
            <Text style={{ color: '#111827', fontWeight: '800' }}>
              {fmtMZN(user.total_savings_applied)}
            </Text>{' '}
            total aplicado
          </Text>
        </View>
      </View>

      <View style={styles.cardActionsRow}>
        <TouchableOpacity style={styles.actionsBtn} onPress={onActions} activeOpacity={0.85}>
          <Ionicons name="receipt-outline" size={16} color={ZORA_ORANGE} />
          <Text style={styles.actionsBtnText}>Ver ações</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.adjustBtn} onPress={onAdjust} activeOpacity={0.85}>
          <Ionicons name="build-outline" size={16} color="#fff" />
          <Text style={styles.adjustBtnText}>Ajustar saldo</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function EmptySection({ icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <View style={styles.emptySectionWrap}>
      <View style={styles.emptySectionIcon}>
        <Ionicons name={icon} size={24} color={ZORA_ORANGE} />
      </View>
      <Text style={styles.emptySectionTitle}>{title}</Text>
      <Text style={styles.emptySectionSub}>{subtitle}</Text>
    </View>
  );
}

function statusTint(status: string): { label: string; bg: string; fg: string; border: string } {
  const s = (status || '').toLowerCase();
  switch (s) {
    case 'approved':
    case 'paid':
    case 'completed':
    case 'active':
    case 'ready':
      return { label: 'Aprovado', bg: '#DCFCE7', fg: '#166534', border: '#BBF7D0' };
    case 'rejected':
    case 'cancelled':
      return { label: 'Rejeitado', bg: '#FEE2E2', fg: '#991B1B', border: '#FECACA' };
    case 'pending':
    case 'locked':
    default:
      return { label: 'Pendente', bg: '#FEF3C7', fg: '#92400E', border: '#FDE68A' };
  }
}

function statusLabelOf(s: string): string {
  const t = statusTint(s);
  switch ((s || '').toLowerCase()) {
    case 'approved': return 'Aprovado';
    case 'rejected': return 'Rejeitado';
    case 'pending': return 'Pendente';
    case 'paid': return 'Pago';
    case 'cancelled': return 'Cancelado';
    case 'active': return 'Ativo';
    case 'completed': return 'Concluído';
    case 'locked': return 'Bloqueado';
    case 'ready': return 'Disponível';
    default: return t.label;
  }
}

function ActivityRow({
  icon, iconBg, iconTint, title, subtitle, amount, amountTint, status,
}: {
  icon: any; iconBg: string; iconTint: string; title: string; subtitle: string;
  amount: string; amountTint: string; status: string;
}) {
  const s = statusTint(status);
  const label = statusLabelOf(status);
  return (
    <View style={styles.activityRow}>
      <View style={[styles.activityIconBox, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={16} color={iconTint} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.activityTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.activitySubtitle} numberOfLines={2}>{subtitle}</Text>
        <View style={[styles.activityStatusPill, { backgroundColor: s.bg, borderColor: s.border }]}>
          <Text style={[styles.activityStatusText, { color: s.fg }]}>{label}</Text>
        </View>
      </View>
      <Text style={[styles.activityAmount, { color: amountTint }]} numberOfLines={1}>
        {amount}
      </Text>
    </View>
  );
}

function InfoLine({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.infoLine}>
      <Ionicons name={icon} size={13} color="#6B7280" style={{ width: 16 }} />
      <Text style={styles.infoLineLabel}>{label}:</Text>
      <Text style={styles.infoLineValue} numberOfLines={1}>{value || '—'}</Text>
    </View>
  );
}

function StatTile({
  icon,
  label,
  value,
  tint,
  numeric,
}: {
  icon: any;
  label: string;
  value: string;
  tint: string;
  numeric?: boolean;
}) {
  return (
    <View style={styles.statTile}>
      <View style={[styles.statIconBox, { backgroundColor: `${tint}22` }]}>
        <Ionicons name={icon} size={15} color={tint} />
      </View>
      <Text style={[styles.statValue, { color: numeric ? '#111827' : tint }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
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
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FED7AA',
    ...shadow({ color: '#000', offset: { width: 0, height: 2 }, opacity: 0.05, radius: 6, elevation: 1 }),
  },
  headerTitles: { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
  },
  headerCount: {
    marginTop: 2,
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
    fontFamily: appTheme.fontFamily,
  },

  searchWrap: { paddingHorizontal: 16, paddingBottom: 10 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#FFE1C2',
    ...shadow({ color: '#000', offset: { width: 0, height: 2 }, opacity: 0.04, radius: 6, elevation: 1 }),
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 14,
    color: '#111827',
    fontFamily: appTheme.fontFamily,
  },
  searchClear: { padding: 2 },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 13, fontWeight: '600', fontFamily: appTheme.fontFamily },

  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 60,
  },

  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFE1C2',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#111827', fontFamily: appTheme.fontFamily },
  emptySub: {
    marginTop: 6,
    fontSize: 12.5,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
    fontFamily: appTheme.fontFamily,
    maxWidth: 280,
  },
  resetSearchBtn: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: ZORA_ORANGE,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 14,
    ...shadow({ color: ZORA_ORANGE, offset: { width: 0, height: 4 }, opacity: 0.28, radius: 10, elevation: 3 }),
  },
  resetSearchBtnText: { color: '#fff', fontWeight: '800', fontSize: 13, fontFamily: appTheme.fontFamily },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FFE1C2',
    ...shadow({ color: '#000', offset: { width: 0, height: 4 }, opacity: 0.05, radius: 10, elevation: 2 }),
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: ZORA_ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFE1C2',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '900', fontFamily: appTheme.fontFamily },
  headRight: { flex: 1, marginLeft: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  userName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
  },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#7C3AED',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  adminBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', fontFamily: appTheme.fontFamily },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: ZORA_GREEN,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  verifiedBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', fontFamily: appTheme.fontFamily },
  unverifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  unverifiedBadgeText: { color: '#92400E', fontSize: 10, fontWeight: '800', fontFamily: appTheme.fontFamily },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  metaText: { fontSize: 12, color: '#4B5563', fontWeight: '600', fontFamily: appTheme.fontFamily },

  cardDivider: { height: 1, backgroundColor: '#FFEFD9', marginVertical: 12 },

  infoRows: { gap: 6 },
  infoLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoLineLabel: { fontSize: 12, color: '#6B7280', fontWeight: '600', fontFamily: appTheme.fontFamily },
  infoLineValue: {
    flex: 1,
    fontSize: 12,
    color: '#111827',
    fontWeight: '700',
    fontFamily: appTheme.fontFamily,
  },

  packageBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  packageBadgeText: { fontSize: 11, fontWeight: '900', fontFamily: appTheme.fontFamily },
  packageName: {
    flex: 1,
    marginLeft: 10,
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '700',
    fontFamily: appTheme.fontFamily,
  },

  grid2x2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statTile: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#FFF7ED',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FFE4C9',
  },
  statIconBox: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 14.5,
    fontWeight: '900',
    fontFamily: appTheme.fontFamily,
  },
  statLabel: {
    marginTop: 2,
    fontSize: 10.5,
    color: '#6B7280',
    fontWeight: '600',
    fontFamily: appTheme.fontFamily,
  },

  savingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  savingsIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savingsTitle: { fontSize: 12.5, fontWeight: '800', color: '#111827', fontFamily: appTheme.fontFamily },
  savingsSub: {
    marginTop: 2,
    fontSize: 11.5,
    color: '#6B7280',
    fontWeight: '600',
    fontFamily: appTheme.fontFamily,
    lineHeight: 15,
  },

  adjustBtn: {
    flex: 1,
    minWidth: 0,
    marginTop: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: ZORA_ORANGE,
    paddingVertical: 11,
    borderRadius: 16,
    ...shadow({ color: ZORA_ORANGE, offset: { width: 0, height: 4 }, opacity: 0.28, radius: 10, elevation: 3 }),
  },
  adjustBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 11.5,
    fontFamily: appTheme.fontFamily,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#FFE1C2',
    ...shadow({ color: '#000', offset: { width: 0, height: 8 }, opacity: 0.12, radius: 16, elevation: 8 }),
  },
  modalHead: { flexDirection: 'row', alignItems: 'center' },
  modalIconBox: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: ZORA_ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: { fontSize: 17, fontWeight: '900', color: '#111827', fontFamily: appTheme.fontFamily },
  modalSub: { marginTop: 2, fontSize: 12, color: '#6B7280', fontWeight: '600', fontFamily: appTheme.fontFamily },
  suspensionAdminHint: { color: '#7F1D1D', backgroundColor: '#FEE2E2', borderRadius: 8, padding: 10, fontSize: 13, lineHeight: 19, fontFamily: appTheme.fontFamily },
  modalClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDivider: { height: 1, backgroundColor: '#FFEFD9', marginVertical: 14 },
  modalInfoGrid: { flexDirection: 'row', gap: 10 },
  miniInfoCard: {
    flex: 1,
    backgroundColor: '#FFF7ED',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FFE4C9',
  },
  miniDot: { width: 6, height: 6, borderRadius: 3, marginBottom: 6 },
  miniInfoLabel: { fontSize: 10.5, color: '#6B7280', fontWeight: '600', fontFamily: appTheme.fontFamily },
  miniInfoValue: { marginTop: 2, fontSize: 14, fontWeight: '900', color: '#111827', fontFamily: appTheme.fontFamily },

  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
    marginBottom: 6,
  },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFE1C2',
    borderRadius: 16,
    paddingHorizontal: 14,
  },
  amountPrefix: {
    color: ZORA_ORANGE_DARK,
    fontWeight: '800',
    fontSize: 14,
    marginRight: 8,
    fontFamily: appTheme.fontFamily,
  },
  amountInput: {
    flex: 1,
    height: 50,
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  quickBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFE1C2',
    alignItems: 'center',
  },
  quickBtnText: { color: ZORA_ORANGE_DARK, fontSize: 11.5, fontWeight: '800', fontFamily: appTheme.fontFamily },
  quickBtnDanger: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  quickBtnTextDanger: { color: ZORA_RED },

  descInput: {
    minHeight: 64,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#FFE1C2',
    borderRadius: 16,
    backgroundColor: '#FFF7ED',
    color: '#111827',
    fontSize: 13,
    textAlignVertical: 'top',
    fontFamily: appTheme.fontFamily,
  },

  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cancelBtnText: { color: '#374151', fontSize: 13.5, fontWeight: '800', fontFamily: appTheme.fontFamily },
  confirmBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: ZORA_ORANGE,
    paddingVertical: 13,
    borderRadius: 14,
    ...shadow({ color: ZORA_ORANGE, offset: { width: 0, height: 4 }, opacity: 0.28, radius: 10, elevation: 3 }),
  },
  confirmBtnText: { color: '#fff', fontSize: 13.5, fontWeight: '800', fontFamily: appTheme.fontFamily },
  btnDisabled: { opacity: 0.6 },

  cardActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    width: '100%',
  },
  actionsBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#FFF7ED',
    paddingVertical: 11,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFD3A7',
  },
  actionsBtnText: {
    color: ZORA_ORANGE,
    fontWeight: '800',
    fontSize: 11.5,
    fontFamily: appTheme.fontFamily,
  },

  actionsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.55)',
    justifyContent: 'flex-end',
  },
  actionsModalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    height: '88%',
    borderWidth: 1,
    borderColor: '#FFE1C2',
    ...shadow({ color: '#000', offset: { width: 0, height: -8 }, opacity: 0.15, radius: 20, elevation: 10 }),
  },
  actionsModalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  actionsAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: ZORA_ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFE1C2',
  },
  actionsAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    fontFamily: appTheme.fontFamily,
  },
  actionsModalTitle: { fontSize: 16, fontWeight: '900', color: '#111827', fontFamily: appTheme.fontFamily },
  actionsModalSub: { marginTop: 2, fontSize: 12, color: '#6B7280', fontWeight: '600', fontFamily: appTheme.fontFamily },
  actionsCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },

  actionsTabsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#FFEFD9',
    marginBottom: 6,
  },
  actionTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F7F7F7',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flex: 1,
    minWidth: '47%',
    justifyContent: 'center',
  },
  actionTabActive: {
    backgroundColor: ZORA_ORANGE,
    borderColor: ZORA_ORANGE,
  },
  actionTabLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4B5563',
    fontFamily: appTheme.fontFamily,
  },
  actionTabLabelActive: {
    color: '#FFF',
  },
  actionTabCount: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTabCountActive: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  actionTabCountText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#4B5563',
    fontFamily: appTheme.fontFamily,
  },
  actionTabCountTextActive: {
    color: '#FFF',
  },

  actionsLoadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionsLoadingText: {
    marginTop: 12,
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: appTheme.fontFamily,
  },

  emptySectionWrap: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptySectionIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFE1C2',
    marginBottom: 14,
  },
  emptySectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', fontFamily: appTheme.fontFamily },
  emptySectionSub: {
    marginTop: 6,
    fontSize: 12.5,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
    fontFamily: appTheme.fontFamily,
  },

  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFDFB',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#FFEFD9',
  },
  activityIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
  },
  activitySubtitle: {
    marginTop: 3,
    fontSize: 11.5,
    color: '#6B7280',
    fontWeight: '600',
    fontFamily: appTheme.fontFamily,
    lineHeight: 15,
  },
  activityStatusPill: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  activityStatusText: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: appTheme.fontFamily,
  },
  activityAmount: {
    fontSize: 13.5,
    fontWeight: '900',
    fontFamily: appTheme.fontFamily,
    marginLeft: 8,
    maxWidth: 120,
    textAlign: 'right',
  },
});
