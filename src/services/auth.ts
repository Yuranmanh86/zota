import AsyncStorage from '@react-native-async-storage/async-storage';
import { backend } from './backendClient';
import { invalidateFinanceCache } from './finance';

const BIOMETRIC_DATA_KEY = '@zora:biometricCredentials';
const PROFILE_TABLES = ['user_profiles', 'profiles'] as const;
type ProfileTableName = (typeof PROFILE_TABLES)[number];
export const SUPPORT_THREAD_ID = '00000000-0000-0000-0000-000000000001';
export const SAVINGS_THREAD_ID = '00000000-0000-0000-0000-000000000002';
export const ALL_ZORA_GROUP_IDS = [SUPPORT_THREAD_ID, SAVINGS_THREAD_ID];
export const ZORA_SYSTEM_PROFILE_ID = '00000000-0000-0000-0000-000000000099';

async function sendWelcomeMessageToGroup(threadId: string, userName: string) {
  try {
    const welcomeText = `👋 Bem-vindo(a) ${userName}! Você foi adicionado(a) automaticamente ao grupo de suporte da Zora. Estamos aqui para ajudar com qualquer dúvida. 💬✨`;
    await backend.from('chat_messages').insert({
      chat_thread_id: threadId,
      sender_profile_id: ZORA_SYSTEM_PROFILE_ID,
      type: 'text',
      content: welcomeText,
      created_at: new Date().toISOString(),
    });
  } catch {}
}

async function ensureAllZoraGroupsMembership(profileId: string, userName?: string) {
  if (!profileId) return;
  for (const threadId of ALL_ZORA_GROUP_IDS) {
    try {
      const existing: any = await backend
        .from('chat_thread_members')
        .select('id')
        .eq('chat_thread_id', threadId)
        .eq('profile_id', profileId)
        .limit(1);
      if (existing?.error) { continue; }
      if (Array.isArray(existing?.data) && existing.data.length > 0) { continue; }
      const ins: any = await backend.from('chat_thread_members').insert({
        chat_thread_id: threadId,
        profile_id: profileId,
        joined_at: new Date().toISOString(),
        role: 'participant',
      });
      if (!ins?.error && userName && threadId === SUPPORT_THREAD_ID) {
        setTimeout(() => sendWelcomeMessageToGroup(threadId, userName.split(' ')[0] || userName), 300);
      }
      if (ins?.error) console.warn(`ensureGroupMembership [${threadId}] warn:`, ins.error);
    } catch (e: any) {
      console.warn(`ensureGroupMembership [${threadId}] failed silently:`, e?.message || e);
    }
  }
}

export async function getGroupMemberCount(threadId: string): Promise<number> {
  try {
    const { data, error } = await backend
      .from('chat_thread_members')
      .select('id', { count: 'exact', head: true })
      .eq('chat_thread_id', threadId);
    if (error) return 0;
    return (data as any)?.count ?? 0;
  } catch {
    return 0;
  }
}

async function ensureSupportGroupMembership(profileId: string) {
  ensureAllZoraGroupsMembership(profileId);
}

type UserProfile = {
  id: string;
  auth_user_id?: string;
  nome_completo?: string;
  telefone?: string;
  email_virtual?: string;
  codigo_convite?: string;
  biometric_enabled?: boolean;
  full_name?: string;
  phone_number?: string;
  invite_code?: string;
  balance?: number;
  total_invested?: number;
  accumulated_profits?: number;
};

type BiometricCredentials = {
  email: string;
  password: string;
  phone?: string;
};

export function getPhoneAliasEmail(phone: string) {
  const digits = phone.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const mzDigits = digits.startsWith('258') && digits.length >= 12 ? digits.slice(3) : digits;
  const normalizedPhone = mzDigits || `user${Date.now()}`;
  return `${normalizedPhone}@zora.app`;
}

export function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('258') && digits.length >= 12 ? digits.slice(3) : digits;
}

async function detectProfileTable(authUserId?: string): Promise<ProfileTableName | null> {
  const authId = authUserId ?? (await backend.auth.getSession()).data.session?.user?.id;
  if (authId) {
    for (const table of PROFILE_TABLES) {
      const { data, error } = await backend
        .from(table)
        .select('id')
        .eq('auth_user_id', authId)
        .limit(1)
        .maybeSingle();
      if (!error && data) {
        return table;
      }
    }
  }

  for (const table of PROFILE_TABLES) {
    const { error } = await backend.from(table).select('id').limit(1);
    if (!error) {
      return table;
    }
  }
  return null;
}

