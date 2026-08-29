import { backend } from './backendClient';
import { Platform, Share as RNShare, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';

function fmtMZN(value: number | string | null | undefined): string {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return 'MZN 0,00';
  const fixed = num.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `MZN ${intFormatted},${decPart}`;
}

export type ReferralSummary = {
  referral_code: string;
  invite_link: string;
  total_invited: number;
  active_invited: number;
  total_packages_purchased: number;
  total_reward_earned: number;
  total_reward_paid: number;
  pending_reward: number;
  bonus_balance: number;
  total_invested_by_invited: number;
  total_reward_earned_fmt: string;
  bonus_balance_fmt: string;
  pending_reward_fmt: string;
  total_invested_by_invited_fmt: string;
};

export type ReferralRewardRow = {
  reward_id: string;
  package_number: number;
  package_name: string;
  investment_amount: number;
  reward_percent: number;
  reward_amount: number;
  status: 'pending' | 'paid' | 'cancelled';
  paid_at: string;
  invited_name: string;
  invited_phone: string;
  reward_amount_fmt: string;
  investment_amount_fmt: string;
  date_label: string;
};

export type WithdrawBonusResult = {
  success: boolean;
  message: string;
  withdrawn_amount: number;
  new_available: number;
  new_bonus: number;
};

let summaryCache: { data: ReferralSummary; expiresAt: number } | null = null;
const SUMMARY_TTL_MS = 10_000;
let historyCache: { data: ReferralRewardRow[]; expiresAt: number } | null = null;
const HISTORY_TTL_MS = 15_000;

export function invalidateReferralCache() {
  summaryCache = null;
  historyCache = null;
}

export async function getReferralSummary(forceFresh = false): Promise<ReferralSummary> {
  const now = Date.now();
  if (!forceFresh && summaryCache && summaryCache.expiresAt > now) return summaryCache.data;
  const rpcRes = await backend.rpc('get_referral_summary');
  if (rpcRes?.error) throw new Error(rpcRes.error?.message || 'Erro ao carregar resumo de indicações.');
  const rows: any[] = Array.isArray(rpcRes?.data) ? rpcRes.data : (rpcRes?.data ? [rpcRes.data] : []);
  const raw = rows[0] ?? {};
  const summary: ReferralSummary = {
    referral_code: String(raw.referral_code ?? ''),
    invite_link: String(raw.invite_link ?? ''),
    total_invited: Number(raw.total_invited ?? 0),
    active_invited: Number(raw.active_invited ?? 0),
    total_packages_purchased: Number(raw.total_packages_purchased ?? 0),
    total_reward_earned: Number(raw.total_reward_earned ?? 0),
    total_reward_paid: Number(raw.total_reward_paid ?? 0),
    pending_reward: Number(raw.pending_reward ?? 0),
    bonus_balance: Number(raw.bonus_balance ?? 0),
    total_invested_by_invited: Number(raw.total_invested_by_invited ?? 0),
    total_reward_earned_fmt: fmtMZN(raw.total_reward_earned),
    bonus_balance_fmt: fmtMZN(raw.bonus_balance),
    pending_reward_fmt: fmtMZN(raw.pending_reward),
    total_invested_by_invited_fmt: fmtMZN(raw.total_invested_by_invited),
  };
  summaryCache = { data: summary, expiresAt: now + SUMMARY_TTL_MS };
  return summary;
}

export async function getReferralHistory(forceFresh = false): Promise<ReferralRewardRow[]> {
  const now = Date.now();
  if (!forceFresh && historyCache && historyCache.expiresAt > now) return historyCache.data;
  const rpcRes = await backend.rpc('get_referral_history');
  if (rpcRes?.error) throw new Error(rpcRes.error?.message || 'Erro ao carregar histórico de recompensas.');
  const rows: any[] = Array.isArray(rpcRes?.data) ? rpcRes.data : [];
  const history = rows.map((r) => {
    const paidDate = r.paid_at ? new Date(r.paid_at) : new Date();
    return {
      reward_id: String(r.reward_id ?? ''),
      package_number: Number(r.package_number ?? 0),
      package_name: String(r.package_name ?? 'Pacote'),
      investment_amount: Number(r.investment_amount ?? 0),
      reward_percent: Number(r.reward_percent ?? 10),
      reward_amount: Number(r.reward_amount ?? 0),
      status: (r.status ?? 'paid') as any,
      paid_at: String(r.paid_at ?? ''),
      invited_name: String(r.invited_name ?? 'Utilizador'),
      invited_phone: String(r.invited_phone ?? '-'),
      reward_amount_fmt: fmtMZN(r.reward_amount),
      investment_amount_fmt: fmtMZN(r.investment_amount),
      date_label: paidDate.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    } as ReferralRewardRow;
  });
  historyCache = { data: history, expiresAt: now + HISTORY_TTL_MS };
  return history;
}

export async function withdrawBonus(amount?: number): Promise<WithdrawBonusResult> {
  try {
    const rpcRes = amount != null
      ? await backend.rpc('withdraw_bonus', { p_amount: amount })
      : await backend.rpc('withdraw_bonus');
    if (rpcRes?.error) {
      return {
        success: false,
        message: rpcRes.error?.message || 'Erro ao resgatar bónus.',
        withdrawn_amount: 0,
        new_available: 0,
        new_bonus: 0,
      };
    }
    const rows: any[] = Array.isArray(rpcRes?.data) ? rpcRes.data : (rpcRes?.data ? [rpcRes.data] : []);
    const first = rows[0] ?? {};
    invalidateReferralCache();
    return {
      success: Boolean(first.success ?? false),
      message: String(first.message ?? 'Operação concluída.'),
      withdrawn_amount: Number(first.withdrawn_amount ?? 0),
      new_available: Number(first.new_available ?? 0),
      new_bonus: Number(first.new_bonus ?? 0),
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Erro de conexão ao resgatar bónus.',
      withdrawn_amount: 0,
      new_available: 0,
      new_bonus: 0,
    };
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    }
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}

export async function shareReferralLink(message: string, url: string): Promise<{ ok: boolean; method?: string }> {
  try {
    if (Platform.OS !== 'web') {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(url, { dialogTitle: 'Partilhar link de indicação', mimeType: 'text/plain' });
        return { ok: true, method: 'share' };
      }
    }
    if (RNShare && typeof (RNShare as any).share === 'function') {
      await (RNShare as any).share({ message, url, title: 'Indique um amigo e ganhe 10%' });
      return { ok: true, method: 'rn-share' };
    }
    await copyToClipboard(url);
    return { ok: true, method: 'clipboard' };
  } catch (err: any) {
    try { await copyToClipboard(url); return { ok: true, method: 'clipboard-fallback' }; } catch { return { ok: false }; }
  }
}

export function buildInviteLink(referralCode: string): string {
  const code = (referralCode || '').trim();
  if (!code) return '';
  const base = (typeof process !== 'undefined' && (process.env as any).EXPO_PUBLIC_INVITE_BASE_URL)
    || 'https://zora.app/invite';
  return `${base}/${encodeURIComponent(code)}`;
}
