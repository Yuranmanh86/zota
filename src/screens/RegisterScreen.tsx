import React, { useState, useEffect, useCallback } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { appTheme } from '../theme/appTheme';
import { signUpUser, getPhoneAliasEmail, getCurrentSession } from '../services/auth';
import { getInitialReferralCode } from '../services/referrals';
import { useAppStore } from '../store/appStore';
import { BrandLogo } from '../components/BrandLogo';

const ZORA_ORANGE = '#FF6A2B';
const ZORA_ORANGE_DARK = '#FF7A00';
const ZORA_ORANGE_LIGHT = 'rgba(255, 106, 43, 0.10)';
const CHECKBOX_SIZE = 18;
const DOT_SIZE = 10;

type FieldProps = {
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
  loading?: boolean;
  autoCapitalize?: any;
  autoFocus?: boolean;
  inputRef?: any;
  returnKeyType?: any;
  onSubmitEditing?: () => void;
  blurOnSubmit?: boolean;
  maxLength?: number;
};

const Field = React.memo(function Field({
  icon, label, placeholder, value, onChangeText, keyboardType, secureTextEntry,
  showToggle, isShowing, setShowing, editable = true, loading = false,
  autoCapitalize, autoFocus, inputRef, returnKeyType, onSubmitEditing,
  blurOnSubmit = false, maxLength,
}: FieldProps) {
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        <View style={styles.inputIconBox}>
          <Ionicons name={icon} size={18} color={ZORA_ORANGE} />
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
          autoFocus={autoFocus}
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
    </View>
  );
});

function avaliaForcaPIN(pwd: string) {
  const onlyNumbers = /^\d*$/.test(pwd);
  const len = pwd.length;
  let score = 0;
  if (len >= 1) score += 1;
  if (len >= 2) score += 1;
  if (len >= 3) score += 1;
  if (len >= 4) score += 1;
  if (len >= 5) score += 1;
  if (len >= 6) score += 1;
  score = Math.max(0, Math.min(score, 5));

  let label = 'Fraca';
  let color = '#EF4444';
  let pct = 20;
  if (score <= 1) { label = 'Fraca'; color = '#EF4444'; pct = 17; }
  else if (score === 2) { label = 'Fraca'; color = '#F97316'; pct = 34; }
  else if (score === 3) { label = 'Razoável'; color = '#F59E0B'; pct = 50; }
  else if (score === 4) { label = 'Boa'; color = '#3B82F6'; pct = 83; }
  else { label = 'Forte'; color = '#059669'; pct = 100; }

  const checks: Array<{ label: string; met: boolean }> = [
    { label: 'Exatamente 6 dígitos', met: len === 6 },
    { label: 'Apenas números de 0 a 9', met: onlyNumbers },
  ];
  return { score, color, label, pct, checks, len, onlyNumbers };
}

function formatPhoneStatic(t: string) {
  const d = t.replace(/\D/g, '').slice(0, 12);
  if (d.length <= 9) return d;
  return `+${d.slice(0, 3)} ${d.slice(3)}`;
}

function normalizePhoneStatic(t: string) {
  const d = t.replace(/\D/g, '');
  if (d.startsWith('258') && d.length === 12) return d.slice(3);
  return d.slice(0, 9);
}

