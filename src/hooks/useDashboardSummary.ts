import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { getDashboardSummary, invalidateFinanceCache } from '../services/finance';

export const DASHBOARD_QUERY_KEY = ['dashboardSummary'] as const;
const STALE_TIME_MS = 5 * 60 * 1000;
const GC_TIME_MS = 10 * 60 * 1000;

const FALLBACK_DATA = {
  principal: 'MZN 0,00',
  available: 'MZN 0,00',
  accumulatedProfits: 'MZN 0,00',
  savingsValue: 'MZN 0,00',
  activeInvestments: 0,
  lastProfit: '+0,0%',
  totalInvested: 'MZN 0,00',
  estimatedDailyProfit: 'MZN 0,00',
  estimatedMonthlyProfit: 'MZN 0,00',
  dailyRate: 3.5,
};

let _bumpEpoch = 0;

export function bumpDashboardEpoch() {
  _bumpEpoch += 1;
}

function useDashboardSummaryCore(isFocused: boolean, requireFocused: boolean) {
  const queryClient = useQueryClient();
  const enabled = requireFocused
    ? isFocused && AppState.currentState === 'active'
    : AppState.currentState === 'active' || AppState.currentState === 'unknown';

  return useQuery({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: async () => {
      try {
        const res = await getDashboardSummary(false);
        return res || { ...FALLBACK_DATA };
      } catch (e: any) {
        console.warn('[useDashboardSummary] queryFn failed (fallback):', e?.message);
        return { ...FALLBACK_DATA };
      }
    },
    enabled: enabled,
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    refetchOnMount: enabled ? true : false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: enabled ? true : false,
    refetchInterval: false,
    refetchIntervalInBackground: false,
    retry: 1,
    retryDelay: 2000,
    placeholderData: () => {
      try {
        const cached = queryClient.getQueryData(DASHBOARD_QUERY_KEY as any);
        return (cached as any) ?? { ...FALLBACK_DATA };
      } catch {
        return { ...FALLBACK_DATA };
      }
    },
  });
}

export function useDashboardSummary(options?: { requireFocused?: boolean }) {
  const requireFocused = options?.requireFocused ?? true;
  const isFocused = useIsFocused();
  return useDashboardSummaryCore(isFocused, requireFocused);
}

export function useDashboardSummaryGlobal() {
  return useDashboardSummaryCore(true, false);
}

export function invalidateDashboardCache() {
  try {
    invalidateFinanceCache();
    bumpDashboardEpoch();
    const queryClient = getGlobalQueryClientSafe();
    if (queryClient?.invalidateQueries) {
      queryClient
        .invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY })
        .catch((e: any) => console.warn('[invalidateDashboardCache] invalidateQueries error:', e?.message));
      queryClient
        .refetchQueries({ queryKey: DASHBOARD_QUERY_KEY, type: 'active' })
        .catch((e: any) => console.warn('[invalidateDashboardCache] refetchQueries error:', e?.message));
    }
  } catch (e: any) {
    console.warn('[invalidateDashboardCache] top-level error:', e?.message);
  }
}

function getGlobalQueryClientSafe() {
  try {
    const { getGlobalQueryClient } = require('../providers/QueryProvider');
    return getGlobalQueryClient ? getGlobalQueryClient() : null;
  } catch {
    return null;
  }
}
