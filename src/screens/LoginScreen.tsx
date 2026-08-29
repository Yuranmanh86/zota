import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { AppState, AppStateStatus } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAppStore } from '../store/appStore';
import { appTheme } from '../theme/appTheme';
import {
  getUserProfile,
  loadBiometricCredentials,
  saveBiometricCredentials,
  signInWithPhone,
  signInWithEmail,
  isAdminByAuthUserId,
  getPhoneAliasEmail,
  normalizePhone,
} from '../services/auth';
import { invalidateFinanceCache } from '../services/finance';
import { backend } from '../services/backendClient';
import { BrandLogo } from '../components/BrandLogo';

const ZORA_ORANGE = '#FF6A2B';
const ZORA_ORANGE_DARK = '#FF7A00';
const ZORA_ORANGE_LIGHT = 'rgba(255, 106, 43, 0.10)';

type LoginFieldProps = {
  icon: any;
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  keyboardType?: any;
  secureTextEntry?: boolean;
  showToggle?: boolean;
  isShowing?: boolean;
  setShowing?: (v: boolean) => void;
  editable?: boolean;
  errorHint?: string;
  rightText?: string;
  loading?: boolean;
  autoCapitalize?: any;
  inputRef?: any;
  returnKeyType?: any;
  onSubmitEditing?: () => void;
  blurOnSubmit?: boolean;
  maxLength?: number;
};

const LoginField = React.memo(function LoginField({
  icon, label, placeholder, value, onChangeText, keyboardType, secureTextEntry,
  showToggle, isShowing, setShowing, editable = true, errorHint, rightText, loading = false,
  autoCapitalize,
  inputRef,
  returnKeyType,
  onSubmitEditing,
  blurOnSubmit = false,
  maxLength,
}: LoginFieldProps) {
  return (
    <View style={{ marginTop: 18 }}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {rightText ? <Text style={styles.fieldRightHint}>{rightText}</Text> : null}
      </View>
      <View style={[styles.inputWrap, errorHint ? styles.inputWrapError : null]}>
        <View style={styles.inputIconBox}>
          <Ionicons name={icon} size={18} color={errorHint ? '#EF4444' : ZORA_ORANGE} />
        </View>
        <TextInput
          ref={inputRef}
          style={styles.inputInner}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          keyboardType={keyboardType || 'default'}
          secureTextEntry={secureTextEntry && !isShowing}
          editable={editable && !loading}
          autoCapitalize={autoCapitalize ?? 'none'}
          autoCorrect={false}
          blurOnSubmit={blurOnSubmit}
          underlineColorAndroid="transparent"
          textContentType="none"
          importantForAutofill="no"
          returnKeyType={returnKeyType || 'next'}
          onSubmitEditing={onSubmitEditing}
          maxLength={maxLength}
        />
        {showToggle && setShowing ? (
          <TouchableOpacity onPress={() => setShowing(!isShowing)} style={styles.inputToggleEye} disabled={loading}>
            <Ionicons name={isShowing ? 'eye-off-outline' : 'eye-outline'} size={18} color="#6B7280" />
          </TouchableOpacity>
        ) : null}
      </View>
      {errorHint ? <Text style={styles.fieldErrorHint}>{errorHint}</Text> : null}
    </View>
  );
});

function formatTelefoneStatic(text: string) {
  const digits = text.replace(/\D/g, '').slice(0, 12);
  if (digits.length <= 9) return digits;
  return `+${digits.slice(0, 3)} ${digits.slice(3)}`;
}

function normalizePIN(text: string) {
  return text.replace(/\D/g, '').slice(0, 6);
}