function normalizeProfile(profile: any): UserProfile | null {
  if (!profile) return null;
  if ('nome_completo' in profile || 'telefone' in profile) {
    return {
      ...profile,
      nome_completo: profile.nome_completo,
      telefone: profile.telefone,
      codigo_convite: profile.codigo_convite,
      biometric_enabled: profile.biometric_enabled,
    };
  }
  return {
    ...profile,
    nome_completo: profile.full_name,
    telefone: profile.phone_number,
    codigo_convite: profile.invite_code,
    biometric_enabled: profile.biometric_enabled,
  };
}

export async function getUserProfile(authUserId?: string) {
  const authId = authUserId ?? (await backend.auth.getSession()).data.session?.user?.id;
  if (!authId) throw new Error('Usuário não autenticado');

  const profileTable = await detectProfileTable();
  if (!profileTable) throw new Error('Nenhuma tabela de perfil encontrada');

  const columns = profileTable === 'user_profiles'
    ? 'id,auth_user_id,full_name,phone_number,biometric_enabled,invite_code,balance,total_invested,accumulated_profits'
    : 'id,auth_user_id,nome_completo,telefone,biometric_enabled,codigo_convite';

  const { data, error } = await backend
    .from(profileTable)
    .select(columns)
    .eq('auth_user_id', authId)
    .maybeSingle();

  if (error) throw error;
  if (data) return normalizeProfile(data);

  const { data: sessionData } = await backend.auth.getSession();
  const authUser = sessionData?.session?.user;
  const userMetadata = (authUser?.user_metadata as any) ?? {};
  const rawPhone = (userMetadata.phone_number || userMetadata.phone || userMetadata.phoneNumber || (authUser?.email?.endsWith('@zora.app') ? authUser.email.split('@')[0] : '')) as string;
  const normalizedPhone = rawPhone?.replace(/\D/g, '') || '';
  const fullName = (userMetadata.full_name || userMetadata.fullName || userMetadata.name || authUser?.email || '').trim();

  if (!normalizedPhone || !fullName) {
    throw new Error('Perfil não encontrado para o usuário autenticado');
  }

  const insertPayload = profileTable === 'user_profiles'
    ? {
        auth_user_id: authId,
        full_name: fullName,
        phone_number: normalizedPhone,
        invite_code: userMetadata.invite_code || null,
      }
    : {
        auth_user_id: authId,
        nome_completo: fullName,
        telefone: normalizedPhone,
        codigo_convite: userMetadata.codigo_convite || null,
      };

  const { data: insertedData, error: insertError } = await backend
    .from(profileTable)
    .insert([insertPayload] as any)
    .select(columns)
    .maybeSingle();

  if (insertError) throw insertError;
  const normalized = normalizeProfile(insertedData);
  if (normalized?.id) {
    const displayName = normalized?.nome_completo || normalized?.full_name || '';
    setTimeout(() => ensureAllZoraGroupsMembership(normalized.id!, displayName), 100);
  }
  return normalized;
}

export async function isPhoneRegistered(phone: string) {
  const profileTable = await detectProfileTable();
  if (!profileTable) throw new Error('Nenhuma tabela de perfil encontrada');

  const normalizedPhone = phone.replace(/\D/g, '');
  const phoneField = profileTable === 'user_profiles' ? 'phone_number' : 'telefone';

  const { data, error } = await backend
    .from(profileTable)
    .select('id')
    .eq(phoneField, normalizedPhone)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

export async function createUserProfile(
  authUserId: string,
  fullName: string,
  phoneNumber: string,
  inviteCode: string
) {
  const profileTable = await detectProfileTable();
  if (!profileTable) throw new Error('Nenhuma tabela de perfil encontrada');

  const phoneField = profileTable === 'user_profiles' ? 'phone_number' : 'telefone';
  const nameField = profileTable === 'user_profiles' ? 'full_name' : 'nome_completo';
  const inviteField = profileTable === 'user_profiles' ? 'invite_code' : 'codigo_convite';

  const payload: Record<string, any> = {
    auth_user_id: authUserId,
    [nameField]: fullName,
    [phoneField]: phoneNumber,
    [inviteField]: inviteCode || null,
  };

  const idField = 'id';
  let profileId: string | undefined;

  try {
    const existing: any = await backend
      .from(profileTable)
      .select(idField)
      .eq('auth_user_id', authUserId)
      .limit(1)
      .maybeSingle();

    if (existing?.error) throw existing.error;

    if (existing?.data?.id) {
      const updateData: Record<string, any> = {};
      updateData[nameField] = fullName;
      updateData[phoneField] = phoneNumber;
      if (inviteCode) updateData[inviteField] = inviteCode;
      const updRes: any = await backend
        .from(profileTable)
        .update(updateData)
        .eq('auth_user_id', authUserId)
        .select(idField)
        .maybeSingle();
      if (updRes?.error) throw updRes.error;
      profileId = updRes?.data?.id;
    } else {
      const insRes: any = await backend
        .from(profileTable)
        .insert([payload as any])
        .select(idField)
        .maybeSingle();
      if (insRes?.error) throw insRes.error;
      profileId = insRes?.data?.id;
    }
  } catch (e: any) {
    if (e?.code === '23505') {
      const fallback: any = await backend
        .from(profileTable)
        .select(idField)
        .eq('auth_user_id', authUserId)
        .maybeSingle();
      if (fallback?.error) throw fallback.error;
      profileId = fallback?.data?.id;
    } else {
      throw e;
    }
  }

  if (profileId) {
    setTimeout(() => ensureAllZoraGroupsMembership(profileId!, fullName), 150);
  }
}

export async function saveBiometricCredentials(email: string, password: string, phone?: string) {
  const data: BiometricCredentials = { email, password };
  if (phone) data.phone = phone;
  await AsyncStorage.setItem(BIOMETRIC_DATA_KEY, JSON.stringify(data));
}

export async function loadBiometricCredentials(): Promise<BiometricCredentials | null> {
  const raw = await AsyncStorage.getItem(BIOMETRIC_DATA_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as BiometricCredentials;
  } catch {
    return null;
  }
}

export async function clearBiometricCredentials() {
  await AsyncStorage.removeItem(BIOMETRIC_DATA_KEY);
}

export async function deleteAccount() {
  const { data: sessionData } = await backend.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) throw new Error('Usuário não autenticado');

  const profileTable = await detectProfileTable();
  if (!profileTable) throw new Error('Nenhuma tabela de perfil encontrada');

  const { error } = await backend
    .from(profileTable)
    .delete()
    .eq('auth_user_id', userId);

  if (error) throw error;

  await clearBiometricCredentials();

  const { error: signOutError } = await backend.auth.signOut();
  if (signOutError) throw signOutError;

  return { error: null };
}

