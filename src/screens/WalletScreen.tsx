import * as React from 'react';
const { useEffect, useState, useCallback, useRef } = React;
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { AppState, AppStateStatus } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppStore } from '../store/appStore';
import { appTheme, shadow } from '../theme/appTheme';
import { isCurrentUserAdmin } from '../services/admin';
import {
  copyToClipboard,
  getReferralSummary,
  withdrawBonus,
  buildInviteLink,
  type ReferralSummary,
} from '../services/referrals';
import { invalidateDashboardCache } from '../hooks/useDashboardSummary';
import { invalidateFinanceCache } from '../services/finance';
import {
  enableBiometric,
  getPhoneAliasEmail,
  getUserProfile,
  loadBiometricCredentials,
  saveBiometricCredentials,
  clearBiometricCredentials,
  signOut,
  deleteAccount,
  signInWithPhone,
} from '../services/auth';

const ZORA_ORANGE = '#FF6A2B';
const ZORA_ORANGE_DARK = '#FF7A00';

type ProfileInfo = {
  id: string;
  full_name?: string;
  phone_number?: string;
  invite_code?: string | null;
  biometric_enabled?: boolean;
};

type MenuItemProps = {
  icon: any;
  iconBg: string;
  iconColor: string;
  label: string;
  subtitle?: string;
  rightElement?: React.ReactNode;
  onPress?: () => void;
  isLast?: boolean;
  danger?: boolean;
};

