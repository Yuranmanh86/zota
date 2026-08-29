import React, { useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import { useDashboardSummaryGlobal, invalidateDashboardCache, bumpDashboardEpoch } from '../hooks/useDashboardSummary';
import { backend } from '../services/backendClient';
import { getUserProfile } from '../services/auth';
import { invalidateFinanceCache } from '../services/finance';

const DEBOUNCE_MS = 900;

export function AppBalanceSyncer() {
  useDashboardSummaryGlobal();

  const refreshDebounceRef = useRef<number | null>(null);
  const balanceChannelRef = useRef<any>(null);
  const profileIdRef = useRef<string | null>(null);
  const authUserIdRef = useRef<string | null>(null);
  const appStateSubRef = useRef<any>(null);
  const setupDoneRef = useRef<boolean>(false);

  const scheduleGlobalRefresh = useCallback(() => {
    try {
      if (refreshDebounceRef.current != null) {
        clearTimeout(refreshDebounceRef.current);
      }
      refreshDebounceRef.current = setTimeout(() => {
        refreshDebounceRef.current = null;
        try {
          invalidateFinanceCache();
          bumpDashboardEpoch();
          invalidateDashboardCache();
        } catch (e: any) {
          console.warn('[AppBalanceSyncer] scheduleGlobalRefresh error:', e?.message);
        }
      }, DEBOUNCE_MS) as unknown as number;
    } catch {}
  }, []);

  const cleanupChannels = useCallback(() => {
    try {
      if (balanceChannelRef.current) {
        try { balanceChannelRef.current.unsubscribe(); } catch {}
        try { backend.removeChannel(balanceChannelRef.current); } catch {}
        balanceChannelRef.current = null;
      }
    } catch {}
  }, []);

  const setupChannels = useCallback(async () => {
    try {
      if (balanceChannelRef.current) return;

      const sessRes: any = await backend.auth.getSession();
      const session = sessRes?.data?.session;
      if (!session?.user?.id) return;
      authUserIdRef.current = session.user.id;

      const profile = await getUserProfile().catch(() => null);
      const profileId = profile?.id;
      if (!profileId) return;
      profileIdRef.current = profileId;

      const balCh = backend.channel(`global_balance_syncer_${profileId}`);

      const tables = [
        { table: 'wallets', filter: `profile_id=eq.${profileId}` },
        { table: 'user_profiles', filter: `id=eq.${profileId}` },
        { table: 'deposits', filter: `profile_id=eq.${profileId}` },
        { table: 'withdrawals', filter: `profile_id=eq.${profileId}` },
        { table: 'user_investments', filter: `profile_id=eq.${profileId}` },
        { table: 'savings_applications', filter: `profile_id=eq.${profileId}` },
      ];

      tables.forEach(({ table, filter }) => {
        balCh.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter },
          () => scheduleGlobalRefresh()
        );
      });

      balCh.subscribe();
      balanceChannelRef.current = balCh;
      setupDoneRef.current = true;
    } catch (e: any) {
      console.warn('[AppBalanceSyncer] setupChannels error:', e?.message);
    }
  }, [scheduleGlobalRefresh]);

  useEffect(() => {
    let isMounted = true;

    setupChannels();

    const handleAppStateChange = (nextState: string) => {
      if (nextState === 'active' && isMounted) {
        if (!balanceChannelRef.current) {
          setupChannels();
        } else {
          scheduleGlobalRefresh();
        }
      }
    };

    appStateSubRef.current = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      isMounted = false;
      try {
        if (appStateSubRef.current?.remove) appStateSubRef.current.remove();
      } catch {}
      cleanupChannels();
      if (refreshDebounceRef.current != null) {
        clearTimeout(refreshDebounceRef.current);
      }
    };
  }, [setupChannels, scheduleGlobalRefresh, cleanupChannels]);

  return null;
}
