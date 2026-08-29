import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { appTheme } from '../theme/appTheme';

export function SupportScreen() {
  const navigation = useNavigation<any>();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>Assistente IA</Text>
      <View style={styles.card}>
        <Text style={styles.amount}>Como posso ajudar hoje?</Text>
        <Text style={styles.label}>Saiba mais sobre investimentos e empréstimos.</Text>
      </View>
      <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Chat')}>
        <Text style={styles.buttonText}>Abrir chat com suporte</Text>
      </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: appTheme.background },
  scroll: { flex: 1 },
  contentContainer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 120 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 16, color: appTheme.text, fontFamily: appTheme.fontFamily },
  card: { borderRadius: 20, padding: 16, marginBottom: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: appTheme.border, shadowColor: appTheme.shadow, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  amount: { fontSize: 16, fontWeight: '700', color: appTheme.text, fontFamily: appTheme.fontFamily },
  label: { fontSize: 13, marginTop: 8, color: appTheme.muted, fontFamily: appTheme.fontFamily },
  button: { backgroundColor: appTheme.primary, borderRadius: 999, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontFamily: appTheme.fontFamily },
  secondaryButton: { borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginBottom: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: appTheme.border, shadowColor: appTheme.shadow, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  secondaryText: { fontWeight: '700', color: appTheme.text, fontFamily: appTheme.fontFamily },
});