export function RegisterScreen() {
  const navigation = useNavigation<any>();
  const setUserName = useAppStore((state) => state.setUserName);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPINHint, setShowPINHint] = useState(false);

  const nameRef = React.useRef<any>(null);
  const phoneRef = React.useRef<any>(null);
  const passwordRef = React.useRef<any>(null);
  const inviteRef = React.useRef<any>(null);

  const pinStrength = avaliaForcaPIN(password);
  const phoneDigits = normalizePhoneStatic(phone);
  const passwordValid = password.length === 6 && pinStrength.onlyNumbers;

  const validations: Array<[string, boolean]> = [
    ['Nome completo', fullName.trim().split(/\s+/).filter(Boolean).length >= 2],
    ['Telefone (T MZ válido)', /^8[2-7]\d{7}$/.test(phoneDigits)],
    ['Palavra-passe (6 dígitos)', passwordValid],
    ['Aceitar Termos e Privacidade', acceptTerms],
  ];
  const totalValid = validations.filter((v) => v[1]).length;
  const allValid = totalValid === validations.length;

  useEffect(() => {
    const t = setTimeout(() => {
      if (password.length > 0) setShowPINHint(true);
    }, 200);
    return () => clearTimeout(t);
  }, [password.length]);

  useEffect(() => {
    let mounted = true;
    getInitialReferralCode().then((code) => {
      if (mounted && code && !inviteCode) setInviteCode(code);
    });
    return () => { mounted = false; };
  }, []);

  const handlePhoneChange = useCallback((t: string) => {
    setPhone(formatPhoneStatic(t));
  }, []);

  const handlePINChange = useCallback((t: string) => {
    const only = t.replace(/\D/g, '').slice(0, 6);
    setPassword(only);
  }, []);

  async function handleRegister() {
    if (!allValid) {
      Alert.alert('Verifique os seus dados', 'Preencha todos os campos corretamente e aceite os Termos e Privacidade.');
      return;
    }
    setLoading(true);
    try {
      const aliasEmail = getPhoneAliasEmail(phoneDigits);
      const result = await signUpUser({
        fullName: fullName.trim(),
        phone: phoneDigits,
        password,
        inviteCode: inviteCode.trim() || undefined,
      });
      if (result.error || !result.data?.user) {
        const msg = result.error?.message || 'Não foi possível criar a conta. Tente novamente.';
        Alert.alert('Cadastro não concluído', msg);
        return;
      }

      const trimmed = fullName.trim();
      const first = trimmed.split(/\s+/)[0] || trimmed;
      if (first) setUserName(first);

      try {
        const sessionCheck = await getCurrentSession();
        if (!sessionCheck?.session?.user) {
          navigation.replace('Login');
          return;
        }
      } catch (_e) {
        navigation.replace('Login');
        return;
      }

      navigation.replace('BiometricSetup', { email: aliasEmail, password, phone: phoneDigits });
    } catch (err: any) {
      console.error('Register catch:', err);
      Alert.alert('Erro', err?.message || 'Não foi possível criar a conta.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']} mode={Platform.OS === 'web' ? 'padding' : undefined}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 74 : 0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            Platform.OS === 'web' ? styles.scrollContentWeb : null,
          ]}
          showsVerticalScrollIndicator={true}
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'interactive'}
          nestedScrollEnabled
          alwaysBounceVertical={false}
          contentInsetAdjustmentBehavior="automatic"
        >
          <View style={styles.brandHeader} key="brand-header">
                      <View >
                      </View>
                      <BrandLogo size="md" showText={true} style={{ marginBottom: 6 }} />
                      <Text style={styles.brandSubtitle}>Cria a sua carteira digital</Text>
          
                     
                    </View>

          <View style={styles.card} key="register-card">
            <View style={styles.cardHeader}>  
              <Text style={styles.cardSubtitle}>Preencha os dados abaixo para começar.</Text>
            </View>

            <View style={styles.sectionDivider}>
              <View style={styles.sectionDot} />
              <Text style={styles.sectionTitleCard}>Seus dados de cadastro</Text>
            </View>

            

            <View style={[styles.section, { marginTop: 14 }]}>

              <Field
                key="name"
                inputRef={nameRef}
                icon="person-outline"
                label="Nome completo"
                placeholder="Ex: João Maria Chissano"
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                loading={loading}
                autoFocus
                returnKeyType="next"
                onSubmitEditing={() => phoneRef.current?.focus?.()}
              />

              <Field
                key="phone"
                inputRef={phoneRef}
                icon="call-outline"
                label="Número de telefone"
                placeholder="+258 84 000 0000"
                value={phone}
                onChangeText={handlePhoneChange}
                keyboardType="phone-pad"
                loading={loading}
                returnKeyType="next"
                onSubmitEditing={() => inviteRef.current?.focus?.()}
                maxLength={17}
              />
            </View>

              <Field
                key="invite"
                inputRef={inviteRef}
                icon="gift-outline"
                label="Código de indicação (opcional)"
                placeholder="Ex: ZORA2024 ou código de um amigo"
                value={inviteCode}
                onChangeText={(t) => setInviteCode(t.toUpperCase())}
                autoCapitalize="characters"
                loading={loading}
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus?.()}
                maxLength={16}
              />

              <Field
                key="password"
                inputRef={passwordRef}
                icon="lock-closed-outline"
                label="Senha"
                placeholder="6 ou mais dígitos"
                value={password}
                onChangeText={handlePINChange}
                secureTextEntry={true}
                showToggle={true}
                isShowing={showPassword}
                setShowing={setShowPassword}
                loading={loading}
                keyboardType="number-pad"
                returnKeyType="done"
                blurOnSubmit={true}
                onSubmitEditing={handleRegister}
                maxLength={6}
              />
            <View style={styles.termsWrap}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <TouchableOpacity
                  style={{ paddingTop: 2 }}
                  onPress={() => setAcceptTerms(!acceptTerms)}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.checkbox,
                      acceptTerms ? styles.checkboxActive : null,
                      { width: CHECKBOX_SIZE, height: CHECKBOX_SIZE, borderRadius: 6 },
                    ]}
                  >
                    {acceptTerms ? <Ionicons name="checkmark-sharp" size={12} color="#FFF" /> : null}
                  </View>
                </TouchableOpacity>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.termsText}>
                    Li e concordo com os{' '}
                    <Text style={styles.termsLink} onPress={() => navigation.navigate('Policies')}>
                      Termos de Uso
                    </Text>
                    {' '}e{' '}
                    <Text style={styles.termsLink} onPress={() => navigation.navigate('Policies')}>
                      Política de Privacidade
                    </Text>
                    {' '}da Zora.
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.ctaButton, loading || !allValid ? styles.ctaButtonDisabled : null]}
              onPress={handleRegister}
              disabled={loading || !allValid}
              activeOpacity={0.85}
            >
              {loading ? (
                <>
                  <ActivityIndicator color="#FFF" size="small" style={{ marginRight: 10 }} />
                  <Text style={styles.ctaButtonText}>Criando a conta...</Text>
                </>
              ) : (
                <>
                  <Text style={styles.ctaButtonText}>Criar minha conta Zora</Text>
                  <View style={styles.ctaArrow}>
                    <Ionicons name="rocket-outline" size={16} color="#FFF" />
                  </View>
                </>
              )}
            </TouchableOpacity>

            

            <View style={styles.registerLinkContainer}>
              <Text style={styles.registerLinkLabel}>Já tem uma conta?</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('Login')}
                disabled={loading}
                activeOpacity={0.7}
                style={styles.registerLinkBtn}
              >
                <Text style={styles.registerLink}>Entrar agora</Text>
                <Ionicons name="arrow-forward" size={14} color={ZORA_ORANGE_DARK} />
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.footer}>
            Zora © {new Date().getFullYear()} — Carteira digital comunitária e economia coletiva.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: appTheme.background,
    minHeight: Platform.OS === 'web' ? '100vh' as any : '100%',
  },
  scrollView: {
    flex: 1,
    width: '100%',
    minHeight: Platform.OS === 'web' ? '100vh' as any : '100%',
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 48,
    flexGrow: 1,
    minHeight: Platform.OS === 'web' ? '100%' : '100%',
  },
  scrollContentWeb: {
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: Platform.OS === 'web' ? 24 : 18,
    paddingBottom: Platform.OS === 'web' ? 120 : 48,
  },

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
  sectionTitleCard: { fontSize: 12, fontWeight: '700', color: '#374151', letterSpacing: 0.4, fontFamily: appTheme.fontFamily, textTransform: 'uppercase' },

  progressWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFAFA',
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,106,43,0.08)',
  },
  progressDot: {
    width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2, marginRight: 6, borderWidth: 1.5,
    backgroundColor: '#E5E7EB', borderColor: '#D1D5DB',
  },
  progressLabel: {
    marginLeft: 'auto', fontSize: 12, fontWeight: '700', color: ZORA_ORANGE_DARK, fontFamily: appTheme.fontFamily,
  },

  section: { paddingBottom: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 2, marginTop: 6 },
  sectionIcon: {
    width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 8,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '800', color: '#111827', letterSpacing: 0.3, textTransform: 'uppercase',
    fontFamily: appTheme.fontFamily,
  },

  fieldLabel: { fontSize: 12.5, fontWeight: '600', color: '#374151', fontFamily: appTheme.fontFamily, marginBottom: 6, marginLeft: 2 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.2, borderColor: '#E5E7EB', borderRadius: 14, backgroundColor: '#FAFAFA' },
  inputIconBox: { width: 42, alignItems: 'center', justifyContent: 'center' },
  inputInner: {
    flex: 1, paddingVertical: 13, paddingRight: 10,
    fontSize: 14.5, color: appTheme.text, fontFamily: appTheme.fontFamily,
    minHeight: 46,
  },
  inputToggleEye: { paddingHorizontal: 14, paddingVertical: 10 },

  strengthCard: {
    marginTop: 14, backgroundColor: 'rgba(255, 106, 43, 0.04)', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: 'rgba(255, 106, 43, 0.08)',
  },
  strengthLabel: { fontSize: 12, fontWeight: '700', color: '#374151', fontFamily: appTheme.fontFamily },
  strengthScore: { fontSize: 12, fontWeight: '900', fontFamily: appTheme.fontFamily },
  strengthBarWrap: { height: 6, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 100, overflow: 'hidden', marginBottom: 12 },
  strengthBar: { height: '100%', borderRadius: 100 },
  strengthChecks: { marginTop: 2 },
  strengthCheckRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 3 },
  checkboxMini: {
    width: 14, height: 14, borderRadius: 4, marginRight: 8, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.2, backgroundColor: '#FFF',
  },
  strengthCheckText: { fontSize: 11.5, fontFamily: appTheme.fontFamily, fontWeight: '600' },
  pinTip: {
    marginTop: 10,
    fontSize: 11,
    color: '#78350F',
    fontFamily: appTheme.fontFamily,
    fontWeight: '600',
    lineHeight: 16,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },

  termsWrap: { marginTop: 20, paddingHorizontal: 2 },
  checkbox: {
    borderWidth: 1.6, borderColor: '#D1D5DB', backgroundColor: '#FFFFFF', marginRight: 10,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  checkboxActive: { backgroundColor: ZORA_ORANGE, borderColor: ZORA_ORANGE },
  termsText: { fontSize: 12.5, color: '#4B5563', lineHeight: 19, fontFamily: appTheme.fontFamily, fontWeight: '500' },
  termsLink: { color: ZORA_ORANGE_DARK, fontWeight: '800', textDecorationLine: 'underline' },

  ctaButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 22,
    backgroundColor: ZORA_ORANGE, borderRadius: 16, paddingVertical: 16,
    shadowColor: ZORA_ORANGE, shadowOpacity: 0.38, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  ctaButtonDisabled: { opacity: 0.55 },
  ctaButtonText: { color: '#FFF', fontSize: 15.5, fontWeight: '800', letterSpacing: 0.3, fontFamily: appTheme.fontFamily },
  ctaArrow: {
    position: 'absolute', right: 16, width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center',
  },

  tipsCard: {
    marginTop: 18, padding: 14, borderRadius: 14,
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
  },
  tipIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  tipTitle: { fontSize: 13, fontWeight: '800', color: '#78350F', fontFamily: appTheme.fontFamily, flex: 1 },
  tipText: {
    fontSize: 11.5, color: '#78350F', lineHeight: 17, fontFamily: appTheme.fontFamily, fontWeight: '500', paddingLeft: 36,
  },

  registerLinkContainer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 20, paddingTop: 18, borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  registerLinkLabel: { fontSize: 13, color: '#374151', fontWeight: '600', fontFamily: appTheme.fontFamily },
  registerLinkBtn: { flexDirection: 'row', alignItems: 'center' },
  registerLink: { color: ZORA_ORANGE_DARK, fontSize: 13, fontWeight: '800', marginRight: 4, fontFamily: appTheme.fontFamily },

  footer: {
    marginTop: 18, textAlign: 'center', fontSize: 11, color: '#9CA3AF',
    fontFamily: appTheme.fontFamily, paddingHorizontal: 10, lineHeight: 16,
  },
});