export async function signUpWithPhone(
  phone: string,
  password: string,
  fullName: string,
  inviteCode?: string
) {
  const normalizedPhone = normalizePhone(phone);
  const email = getPhoneAliasEmail(phone);

  const onlyNumbersPIN = /^\d+$/.test(password);
  if (!onlyNumbersPIN || password.length !== 6) {
    return {
      user: null,
      error: 'PIN inválido. Deve conter exatamente 6 dígitos numéricos.',
    };
  }

  try {
    const { data, error: signUpError } = await backend.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone_number: normalizedPhone,
          invite_code: inviteCode || null,
        },
      },
    });

    if (signUpError) {
      let errString = '';
      try {
        errString = JSON.stringify(signUpError, Object.getOwnPropertyNames(signUpError));
      } catch {
        errString = String(signUpError.message || 'Erro ao registrar');
      }
      console.error('signUpWithPhone signUpError:', signUpError);

      if (signUpError.status === 400 || (signUpError as any)?.code === 'user_already_exists' || /already registered|already exists|já registado|ja registado/i.test(errString)) {
        try {
          const signInRes = await backend.auth.signInWithPassword({ email, password });
          if (!signInRes?.error && signInRes?.data?.session?.user) {
            const existingUser = signInRes.data.session.user;
            try {
              await createUserProfile(existingUser.id, fullName, normalizedPhone, inviteCode || '');
            } catch (profileErr: any) {
              console.warn('signUpWithPhone existing user profile creation warn:', profileErr);
            }
            return { user: existingUser, error: null };
          }
        } catch (signInRetryErr: any) {
          console.warn('signUpWithPhone fallback signIn failed:', signInRetryErr?.message);
        }
      }

      return { user: null, error: errString };
    }

    const userId = data?.user?.id;
    if (!userId) {
      return { user: null, error: 'Falha ao criar usuário. Tente novamente.' };
    }

    try {
      await createUserProfile(userId, fullName, normalizedPhone, inviteCode || '');
    } catch (profileErr: any) {
      console.warn('signUpWithPhone: profile creation failed, continuing signup:', profileErr);
    }

    if (!data?.session) {
      try {
        const signInRes = await backend.auth.signInWithPassword({ email, password });
        if (signInRes?.error) {
          console.warn('signUpWithPhone auto signIn failed:', signInRes.error);
        }
      } catch (e: any) {
        console.warn('signUpWithPhone auto signIn exception:', e?.message);
      }
    }

    setTimeout(async () => {
      try {
        const profileTable = await detectProfileTable();
        if (profileTable) {
          const pf: any = await backend
            .from(profileTable)
            .select('id')
            .eq('auth_user_id', userId)
            .maybeSingle();
          const pid = pf?.data?.id;
          if (pid) ensureAllZoraGroupsMembership(pid, fullName);
        }
      } catch {}
    }, 800);

    return { user: data.user, error: null };
  } catch (error: any) {
    return { user: null, error: String(error?.message || 'Erro ao registrar') };
  }
}

type SignUpUserInput = {
  fullName: string;
  phone: string;
  email?: string;
  password: string;
  inviteCode?: string;
};

