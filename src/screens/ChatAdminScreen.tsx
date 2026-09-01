import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { backend } from '../services/backendClient';
import { adminSuspendUser, adminUnsuspendUser } from '../services/admin';

type ChatUser = {
  id: string;
  full_name: string;
  phone_number: string;
  suspended_until: string | null;
  suspension_reason: string | null;
};

const DEFAULT_REASON = 'Por motivos de conteúdo que viola as políticas do Zora.';

export function ChatAdminScreen() {
  const navigation = useNavigation<any>();
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    const result: any = await backend
      .from('user_profiles')
      .select('id,full_name,phone_number,suspended_until,suspension_reason')
      .order('full_name', { ascending: true });
    if (result?.error) throw result.error;
    setUsers(result.data ?? []);
  }, []);

  useEffect(() => {
    loadUsers().catch((error: any) => Alert.alert('Erro', error?.message || 'Não foi possível carregar os utilizadores.')).finally(() => setLoading(false));
  }, [loadUsers]);

  const isSuspended = (user: ChatUser) => Boolean(user.suspended_until && new Date(user.suspended_until).getTime() > Date.now());
  const actOnUser = (user: ChatUser) => {
    const active = isSuspended(user);
    const action = active ? 'reativar' : 'suspender';
    const execute = async (hours?: number) => {
      setBusyId(user.id);
      try {
        const result = active ? await adminUnsuspendUser(user.id) : await adminSuspendUser(user.id, hours ?? 4, DEFAULT_REASON);
        Alert.alert(result.success ? 'Sucesso' : 'Aviso', result.message);
        if (result.success) await loadUsers();
      } catch (error: any) {
        Alert.alert('Erro', error?.message || `Não foi possível ${action} o utilizador.`);
      } finally { setBusyId(null); }
    };
    if (active) {
      Alert.alert('Reativar mensagens', `Reativar ${user.full_name || user.phone_number}?`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Reativar', onPress: () => execute() }]);
    } else {
      Alert.alert('Suspender mensagens', 'Escolha a duração da suspensão.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: '4 horas', onPress: () => execute(4) },
        { text: '24 horas', onPress: () => execute(24) },
        { text: '72 horas', onPress: () => execute(72) },
      ]);
    }
  };

  const visibleUsers = users.filter((user) => `${user.full_name} ${user.phone_number}`.toLowerCase().includes(search.toLowerCase().trim()));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={22} color="#111827" /></TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 14 }}><Text style={styles.title}>Moderação do Chat</Text><Text style={styles.subtitle}>Suspender mensagens públicas e privadas</Text></View>
      </View>
      <View style={styles.search}><Ionicons name="search-outline" size={18} color="#6B7280" /><TextInput value={search} onChangeText={setSearch} placeholder="Nome ou telefone" placeholderTextColor="#9CA3AF" style={styles.searchInput} /></View>
      {loading ? <ActivityIndicator color="#0D9488" size="large" style={{ marginTop: 40 }} /> : <FlatList data={visibleUsers} keyExtractor={(user) => user.id} contentContainerStyle={styles.list} renderItem={({ item }) => {
        const active = isSuspended(item);
        return <View style={styles.card}><View style={{ flex: 1 }}><Text style={styles.name}>{item.full_name || 'Sem nome'}</Text><Text style={styles.phone}>{item.phone_number || 'Sem número'}</Text>{active ? <Text style={styles.status}>Suspenso até {new Date(item.suspended_until!).toLocaleString('pt-MZ')}</Text> : null}</View><TouchableOpacity style={[styles.action, active && styles.reactivate]} onPress={() => actOnUser(item)} disabled={busyId === item.id}><Ionicons name={busyId === item.id ? 'time-outline' : active ? 'lock-open-outline' : 'ban-outline'} size={17} color="#fff" /><Text style={styles.actionText}>{active ? 'Reativar' : 'Suspender'}</Text></TouchableOpacity></View>;
      }} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#F8FAFC' }, header: { flexDirection: 'row', alignItems: 'center', padding: 18, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }, title: { fontSize: 20, fontWeight: '800', color: '#111827' }, subtitle: { marginTop: 3, fontSize: 12, color: '#6B7280' }, search: { margin: 14, paddingHorizontal: 14, height: 46, borderRadius: 12, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB' }, searchInput: { flex: 1, marginLeft: 8, color: '#111827' }, list: { padding: 14, paddingTop: 0 }, card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB' }, name: { fontSize: 15, fontWeight: '800', color: '#111827' }, phone: { marginTop: 4, color: '#6B7280', fontSize: 13 }, status: { marginTop: 6, color: '#991B1B', fontSize: 12, fontWeight: '700' }, action: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#DC2626', paddingHorizontal: 11, paddingVertical: 10, borderRadius: 9 }, reactivate: { backgroundColor: '#16A34A' }, actionText: { color: '#fff', fontSize: 12, fontWeight: '800' } });
