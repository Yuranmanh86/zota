import * as React from 'react';
const { useEffect, useState, useCallback, useRef } = React;
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, AppState, Platform, Linking, Alert, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppStore } from '../store/appStore';
import { useDashboardSummary, DASHBOARD_QUERY_KEY, bumpDashboardEpoch, invalidateDashboardCache } from '../hooks/useDashboardSummary';
import { appTheme } from '../theme/appTheme';
import { backend } from '../services/backendClient';
import { getUserProfile } from '../services/auth';
import { getLastReadAll } from '../services/chat';
import { invalidateFinanceCache } from '../services/finance';
import { getGlobalQueryClient } from '../providers/QueryProvider';

function ensureDownloadModalStyles() {
  if (Platform.OS !== 'web') return;
  try {
    const id = 'zora-download-modal-styles';
    if (typeof document === 'undefined' || document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.innerHTML = `
      .zora-download-overlay {
        position: fixed !important;
        inset: 0 !important;
        z-index: 9999 !important;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .zora-download-backdrop {
        position: absolute;
        inset: 0;
        background-color: rgba(17, 24, 39, 0.48);
        backdrop-filter: blur(10px) saturate(140%);
        -webkit-backdrop-filter: blur(10px) saturate(140%);
      }
      .zora-download-card-wrap {
        position: relative;
        z-index: 1;
        width: 100%;
        max-width: 480px;
        padding: 0 20px;
        animation: zoraFadeIn 350ms cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      .zora-download-card {
        animation: zoraPopIn 420ms cubic-bezier(0.22, 1.2, 0.36, 1) both;
      }
      @keyframes zoraPopIn {
        0% { opacity: 0; transform: translateY(14px) scale(0.94); }
        60% { transform: translateY(-2px) scale(1.01); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes zoraFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  } catch (e) {
    // ignore
  }
}

function setNativeClassName(target: any, className: string) {
  if (!target || typeof target.setNativeProps !== 'function') return;
  try {
    target.setNativeProps({ className });
  } catch {
    // ignore
  }
}

interface DownloadAppModalProps {
  visible: boolean;
  onDismiss: () => void;
  onDownload: () => void;
}

function DownloadAppModal({ visible, onDismiss, onDownload }: DownloadAppModalProps) {
  const overlayRef = useRef<any>(null);
  const backdropRef = useRef<any>(null);
  const cardWrapRef = useRef<any>(null);
  const cardRef = useRef<any>(null);

  useEffect(() => {
    if (!visible) return;
    ensureDownloadModalStyles();
    const applyClasses = () => {
      requestAnimationFrame(() => {
        setNativeClassName(overlayRef.current, 'zora-download-overlay');
        setNativeClassName(backdropRef.current, 'zora-download-backdrop');
        setNativeClassName(cardWrapRef.current, 'zora-download-card-wrap');
        setNativeClassName(cardRef.current, 'zora-download-card');
      });
    };
    if (Platform.OS === 'web') {
      applyClasses();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View ref={overlayRef} style={styles.modalOverlayFallback} collapsable={false}>
        <TouchableOpacity
          ref={backdropRef as any}
          style={styles.modalBackdropFallback}
          activeOpacity={1}
          onPress={onDismiss}
        />
        <View
          ref={cardWrapRef}
          style={styles.modalCenterFallback}
          onStartShouldSetResponder={() => true}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <View ref={cardRef} style={styles.downloadAppCard}>
            <View style={styles.downloadAppCardGlow1} />
            <View style={styles.downloadAppCardGlow2} />
            <View style={styles.downloadAppCardInner}>
              <View style={styles.downloadAppIconBox}>
                <LinearGradient
                  colors={['#FF6A2B', '#FF2D2D']}
                  start={[0, 0]}
                  end={[1, 1]}
                  style={styles.downloadAppIconGradient}
                >
                  <Ionicons name="phone-portrait" size={28} color="#FFF" />
                </LinearGradient>
              </View>
              <View style={styles.downloadAppTextBlock}>
                <View style={styles.downloadAppBadge}>
                  <Ionicons name="sparkles" size={12} color="#FFD700" />
                  <Text style={styles.downloadAppBadgeText}>Experiência Premium</Text>
                </View>
                <Text style={styles.downloadAppTitle}>Descarregue a App Zora</Text>
                <Text style={styles.downloadAppSubtitle}>
                  Mais rápido, notificações push, biometria e uma experiência imersiva no seu telemóvel.
                </Text>
                <View style={styles.downloadAppFeatureRow}>
                  <View style={styles.downloadFeatureChip}>
                    <Ionicons name="flash" size={11} color="#FF7A00" />
                    <Text style={styles.downloadFeatureText}>Rápido</Text>
                  </View>
                  <View style={styles.downloadFeatureChip}>
                    <Ionicons name="notifications" size={11} color="#FF7A00" />
                    <Text style={styles.downloadFeatureText}>Push</Text>
                  </View>
                  <View style={styles.downloadFeatureChip}>
                    <Ionicons name="finger-print" size={11} color="#FF7A00" />
                    <Text style={styles.downloadFeatureText}>Seguro</Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity onPress={onDismiss} hitSlop={14} style={styles.downloadAppCloseBtn}>
                <Ionicons name="close" size={18} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.downloadAppCTA}
              activeOpacity={0.9}
              onPress={onDownload}
            >
              <Ionicons name="download" size={16} color="#FFF" />
              <Text style={styles.downloadAppCTAText}>Instalar App Mobile</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const ZORA_ORANGE = '#FF6A2B';
const ZORA_ORANGE_DARK = '#FF7A00';
const ZORA_ORANGE_DEEP = '#E85D1F';

const quickActions = [
  { label: 'Recarregar', icon: 'reload', screen: 'Reload', isTab: false, tabName: null as string | null, bgColor: '#FFF7ED', iconColor: ZORA_ORANGE_DARK, borderColor: '#FFD3A7' },
  { label: 'Sacar', icon: 'cash-outline', screen: 'Withdraw', isTab: false, tabName: null as string | null, bgColor: '#FEF3C7', iconColor: '#B45309', borderColor: '#FDE68A' },
  { label: 'Investir', icon: 'trending-up', screen: 'Investimentos', isTab: true, tabName: 'Investimentos', bgColor: '#ECFDF3', iconColor: '#059669', borderColor: '#A7F3D0' },
  { label: 'Poupar', icon: 'save-outline', screen: 'Poupança', isTab: true, tabName: 'Poupança', bgColor: '#EFF6FF', iconColor: '#2563EB', borderColor: '#BFDBFE' },
];

export function HomeScreen() {
  const navigation = useNavigation<any>();
  const userName = useAppStore((state) => state.userName);
  const welcomeMessage = useAppStore((state) => state.welcomeMessage);
  const setWelcomeMessage = useAppStore((state) => state.setWelcomeMessage);
  const hideBalance = useAppStore((state) => state.hideBalance);
  const setHideBalance = useAppStore((state) => state.setHideBalance);
  const loadPreferences = useAppStore((state) => state.loadPreferences);
  const { data, isLoading, isFetching } = useDashboardSummary();
  const isBusy = isLoading || isFetching;
  const [chatNotificationCount, setChatNotificationCount] = useState(0);
  const [loadingChatNotifications, setLoadingChatNotifications] = useState(false);
  const [showDownloadBanner, setShowDownloadBanner] = useState(false);
  const profileIdRef = React.useRef<string | null>(null);
  const downloadBannerShownRef = React.useRef(false);

  const dismissDownloadBanner = () => setShowDownloadBanner(false);

  const handleDownloadApp = () => {
    setShowDownloadBanner(false);
    if (Platform.OS === 'web') {
      try {
        const apkUrl = `${window.location.origin}/downloads/zora.apk`;
        const link = document.createElement('a');
        link.href = apkUrl;
        link.setAttribute('download', 'zora.apk');
        link.type = 'application/vnd.android.package-archive';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => {
          if (Alert && Alert.alert) {
            Alert.alert(
              'Download Iniciado',
              'A app Zora (zora.apk) está a ser descarregada. Após concluir, toque no ficheiro para instalar.\n\nCaso o download não inicie automaticamente, certifique-se de que o ficheiro zora.apk se encontra na pasta public/downloads do projeto.',
              [{ text: 'Entendido' }]
            );
          }
        }, 300);
      } catch {}
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'web') {
        setShowDownloadBanner(true);
      }
    }, [])
  );

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  useEffect(() => {
    if (welcomeMessage) {
      const timeout = setTimeout(() => setWelcomeMessage(null), 5000);
      return () => clearTimeout(timeout);
    }
  }, [welcomeMessage, setWelcomeMessage]);

  const refreshDebounceRef = useRef<number | null>(null);
  const chatDebounceRef = useRef<number | null>(null);

  const scheduleDashboardRefresh = useCallback(() => {
    try {
      if (refreshDebounceRef.current != null) {
        clearTimeout(refreshDebounceRef.current);
      }
      refreshDebounceRef.current = setTimeout(() => {
        refreshDebounceRef.current = null;
        try {
          invalidateFinanceCache();
          bumpDashboardEpoch();
          invalidateDashboardCache();
        } catch (e: any) {
          console.warn('[HomeScreen] scheduleDashboardRefresh error:', e?.message);
        }
      }, 350) as unknown as number;
    } catch {}
  }, []);

  const scheduleChatRefresh = useCallback(() => {
    try {
      if (chatDebounceRef.current != null) {
        clearTimeout(chatDebounceRef.current);
      }
      chatDebounceRef.current = setTimeout(() => {
        chatDebounceRef.current = null;
        loadChatNotificationsInternal();
      }, 500) as unknown as number;
    } catch {}
  }, []);

  const loadChatNotificationsInternal = useCallback(async () => {
    try {
      setLoadingChatNotifications(true);
      const profile = await getUserProfile().catch(() => null);
      const profileId = profile?.id;
      profileIdRef.current = profileId ?? null;
      if (!profileId) {
        setChatNotificationCount(0);
        return;
      }

      const { data: memberships, error: membershipsError } = await backend
        .from('chat_thread_members')
        .select('chat_thread_id')
        .eq('profile_id', profileId);

      if (membershipsError) throw membershipsError;

      const threadIds = (memberships ?? []).map((m: any) => m.chat_thread_id).filter(Boolean);
      if (threadIds.length === 0) {
        setChatNotificationCount(0);
        return;
      }

      const lastReadMap = await getLastReadAll().catch(() => ({} as Record<string, string>));
      const { data: messages, error } = await backend
        .from('chat_messages')
        .select('chat_thread_id,created_at,sender_profile_id')
        .in('chat_thread_id', threadIds)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const unreadCount = (messages ?? []).filter((message: any) => {
        const isMine = message.sender_profile_id === profileId;
        const lastReadAt = lastReadMap[message.chat_thread_id];
        return !isMine && (!lastReadAt || new Date(message.created_at).getTime() > new Date(lastReadAt).getTime());
      }).length;

      setChatNotificationCount(unreadCount);
    } catch (error: any) {
      console.warn('[HomeScreen] chat notification count error:', error?.message);
      setChatNotificationCount(0);
    } finally {
      setLoadingChatNotifications(false);
    }
  }, []);

  const loadChatNotifications = useCallback(() => {
    scheduleChatRefresh();
  }, [scheduleChatRefresh]);

  useFocusEffect(
    useCallback(() => {
      loadChatNotifications();
    }, [loadChatNotifications])
  );

  const chatChannelRef = useRef<any>(null);
  const authUserIdRef = useRef<string | null>(null);
  const channelsSetupRef = useRef<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    const setupChannels = async () => {
      if (channelsSetupRef.current && chatChannelRef.current) return;

      try {
        const sessRes: any = await backend.auth.getSession();
        const session = sessRes?.data?.session;
        if (!session?.user?.id) return;
        authUserIdRef.current = session.user.id;

        const profile = await getUserProfile().catch(() => null);
        const profileId = profile?.id;
        if (!profileId) return;

        profileIdRef.current = profileId;

        if (chatChannelRef.current) {
          try { chatChannelRef.current.unsubscribe(); } catch {}
          try { backend.removeChannel(chatChannelRef.current); } catch {}
          chatChannelRef.current = null;
        }

        try {
          const chatCh = backend.channel(`home_chat_${profileId}`);
          chatCh.on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'chat_messages' },
            () => {
              if (!isMounted) return;
              scheduleChatRefresh();
            }
          );
          chatCh.subscribe();
          chatChannelRef.current = chatCh;
        } catch (e: any) {
          console.warn('[HomeScreen] chat realtime setup error:', e?.message);
        }

        channelsSetupRef.current = true;
      } catch (err: any) {
        console.warn('[HomeScreen] setupChannels error:', err?.message);
      }
    };

    setupChannels();

    return () => {
      isMounted = false;

      if (refreshDebounceRef.current != null) {
        clearTimeout(refreshDebounceRef.current);
        refreshDebounceRef.current = null;
      }
      if (chatDebounceRef.current != null) {
        clearTimeout(chatDebounceRef.current);
        chatDebounceRef.current = null;
      }

      if (chatChannelRef.current) {
        try { chatChannelRef.current.unsubscribe(); } catch {}
        try { backend.removeChannel(chatChannelRef.current); } catch {}
        chatChannelRef.current = null;
      }
      channelsSetupRef.current = false;
    };
  }, [scheduleChatRefresh]);

  const getTimeOfDayGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  const maskValue = (val: string | undefined) => {
    if (!val) return 'MZN ••••••';
    if (!hideBalance) return val;
    return 'MZN ••••••';
  };

  const insets = useSafeAreaInsets();
  const contentPadBottom = Math.max(130, 76 + insets.bottom + 16 + 30);

  return (
    <>
      <SafeAreaView style={styles.container}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.contentContainer, { paddingBottom: contentPadBottom }]}
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.headerRow}>
          <View style={styles.userInfoBlock}>
            <View style={styles.avatarBadge}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>{(userName || 'C')[0].toUpperCase()}</Text>
              </View>
              <View style={styles.avatarOnlineDot} />
            </View>
            <View style={styles.userTextBlock}>
              <Text style={styles.greetingLabel}>{getTimeOfDayGreeting()},</Text>
              <Text style={styles.userNameText}>{userName || 'Cliente'}</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            {Platform.OS === 'web' ? (
              <TouchableOpacity
                style={[styles.headerIconBtn, styles.headerIconBtnDownload]}
                onPress={handleDownloadApp}
                activeOpacity={0.7}
              >
                <Ionicons name="download-outline" size={21} color={ZORA_ORANGE_DARK} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.headerIconBtn, Platform.OS === 'web' && styles.headerIconBtnSpaced]}
              onPress={() => navigation.navigate('Bate-Papo')}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="bell-outline" size={22} color="#374151" />
              {chatNotificationCount > 0 ? (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>
                    {chatNotificationCount > 99 ? '99+' : chatNotificationCount}
                  </Text>
                </View>
              ) : null}
              {loadingChatNotifications && chatNotificationCount === 0 ? <View style={styles.notificationDot} /> : null}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.headerIconBtn, styles.headerIconBtnSpaced]}
              onPress={() => navigation.navigate('Conta')}
              activeOpacity={0.7}
            >
              <Ionicons name="settings-outline" size={22} color="#374151" />
            </TouchableOpacity>
          </View>
        </View>

        {welcomeMessage ? (
          <View style={styles.banner}>
            <View style={styles.bannerIconWrap}>
              <Ionicons name="sparkles" size={18} color="#92400E" />
            </View>
            <Text style={styles.bannerText}>{welcomeMessage}</Text>
            <TouchableOpacity onPress={() => setWelcomeMessage(null)} hitSlop={12}>
              <Ionicons name="close" size={16} color="#92400E" />
            </TouchableOpacity>
          </View>
        ) : null}

        <LinearGradient
          colors={['#FF2D2D', '#FF5A1F', '#FF8A3D']}
          start={[0, 0]}
          end={[1, 1]}
          style={styles.heroCard}
        >
          <View style={styles.heroHeader}>
            <View style={{ flex: 1 }}>
              <View style={styles.heroEyebrowRow}>
                <Text style={styles.heroEyebrow}>Saldo principal</Text>
                <TouchableOpacity
                  onPress={() => setHideBalance(!hideBalance)}
                  activeOpacity={0.7}
                  style={styles.hideBalanceBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={hideBalance ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="rgba(255,255,255,0.92)"
                  />
                </TouchableOpacity>
              </View>
              {isBusy ? (
                <View style={styles.balanceLoadingRow}>
                  <ActivityIndicator color="#FFF" size="small" />
                  <Text style={styles.balanceLoadingText}>A actualizar...</Text>
                </View>
              ) : (
                <Text style={styles.balanceValue}>{maskValue(data?.principal)}</Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.accountStatusBadge}
              onPress={() => navigation.navigate('Conta')}
              activeOpacity={0.8}
            >
              <View style={styles.statusDot} />
              <Text style={styles.statusBadgeText}>Verificado</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.heroSubtext}>
            Actualizado agora • Dados protegidos
          </Text>

          <View style={styles.heroMetricsRow}>
            <View style={styles.heroMetricCard}>
              <View style={styles.metricIconRow}>
                <View style={[styles.metricIconBox, styles.metricIconBoxAvailable]}>
                  <Ionicons name="trending-up-outline" size={14} color="#FFF" />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.metricLabel}>Investido</Text>
                  {isBusy ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <Text style={styles.metricValue}>{maskValue(data?.totalInvested)}</Text>
                  )}
                </View>
              </View>
            </View>

            <View style={[styles.heroMetricCard, styles.heroMetricCardMargin]}>
              <View style={styles.metricIconRow}>
                <View style={[styles.metricIconBox, styles.metricIconBoxProfit]}>
                  <Ionicons name="trending-up" size={14} color="#FFF" />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.metricLabel}>Lucros</Text>
                  {isBusy ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <Text style={styles.metricValue}>{maskValue(data?.accumulatedProfits)}</Text>
                  )}
                </View>
              </View>
            </View>
          </View>
        </LinearGradient>

        {isBusy ? (
          <View style={styles.loadingStateCard}>
            <View style={styles.loadingSpinnerWrap}>
              <ActivityIndicator color={ZORA_ORANGE} size="small" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.loadingStateTitle}>A preparar os seus dados</Text>
              <Text style={styles.loadingStateSubtitle}>Isto demora apenas alguns segundos...</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>Acesso rápido</Text>
              <Text style={styles.sectionSubtitle}>O que pretende fazer hoje?</Text>
            </View>
            <TouchableOpacity
              style={styles.seeAllBtn}
              onPress={() => {}}
              activeOpacity={0.7}
            >
              <Text style={styles.seeAllText}>Ver tudo</Text>
              <Ionicons name="chevron-forward" size={14} color={ZORA_ORANGE_DARK} />
            </TouchableOpacity>
          </View>

            <View style={styles.actionsGrid}>
            {quickActions.map((action) => (
              <TouchableOpacity
                key={action.label}
                style={[
                  styles.actionCard,
                  { backgroundColor: action.bgColor, borderColor: action.borderColor },
                ]}
                onPress={() => {
                  if (action.isTab && action.tabName) {
                    navigation.navigate('Main', { screen: action.tabName });
                  } else {
                    navigation.navigate(action.screen);
                  }
                }}
                activeOpacity={0.75}
              >
                <View style={styles.actionIconWrap}>
                  <Ionicons name={action.icon as never} size={22} color={action.iconColor} />
                </View>
                <Text style={[styles.actionLabel, { color: action.iconColor }]}>
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.dashboardCard}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderText}>
                <Text style={styles.cardTitle}>Resumo financeiro</Text>
                <Text style={styles.cardSubtitle}>Visão geral dos seus investimentos</Text>
              </View>
              <View style={styles.tagBadge}>
                <Ionicons name="analytics-outline" size={12} color={ZORA_ORANGE_DARK} />
                <Text style={styles.tagBadgeText}>Semanal</Text>
              </View>
            </View>

            <View style={styles.summaryMetricsRow}>
              <View style={styles.summaryMetricBox}>
                <View style={[styles.summaryDot, { backgroundColor: '#059669' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryMetricLabel}>Poupança</Text>
                  <Text style={styles.summaryMetricValue}>{maskValue(data?.savingsValue)}</Text>
                </View>
              </View>
              <View style={styles.verticalDivider} />
              <View style={styles.summaryMetricBox}>
                <View style={[styles.summaryDot, { backgroundColor: ZORA_ORANGE_DARK }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryMetricLabel}>Investimentos</Text>
                  <Text style={styles.summaryMetricValue}>
                    {hideBalance ? '•• ativos' : (data?.activeInvestments ?? '0 ativos')}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.chartWrapper}>
              <View style={styles.chartHeaderRow}>
                <View>
                  <Text style={styles.chartTitle}>Evolução semanal</Text>
                  <Text style={styles.chartSubtitle}>Últimos 7 dias</Text>
                </View>
                <View style={[styles.changeBadge, { backgroundColor: '#ECFDF3' }]}>
                  <Ionicons name="trending-up" size={12} color="#166534" />
                  <Text style={[styles.changeText, { color: '#166534' }]}>
                    {data?.lastProfit ?? '+3.2%'}
                  </Text>
                </View>
              </View>

              <View style={styles.chartContainer}>
                <View style={styles.chartGrid}>
                  {Array.from({ length: 3 }).map((_, index) => (
                    <View key={index} style={styles.chartGridLine} />
                  ))}
                </View>
                <View style={styles.chartBarsRow}>
                  {[
                    { day: 'S', value: 45 },
                    { day: 'T', value: 60 },
                    { day: 'Q', value: 55 },
                    { day: 'Q', value: 72 },
                    { day: 'S', value: 66 },
                    { day: 'S', value: 88 },
                    { day: 'D', value: 79 },
                  ].map((item, index) => (
                    <View key={index} style={styles.chartBarColumn}>
                      <View style={styles.chartBarOuter}>
                        <View
                          style={[
                            styles.chartBar,
                            { height: `${Math.max(item.value * 0.8, 20)}%` },
                            index === 5 ? styles.chartBarHighlight : null,
                          ]}
                        />
                      </View>
                      <Text style={styles.chartDayLabel}>{item.day}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={styles.tipCard}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Support')}
          >
            <View style={styles.tipIconWrap}>
              <LinearGradient
                colors={['#FF8A3D', '#FF6A2B']}
                start={[0, 0]}
                end={[1, 1]}
                style={styles.tipGradient}
              >
                <MaterialCommunityIcons name="lightbulb-on-outline" size={24} color="#FFF" />
              </LinearGradient>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.tipTitle}>Dica do dia</Text>
              <Text style={styles.tipMessage}>
                Diversifique os seus investimentos para obter melhores retornos a longo prazo.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>

    <DownloadAppModal
      visible={Platform.OS === 'web' && showDownloadBanner}
      onDismiss={dismissDownloadBanner}
      onDownload={handleDownloadApp}
    />
    </>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF8F3' },
  scroll: { flex: 1 },
  contentContainer: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 150 },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  userInfoBlock: { flexDirection: 'row', alignItems: 'center' },
  avatarBadge: { position: 'relative', marginRight: 12 },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: ZORA_ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ZORA_ORANGE,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  avatarText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
    fontFamily: appTheme.fontFamily,
  },
  avatarOnlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: '#FFF8F3',
  },
  userTextBlock: {},
  greetingLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
    fontFamily: appTheme.fontFamily,
    marginBottom: 2,
  },
  userNameText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F3F4F6',
    position: 'relative',
  },
  headerIconBtnSpaced: { marginLeft: 8 },
  notificationDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1,
    borderColor: '#FFF',
  },
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#FFF',
  },
  notificationBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
    fontFamily: appTheme.fontFamily,
  },

  banner: {
    backgroundColor: '#FEF3C7',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#FCD34D',
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerIconWrap: { marginRight: 10 },
  bannerText: {
    flex: 1,
    color: '#92400E',
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 19,
    fontFamily: appTheme.fontFamily,
  },

  heroCard: {
    borderRadius: 24,
    padding: 18,
    marginBottom: 18,
    shadowColor: '#FF6A2B',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
    overflow: 'hidden',
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  heroEyebrow: {
    fontSize: 10.5,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontFamily: appTheme.fontFamily,
  },
  hideBalanceBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    marginRight: 8,
  },
  balanceValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    fontFamily: appTheme.fontFamily,
    letterSpacing: -0.3,
  },
  balanceLoadingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  balanceLoadingText: {
    color: 'rgba(255,255,255,0.9)',
    marginLeft: 6,
    fontSize: 12.5,
    fontWeight: '600',
    fontFamily: appTheme.fontFamily,
  },
  accountStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#86EFAC',
    marginRight: 5,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 10.5,
    fontFamily: appTheme.fontFamily,
  },
  heroSubtext: {
    fontSize: 11.5,
    marginTop: 6,
    color: 'rgba(255,255,255,0.88)',
    fontFamily: appTheme.fontFamily,
  },
  heroMetricsRow: {
    flexDirection: 'row',
    marginTop: 14,
  },
  heroMetricCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  heroMetricCardMargin: { marginLeft: 8 },
  metricIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricIconBoxAvailable: { backgroundColor: 'rgba(22, 163, 74, 0.75)' },
  metricIconBoxProfit: { backgroundColor: 'rgba(59, 130, 246, 0.75)' },
  metricLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.86)',
    fontWeight: '600',
    marginBottom: 3,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    fontFamily: appTheme.fontFamily,
  },
  metricValue: {
    fontSize: 12.5,
    color: '#FFFFFF',
    fontWeight: '800',
    fontFamily: appTheme.fontFamily,
  },

  loadingStateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,106,43,0.12)',
    shadowColor: appTheme.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  loadingSpinnerWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  loadingStateTitle: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 13.5,
    fontFamily: appTheme.fontFamily,
    marginBottom: 2,
  },
  loadingStateSubtitle: {
    color: '#9CA3AF',
    fontSize: 12,
    fontFamily: appTheme.fontFamily,
  },

  section: { marginBottom: 22 },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 12.5,
    color: '#6B7280',
    fontFamily: appTheme.fontFamily,
  },
  seeAllBtn: { flexDirection: 'row', alignItems: 'center' },
  seeAllText: {
    color: ZORA_ORANGE_DARK,
    fontWeight: '700',
    fontSize: 12.5,
    marginRight: 2,
    fontFamily: appTheme.fontFamily,
  },

  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  actionCard: {
    width: '22.5%',
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: appTheme.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  actionIconWrap: { marginBottom: 8 },
  actionLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    textAlign: 'center',
    fontFamily: appTheme.fontFamily,
  },

  dashboardCard: {
    borderRadius: 28,
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.06)',
    shadowColor: appTheme.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  cardHeaderText: {},
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
    marginBottom: 3,
  },
  cardSubtitle: {
    fontSize: 12.5,
    color: '#6B7280',
    fontFamily: appTheme.fontFamily,
  },
  tagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#FFE0C2',
  },
  tagBadgeText: {
    color: ZORA_ORANGE_DARK,
    fontWeight: '700',
    fontSize: 11.5,
    marginLeft: 5,
    fontFamily: appTheme.fontFamily,
  },

  summaryMetricsRow: {
    flexDirection: 'row',
    backgroundColor: '#FAFAFA',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  summaryMetricBox: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  summaryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  summaryMetricLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
    fontFamily: appTheme.fontFamily,
  },
  summaryMetricValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
  },
  verticalDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 2,
  },

  chartWrapper: {
    backgroundColor: '#FAFAFA',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
  },
  chartSubtitle: {
    fontSize: 11.5,
    color: '#6B7280',
    marginTop: 2,
    fontFamily: appTheme.fontFamily,
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  changeText: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
    fontFamily: appTheme.fontFamily,
  },

  chartContainer: { position: 'relative', height: 150 },
  chartGrid: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 24,
    justifyContent: 'space-between',
  },
  chartGridLine: { height: 1, backgroundColor: 'rgba(17,24,39,0.06)' },
  chartBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: '100%',
    paddingBottom: 24,
  },
  chartBarColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  chartBarOuter: {
    width: 20,
    height: '80%',
    justifyContent: 'flex-end',
    alignItems: 'center',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 106, 43, 0.1)',
  },
  chartBar: {
    width: '100%',
    backgroundColor: ZORA_ORANGE,
    borderRadius: 10,
    opacity: 0.85,
  },
  chartBarHighlight: {
    backgroundColor: ZORA_ORANGE_DEEP,
    opacity: 1,
    shadowColor: ZORA_ORANGE_DEEP,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  chartDayLabel: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
    fontFamily: appTheme.fontFamily,
    position: 'absolute',
    bottom: 0,
  },

  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,106,43,0.08)',
    shadowColor: appTheme.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  tipIconWrap: { marginRight: 14 },
  tipGradient: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ZORA_ORANGE,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  tipTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: ZORA_ORANGE_DARK,
    fontFamily: appTheme.fontFamily,
    marginBottom: 3,
  },
  tipMessage: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
    fontFamily: appTheme.fontFamily,
  },
  headerIconBtnDownload: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FFE0C2',
  },
  downloadAppCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(255,106,43,0.14)',
    shadowColor: ZORA_ORANGE,
    shadowOpacity: 0.28,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
    ...(Platform.OS === 'web'
      ? {
          maxWidth: '100%',
        }
      : {}),
  },
  downloadAppCardGlow1: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,106,43,0.08)',
  },
  downloadAppCardGlow2: {
    position: 'absolute',
    bottom: -50,
    left: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,45,45,0.06)',
  },
  downloadAppCardInner: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 18,
    zIndex: 1,
  },
  downloadAppIconBox: { marginRight: 14 },
  downloadAppIconGradient: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ZORA_ORANGE,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  downloadAppTextBlock: { flex: 1, paddingRight: 10 },
  downloadAppBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 8,
  },
  downloadAppBadgeText: {
    marginLeft: 4,
    fontSize: 10.5,
    fontWeight: '800',
    color: '#B45309',
    fontFamily: appTheme.fontFamily,
  },
  downloadAppTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
    marginBottom: 4,
  },
  downloadAppSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
    fontFamily: appTheme.fontFamily,
    marginBottom: 10,
  },
  downloadAppFeatureRow: { flexDirection: 'row', gap: 6 },
  downloadFeatureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    gap: 4,
    borderWidth: 1,
    borderColor: '#FFE1C2',
  },
  downloadFeatureText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#9A4D00',
    fontFamily: appTheme.fontFamily,
  },
  downloadAppCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  downloadAppCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 18,
    marginBottom: 16,
    paddingVertical: 13,
    borderRadius: 18,
    backgroundColor: ZORA_ORANGE,
    shadowColor: ZORA_ORANGE,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
    position: 'relative',
    zIndex: 1,
  },
  downloadAppCTAText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
    fontFamily: appTheme.fontFamily,
  },
  modalOverlay: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(17, 24, 39, 0.55)',
  },
  modalCenter: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: 20,
  },
  modalOverlayFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdropFallback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(17, 24, 39, 0.55)',
  },
  modalCenterFallback: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: 20,
  },
});
