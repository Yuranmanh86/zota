import * as React from 'react';
const { useEffect } = React;
import { View, StyleSheet, Text, Platform, StatusBar as RNStatusBar, useWindowDimensions } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer, CommonActions } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationBar } from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import { HomeScreen } from '../screens/HomeScreen';
import { InvestmentsScreen } from '../screens/InvestmentsScreen';
import { SavingsScreen } from '../screens/SavingsScreen';
import { SupportScreen } from '../screens/SupportScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { ChatDetailScreen } from '../screens/ChatDetailScreen';
import { ReloadScreen } from '../screens/ReloadScreen';
import { WithdrawScreen } from '../screens/WithdrawScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { BiometricSetupScreen } from '../screens/BiometricSetupScreen';
import { PoliciesScreen } from '../screens/PoliciesScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { AdminDashboardScreen } from '../screens/AdminDashboardScreen';
import { AdminUsersScreen } from '../screens/AdminUsersScreen';
import { AdminDepositsScreen } from '../screens/AdminDepositsScreen';
import { AdminWithdrawalsScreen } from '../screens/AdminWithdrawalsScreen';
import { ChatAdminScreen } from '../screens/ChatAdminScreen';
import { SplashScreen } from '../screens/SplashScreen';
import { backend } from '../services/backendClient';
import { useAppStore } from '../store/appStore';
import { getUserProfile, isAdminByAuthUserId } from '../services/auth';
import { AppBalanceSyncer } from '../providers/AppBalanceSyncer';
import { getInitialReferralCode } from '../services/referrals';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function setupSystemBars() {
  if (Platform.OS === 'web') return;
  try {
    RNStatusBar.setBarStyle('dark-content', true);
    RNStatusBar.setBackgroundColor('#FFFFFF', true);
  } catch {}
}

