import React, { useState } from 'react';
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
import { requestPasswordReset } from '../services/auth';

const ZORA_ORANGE = '#FF6A2B';
const ZORA_ORANGE_DARK = '#FF7A00';
const ZORA_ORANGE_LIGHT = 'rgba(255, 106, 43, 0.10)';

export function ForgotPasswordScreen() {
  const navigation = useNavigation<any>();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  function validateEmail(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return 'O email é obrigatório.';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) return 'Insira um email válido.';
    return null;
  }

  async function handleSendResetLink() {
    const validationError = validateEmail(email);
    if (validationError) {
      setEmailError(validationError);
      return;
    }
    setEmailError(null);
    setLoading(true);

    try {
      const { error } = await requestPasswordReset(email);
      if (error) {
        Alert.alert('Não foi possível enviar', error);
        return;
      }
      setEmailSent(true);
    } catch (error: any) {
      Alert.alert('Erro', error.message || 'Ocorreu um erro inesperado.');
    } finally {
      setLoading(false);
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
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color="#111827" />
          </TouchableOpacity>

          <View style={styles.brandHeader}>
            <View style={styles.iconHeaderWrap}>
              <View style={styles.iconHeaderCircle}>
                <Ionicons name="mail-unread-outline" size={32} color="#FFF" />
              </View>
            </View>
            <Text style={styles.screenTitle}>Recuperar senha</Text>
            <Text style={styles.screenSubtitle}>
              {emailSent
                ? 'Verifique a sua caixa de entrada para redefinir a senha.'
                : 'Insira o email associado à sua conta e enviaremos um link para redefinir a sua senha.'}
            </Text>
          </View>

          {emailSent ? (
            <View style={styles.successCard}>
              <View style={styles.successIconWrap}>
                <Ionicons name="checkmark-circle" size={48} color="#16A34A" />
              </View>
              <Text style={styles.successTitle}>Link enviado!</Text>
              <Text style={styles.successMessage}>
                Enviamos um email com instruções para{'\n'}
                <Text style={styles.successEmail}>{email.trim()}</Text>
              </Text>
              <Text style={styles.successHint}>
                Não recebeu? Verifique a pasta de spam ou tente novamente.
              </Text>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {
                  setEmailSent(false);
                  setEmail('');
                }}
                disabled={loading}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh-outline" size={16} color={ZORA_ORANGE_DARK} />
                <Text style={styles.secondaryButtonText}>Tentar outro email</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.ctaButton, loading && styles.ctaButtonDisabled]}
                onPress={() => navigation.goBack()}
                activeOpacity={0.85}
              >
                <Text style={styles.ctaButtonText}>Voltar ao login</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.card}>
              <View style={styles.sectionDivider}>
                <View style={styles.sectionDot} />
                <Text style={styles.sectionTitle}>Seu email de recuperação</Text>
              </View>

              <View style={{ marginTop: 18 }}>
                <View style={styles.fieldLabelRow}>
                  <Text style={styles.fieldLabel}>Endereço de email</Text>
                </View>
                <View style={[styles.inputWrap, emailError ? styles.inputWrapError : null]}>
                  <View style={styles.inputIconBox}>
                    <Ionicons
                      name="mail-outline"
                      size={18}
                      color={emailError ? '#EF4444' : ZORA_ORANGE}
                    />
                  </View>
                  <TextInput
                    style={styles.inputInner}
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      if (emailError) setEmailError(null);
                    }}
                    placeholder="seu@email.com"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                    autoComplete="email"
                    textContentType="emailAddress"
                  />
                </View>
                {emailError ? <Text style={styles.fieldErrorHint}>{emailError}</Text> : null}
              </View>

              <View style={styles.infoCard}>
                <View style={styles.infoIconWrap}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={ZORA_ORANGE_DARK} />
                </View>
                <Text style={styles.infoText}>
                  O link de redefinição expira após 1 hora por motivos de segurança. A sua privacidade é importante para nós.
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.ctaButton, loading && styles.ctaButtonDisabled]}
                onPress={handleSendResetLink}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <>
                    <ActivityIndicator color="#FFF" size="small" style={{ marginRight: 10 }} />
                    <Text style={styles.ctaButtonText}>A enviar...</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.ctaButtonText}>Enviar link de recuperação</Text>
                    <View style={styles.ctaArrow}>
                      <Ionicons name="paper-plane-outline" size={16} color="#FFF" />
                    </View>
                  </>
                )}
              </TouchableOpacity>

              <View style={styles.dividerLine} />

              <View style={styles.registerLinkContainer}>
                <View>
                  <Text style={styles.registerLinkLabel}>Lembrou da senha?</Text>
                  <Text style={styles.registerLinkSubtitle}>Pode voltar ao ecrã de login</Text>
                </View>
                <TouchableOpacity
                  onPress={() => navigation.goBack()}
                  disabled={loading}
                  style={styles.registerLinkBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.registerLink}>Entrar</Text>
                  <Ionicons name="arrow-forward" size={14} color={ZORA_ORANGE_DARK} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          <Text style={styles.footerTerms}>
            Ao continuar, concorda com os{' '}
            <Text
              style={styles.footerLink}
              onPress={() => navigation.navigate('Policies')}
            >
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

  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },

  brandHeader: { alignItems: 'center', paddingTop: 10, paddingBottom: 18 },
  iconHeaderWrap: { marginBottom: 14 },
  iconHeaderCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: ZORA_ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ZORA_ORANGE,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#111827',
    fontFamily: appTheme.fontFamily,
    letterSpacing: -0.3,
    marginBottom: 8,
    textAlign: 'center',
  },
  screenSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    fontFamily: appTheme.fontFamily,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 10,
  },

  successCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    paddingHorizontal: 22,
    paddingVertical: 28,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.12)',
    shadowColor: appTheme.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    marginTop: 10,
    alignItems: 'center',
  },
  successIconWrap: { marginBottom: 14 },
  successTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#166534',
    fontFamily: appTheme.fontFamily,
    marginBottom: 8,
  },
  successMessage: {
    fontSize: 14,
    color: '#374151',
    fontFamily: appTheme.fontFamily,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 10,
  },
  successEmail: {
    fontWeight: '800',
    color: ZORA_ORANGE_DARK,
  },
  successHint: {
    fontSize: 12,
    color: '#9CA3AF',
    fontFamily: appTheme.fontFamily,
    textAlign: 'center',
    marginBottom: 22,
    lineHeight: 18,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingVertical: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 106, 43, 0.10)',
    shadowColor: appTheme.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    marginTop: 10,
  },

  sectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 2,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ZORA_ORANGE,
    marginRight: 8,
    shadowColor: ZORA_ORANGE,
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    letterSpacing: 0.4,
    fontFamily: appTheme.fontFamily,
    textTransform: 'uppercase',
  },

  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#374151',
    fontFamily: appTheme.fontFamily,
    marginLeft: 2,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.2,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    backgroundColor: '#FAFAFA',
  },
  inputWrapError: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  inputIconBox: { width: 42, alignItems: 'center', justifyContent: 'center' },
  inputInner: {
    flex: 1,
    paddingVertical: 13,
    paddingRight: 10,
    fontSize: 14.5,
    color: appTheme.text,
    fontFamily: appTheme.fontFamily,
    minHeight: 46,
  },
  fieldErrorHint: {
    marginTop: 6,
    marginLeft: 2,
    fontSize: 11.5,
    color: '#EF4444',
    fontWeight: '600',
    fontFamily: appTheme.fontFamily,
  },

  infoCard: {
    flexDirection: 'row',
    backgroundColor: ZORA_ORANGE_LIGHT,
    borderRadius: 14,
    padding: 12,
    marginTop: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 106, 43, 0.12)',
  },
  infoIconWrap: { width: 28, alignItems: 'center', marginRight: 8, marginTop: 2 },
  infoText: {
    flex: 1,
    fontSize: 11.5,
    color: '#78350F',
    lineHeight: 17,
    fontFamily: appTheme.fontFamily,
    fontWeight: '500',
  },

  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: ZORA_ORANGE_LIGHT,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    marginBottom: 16,
  },
  secondaryButtonText: {
    marginLeft: 6,
    color: ZORA_ORANGE_DARK,
    fontSize: 13,
    fontWeight: '800',
    fontFamily: appTheme.fontFamily,
  },

  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
    backgroundColor: ZORA_ORANGE,
    borderRadius: 16,
    paddingVertical: 16,
    shadowColor: ZORA_ORANGE,
    shadowOpacity: 0.38,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  ctaButtonDisabled: { opacity: 0.7 },
  ctaButtonText: {
    color: '#FFF',
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: 0.3,
    fontFamily: appTheme.fontFamily,
  },
  ctaArrow: {
    position: 'absolute',
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  dividerLine: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 20 },

  registerLinkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  registerLinkLabel: {
    color: '#111827',
    fontSize: 13.5,
    fontWeight: '700',
    fontFamily: appTheme.fontFamily,
  },
  registerLinkSubtitle: {
    color: '#6B7280',
    fontSize: 11.5,
    marginTop: 2,
    fontFamily: appTheme.fontFamily,
  },
  registerLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ZORA_ORANGE_LIGHT,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  registerLink: {
    color: ZORA_ORANGE_DARK,
    fontSize: 13.5,
    fontWeight: '800',
    fontFamily: appTheme.fontFamily,
    marginRight: 4,
  },

  footerTerms: {
    marginTop: 22,
    textAlign: 'center',
    fontSize: 11.5,
    color: '#9CA3AF',
    lineHeight: 16,
    paddingHorizontal: 14,
    fontFamily: appTheme.fontFamily,
  },
  footerLink: {
    color: ZORA_ORANGE_DARK,
    fontWeight: '800',
    textDecorationLine: 'underline',
    textDecorationColor: ZORA_ORANGE_DARK,
  },
});