function MenuItem({
  icon,
  iconBg,
  iconColor,
  label,
  subtitle,
  rightElement,
  onPress,
  isLast = false,
  danger = false,
}: MenuItemProps) {
  return (
    <TouchableOpacity
      style={[styles.menuItem, isLast && styles.menuItemLast]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <View style={[styles.menuIconBox, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={styles.menuTextBlock}>
        <Text style={[styles.menuLabel, danger && styles.menuLabelDanger]}>{label}</Text>
        {subtitle ? <Text style={styles.menuSubtitle}>{subtitle}</Text> : null}
      </View>
      {rightElement ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={danger ? '#DC2626' : '#9CA3AF'} /> : null)}
    </TouchableOpacity>
  );
}

export function WalletScreen() {
  const navigation = useNavigation<any>();
  const userName = useAppStore((state) => state.userName);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [requireActivationPassword, setRequireActivationPassword] = useState(false);
  const [activationPassword, setActivationPassword] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [refreshing, setRefreshing] = useState(false);
  const [referral, setReferral] = useState<ReferralSummary | null>(null);
  const [loadingReferral, setLoadingReferral] = useState(true);
  const [savingBonus, setSavingBonus] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', setAppState);
    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
      });
    }, [])
  );

  const flashCopied = (key: string) => {
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1600);
  };

  const inviteCode = profile?.invite_code || null;
  const referralCode = referral?.referral_code || inviteCode || '';
  const inviteLink = referral?.invite_link || buildInviteLink(referralCode);

  const onCopyCode = async () => {
    if (!referralCode) return;
    const ok = await copyToClipboard(referralCode);
    if (ok) flashCopied('code'); else Alert.alert('Erro', 'Não foi possível copiar.');
  };

  const onCopyLink = async () => {
    if (!inviteLink) return;
    const ok = await copyToClipboard(inviteLink);
    if (ok) flashCopied('link'); else Alert.alert('Erro', 'Não foi possível copiar.');
  };

  const onShare = async () => {
    if (!inviteLink) return;
    const msg = `Junte-se à Zora usando o meu link de indicação e compre um pacote N1 a N9 para começares a investir com retorno diário garantido. Eu ganho 10% do valor como bónus de indicação. Obrigado!\n\n${inviteLink}`;
    navigation.navigate('Main', {
      screen: 'Bate-Papo',
      params: { shareText: msg, shareUrl: inviteLink },
    });
  };

  const onWithdrawBonus = async () => {
    if (!referral || referral.bonus_balance <= 0) {
      Alert.alert('Sem bónus', 'Ainda não tem bónus para resgatar. Convide amigos e quando eles comprarem um pacote N1 a N9 você ganha 10% do valor.');
      return;
    }
    Alert.alert(
      'Resgatar bónus',
      `Deseja mover ${referral.bonus_balance_fmt} do saldo de bónus para o saldo disponível da carteira?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Resgatar tudo',
          style: 'default',
          onPress: async () => {
            setSavingBonus(true);
            try {
              const r = await withdrawBonus();
              if (r.success) {
                invalidateFinanceCache();
                invalidateDashboardCache();
                await loadAll(true);
                navigation.navigate('Main', { screen: 'Home' });
              } else {
                Alert.alert('Aviso', r.message);
              }
            } finally {
              setSavingBonus(false);
            }
          },
        },
      ]
    );
  };

  const loadAll = useCallback(async (forceFresh = false) => {
    try {
      const userProfile = await getUserProfile();
      setProfile(userProfile as ProfileInfo);
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(compatible && enrolled);
    } catch (error) {
      console.error('Erro ao carregar conta:', error);
      navigation.replace('Login');
    }
    try {
      setLoadingReferral(true);
      const ref = await getReferralSummary(forceFresh);
      setReferral(ref);
    } catch (e: any) {
      console.warn('referral summary error', e?.message);
    } finally {
      setLoadingReferral(false);
    }
    setLoading(false);
  }, [navigation]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await loadAll(true); } finally { setRefreshing(false); }
  };

  useEffect(() => {
    async function checkAdminStatus() {
      try {
        setCheckingAdmin(true);
        const admin = await isCurrentUserAdmin(true);
        setIsAdmin(admin);
      } catch (e) {
        setIsAdmin(false);
      } finally {
        setCheckingAdmin(false);
      }
    }
    checkAdminStatus();
  }, []);

  async function handleLogout() {
    try {
      setSaving(true);
      const { error } = await signOut();
      if (error) throw new Error(error);
      useAppStore.setState({ userName: '' });
      navigation.replace('Login');
    } catch (error: any) {
      Alert.alert('Erro', error.message || 'Não foi possível sair da conta');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAccount() {
    Alert.alert(
      'Eliminar conta',
      'Tem a certeza que deseja eliminar permanentemente a sua conta? Esta ação não pode ser revertida e todos os seus dados serão perdidos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sim, eliminar',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Confirmação final',
              'Esta é a sua última chance. Todos os seus investimentos, poupanças e histórico serão eliminados definitivamente. Continuar?',
              [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Eliminar definitivamente',
                  style: 'destructive',
                  onPress: async () => {
                    setDeleteLoading(true);
                    try {
                      const { error } = await deleteAccount();
                      if (error) throw new Error(error);
                      useAppStore.setState({ userName: '' });
                      Alert.alert(
                        'Conta eliminada',
                        'A sua conta foi eliminada com sucesso. Lamentamos vê-lo partir.',
                        [{ text: 'OK', onPress: () => navigation.replace('Login') }]
                      );
                    } catch (error: any) {
                      Alert.alert(
                        'Erro ao eliminar',
                        error.message || 'Não foi possível eliminar a conta. Tente novamente ou contacte o suporte.'
                      );
                    } finally {
                      setDeleteLoading(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }

  async function deactivateBiometry() {
    if (appState !== 'active') return;
    setActionLoading(true);
    try {
      const authResult = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirme com biometria para desativar',
        fallbackLabel: 'Usar senha',
      });
      if (!authResult.success) {
        throw new Error('Autenticação biométrica falhou.');
      }
      const { error } = await enableBiometric(false);
      if (error) throw new Error(error);
      await clearBiometricCredentials();
      setProfile((current) => (current ? { ...current, biometric_enabled: false } : current));
      setStatusMessage('Login biométrico desativado.');
    } catch (error: any) {
      console.error('Erro ao desativar biometria:', error);
      if (appState === 'active') {
        Alert.alert('Erro', error.message || 'Não foi possível desativar a biometria.');
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function activateBiometry() {
    if (!biometricAvailable) {
      Alert.alert('Biometria indisponível', 'Este dispositivo não suporta autenticação biométrica.');
      return;
    }

    const credentials = await loadBiometricCredentials();
    if (!credentials && !requireActivationPassword) {
      setRequireActivationPassword(true);
      setStatusMessage('Digite sua senha atual para ativar a biometria.');
      return;
    }

    const phoneNumber = profile?.phone_number || (profile as any)?.telefone;
    const email = phoneNumber ? getPhoneAliasEmail(phoneNumber) : null;
    if (!email || !phoneNumber) {
      setStatusMessage('Telefone não disponível para registrar biometria.');
      Alert.alert('Erro', 'Não foi possível obter o telefone do seu perfil. Tente novamente ou contacte o suporte.');
      return;
    }

    const normalizedPhone = phoneNumber.replace(/\D/g, '');

    if (!credentials && !activationPassword) {
      setStatusMessage('Insira a senha da conta para salvar as credenciais biométricas.');
      return;
    }

    if (appState !== 'active') {
      console.warn('Skipping biometric activation while app not active');
      return;
    }

    setActionLoading(true);
    try {
      const password = credentials?.password ?? activationPassword;

      if (!credentials) {
        const onlyNumbersPIN = /^\d+$/.test(password);
        if (!onlyNumbersPIN || password.length !== 6) {
          throw new Error('A senha deve ser um PIN de 6 dígitos numéricos.');
        }
        const validation = await signInWithPhone(normalizedPhone, password);
        if (validation.error || !validation.session?.user) {
          throw new Error('Senha incorreta. Verifique o seu PIN e tente novamente.');
        }
      }

      const authResult = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Use sua biometria para ativar o login seguro',
        fallbackLabel: 'Usar senha',
        cancelLabel: 'Cancelar',
        disableDeviceFallback: false,
      });

      if (!authResult.success) {
        return;
      }

      const { error } = await enableBiometric(true);
      if (error) throw new Error(error);

      await saveBiometricCredentials(email, password, normalizedPhone);
      setProfile((current) => (current ? { ...current, biometric_enabled: true } : current));
      setRequireActivationPassword(false);
      setActivationPassword('');
      setStatusMessage('Login biométrico ativado com sucesso.');
    } catch (error: any) {
      console.error('Erro ao ativar biometria:', error);
      if (appState === 'active') {
        Alert.alert('Erro', error.message || 'Não foi possível ativar a biometria.');
      } else {
        console.warn('Skipped alert for biometric activation error because app is not active');
      }
    } finally {
      setActionLoading(false);
    }
  }

  const accountName = profile?.full_name ?? userName ?? 'Cliente Zora';
  const biometricStatus = profile?.biometric_enabled ? 'Ativado' : 'Desativado';
  const profileSubtitle = profile?.phone_number ? `Telefone ${profile.phone_number}` : 'Sem telefone definido';
  const initialLetter = (accountName || 'Z')[0].toUpperCase();

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingScreen}>
          <ActivityIndicator color={ZORA_ORANGE} size="large" />
          <Text style={styles.loadingScreenText}>A carregar a sua conta...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
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
              <Text style={styles.webHeaderTitle}>Definições</Text>
              <Text style={styles.webHeaderSubtitle}>Conta, segurança e preferências</Text>
            </View>
            <View style={{ width: 40 }} />
          </View>
        ) : null}

        <LinearGradient
          colors={['#FF6A2B', '#FF8A3D', '#FFB06A']}
          start={[0, 0]}
          end={[1, 1]}
          style={styles.profileHero}
        >
          <View style={styles.profileHeroGlow} />
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            disabled={saving || deleteLoading}
            activeOpacity={0.7}
          >
            {saving ? (
              <ActivityIndicator color="#DC2626" size="small" />
            ) : (
              <MaterialCommunityIcons name="logout" size={20} color="#DC2626" />
            )}
          </TouchableOpacity>
          <View style={styles.profileHeroInner}>
            <View style={styles.avatarLarge}>
              <Text style={styles.avatarLargeText}>{initialLetter}</Text>
            </View>
            <View style={styles.profileInfoBlock}>
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#FFF" />
                <Text style={styles.verifiedBadgeText}>Verificado</Text>
              </View>
              <Text style={styles.profileName}>{accountName}</Text>
              <Text style={styles.profileSub}>{profileSubtitle}</Text>
            </View>
          </View>

          <View style={styles.profileStatsRow}>
            <View style={styles.statChip}>
              <MaterialCommunityIcons name="shield-check" size={15} color="#FFF" />
              <Text style={styles.statChipText}>Seguro</Text>
            </View>
            <View style={[styles.statChip, profile?.biometric_enabled ? styles.statChipActive : styles.statChipMuted]}>
              <Ionicons
                name="finger-print"
                size={15}
                color={profile?.biometric_enabled ? '#166534' : '#6B7280'}
              />
              <Text
                style={[
                  styles.statChipText,
                  profile?.biometric_enabled ? styles.statChipTextActive : styles.statChipTextMuted,
                ]}
              >
                Biometria {biometricStatus.toLowerCase()}
              </Text>
            </View>
           
          </View>
        </LinearGradient>

        <View style={styles.sectionCard}>
          <View style={styles.sectionCardHeader}>
            <View>
              <Text style={styles.sectionCardTitle}>Perfil e indicações</Text>
              <Text style={styles.sectionCardSubtitle}>Dados pessoais, código e bónus de convite</Text>
            </View>
          </View>

        

          <View style={styles.referralCard}>
            <View style={styles.referralCardHeader}>
              <View style={styles.referralIconWrap}>
                <Ionicons name="gift" size={18} color="#FFF" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.referralTitle}>Bónus de indicação</Text>
                <Text style={styles.referralSubtitle}>Ganhe 10% em cada pacote N1 a N9 indicado</Text>
              </View>
            </View>

            <View style={styles.referralBalanceRow}>
              <View>
                <Text style={styles.referralBalanceLabel}>Bonus disponíveis</Text>
                <Text style={styles.referralBalanceValue}>{loadingReferral ? '…' : referral?.bonus_balance_fmt ?? 'MZN 0,00'}</Text>
              </View>
              <TouchableOpacity
                style={[styles.withdrawButton, (savingBonus || loadingReferral || !referral || referral.bonus_balance <= 0) && styles.withdrawButtonDisabled]}
                onPress={onWithdrawBonus}
                disabled={savingBonus || loadingReferral || !referral || referral.bonus_balance <= 0}
              >
                {savingBonus ? <ActivityIndicator size="small" color={ZORA_ORANGE} /> : <Ionicons name="download-outline" size={16} color={ZORA_ORANGE} />}
                <Text style={styles.withdrawButtonText}>Resgatar</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.referralFieldRow}>
              <Text style={styles.referralFieldLabel}>Seu código</Text>
              <View style={styles.referralValueRow}>
                <Text style={styles.referralCodeText} selectable>{referralCode || '---'}</Text>
                <TouchableOpacity style={[styles.referralActionPill, copiedKey === 'code' && styles.referralActionPillActive]} onPress={onCopyCode} disabled={!referralCode}>
                  <Ionicons name={copiedKey === 'code' ? 'checkmark' : 'copy-outline'} size={14} color={copiedKey === 'code' ? '#FFF' : ZORA_ORANGE} />
                  <Text style={[styles.referralActionText, copiedKey === 'code' && styles.referralActionTextActive]}>{copiedKey === 'code' ? 'Copiado' : 'Copiar'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.referralFieldRow}>
              <Text style={styles.referralFieldLabel}>Link de indicação</Text>
              <View style={styles.referralValueRow}>
                <Text style={styles.referralLinkText} numberOfLines={1} selectable>{inviteLink || '---'}</Text>
              </View>
              <View style={styles.referralActionsRow}>
                <TouchableOpacity style={[styles.referralActionBtn, copiedKey === 'link' && styles.referralActionBtnActive]} onPress={onCopyLink} disabled={!inviteLink}>
                  <Ionicons name={copiedKey === 'link' ? 'checkmark' : 'link'} size={15} color={copiedKey === 'link' ? '#FFF' : ZORA_ORANGE} />
                  <Text style={[styles.referralActionBtnText, copiedKey === 'link' && styles.referralActionBtnTextActive]}>{copiedKey === 'link' ? 'Copiado' : 'Copiar link'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.referralActionBtn, styles.referralActionBtnPrimary]} onPress={onShare} disabled={!inviteLink}>
                  <Ionicons name="share-social-outline" size={15} color="#FFF" />
                  <Text style={styles.referralActionBtnTextPrimary}>Partilhar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.menuList}>
            
            <MenuItem
              icon="shield-checkmark-outline"
              iconBg="#EFF6FF"
              iconColor="#2563EB"
              label="Privacidade e dados"
              subtitle="Gerir as suas permissões"
              onPress={() => navigation.navigate('Policies')}
              isLast
            />
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionCardHeader}>
            <View>
              <Text style={styles.sectionCardTitle}>Segurança</Text>
              <Text style={styles.sectionCardSubtitle}>Proteja a sua conta</Text>
            </View>
          </View>

          <View style={styles.menuList}>
            <MenuItem
              icon="finger-print"
              iconBg="#FFF7ED"
              iconColor={ZORA_ORANGE_DARK}
              label="Login biométrico"
              subtitle={
                profile?.biometric_enabled
                  ? 'Toque para desativar o acesso rápido'
                  : biometricAvailable
                    ? 'Toque para ativar acesso seguro'
                    : 'Não disponível no dispositivo'
              }
              rightElement={
                <View style={[styles.statusBadge, profile?.biometric_enabled ? styles.statusBadgeOn : styles.statusBadgeOff]}>
                  <Text style={[styles.statusBadgeLabel, profile?.biometric_enabled ? styles.statusBadgeLabelOn : styles.statusBadgeLabelOff]}>
                    {biometricStatus}
                  </Text>
                </View>
              }
              onPress={
                !biometricAvailable
                  ? undefined
                  : profile?.biometric_enabled
                    ? deactivateBiometry
                    : activateBiometry
              }
            />

            {requireActivationPassword ? (
              <View style={styles.passwordSection}>
                <Text style={styles.passwordLabel}>Senha atual</Text>
                <TextInput
                  style={styles.passwordInput}
                  value={activationPassword}
                  onChangeText={setActivationPassword}
                  placeholder="Digite sua senha de 6 dígitos"
                  secureTextEntry
                  editable={!actionLoading}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholderTextColor="#9CA3AF"
                />
                <TouchableOpacity
                  style={[styles.confirmButton, actionLoading && styles.actionButtonDisabled]}
                  onPress={activateBiometry}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <Text style={styles.confirmButtonText}>Confirmar e ativar</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          {statusMessage ? (
            <View style={styles.statusMessageWrap}>
              <Ionicons name="information-circle-outline" size={16} color={ZORA_ORANGE_DARK} />
              <Text style={styles.statusMessage}>{statusMessage}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionCardHeader}>
            <View>
              <Text style={styles.sectionCardTitle}>Geral</Text>
              <Text style={styles.sectionCardSubtitle}>Preferências e suporte</Text>
            </View>
          </View>

          <View style={styles.menuList}>
            <MenuItem
              icon="help-circle-outline"
              iconBg="#FEF3C7"
              iconColor="#B45309"
              label="Central de ajuda"
              subtitle="Perguntas frequentes e tutoriais"
              onPress={() => navigation.navigate('Support')}
            />

            

            <MenuItem
              icon="document-text-outline"
              iconBg="#F3E8FF"
              iconColor="#7C3AED"
              label="Termos e políticas"
              subtitle="Saiba como protegemos os seus dados"
              onPress={() => navigation.navigate('Policies')}
              isLast
            />
          </View>
        </View>

        {isAdmin || checkingAdmin ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionCardHeader}>
              <View>
                <Text style={[styles.sectionCardTitle, { color: '#7C3AED' }]}>
                  <MaterialCommunityIcons name="shield-crown" size={18} color="#7C3AED" /> Administração
                </Text>
                <Text style={styles.sectionCardSubtitle}>
                  {checkingAdmin ? 'A verificar permissões…' : 'Painel de controlo da plataforma Zora'}
                </Text>
              </View>
              <View style={{ backgroundColor: '#F3E8FF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: '#DDD6FE' }}>
                {checkingAdmin ? (
                  <ActivityIndicator color="#7C3AED" size="small" />
                ) : (
                  <Text style={{ color: '#6D28D9', fontWeight: '800', fontSize: 11.5, fontFamily: appTheme.fontFamily }}>
                    ADMIN
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.menuList}>
              <MenuItem
                icon="stats-chart"
                iconBg="#F3E8FF"
                iconColor="#7C3AED"
                label="Painel Administrativo"
                subtitle="Estatísticas, depósitos, saques e utilizadores"
                onPress={() => navigation.navigate('AdminDashboard')}
                isLast
              />
            </View>
          </View>
        ) : null}

        <View style={[styles.sectionCard, styles.dangerCard]}>
          <View style={styles.sectionCardHeader}>
            <View>
              <Text style={[styles.sectionCardTitle, styles.dangerTitle]}>Zona perigosa</Text>
              <Text style={styles.sectionCardSubtitle}>Ações irreversíveis</Text>
            </View>
            <MaterialCommunityIcons
              name="alert-octagon-outline"
              size={24}
              color="#DC2626"
            />
          </View>

          <View style={styles.dangerBox}>
            <View style={styles.dangerBoxInner}>
              <Ionicons name="warning-outline" size={18} color="#DC2626" />
              <Text style={styles.dangerText}>
                Eliminar a sua conta removerá permanentemente todos os seus dados, incluindo investimentos, poupanças e histórico de transações.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.deleteButton, deleteLoading && styles.actionButtonDisabled]}
              onPress={handleDeleteAccount}
              disabled={deleteLoading}
              activeOpacity={0.8}
            >
              {deleteLoading ? (
                <>
                  <ActivityIndicator color="#FFF" size="small" style={{ marginRight: 10 }} />
                  <Text style={styles.deleteButtonText}>A eliminar...</Text>
                </>
              ) : (
                <>
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color="#FFF" />
                  <Text style={styles.deleteButtonText}>Eliminar a minha conta</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.appVersionLabel}>Zora • Versão 1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF8F3' },
  contentContainer: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 60 },
  loadingScreen: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingScreenText: { marginTop: 14, color: '#6B7280', fontSize: 14, fontFamily: appTheme.fontFamily, fontWeight: '600' },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
    letterSpacing: -0.3,
  },
  logoutButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },

  profileHero: {
    borderRadius: 30,
    padding: 22,
    marginBottom: 20,
    overflow: 'hidden',
    shadowColor: ZORA_ORANGE,
    shadowOpacity: 0.32,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 9,
  },
  profileHeroGlow: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  profileHeroInner: { flexDirection: 'row', alignItems: 'center', zIndex: 1 },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    shadowColor: 'rgba(0,0,0,0.12)',
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  avatarLargeText: {
    fontSize: 30,
    fontWeight: '900',
    color: ZORA_ORANGE,
    fontFamily: appTheme.fontFamily,
  },
  profileInfoBlock: { flex: 1 },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(22, 163, 74, 0.9)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    marginBottom: 8,
  },
  verifiedBadgeText: {
    color: '#FFF',
    fontSize: 10.5,
    fontWeight: '800',
    marginLeft: 4,
    fontFamily: appTheme.fontFamily,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFF',
    fontFamily: appTheme.fontFamily,
    marginBottom: 4,
  },
  profileSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.92)',
    fontFamily: appTheme.fontFamily,
  },
  profileStatsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 18, gap: 8, zIndex: 1 },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.24)',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  statChipText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 11.5,
    fontFamily: appTheme.fontFamily,
  },
  statChipActive: { backgroundColor: '#DCFCE7' },
  statChipMuted: { backgroundColor: 'rgba(255,255,255,0.2)' },
  statChipTextActive: { color: '#166534' },
  statChipTextMuted: { color: 'rgba(255,255,255,0.9)' },

  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    padding: 18,
    marginBottom: 16,
    shadowColor: appTheme.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.04)',
  },
  sectionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionCardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
    marginBottom: 2,
  },
  sectionCardSubtitle: {
    fontSize: 12.5,
    color: '#6B7280',
    fontFamily: appTheme.fontFamily,
  },
  profileSummaryCard: {
    backgroundColor: '#FFF7ED',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FFE1C2',
    marginBottom: 12,
  },
  profileSummaryRow: { flexDirection: 'row', alignItems: 'center' },
  profileSummaryAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: ZORA_ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileSummaryName: { fontSize: 15, fontWeight: '800', color: '#111827', fontFamily: appTheme.fontFamily },
  profileSummarySub: { fontSize: 12, color: '#6B7280', marginTop: 2, fontFamily: appTheme.fontFamily },
  profileSummaryInvite: { fontSize: 11.5, color: ZORA_ORANGE_DARK, marginTop: 4, fontWeight: '700', fontFamily: appTheme.fontFamily },
  referralCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FFE1C2',
    marginBottom: 12,
  },
  referralCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  referralIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: ZORA_ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  referralTitle: { fontSize: 14, fontWeight: '800', color: '#111827', fontFamily: appTheme.fontFamily },
  referralSubtitle: { fontSize: 12, color: '#6B7280', marginTop: 2, fontFamily: appTheme.fontFamily },
  referralBalanceRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, columnGap: 12 },
  referralBalanceLabel: { fontSize: 11.5, color: '#9A4D00', fontWeight: '700', fontFamily: appTheme.fontFamily, flexShrink: 1 },
  referralBalanceValue: { fontSize: 22, fontWeight: '900', color: '#111827', marginTop: 2, fontFamily: appTheme.fontFamily, flexShrink: 1 },
  withdrawButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    marginTop: 6,
    flexShrink: 0,
  },
  withdrawButtonDisabled: { opacity: 0.55 },
  withdrawButtonText: { color: ZORA_ORANGE, fontWeight: '800', fontSize: 12, fontFamily: appTheme.fontFamily },
  referralFieldRow: { marginTop: 10 },
  referralFieldLabel: { fontSize: 12, fontWeight: '700', color: '#9A4D00', marginBottom: 6, fontFamily: appTheme.fontFamily },
  referralValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFE1C2',
  },
  referralCodeText: { fontSize: 16, fontWeight: '900', color: ZORA_ORANGE_DARK, letterSpacing: 0.8, fontFamily: appTheme.fontFamily },
  referralActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  referralActionPillActive: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  referralActionText: { color: ZORA_ORANGE, fontWeight: '700', fontSize: 12, fontFamily: appTheme.fontFamily },
  referralActionTextActive: { color: '#FFF' },
  referralLinkText: { fontSize: 13, color: '#111827', flex: 1, marginRight: 8, fontWeight: '500', fontFamily: appTheme.fontFamily },
  referralActionsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, gap: 10 },
  referralActionBtn: {
    flex: 1,
    minWidth: 130,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
    backgroundColor: '#FFF',
  },
  referralActionBtnActive: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  referralActionBtnText: { color: ZORA_ORANGE, fontWeight: '700', fontSize: 12, fontFamily: appTheme.fontFamily },
  referralActionBtnTextActive: { color: '#FFF' },
  referralActionBtnPrimary: { backgroundColor: ZORA_ORANGE, borderColor: ZORA_ORANGE },
  referralActionBtnTextPrimary: { color: '#FFF', fontWeight: '700', fontSize: 12, fontFamily: appTheme.fontFamily },
  scoreBadge: {
    backgroundColor: '#ECFDF3',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  scoreBadgeValue: {
    color: '#15803D',
    fontWeight: '900',
    fontSize: 14,
    fontFamily: appTheme.fontFamily,
  },

  menuList: {
    backgroundColor: '#FAFAFA',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  menuItemLast: { borderBottomWidth: 0 },
  menuIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuTextBlock: { flex: 1 },
  menuLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
    marginBottom: 2,
  },
  menuLabelDanger: { color: '#DC2626' },
  menuSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: appTheme.fontFamily,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusBadgeOn: { backgroundColor: '#DCFCE7', borderWidth: 1, borderColor: '#BBF7D0' },
  statusBadgeOff: { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  statusBadgeLabel: { fontSize: 11.5, fontWeight: '700', fontFamily: appTheme.fontFamily },
  statusBadgeLabelOn: { color: '#15803D' },
  statusBadgeLabelOff: { color: '#6B7280' },

  passwordSection: {
    marginTop: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFE0C2',
  },
  passwordLabel: {
    fontSize: 12,
    color: '#9A4D00',
    marginBottom: 8,
    fontFamily: appTheme.fontFamily,
    fontWeight: '700',
  },
  passwordInput: {
    borderWidth: 1,
    borderColor: '#F6D7B8',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    backgroundColor: '#FFFFFF',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
    marginBottom: 12,
  },
  confirmButton: {
    backgroundColor: ZORA_ORANGE,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: appTheme.fontFamily,
  },
  actionButtonDisabled: { opacity: 0.6 },

  statusMessageWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    backgroundColor: '#FFF7ED',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FFE0C2',
  },
  statusMessage: {
    marginLeft: 8,
    fontSize: 12.5,
    color: '#78350F',
    fontFamily: appTheme.fontFamily,
    fontWeight: '500',
    flex: 1,
  },

  chartCard: {
    padding: 14,
    borderRadius: 20,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFE0C2',
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  chartLabel: {
    fontSize: 11.5,
    color: '#9A4D00',
    fontWeight: '700',
    fontFamily: appTheme.fontFamily,
  },
  chartValue: {
    fontSize: 18,
    color: '#111827',
    fontWeight: '800',
    fontFamily: appTheme.fontFamily,
    marginTop: 2,
  },
  chartBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  chartBadgeText: {
    color: ZORA_ORANGE_DARK,
    fontWeight: '800',
    fontSize: 12,
    fontFamily: appTheme.fontFamily,
  },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 100,
    marginTop: 4,
    paddingHorizontal: 2,
  },
  bar: {
    flex: 1,
    marginHorizontal: 4,
    borderRadius: 999,
    backgroundColor: ZORA_ORANGE,
    opacity: 0.9,
    minHeight: 8,
  },
  barHighlight: {
    backgroundColor: '#E85D1F',
    opacity: 1,
    shadowColor: ZORA_ORANGE,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  chartLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingHorizontal: 2,
  },
  legendText: {
    fontSize: 10.5,
    color: '#7C2D12',
    fontWeight: '600',
    fontFamily: appTheme.fontFamily,
  },

  dangerCard: {
    backgroundColor: '#FFF',
    borderColor: 'rgba(220, 38, 38, 0.12)',
  },
  dangerTitle: { color: '#DC2626' },
  dangerBox: {},
  dangerBoxInner: {
    flexDirection: 'row',
    backgroundColor: '#FEF2F2',
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: 14,
  },
  dangerText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 12.5,
    color: '#991B1B',
    lineHeight: 19,
    fontFamily: appTheme.fontFamily,
    fontWeight: '500',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    borderRadius: 16,
    paddingVertical: 15,
    shadowColor: '#DC2626',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  deleteButtonText: {
    color: '#FFF',
    fontSize: 14.5,
    fontWeight: '800',
    fontFamily: appTheme.fontFamily,
    marginLeft: 8,
  },

  appVersionLabel: {
    textAlign: 'center',
    marginTop: 10,
    color: '#9CA3AF',
    fontSize: 11.5,
    fontFamily: appTheme.fontFamily,
    fontWeight: '500',
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