export async function signUpUser(input: SignUpUserInput) {
  try {
    const invite = input.inviteCode?.trim() || undefined;
    const { user, error } = await signUpWithPhone(input.phone, input.password, input.fullName, invite);
    return {
      data: user ? { user } : null,
      error: error ? new Error(error) : null,
    };
  } catch (e: any) {
    return {
      data: null,
      error: e,
    };
  }
}

export async function signInWithPhone(phone: string, password: string) {
  const email = getPhoneAliasEmail(phone);

  const onlyNumbersPIN = /^\d+$/.test(password);
  if (!onlyNumbersPIN || password.length !== 6) {
    return {
      session: null,
      error: 'PIN inválido. Deve conter exatamente 6 dígitos numéricos.',
    };
  }

  try {
    const { data, error } = await backend.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { session: null, error: String(error.message || 'Erro ao fazer login') };
    }

    return { session: data.session, error: null };
  } catch (error: any) {
    return { session: null, error: error.message || 'Erro ao fazer login' };
  }
}

export async function signInWithEmail(emailInput: string, password: string) {
  const email = (emailInput || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { session: null, error: 'Endereço de e-mail inválido.' };
  }
  if (!password || password.length < 4) {
    return { session: null, error: 'Senha inválida.' };
  }
  try {
    const { data, error } = await backend.auth.signInWithPassword({ email, password });
    if (error) {
      return { session: null, error: String(error.message || 'Erro ao fazer login com e-mail.') };
    }
    return { session: data.session, error: null };
  } catch (error: any) {
    return { session: null, error: error.message || 'Erro ao fazer login com e-mail.' };
  }
}

export async function isAdminByAuthUserId(authUserId?: string): Promise<boolean> {
  const uid = authUserId ?? (await backend.auth.getSession()).data.session?.user?.id;
  if (!uid) return false;
  try {
    const profileTable = await detectProfileTable(uid);
    if (!profileTable) return false;

    const res: any = await backend
      .from(profileTable)
      .select('is_admin')
      .eq('auth_user_id', uid)
      .maybeSingle();
    if (!res?.error && res?.data) {
      return Boolean(res.data.is_admin ?? false);
    }

    if (profileTable !== 'user_profiles') {
      const fallback: any = await backend
        .from('user_profiles')
        .select('is_admin')
        .eq('auth_user_id', uid)
        .maybeSingle();
      if (!fallback?.error && fallback?.data) {
        return Boolean(fallback.data.is_admin ?? false);
      }
    }
  } catch {
    // ignore and return false
  }
  return false;
}

export async function signOut() {
  try {
    const { error } = await backend.auth.signOut();
    if (error) throw error;
    return { error: null };
  } catch (error: any) {
    return { error: error.message || 'Erro ao fazer logout' };
  }
}

export async function getCurrentSession() {
  try {
    const {
      data: { session },
      error,
    } = await backend.auth.getSession();

    if (error) throw error;

    return { session, error: null };
  } catch (error: any) {
    return { session: null, error: error.message };
  }
}

export async function updateUserProfile(updates: Record<string, any>) {
  try {
    const { data: sessionData } = await backend.auth.getSession();
    if (!sessionData.session?.user) throw new Error('Usuário não autenticado');

    const profileTable = await detectProfileTable();
    if (!profileTable) throw new Error('Nenhuma tabela de perfil encontrada');

    const { error } = await backend
      .from(profileTable)
      .update(updates)
      .eq('auth_user_id', sessionData.session.user.id);

    if (error) throw error;

    return { error: null };
  } catch (error: any) {
    return { error: error.message || 'Erro ao atualizar perfil' };
  }
}

export async function enableBiometric(enabled: boolean) {
  try {
    const { data: sessionData } = await backend.auth.getSession();
    if (!sessionData.session?.user) throw new Error('Usuário não autenticado');

    const profileTable = await detectProfileTable();
    if (!profileTable) throw new Error('Nenhuma tabela de perfil encontrada');

    const { error } = await backend
      .from(profileTable)
      .update({ biometric_enabled: enabled })
      .eq('auth_user_id', sessionData.session.user.id);

    if (error) throw error;

    if (!enabled) {
      await clearBiometricCredentials();
    }

    try { invalidateFinanceCache(); } catch {}

    return { error: null };
  } catch (error: any) {
    return { error: error.message || 'Erro ao habilitar biometria' };
  }
}

export async function requestPasswordReset(email: string) {
  try {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return { error: 'Endereço de email inválido.' };
    }

    const { error } = await backend.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: undefined,
    });

    if (error) {
      return { error: error.message || 'Não foi possível enviar o link de recuperação.' };
    }

    return { error: null };
  } catch (error: any) {
    return { error: error.message || 'Erro ao solicitar recuperação de senha.' };
  }
}
