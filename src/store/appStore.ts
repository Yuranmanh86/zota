import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark';

const HIDE_BALANCE_KEY = '@zora:hide_balance';

type AppState = {
  theme: ThemeMode;
  toggleTheme: () => void;
  userName: string;
  welcomeMessage: string | null;
  hideBalance: boolean;
  setUserName: (name: string) => void;
  setWelcomeMessage: (message: string | null) => void;
  setHideBalance: (hide: boolean) => Promise<void>;
  loadPreferences: () => Promise<void>;
};

export const useAppStore = create<AppState>((set) => ({
  theme: 'dark',
  userName: '',
  welcomeMessage: null,
  hideBalance: false,
  toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
  setUserName: (name) => set({ userName: name }),
  setWelcomeMessage: (message) => set({ welcomeMessage: message }),
  setHideBalance: async (hide: boolean) => {
    try {
      await AsyncStorage.setItem(HIDE_BALANCE_KEY, hide ? '1' : '0');
    } catch {}
    set({ hideBalance: hide });
  },
  loadPreferences: async () => {
    try {
      const raw = await AsyncStorage.getItem(HIDE_BALANCE_KEY);
      if (raw === '1') set({ hideBalance: true });
    } catch {}
  },
}));