function MainTabs() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const tabBarBottom = Math.max(1, insets.bottom + 1);
  const isWeb = Platform.OS === 'web';
  const webTabBarWidth = Math.max(0, Math.min(windowWidth, 480) - 28);
  const tabBarStyleBase: any = {
    position: 'absolute',
    left: isWeb ? '50%' : 14,
    right: isWeb ? undefined : 14,
    width: isWeb ? webTabBarWidth : undefined,
    marginLeft: isWeb ? -(webTabBarWidth / 2) : undefined,
    bottom: isWeb ? 12 : tabBarBottom,
    height: 76,
    borderRadius: 30,
    paddingTop: 6,
    paddingBottom: 14,
    paddingHorizontal: 6,
    borderTopWidth: 0,
    backgroundColor: '#FFFFFF',
    borderCurve: 'continuous',
    shadowColor: '#FF4D00',
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 18,
    borderWidth: 1,
    borderColor: '#FFE1C2',
    zIndex: 999,
  };
  const webTabBarStyle: any = isWeb
    ? {
        shadowOpacity: 0.1,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
      }
    : {};
  const finalTabBarStyle = { ...tabBarStyleBase, ...webTabBarStyle };
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#FF4D00',
        tabBarInactiveTintColor: '#FF8A3D',
        tabBarActiveBackgroundColor: '#FFF3E8',
        tabBarStyle: finalTabBarStyle,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '800', marginTop: 1, color: '#1F2937', letterSpacing: 0.1 },
        tabBarItemStyle: { borderRadius: 20, marginHorizontal: 2 },
        tabBarIcon: ({ color, size }) => {
          const iconName =
            route.name === 'Home'
              ? 'home'
              : route.name === 'Investimentos'
                ? 'trending-up'
                : route.name === 'Poupança'
                  ? 'save'
                  : 'chatbubble-ellipses';
          return <Ionicons name={iconName as never} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Investimentos" component={InvestmentsScreen} />
      <Tab.Screen name="Poupança" component={SavingsScreen} />
      <Tab.Screen name="Bate-Papo" component={ChatScreen} />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const [isAuthReady, setIsAuthReady] = React.useState(false);
  const [initialRouteName, setInitialRouteName] = React.useState<'Login' | 'Main' | 'Register' | 'AdminDashboard'>('Login');
  const navRef = React.useRef<any>(null);
  const firstApplyRef = React.useRef(true);
  const bootCompletedRef = React.useRef(false);
  const sessionProcessingRef = React.useRef(false);
  const signedInCoolDownUntilRef = React.useRef<number>(0);

  useEffect(() => {
    setupSystemBars();
  }, []);

  const handleNavigationStateChange = React.useCallback(() => {
    setupSystemBars();
  }, []);

  const setSignedInCoolDown = (ms = 3500) => {
    signedInCoolDownUntilRef.current = Date.now() + ms;
  };
  const isInSignedInCoolDown = () => Date.now() < signedInCoolDownUntilRef.current;

  const safeSetInitialRoute = React.useCallback((name: any) => {
    try {
      setInitialRouteName(name);
    } catch (e: any) {
      console.warn('safeSetInitialRoute failed:', e?.message);
    }
  }, []);

  const applySessionProfile = React.useCallback(async (user: any, opts?: { skipCoolDown?: boolean }) => {
    if (sessionProcessingRef.current) return;
    sessionProcessingRef.current = true;
    try {
      if (!user?.id) {
        try { useAppStore.setState({ userName: '' }); } catch {}
        return;
      }

      let profileData: any = null;
      try {
        profileData = await getUserProfile(user.id).catch(() => null);
      } catch {}
      const profileName = profileData?.full_name || profileData?.nome_completo || '';
      if (profileName) {
        const first = profileName.split(' ')[0];
        try { useAppStore.setState({ userName: first }); } catch {}
      }

      let admin = false;
      try {
        admin = await isAdminByAuthUserId(user.id).catch(() => false);
      } catch {}
      const targetRoute: 'Main' | 'AdminDashboard' = admin ? 'AdminDashboard' : 'Main';

      if (!opts?.skipCoolDown) setSignedInCoolDown(4000);

      if (firstApplyRef.current) {
        firstApplyRef.current = false;
        safeSetInitialRoute(profileData?.full_name ? targetRoute : 'Register');
        return;
      }

      const nav: any = navRef.current;
      if (nav && nav.isReady()) {
        try {
          const state = nav.getState?.();
          const currentRouteName = state?.routes?.[state.routes.length - 1]?.name;
          const shouldResetToHome = ['Login', 'Register', 'ForgotPassword', 'Policies', 'BiometricSetup'].includes(currentRouteName);

          if (shouldResetToHome) {
            try {
              nav.dispatch(
                CommonActions.reset({
                  index: 0,
                  routes: [{ name: profileData?.full_name ? (targetRoute as any) : 'Register' }],
                })
              );
            } catch (dispatchErr: any) {
              console.warn('nav dispatch failed:', dispatchErr?.message);
            }
          }
        } catch {}
      } else {
        safeSetInitialRoute(profileData?.full_name ? targetRoute : 'Register');
      }
    } finally {
      sessionProcessingRef.current = false;
    }
  }, [safeSetInitialRoute]);

  React.useEffect(() => {
    let isMounted = true;
    let cancelled = false;

    async function loadSession() {
      try {
        const initialReferralCode = await getInitialReferralCode();
        let session: any = null;
        try {
          const res: any = await backend.auth.getSession();
          session = res?.data?.session;
        } catch (sessionErr: any) {
          console.error('loadSession getSession error:', sessionErr?.message);
        }
        if (!isMounted || cancelled) return;

        if (session?.user) {
          try {
            let profileData: any = null;
            try {
              profileData = await getUserProfile(session.user.id).catch(() => null);
            } catch {}
            const profileName = profileData?.full_name || profileData?.nome_completo;

            if (!profileData || !profileName) {
              safeSetInitialRoute('Register');
            } else {
              try { useAppStore.setState({ userName: profileName.split(' ')[0] }); } catch {}
              let admin = false;
              try { admin = await isAdminByAuthUserId(session.user.id).catch(() => false); } catch {}
              safeSetInitialRoute(admin ? 'AdminDashboard' : 'Main');
              setSignedInCoolDown(4000);
            }
          } catch {
            safeSetInitialRoute('Login');
          }
        } else {
          safeSetInitialRoute(initialReferralCode ? 'Register' : 'Login');
        }
      } catch {
        if (isMounted && !cancelled) {
          safeSetInitialRoute('Login');
        }
      } finally {
        if (isMounted && !cancelled) {
          try { firstApplyRef.current = false; } catch {}
          try { bootCompletedRef.current = true; } catch {}
          try { setIsAuthReady(true); } catch (e) {
            console.error('Failed to set isAuthReady (retrying):', e);
            try { setIsAuthReady(true); } catch {}
          }
        }
      }
    }

    try {
      loadSession();
    } catch (loadErr: any) {
      console.error('loadSession top-level catch:', loadErr?.message);
      safeSetInitialRoute('Login');
      try { setIsAuthReady(true); } catch {}
    }

    let subscription: any = null;
    try {
      const onSubRes: any = backend.auth.onAuthStateChange((event: any, session: any) => {
        if (!bootCompletedRef.current) return;

        if (event === 'TOKEN_REFRESHED') {
          console.info('[onAuthStateChange] TOKEN_REFRESHED: mantendo estado atual.');
          return;
        }
        if (event === 'USER_UPDATED') {
          console.info('[onAuthStateChange] USER_UPDATED: mantendo estado atual.');
          return;
        }

        if (session?.user) {
          if (event === 'SIGNED_IN') {
            setSignedInCoolDown(5000);
          }
          applySessionProfile(session.user);
          return;
        }

        // SIGNED_OUT / SIGNED_OUT fake event
        if (isInSignedInCoolDown()) {
          console.warn(`[onAuthStateChange] event=${event} IGNORADO: dentro do cooldown de SIGNED_IN`);
          return;
        }

        try { firstApplyRef.current = true; } catch {}
        try { useAppStore.setState({ userName: '' }); } catch {}
        safeSetInitialRoute('Login');
        const nav: any = navRef.current;
        if (nav && nav.isReady()) {
          try {
            nav.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Login' as never }] }));
          } catch (navErr: any) {
            console.warn('logout nav dispatch failed:', navErr?.message);
          }
        }
      });
      subscription = onSubRes?.data?.subscription;
    } catch (subErr: any) {
      console.error('onAuthStateChange subscription failed:', subErr?.message);
    }

    return () => {
      isMounted = false;
      cancelled = true;
      try { subscription?.unsubscribe?.(); } catch {}
    };
  }, [applySessionProfile, safeSetInitialRoute]);

  if (!isAuthReady) {
    try {
      return <SplashScreen message="A preparar o Zora..." />;
    } catch {
      return null;
    }
  }

  return (
    <NavigationContainer
      ref={navRef}
      onStateChange={handleNavigationStateChange}
      onReady={handleNavigationStateChange}
    >
      <>
        <StatusBar style="dark" />
        <NavigationBar style="dark" />
        <AppBalanceSyncer />
        <Stack.Navigator
          initialRouteName={initialRouteName}
          screenOptions={{ headerShown: false, cardStyle: { flex: 1, minHeight: 0 } }}
        >
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          <Stack.Screen name="Policies" component={PoliciesScreen} />
          <Stack.Screen name="BiometricSetup" component={BiometricSetupScreen} />
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="Conta" component={ProfileScreen} />
          <Stack.Screen name="Support" component={SupportScreen} />
          <Stack.Screen name="ChatDetail" component={ChatDetailScreen} />
          <Stack.Screen name="ChatAdmin" component={ChatAdminScreen} />
          <Stack.Screen name="Reload" component={ReloadScreen} />
          <Stack.Screen name="Withdraw" component={WithdrawScreen} />
          <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
          <Stack.Screen name="AdminUsers" component={AdminUsersScreen} />
          <Stack.Screen name="AdminDeposits" component={AdminDepositsScreen} />
          <Stack.Screen name="AdminWithdrawals" component={AdminWithdrawalsScreen} />
        </Stack.Navigator>
      </>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBarBackground: {
    flex: 1,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
  },
});
