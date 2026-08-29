import 'react-native-url-polyfill/auto';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const expoConfig = Constants.expoConfig || (Constants.manifest as any) || {};
const SUPABASE_URL =
  (expoConfig.extra as any)?.supabaseUrl ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  'https://ahvvmyuiphtiuxlvbjaj.supabase.co';
const SUPABASE_ANON_KEY =
  (expoConfig.extra as any)?.supabaseAnonKey ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_TGPXxS0u7ZjMcNCT_S0-mg_PkZ2ohVw';

export type Session = any;

const isWeb = typeof window !== 'undefined';

export const backend: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: isWeb ? undefined : AsyncStorage,
    persistSession: true,
    detectSessionInUrl: false,
    autoRefreshToken: true,
  },
});

