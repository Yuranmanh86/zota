import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { AppState, AppStateStatus } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute } from '@react-navigation/native';
import { appTheme } from '../theme/appTheme';
import { enableBiometric, loadBiometricCredentials, saveBiometricCredentials, getPhoneAliasEmail, normalizePhone } from '../services/auth';
import { backend } from '../services/backendClient';

const BIOMETRIC_ENABLED_KEY = '@zora:biometricEnabled';

export function BiometricSetupScreen() {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(false);
  const [skipLoading, setSkipLoading] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const submissionLockRef = useRef(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', setAppState);
    return () => sub.remove();
  }, []);

  const route = useRoute();
  const rawParams = route.params as { email?: string; password?: string; phone?: string } | undefined;

  const cleanedPhone = React.useMemo(() => {
    if (rawParams?.phone) return normalizePhone(rawParams.phone);
    if (rawParams?.email && rawParams.email.endsWith('@zora.app')) {
      const local = rawParams.email.split('@')[0];
      const digits = local.replace(/\D/g, '');
      return digits ? normalizePhone(digits) : '';
    }
    return '';
  }, [rawParams?.email, rawParams?.phone]);

  const cleanedEmail = React.useMemo(() => {
    if (cleanedPhone) return getPhoneAliasEmail(cleanedPhone);
    if (rawParams?.email) {
      let e = (rawParams.email || '').trim().toLowerCase();
      if (e.endsWith('.local')) e = e.slice(0, -'.local'.length);
      if (e.startsWith('zora.')) e = e.slice(5);
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return e;
    }
    return cleanedPhone ? getPhoneAliasEmail(cleanedPhone) : '';
  }, [cleanedPhone, rawParams?.email]);

  const params = React.useMemo(() => ({
    email: cleanedEmail || undefined,
    password: rawParams?.password,
    phone: cleanedPhone || undefined,
  }), [cleanedEmail, cleanedPhone, rawParams?.password]);

  const isWeb = Platform.OS === 'web';

  const infoRows = useMemo(
    () => [
      { icon: 'flash-outline', title: 'Acesso instantâneo', desc: 'Entre na conta em 1 toque.' },
      { icon: 'shield-checkmark-outline', title: 'Segurança máxima', desc: 'Autenticação por hardware do dispositivo.' },
      { icon: 'finger-print-outline', title: 'Impressão ou Face', desc: 'Compatível com todos os sensores biométricos.' },
    ],
    []
  );

  async function goToMain() {
    if (submissionLockRef.current) return;
    submissionLockRef.current = true;
    try {
      setSkipLoading(true);
      try {
        await AsyncStorage.removeItem(BIOMETRIC_ENABLED_KEY);
      } catch (_e) {}

      try {
        const check1: any = await backend.auth.getSession();
        if (!check1?.data?.session?.user) {
          if (appState === 'active') {
            Alert.alert(
              'Sessão expirada',
              'Faça login novamente para continuar.',
              [{ text: 'Ir para Login', onPress: () => navigation.replace('Login') }]
            );
          }
          return;
        }
      } catch (_sessErr: any) {
        console.warn('goToMain session check1 failed:', _sessErr?.message);
      }

      await new Promise((r) => setTimeout(r, 250));

      try {
        const check2: any = await backend.auth.getSession();
        if (!check2?.data?.session?.user) {
          if (appState === 'active') {
            Alert.alert(
              'Sessão expirada',
              'Faça login novamente para continuar.',
              [{ text: 'Ir para Login', onPress: () => navigation.replace('Login') }]
            );
          }
          return;
        }
      } catch (_sessErr2: any) {
        console.warn('goToMain session check2 failed:', _sessErr2?.message);
      }
    } finally {
      setSkipLoading(false);
      submissionLockRef.current = false;
      try {
        navigation.replace('Main');
      } catch (navErr: any) {
        console.error('BiometricSetup goToMain nav error:', navErr?.message);
        try { navigation.reset({ index: 0, routes: [{ name: 'Main' as never }] }); } catch {}
      }
    }
  }

  async function enableBiometrics() {
    if (submissionLockRef.current) return;
    submissionLockRef.current = true;
    if (isWeb) {
      Alert.alert(
        'Biometria não suportada na Web',
        'O seu navegador não permite autenticação biométrica neste momento. Pode ativar mais tarde na App mobile.',
        [
          {
            text: 'Continuar para a Zora',
            onPress: () => {
              submissionLockRef.current = false;
              goToMain();
            },
            style: 'default',
          },
        ]
      );
      submissionLockRef.current = false;
      return;
    }
    try {
      try {
        const sessionCheck: any = await backend.auth.getSession();
        if (!sessionCheck?.data?.session?.user) {
          if (appState === 'active') {
            Alert.alert(
              'Sessão expirada',
              'Não foi possível confirmar a sua sessão. Por favor, faça login novamente.',
              [{ text: 'Ir para Login', onPress: () => navigation.replace('Login') }]
            );
          }
          submissionLockRef.current = false;
          return;
        }
      } catch (_sessionErr) {
        if (appState === 'active') {
          Alert.alert('Sessão inválida', 'Por favor, faça login novamente.', [
            { text: 'Ir para Login', onPress: () => navigation.replace('Login') },
          ]);
        }
        submissionLockRef.current = false;
        return;
      }

      if (appState !== 'active') {
        console.warn('Skipping biometric enable while app not active');
        submissionLockRef.current = false;
        return;
      }
      setLoading(true);
      const compatible = await LocalAuthentication.hasHardwareAsync();
      if (!compatible) {
        if (appState === 'active') {
          Alert.alert(
            'Biometria indisponível',
            'Este dispositivo não suporta autenticação biométrica.',
            [{
              text: 'Continuar',
              onPress: () => {
                submissionLockRef.current = false;
                goToMain();
              },
            }]
          );
        } else {
          console.warn('Biometria indisponível (app inactive)');
        }
        submissionLockRef.current = false;
        return;
      }

      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) {
        Alert.alert(
          'Biometria não configurada',
          'Configure impressão digital ou Face ID nas definições do dispositivo.',
          [{
            text: 'Continuar',
            onPress: () => {
              submissionLockRef.current = false;
              goToMain();
            },
          }]
        );
        submissionLockRef.current = false;
        return;
      }

      if (appState !== 'active') {
        console.warn('Skipping authenticateAsync because app not active');
        submissionLockRef.current = false;
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Ativar login biométrico',
        fallbackLabel: 'Usar senha',
      });
      if (!result.success) {
        if (appState === 'active') Alert.alert('Erro', 'Autenticação biométrica falhou. Tente novamente ou clique em Depois.');
        submissionLockRef.current = false;
        return;
      }

      const credentials = params?.email && params?.password
        ? { email: params.email, password: params.password }
        : await loadBiometricCredentials();

      if (!credentials) {
        Alert.alert('Credenciais não encontradas', 'Faça login com senha e ative a biometria novamente.');
        submissionLockRef.current = false;
        return;
      }

      let phoneToSave = params?.phone;
      if (!phoneToSave && credentials.email && credentials.email.endsWith('@zora.app')) {
        phoneToSave = credentials.email.split('@')[0].replace(/\D/g, '');
      }

      try {
        await saveBiometricCredentials(credentials.email, credentials.password, phoneToSave);
      } catch (_saveErr) {}
      try {
        await enableBiometric(true);
      } catch (_enableErr) {}

      submissionLockRef.current = false;
      Alert.alert('Pronto 🎉', 'Login biométrico ativado. A partir de agora pode entrar rapidamente.', [
        {
          text: 'Entrar na Zora',
          onPress: () => goToMain(),
        },
      ]);
    } catch (error: any) {
      console.error('Erro ao ativar biometria:', error);
      if (appState === 'active') Alert.alert('Erro', error?.message || 'Não foi possível ativar a biometria.');
    } finally {
      setLoading(false);
      submissionLockRef.current = false;
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']} mode={isWeb ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scrollContent,
          isWeb ? styles.scrollContentWeb : null,
        ]}
        showsVerticalScrollIndicator={isWeb}
      >
        <View style={styles.brandHeader}>
          <View style={styles.brandLogoIcon}>
            <Text style={styles.brandLogoLetter}>Z</Text>
            <Ionicons name="flash" size={14} color="#FFF" style={{ position: 'absolute', right: -3, bottom: -3 }} />
          </View>
          <Text style={styles.brandTitle}>Zora</Text>
        </View>

        <Text style={styles.title}>
          {isWeb ? 'Segurança da conta' : 'Login biométrico'}
        </Text>
        <Text style={styles.subtitle}>
          {isWeb
            ? 'Ative a segurança adicional quando usar a App mobile. Agora pode continuar.'
            : 'Proteja o acesso à sua conta de forma rápida e segura.'}
        </Text>

        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons
              name={isWeb ? 'shield-checkmark' : 'finger-print'}
              size={34}
              color="#FF7A00"
            />
          </View>
          <Text style={styles.cardTitle}>
            {isWeb ? 'Conta criada com sucesso ✅' : 'Ativar agora?'}
          </Text>
          <Text style={styles.cardText}>
            {isWeb
              ? 'Na Web não usamos biometria do navegador. Quando usar a App mobile, poderá ativar impressão digital ou Face ID.'
              : 'Depois do primeiro login, você poderá entrar com impressão digital ou Face ID, sem digitar o PIN.'}
          </Text>

          <View style={styles.infoList}>
            {infoRows.map((r) => (
              <View key={r.title} style={styles.infoRow}>
                <View style={styles.infoIconBox}>
                  <Ionicons name={r.icon as never} size={16} color="#FF7A00" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoTitle}>{r.title}</Text>
                  <Text style={styles.infoDesc}>{r.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          {!isWeb ? (
            <TouchableOpacity
              style={[styles.button, loading ? styles.buttonDisabled : null]}
              onPress={enableBiometrics}
              disabled={loading}
              activeOpacity={0.9}
            >
              {loading ? (
                <>
                  <ActivityIndicator color="#FFF" size="small" style={{ marginRight: 10 }} />
                  <Text style={styles.buttonText}>A processar…</Text>
                </>
              ) : (
                <>
                  <Ionicons name="finger-print" size={18} color="#FFF" />
                  <Text style={[styles.buttonText, { marginLeft: 8 }]}>Ativar biometria</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[
              styles.secondaryButton,
              isWeb ? styles.secondaryButtonPrimary : null,
              skipLoading ? styles.buttonDisabled : null,
            ]}
            onPress={goToMain}
            disabled={skipLoading}
            activeOpacity={0.85}
          >
            {skipLoading ? (
              <>
                <ActivityIndicator color={isWeb ? '#FFF' : '#C2410C'} size="small" style={{ marginRight: 8 }} />
                <Text
                  style={[
                    styles.secondaryButtonText,
                    isWeb ? styles.secondaryButtonTextPrimary : null,
                  ]}
                >
                  A entrar…
                </Text>
              </>
            ) : (
              <>
                <Ionicons
                  name="arrow-forward-circle"
                  size={16}
                  color={isWeb ? '#FFF' : '#C2410C'}
                />
                <Text
                  style={[
                    styles.secondaryButtonText,
                    isWeb ? styles.secondaryButtonTextPrimary : null,
                    { marginLeft: 8 },
                  ]}
                >
                  {isWeb ? 'Entrar agora na Home' : 'Configurar depois'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          A sua privacidade é prioridade. Dados biométricos nunca saem do seu dispositivo.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF7ED',
    ...(Platform.OS === 'web' ? { minHeight: '100vh' as any } : {}),
  },
  scrollContent: { padding: 24 },
  scrollContentWeb: {
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: 40,
    paddingBottom: 120,
  },
  brandHeader: { alignItems: 'center', marginBottom: 20, flexDirection: 'row', alignSelf: 'center' },
  brandLogoIcon: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: '#FF6A2B',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
    shadowColor: '#FF6A2B', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  brandLogoLetter: { color: '#FFF', fontSize: 24, fontWeight: '900', fontFamily: appTheme.fontFamily, marginRight: 2 },
  brandTitle: { fontSize: 30, fontWeight: '900', color: '#FF6A2B', fontFamily: appTheme.fontFamily, letterSpacing: -0.3 },

  title: { fontSize: 26, fontWeight: '800', color: '#111827', fontFamily: appTheme.fontFamily, textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#6B7280', marginTop: 8, marginBottom: 18, fontFamily: appTheme.fontFamily, textAlign: 'center', lineHeight: 20, paddingHorizontal: 10 },

  card: {
    backgroundColor: '#FFF', borderRadius: 24, padding: 22,
    borderWidth: 1, borderColor: '#FFE1C2',
    alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 4,
  },
  iconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,122,0,0.10)', alignItems: 'center', justifyContent: 'center',
    marginBottom: 14, borderWidth: 1, borderColor: 'rgba(255,122,0,0.20)',
  },
  cardTitle: { fontSize: 20, fontWeight: '800', color: '#111827', fontFamily: appTheme.fontFamily, textAlign: 'center' },
  cardText: {
    fontSize: 13, color: '#6B7280', textAlign: 'center',
    marginTop: 8, marginBottom: 14, fontFamily: appTheme.fontFamily, lineHeight: 19,
  },

  infoList: { width: '100%', marginBottom: 18 },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  infoIconBox: {
    width: 34, height: 34, borderRadius: 12,
    backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#FFD3A7', marginRight: 10,
  },
  infoTitle: { fontSize: 13, fontWeight: '800', color: '#111827', fontFamily: appTheme.fontFamily },
  infoDesc: { fontSize: 12, color: '#6B7280', marginTop: 2, fontFamily: appTheme.fontFamily },

  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FF7A00', borderRadius: 16, paddingVertical: 15, paddingHorizontal: 18,
    width: '100%',
    shadowColor: '#FF7A00', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 7,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFF', fontWeight: '800', fontFamily: appTheme.fontFamily, fontSize: 15 },

  secondaryButton: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    width: '100%',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  secondaryButtonPrimary: {
    backgroundColor: '#FF7A00',
    shadowColor: '#FF7A00',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
  secondaryButtonText: { color: '#C2410C', fontWeight: '800', fontFamily: appTheme.fontFamily, fontSize: 14 },
  secondaryButtonTextPrimary: { color: '#FFFFFF' },

  footer: {
    marginTop: 22, textAlign: 'center', fontSize: 11.5,
    color: '#9A4D00', fontFamily: appTheme.fontFamily, fontWeight: '600',
    paddingHorizontal: 20, lineHeight: 16,
  },
});