export function LoginScreen() {
  const navigation = useNavigation<any>();
  const setUserName = useAppStore((state) => state.setUserName);
  const setWelcomeMessage = useAppStore((state) => state.setWelcomeMessage);

  const [telefone, setTelefone] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [lembrarTelefone, setLembrarTelefone] = useState(true);
  const [loading, setLoading] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [savedBiometricCredentials, setSavedBiometricCredentials] = useState<{ email: string; password: string; phone?: string } | null>(null);
  const isFocused = useIsFocused();
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const submissionLockRef = useRef(false);
  const biometricLockRef = useRef(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', setAppState);
    return () => sub.remove();
  }, []);

  const passwordInputRef = React.useRef<any>(null);
  const adminPasswordInputRef = React.useRef<any>(null);

  const lembrarTelefoneRef = useRef(lembrarTelefone);
  const telefoneRef = useRef(telefone);
  useEffect(() => { lembrarTelefoneRef.current = lembrarTelefone; }, [lembrarTelefone]);
  useEffect(() => { telefoneRef.current = telefone; }, [telefone]);

  const biometricLoadedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    if (!isFocused) return;

    async function loadBiometric() {
      try {
        const credentials: any = await loadBiometricCredentials();
        const compatible = await LocalAuthentication.hasHardwareAsync().catch(() => false);
        const enrolled = await LocalAuthentication.isEnrolledAsync().catch(() => false);
        const supported = Boolean(compatible && enrolled);
        if (cancelled) return;

        setBiometricSupported(supported);
        setSavedBiometricCredentials(supported ? credentials : null);

        if (supported && credentials?.phone && lembrarTelefoneRef.current && !telefoneRef.current) {
          setTelefone(formatTelefoneStatic(credentials.phone));
        }
        biometricLoadedRef.current = true;
      } catch (_e: any) {
        if (!cancelled) {
          setBiometricSupported(false);
          setSavedBiometricCredentials(null);
        }
      }
    }

    if (!biometricLoadedRef.current || isFocused) {
      loadBiometric();
    }
    return () => { cancelled = true; };
  }, [isFocused]);

  const handleTelefoneChange = useCallback((t: string) => {
    setTelefone(formatTelefoneStatic(t));
  }, []);

  const handlePasswordChange = useCallback((t: string) => {
    setPassword(normalizePIN(t));
  }, []);

  async function afterLoginCommon(authUserId: string) {
    try {
      invalidateFinanceCache();
      const [isAdmin, profile] = await Promise.all([
        isAdminByAuthUserId(authUserId),
        getUserProfile(authUserId),
      ]);
      const name = profile?.full_name ?? profile?.nome_completo;
      if (name) {
        setUserName(name.split(' ')[0] || name);
      }
      setWelcomeMessage(isAdmin ? 'Bem-vindo(a), Administrador! 🛡️' : 'Bem-vindo de volta! 👋');
      if (isAdmin) {
        navigation.reset({ index: 0, routes: [{ name: 'AdminDashboard' as never }] });
      } else {
        navigation.replace('Main');
      }
    } catch (e: any) {
      console.warn('afterLoginCommon falhou, fallback para Main:', e?.message);
      navigation.replace('Main');
    }
  }

  async function handleLoginUser() {
    if (submissionLockRef.current) return;
    submissionLockRef.current = true;
    const normalizedPhone = normalizePhone(telefone);
    const onlyNumbersPIN = /^\d*$/.test(password);
    if (!normalizedPhone) {
      Alert.alert('Telefone obrigatório', 'Insira o seu número de telefone.');
      submissionLockRef.current = false;
      return;
    }
    if (normalizedPhone.length < 9) {
      Alert.alert('Telefone inválido', 'Insira um número de telefone válido.');
      submissionLockRef.current = false;
      return;
    }
    if (!password.trim()) {
      Alert.alert('Senha obrigatória', 'Insira o seu PIN numérico.');
      submissionLockRef.current = false;
      return;
    }
    if (!onlyNumbersPIN) {
      Alert.alert('PIN inválido', 'A senha deve conter apenas números de 0 a 9.');
      submissionLockRef.current = false;
      return;
    }
    if (password.length !== 6) {
      Alert.alert('PIN inválido', 'O PIN deve ter exatamente 6 dígitos numéricos.');
      submissionLockRef.current = false;
      return;
    }

    setLoading(true);
    try {
      const { session, error } = await signInWithPhone(normalizedPhone, password.trim());
      if (error) throw new Error(typeof error === 'string' ? error : error?.message || 'Erro ao fazer login');
      if (!session?.user) throw new Error('Falha ao fazer login');
      try {
        const email = getPhoneAliasEmail(normalizedPhone);
        await saveBiometricCredentials(email, password.trim(), normalizedPhone);
      } catch { /* ignore credential sync errors */ }
      await afterLoginCommon(session.user.id);
    } catch (error: any) {
      console.error('Erro ao fazer login:', error);
      Alert.alert('Não foi possível entrar', error.message || 'Verifique os seus dados e tente novamente.');
    } finally {
      setLoading(false);
      submissionLockRef.current = false;
    }
  }

  async function handleLogin() {
    await handleLoginUser();
  }

  async function handleBiometricLogin() {
    if (biometricLockRef.current) return;
    biometricLockRef.current = true;

    if (!savedBiometricCredentials) {
      if (appState === 'active' && isFocused) {
        Alert.alert('Biometria não guardada', 'Primeiro faça login com senha e ative a biometria na sua conta.');
      } else {
        console.warn('Biometric login attempted while inactive/no credentials');
      }
      biometricLockRef.current = false;
      return;
    }

    if (appState !== 'active' || !isFocused) {
      console.warn('Skipping biometric auth while app not active or screen not focused');
      biometricLockRef.current = false;
      return;
    }

    setLoading(true);
    try {
      const authResult = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Entrar na Zora com biometria',
        fallbackLabel: 'Usar senha',
        cancelLabel: 'Cancelar',
        disableDeviceFallback: false,
      });

      if (!authResult.success) {
        setLoading(false);
        biometricLockRef.current = false;
        return;
      }

      const storedPhone = savedBiometricCredentials.phone ? normalizePhone(savedBiometricCredentials.phone) : '';
      const storedEmail = savedBiometricCredentials.email || '';
      const normalizedPhoneFromEmail = storedEmail.endsWith('@zora.app')
        ? normalizePhone(storedEmail.split('@')[0].replace(/\D/g, ''))
        : '';
      const phoneToUse = storedPhone || normalizedPhoneFromEmail;

      let signInResult;
      if (phoneToUse) {
        signInResult = await signInWithPhone(phoneToUse, savedBiometricCredentials.password);
      } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(storedEmail)) {
        signInResult = await signInWithEmail(storedEmail, savedBiometricCredentials.password);
      } else {
        throw new Error('Credenciais biométricas inválidas. Faça login manualmente e ative a biometria novamente.');
      }

      const { session, error } = signInResult;
      if (error) throw new Error(typeof error === 'string' ? error : error?.message || 'Erro ao entrar com biometria');
      if (!session?.user) throw new Error('Falha ao fazer login');
      try {
        if (phoneToUse) {
          const email = getPhoneAliasEmail(phoneToUse);
          await saveBiometricCredentials(email, savedBiometricCredentials.password, phoneToUse);
        }
      } catch { /* ignore */ }
      await afterLoginCommon(session.user.id);
    } catch (error: any) {
      console.error('Erro ao entrar com biometria:', error);
      if (appState === 'active' && isFocused) {
        Alert.alert('Biometria falhou', error.message || 'Tente entrar com a sua senha.');
      } else {
        console.warn('Skipped alert for biometric error because app is not active');
      }
    } finally {
      setLoading(false);
      biometricLockRef.current = false;
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          nestedScrollEnabled
        >
          <View style={styles.brandHeader} key="brand-header">
            <View style={styles.welcomeBadge}>
              <Ionicons name="sparkles" size={14} color={ZORA_ORANGE_DARK} />
              <Text style={styles.welcomeBadgeText}>Bem-vindo de volta</Text>
            </View>
            <BrandLogo size="md" showText={true} style={{ marginBottom: 6 }} />
            <Text style={styles.brandSubtitle}>Entre na sua carteira digital</Text>

           
          </View>

          <View style={styles.card} key="login-card">

            <View style={styles.sectionDivider}>
              <View style={styles.sectionDot} />
              <Text style={styles.sectionTitle}>Seus dados de acesso</Text>
            </View>

            <LoginField
              key="phone-field"
              icon="call-outline"
              label="Número de telefone"
              placeholder="+258 84 000 0000"
              value={telefone}
              onChangeText={handleTelefoneChange}
              keyboardType="phone-pad"
              rightText="+258 MZ"
              autoCapitalize="none"
              loading={loading}
              returnKeyType="next"
              onSubmitEditing={() => passwordInputRef.current?.focus?.()}
            />

            <LoginField
              key="password-field"
              inputRef={passwordInputRef}
              icon="lock-closed-outline"
              label="Senha"
              placeholder="6 ou mais dígitos"
              value={password}
              onChangeText={handlePasswordChange}
              secureTextEntry={true}
              showToggle={true}
              isShowing={mostrarSenha}
              setShowing={setMostrarSenha}
              autoCapitalize="none"
              loading={loading}
              keyboardType="number-pad"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              blurOnSubmit={true}
              maxLength={6}
            />

            <View style={styles.quickOptionsRow}>
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setLembrarTelefone(!lembrarTelefone)}
                disabled={loading}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, lembrarTelefone ? styles.checkboxActive : null]}>
                  {lembrarTelefone ? <Ionicons name="checkmark" size={12} color="#FFF" /> : null}
                </View>
                <Text style={styles.checkboxText}>Lembrar telefone</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => navigation.navigate('ForgotPassword')}
                disabled={loading}
                activeOpacity={0.7}
              >
                <Text style={styles.forgotText}>Esqueci a senha</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.ctaButton, loading && styles.ctaButtonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <>
                  <ActivityIndicator color="#FFF" size="small" style={{ marginRight: 10 }} />
                  <Text style={styles.ctaButtonText}>A entrar...</Text>
                </>
              ) : (
                <>
                  <Text style={styles.ctaButtonText}>Entrar</Text>
                  <View style={styles.ctaArrow}>
                    <Ionicons name="arrow-forward" size={16} color="#FFF" />
                  </View>
                </>
              )}
            </TouchableOpacity>

            {(biometricSupported || savedBiometricCredentials) ? (
              <View style={{ marginTop: 18 }}>
                <View style={styles.orDivider}>
                  <View style={styles.orLine} />
                  <Text style={styles.orText}>ou</Text>
                  <View style={styles.orLine} />
                </View>

                {savedBiometricCredentials ? (
                  <TouchableOpacity
                    style={[styles.biometricButton, loading && styles.ctaButtonDisabled]}
                    onPress={handleBiometricLogin}
                    disabled={loading}
                    activeOpacity={0.8}
                  >
                    <View style={styles.biometricIconWrap}>
                      <Ionicons name="finger-print" size={22} color={ZORA_ORANGE} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.biometricTitle}>Entrar com biometria</Text>
                      <Text style={styles.biometricSub}>Impressão digital, reconhecimento facial...</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#6B7280" />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.biometricHintCard}>
                    <View style={styles.biometricHintIcon}>
                      <Ionicons name="shield-checkmark-outline" size={18} color={ZORA_ORANGE_DARK} />
                    </View>
                    <Text style={styles.biometricHintText}>
                      Biometria disponível no seu dispositivo.{'\n'}
                      <Text style={{ fontWeight: '700', color: ZORA_ORANGE_DARK }}>Ative-a na sua conta</Text> depois de entrar.
                    </Text>
                  </View>
                )}
              </View>
            ) : null}

            <View style={styles.trustRow}>
              <Ionicons name="shield-checkmark-outline" size={14} color="#6B7280" />
              <Text style={styles.trustText}>Acesso seguro com encriptação ponta-a-ponta.</Text>
            </View>

            <View style={styles.dividerLine} />

            <View style={styles.registerLinkContainer}>
              <View>
                <Text style={styles.registerLinkLabel}>Ainda não usa a Zora?</Text>
                <Text style={styles.registerLinkSubtitle}>Crie a sua conta em menos de 1 minuto</Text>
              </View>
              <TouchableOpacity
                onPress={() => navigation.navigate('Register')}
                disabled={loading}
                style={styles.registerLinkBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.registerLink}>Criar conta</Text>
                <Ionicons name="arrow-forward" size={14} color={ZORA_ORANGE_DARK} />
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.footerTerms}>
            Ao entrar, concorda com os{' '}
            <Text style={styles.footerLink} onPress={() => navigation.navigate('Policies')}>
              Termos de Uso e Política de Privacidade da Zora
            </Text>
            .
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: appTheme.background },
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 48 },

  brandHeader: { alignItems: 'center', paddingTop: 10, paddingBottom: 10 },
  welcomeBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: ZORA_ORANGE_LIGHT,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, marginBottom: 14,
    borderWidth: 1, borderColor: 'rgba(255, 106, 43, 0.15)',
  },
  welcomeBadgeText: { color: ZORA_ORANGE_DARK, fontSize: 11.5, fontWeight: '700', marginLeft: 6, fontFamily: appTheme.fontFamily, letterSpacing: 0.2 },
  brandSubtitle: { fontSize: 13, color: '#6B7280', fontFamily: appTheme.fontFamily, marginBottom: 18 },
  heroCard: {
    flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 18, paddingVertical: 14, paddingHorizontal: 10,
    borderWidth: 1, borderColor: 'rgba(255, 106, 43, 0.08)',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 14, shadowOffset: { width: 0, height: 3 }, elevation: 2,
    width: '100%', justifyContent: 'space-around',
  },
  heroItem: { alignItems: 'center', flex: 1 },
  heroIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  heroText: { fontSize: 11.5, fontWeight: '700', color: '#374151', fontFamily: appTheme.fontFamily },
  heroDivider: { width: 1, height: 40, backgroundColor: '#F3F4F6' },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 22, paddingHorizontal: 20, paddingVertical: 22,
    borderWidth: 1, borderColor: 'rgba(255, 106, 43, 0.10)',
    shadowColor: appTheme.shadow, shadowOpacity: 0.08, shadowRadius: 24, shadowOffset: { width: 0, height: 6 }, elevation: 4, marginTop: 10,
  },
  cardHeader: { marginBottom: 2 },
  cardTitle: { fontSize: 22, fontWeight: '800', color: appTheme.text, fontFamily: appTheme.fontFamily, marginBottom: 4 },
  cardSubtitle: { fontSize: 13, color: '#6B7280', fontFamily: appTheme.fontFamily },

  sectionDivider: { flexDirection: 'row', alignItems: 'center', marginTop: 22, marginBottom: 2 },
  sectionDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: ZORA_ORANGE, marginRight: 8,
    shadowColor: ZORA_ORANGE, shadowOpacity: 0.4, shadowRadius: 4, shadowOffset: { width: 0, height: 0 },
  },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#374151', letterSpacing: 0.4, fontFamily: appTheme.fontFamily, textTransform: 'uppercase' },

  fieldLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 },
  fieldLabel: { fontSize: 12.5, fontWeight: '600', color: '#374151', fontFamily: appTheme.fontFamily, marginLeft: 2 },
  fieldRightHint: { fontSize: 11, color: ZORA_ORANGE_DARK, fontWeight: '700', fontFamily: appTheme.fontFamily },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.2, borderColor: '#E5E7EB', borderRadius: 14, backgroundColor: '#FAFAFA' },
  inputWrapError: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  inputIconBox: { width: 42, alignItems: 'center', justifyContent: 'center' },
  inputInner: {
    flex: 1, paddingVertical: 13, paddingRight: 10,
    fontSize: 14.5, color: appTheme.text, fontFamily: appTheme.fontFamily,
    minHeight: 46,
  },
  inputToggleEye: { paddingHorizontal: 14, paddingVertical: 10 },
  fieldErrorHint: { marginTop: 6, marginLeft: 2, fontSize: 11.5, color: '#EF4444', fontWeight: '600', fontFamily: appTheme.fontFamily },

  quickOptionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center' },
  checkbox: {
    width: 18, height: 18, borderRadius: 5, borderWidth: 1.6, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center', marginRight: 8, backgroundColor: '#FFF',
  },
  checkboxActive: { backgroundColor: ZORA_ORANGE, borderColor: ZORA_ORANGE },
  checkboxText: { fontSize: 12.5, color: '#374151', fontWeight: '600', fontFamily: appTheme.fontFamily },
  forgotText: { fontSize: 12.5, color: ZORA_ORANGE_DARK, fontWeight: '800', fontFamily: appTheme.fontFamily },

  ctaButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 24,
    backgroundColor: ZORA_ORANGE, borderRadius: 16, paddingVertical: 16,
    shadowColor: ZORA_ORANGE, shadowOpacity: 0.38, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  ctaButtonDisabled: { opacity: 0.7 },
  ctaButtonText: { color: '#FFF', fontSize: 15.5, fontWeight: '800', letterSpacing: 0.3, fontFamily: appTheme.fontFamily },
  ctaArrow: {
    position: 'absolute', right: 16, width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.22)', alignItems: 'center', justifyContent: 'center',
  },

  orDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 18 },
  orLine: { flex: 1, height: 1, backgroundColor: '#F3F4F6' },
  orText: { paddingHorizontal: 14, color: '#9CA3AF', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', fontFamily: appTheme.fontFamily, letterSpacing: 1 },

  biometricButton: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFAFA', borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 14, borderWidth: 1.2, borderColor: '#E5E7EB',
  },
  biometricIconWrap: {
    width: 42, height: 42, borderRadius: 12, backgroundColor: ZORA_ORANGE_LIGHT,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  biometricTitle: { fontSize: 14.5, fontWeight: '800', color: '#111827', fontFamily: appTheme.fontFamily },
  biometricSub: { fontSize: 11.5, color: '#6B7280', marginTop: 2, fontFamily: appTheme.fontFamily },
  biometricHintCard: {
    flexDirection: 'row', backgroundColor: 'rgba(255, 106, 43, 0.06)', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: 'rgba(255, 106, 43, 0.12)',
  },
  biometricHintIcon: { width: 30, alignItems: 'center', marginRight: 8, marginTop: 2 },
  biometricHintText: {
    flex: 1, fontSize: 11.5, color: '#78350F', lineHeight: 16, fontFamily: appTheme.fontFamily, fontWeight: '500',
  },

  trustRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  trustText: { fontSize: 11.5, color: '#6B7280', marginLeft: 6, fontFamily: appTheme.fontFamily },
  dividerLine: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 18 },

  modeSwitchRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  modeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#FAFAFA',
    borderWidth: 1.4,
    borderColor: '#E5E7EB',
  },
  modeChipActive: {
    backgroundColor: ZORA_ORANGE,
    borderColor: ZORA_ORANGE_DARK,
    shadowColor: ZORA_ORANGE,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  modeChipAdmin: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  modeChipAdminActive: {
    backgroundColor: '#1D4ED8',
    borderColor: '#1E40AF',
    shadowColor: '#1D4ED8',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  modeChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: ZORA_ORANGE_DARK,
    fontFamily: appTheme.fontFamily,
  },
  modeChipTextActive: { color: '#FFF' },
  modeChipAdminText: { color: '#1E3A8A' },

  adminHintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    padding: 12,
    backgroundColor: '#DBEAFE',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  adminHintText: {
    marginLeft: 8,
    flex: 1,
    fontSize: 11.5,
    fontWeight: '600',
    color: '#1E3A8A',
    fontFamily: appTheme.fontFamily,
    lineHeight: 16,
  },
  ctaButtonAdmin: {
    backgroundColor: '#1D4ED8',
    shadowColor: '#1D4ED8',
  },

  registerLinkContainer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4,
  },
  registerLinkLabel: { color: '#111827', fontSize: 13.5, fontWeight: '700', fontFamily: appTheme.fontFamily },
  registerLinkSubtitle: { color: '#6B7280', fontSize: 11.5, marginTop: 2, fontFamily: appTheme.fontFamily },
  registerLinkBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: ZORA_ORANGE_LIGHT,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
  },
  registerLink: { color: ZORA_ORANGE_DARK, fontSize: 13.5, fontWeight: '800', fontFamily: appTheme.fontFamily, marginRight: 4 },

  footerTerms: {
    marginTop: 18, textAlign: 'center', fontSize: 11.5, color: '#9CA3AF',
    lineHeight: 16, paddingHorizontal: 14, fontFamily: appTheme.fontFamily,
  },
  footerLink: {
    color: ZORA_ORANGE_DARK,
    fontWeight: '800',
    textDecorationLine: 'underline',
    textDecorationColor: ZORA_ORANGE_DARK,
  },
});
