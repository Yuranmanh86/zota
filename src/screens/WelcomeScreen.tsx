import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { appTheme } from '../theme/appTheme';
import { BrandLogo } from '../components/BrandLogo';

export function WelcomeScreen() {
  const navigation = useNavigation<any>();

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#FF7A00', '#FF9F2E']} style={styles.hero}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoWrap}>
            <BrandLogo
              size="lg"
              showText={true}
              iconBg="#FFFFFF"
              letterColor="#FF6A2B"
              flashColor="#FF6A2B"
              textColor="#FFFFFF"
            />
          </View>
          <Text style={styles.title}>Bem-vindo ao Zora</Text>
          <Text style={styles.subtitle}>Uma conta financeira simples, segura e feita para o seu dia a dia.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('Register')}>
            <Text style={styles.primaryButtonText}>Criar conta</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.secondaryButtonText}>Já tenho conta</Text>
          </TouchableOpacity>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF7ED' },
  hero: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 24, alignItems: 'center', paddingVertical: 40, flexGrow: 1, justifyContent: 'center' },
  logoWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
    padding: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 32,
  },
  title: { fontSize: 28, fontWeight: '800', color: '#FFF', marginBottom: 10, textAlign: 'center', fontFamily: appTheme.fontFamily },
  subtitle: { fontSize: 15, color: 'rgba(255,255,255,0.92)', textAlign: 'center', marginBottom: 24, lineHeight: 22, fontFamily: appTheme.fontFamily },
  primaryButton: { width: '100%', backgroundColor: '#FFF', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  primaryButtonText: { color: '#FF7A00', fontWeight: '700', fontSize: 15, fontFamily: appTheme.fontFamily },
  secondaryButton: { width: '100%', paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 16 },
  secondaryButtonText: { color: '#FFF', fontWeight: '700', fontSize: 15, fontFamily: appTheme.fontFamily },
});
