import { backend } from './backendClient';
import { invalidateFinanceCache } from './finance';

export type AdminStats = {
  total_users: number;
  verified_users: number;
  total_deposits_count: number;
  pending_deposits_count: number;
  total_deposits_value: number;
  pending_deposits_value: number;
  total_withdrawals_count: number;
  pending_withdrawals_count: number;
  total_withdrawals_value: number;
  pending_withdrawals_value: number;
  total_balance: number;
  total_available: number;
  total_bonus: number;
  total_invested: number;
  active_investments: number;
  total_savings_applications: number;
  active_savings_value: number;
};

export type AdminUserRow = {
  id: string;
  full_name: string;
  phone_number: string;
  is_admin: boolean;
  is_verified: boolean;
  referral_code: string | null;
  invite_code: string | null;
  referred_by: string | null;
  referred_by_name: string | null;
  joined_at: string | null;
  wallet_balance: number;
  wallet_available: number;
  wallet_bonus: number;
  active_package_number: number | null;
  active_package_name: string | null;
  total_invested: number;
  active_investments: number;
  savings_count: number;
  total_savings_applied: number;
  suspended_until: string | null;
  suspension_reason: string | null;
};

export type DepositRow = {
  id: string;
  profile_id: string;
  wallet_id?: string | null;
  amount: number;
  payment_method: string;
  proof_reference?: string | null;
  contact?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  admin_notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  full_name?: string | null;
  phone_number?: string | null;
};

export type WithdrawalRow = {
  id: string;
  profile_id: string;
  wallet_id?: string | null;
  amount: number;
  fee: number;
  total_deducted: number;
  withdrawal_method: string;
  contact: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'paid';
  admin_notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  full_name?: string | null;
  phone_number?: string | null;
};

export type ActionResult = {
  success: boolean;
  message: string;
};

export async function isCurrentUserAdmin(forceFresh = false): Promise<boolean> {
  const session = forceFresh
    ? (await backend.auth.refreshSession()).data.session
    : (await backend.auth.getSession()).data.session;
  const uid = session?.user?.id;
  if (!uid) return false;
  const res: any = await backend
    .from('user_profiles')
    .select('is_admin')
    .eq('auth_user_id', uid)
    .maybeSingle();
  if (res?.error) return false;
  return Boolean(res?.data?.is_admin ?? false);
}

function pickNumAny(obj: Record<string, any>, keys: string[], fallback = 0): number {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && !Number.isNaN(Number(v)) && Number(v) !== 0) return Number(v);
  }
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && !Number.isNaN(Number(v))) return Number(v);
  }
  return fallback;
}

export async function getAdminStats(): Promise<AdminStats> {
  const rpcRes: any = await backend.rpc('admin_dashboard_stats');
  if (rpcRes?.error) throw rpcRes.error;
  const rows: any[] = Array.isArray(rpcRes?.data) ? rpcRes.data : (rpcRes?.data ? [rpcRes.data] : []);
  const first = rows[0] ?? {};
  return {
    total_users: pickNumAny(first, ['total_users', 'totalUsers']),
    verified_users: pickNumAny(first, ['verified_users', 'verifiedUsers']),
    total_deposits_count: pickNumAny(first, ['total_deposits_count', 'totalDepositsCount']),
    pending_deposits_count: pickNumAny(first, ['pending_deposits_count', 'pendingDepositsCount']),
    total_deposits_value: pickNumAny(first, ['total_deposits_value', 'totalDepositsValue', 'totalDepositsApproved']),
    pending_deposits_value: pickNumAny(first, ['pending_deposits_value', 'pendingDepositsValue', 'pendingDepositsAmount']),
    total_withdrawals_count: pickNumAny(first, ['total_withdrawals_count', 'totalWithdrawalsCount']),
    pending_withdrawals_count: pickNumAny(first, ['pending_withdrawals_count', 'pendingWithdrawalsCount']),
    total_withdrawals_value: pickNumAny(first, ['total_withdrawals_value', 'totalWithdrawalsValue']),
    pending_withdrawals_value: pickNumAny(first, ['pending_withdrawals_value', 'pendingWithdrawalsValue', 'pendingWithdrawalsAmount']),
    total_balance: pickNumAny(first, ['total_balance', 'totalBalance']),
    total_available: pickNumAny(first, ['total_available', 'totalAvailable']),
    total_bonus: pickNumAny(first, ['total_bonus', 'totalBonus']),
    total_invested: pickNumAny(first, ['total_invested', 'totalInvested']),
    active_investments: pickNumAny(first, ['active_investments', 'activeInvestments']),
    total_savings_applications: pickNumAny(first, ['total_savings_applications', 'totalSavingsApplications', 'activeSavingsCount']),
    active_savings_value: pickNumAny(first, ['active_savings_value', 'activeSavingsValue', 'totalSavings']),
  };
}

export async function getAdminUsers(
  limit = 500,
  offset = 0,
  search?: string | null
): Promise<AdminUserRow[]> {
  const params: any = { p_limit: limit, p_offset: offset };
  if (search) params.p_search = search;
  const rpcRes: any = await backend.rpc('admin_list_users', params);
  if (rpcRes?.error) throw rpcRes.error;
  const rows: any[] = Array.isArray(rpcRes?.data) ? rpcRes.data : [];
  const mapped = rows.map((r) => ({
    id: String(r.id ?? ''),
    full_name: String(r.full_name ?? ''),
    phone_number: String(r.phone_number ?? ''),
    is_admin: Boolean(r.is_admin ?? false),
    is_verified: Boolean(r.is_verified ?? r.verified ?? false),
    referral_code: r.referral_code ?? null,
    invite_code: r.invite_code ?? null,
    referred_by: r.referred_by ?? null,
    referred_by_name: r.referred_by_name ?? null,
    joined_at: r.joined_at ?? null,
    wallet_balance: Number(r.wallet_balance ?? 0),
    wallet_available: Number(r.wallet_available ?? 0),
    wallet_bonus: Number(r.wallet_bonus ?? 0),
    active_package_number:
      r.active_package_number != null ? Number(r.active_package_number) : null,
    active_package_name: r.active_package_name ?? null,
    total_invested: Number(r.total_invested ?? 0),
    active_investments: Number(r.active_investments ?? 0),
    savings_count: Number(r.savings_count ?? 0),
    total_savings_applied: Number(r.total_savings_applied ?? 0),
    suspended_until: r.suspended_until ?? null,
    suspension_reason: r.suspension_reason ?? null,
  }));
  if (mapped.length > 0) {
    const profilesRes: any = await backend
      .from('user_profiles')
      .select('id,suspended_until,suspension_reason')
      .in('id', mapped.map((user) => user.id));
    if (!profilesRes?.error) {
      const suspensionById = new Map((profilesRes.data ?? []).map((profile: any) => [String(profile.id), profile]));
      mapped.forEach((user) => {
        const suspension = suspensionById.get(user.id) as any;
        if (suspension) {
          user.suspended_until = suspension.suspended_until ?? null;
          user.suspension_reason = suspension.suspension_reason ?? null;
        }
      });
    }
  }
  return mapped;
}

export async function adminSuspendUser(
  profileId: string,
  hours = 4,
  reason = 'Por motivos de conteúdo que viola as políticas do Zora.'
): Promise<ActionResult> {
  const rpcRes: any = await backend.rpc('admin_suspend_user', {
    p_profile_id: profileId,
    p_hours: hours,
    p_reason: reason,
  });
  if (rpcRes?.error) return { success: false, message: rpcRes.error.message || 'Não foi possível suspender.' };
  const result = Array.isArray(rpcRes?.data) ? rpcRes.data[0] : (rpcRes?.data ?? {});
  return {
    success: Boolean(result.success),
    message: String(result.message ?? 'Operação concluída.'),
  };
}

export async function adminUnsuspendUser(profileId: string): Promise<ActionResult> {
  const rpcRes: any = await backend.rpc('admin_unsuspend_user', { p_profile_id: profileId });
  if (rpcRes?.error) return { success: false, message: rpcRes.error.message || 'Não foi possível reativar.' };
  const result = Array.isArray(rpcRes?.data) ? rpcRes.data[0] : (rpcRes?.data ?? {});
  return {
    success: Boolean(result.success),
    message: String(result.message ?? 'Operação concluída.'),
  };
}

async function enrichWithProfiles<T extends { profile_id: string }>(
  rows: T[],
  existingProfileGetter?: (row: T) => { full_name?: string | null; phone_number?: string | null } | undefined
): Promise<Array<T & { full_name?: string | null; phone_number?: string | null }>> {
  if (!rows || rows.length === 0) return [];
  const profileIds = Array.from(new Set(rows.map(r => r.profile_id).filter(Boolean)));
  const profilesMap = new Map<string, { full_name: string | null; phone_number: string | null }>();
  if (profileIds.length > 0) {
    try {
      const profilesRes: any = await backend
        .from('user_profiles')
        .select('id, full_name, phone_number')
        .in('id', profileIds);
      if (!profilesRes?.error && profilesRes?.data) {
        for (const p of profilesRes.data) {
          profilesMap.set(String(p.id), {
            full_name: p.full_name ?? null,
            phone_number: p.phone_number ?? null,
          });
        }
      }
    } catch { /* ignore profile enrichment errors */ }
  }
  return rows.map((r) => {
    const preExisting = existingProfileGetter ? existingProfileGetter(r) : undefined;
    const fromMap = profilesMap.get(String(r.profile_id));
    return {
      ...r,
      full_name: fromMap?.full_name ?? preExisting?.full_name ?? null,
      phone_number: fromMap?.phone_number ?? preExisting?.phone_number ?? null,
    };
  });
}

export async function getPendingDeposits(): Promise<DepositRow[]> {
  const res: any = await backend
    .from('deposits')
    .select('*')
    .in('status', ['pending'])
    .order('created_at', { ascending: false });
  if (res?.error) throw res.error;
  const baseRows = (res?.data ?? []).map((d: any) => ({
    id: d.id,
    profile_id: d.profile_id,
    wallet_id: d.wallet_id ?? null,
    amount: Number(d.amount ?? 0),
    payment_method: String(d.payment_method ?? ''),
    proof_reference: d.proof_reference ?? null,
    contact: d.contact ?? null,
    status: d.status,
    admin_notes: d.admin_notes ?? null,
    reviewed_by: d.reviewed_by ?? null,
    reviewed_at: d.reviewed_at ?? null,
    created_at: d.created_at,
  }));
  const enriched = await enrichWithProfiles(baseRows);
  return enriched as DepositRow[];
}

export async function getPendingWithdrawals(): Promise<WithdrawalRow[]> {
  const res: any = await backend
    .from('withdrawals')
    .select('*')
    .in('status', ['pending'])
    .order('created_at', { ascending: false });
  if (res?.error) throw res.error;
  const baseRows = (res?.data ?? []).map((w: any) => ({
    id: w.id,
    profile_id: w.profile_id,
    wallet_id: w.wallet_id ?? null,
    amount: Number(w.amount ?? 0),
    fee: Number(w.fee ?? 0),
    total_deducted: Number(w.total_deducted ?? 0),
    withdrawal_method: String(w.withdrawal_method ?? ''),
    contact: String(w.contact ?? ''),
    status: w.status,
    admin_notes: w.admin_notes ?? null,
    reviewed_by: w.reviewed_by ?? null,
    reviewed_at: w.reviewed_at ?? null,
    created_at: w.created_at,
  }));
  const enriched = await enrichWithProfiles(baseRows);
  return enriched as WithdrawalRow[];
}

export async function adminApproveDeposit(id: string, notes?: string | null): Promise<ActionResult> {
  const rpcRes: any = await backend.rpc('admin_approve_deposit', {
    p_deposit_id: id,
    p_admin_notes: notes ?? null,
  });
  invalidateFinanceCache();
  if (rpcRes?.error) return { success: false, message: rpcRes.error.message || 'Erro ao aprovar.' };
  const rows: any[] = Array.isArray(rpcRes?.data) ? rpcRes.data : (rpcRes?.data ? [rpcRes.data] : []);
  const first = rows[0] ?? {};
  return {
    success: Boolean(first.success ?? true),
    message: String(first.message ?? 'Depósito aprovado.'),
  };
}

export async function adminRejectDeposit(id: string, notes?: string | null): Promise<ActionResult> {
  const rpcRes: any = await backend.rpc('admin_reject_deposit', {
    p_deposit_id: id,
    p_admin_notes: notes ?? null,
  });
  invalidateFinanceCache();
  if (rpcRes?.error) return { success: false, message: rpcRes.error.message || 'Erro ao rejeitar.' };
  const rows: any[] = Array.isArray(rpcRes?.data) ? rpcRes.data : (rpcRes?.data ? [rpcRes.data] : []);
  const first = rows[0] ?? {};
  return {
    success: Boolean(first.success ?? true),
    message: String(first.message ?? 'Depósito rejeitado.'),
  };
}

export async function adminApproveWithdrawal(id: string, notes?: string | null): Promise<ActionResult> {
  const rpcRes: any = await backend.rpc('admin_approve_withdrawal', {
    p_withdrawal_id: id,
    p_admin_notes: notes ?? null,
  });
  invalidateFinanceCache();
  if (rpcRes?.error) return { success: false, message: rpcRes.error.message || 'Erro ao aprovar.' };
  const rows: any[] = Array.isArray(rpcRes?.data) ? rpcRes.data : (rpcRes?.data ? [rpcRes.data] : []);
  const first = rows[0] ?? {};
  return {
    success: Boolean(first.success ?? true),
    message: String(first.message ?? 'Saque aprovado.'),
  };
}

export async function adminRejectWithdrawal(id: string, notes?: string | null): Promise<ActionResult> {
  const rpcRes: any = await backend.rpc('admin_reject_withdrawal', {
    p_withdrawal_id: id,
    p_admin_notes: notes ?? null,
  });
  invalidateFinanceCache();
  if (rpcRes?.error) return { success: false, message: rpcRes.error.message || 'Erro ao rejeitar.' };
  const rows: any[] = Array.isArray(rpcRes?.data) ? rpcRes.data : (rpcRes?.data ? [rpcRes.data] : []);
  const first = rows[0] ?? {};
  return {
    success: Boolean(first.success ?? true),
    message: String(first.message ?? 'Saque rejeitado e valor devolvido.'),
  };
}

export async function adminAdjustWallet(
  profileId: string,
  amount: number,
  availableOnly = true,
  description?: string | null
): Promise<ActionResult & { new_available?: number; new_balance?: number }> {
  if (!Number.isFinite(amount) || amount === 0) {
    return { success: false, message: 'Valor inválido para ajuste.' };
  }
  const rpcRes: any = await backend.rpc('admin_adjust_wallet', {
    p_profile_id: profileId,
    p_amount: amount,
    p_available_only: availableOnly,
    p_description: description ?? null,
  });
  invalidateFinanceCache();
  if (rpcRes?.error) return { success: false, message: rpcRes.error.message || 'Erro ao ajustar.' };
  const rows: any[] = Array.isArray(rpcRes?.data) ? rpcRes.data : (rpcRes?.data ? [rpcRes.data] : []);
  const first = rows[0] ?? {};
  return {
    success: Boolean(first.success ?? true),
    message: String(first.message ?? 'Saldo ajustado.'),
    new_available: first.new_available != null ? Number(first.new_available) : undefined,
    new_balance: first.new_balance != null ? Number(first.new_balance) : undefined,
  };
}

export function fmtMZN(value: number | string | null | undefined): string {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return 'MZN 0,00';
  const fixed = num.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `MZN ${intFormatted},${decPart}`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return String(iso);
  }
}

export async function getAllDeposits(statusFilter?: 'pending' | 'approved' | 'rejected' | 'all'): Promise<DepositRow[]> {
  const q: any = backend
    .from('deposits')
    .select('*')
    .order('created_at', { ascending: false });
  if (statusFilter && statusFilter !== 'all') q.in('status', [statusFilter]);
  const res: any = await q;
  if (res?.error) throw res.error;
  const baseRows = (res?.data ?? []).map((d: any) => ({
    id: d.id,
    profile_id: d.profile_id,
    wallet_id: d.wallet_id ?? null,
    amount: Number(d.amount ?? 0),
    payment_method: String(d.payment_method ?? ''),
    proof_reference: d.proof_reference ?? null,
    contact: d.contact ?? null,
    status: d.status,
    admin_notes: d.admin_notes ?? null,
    reviewed_by: d.reviewed_by ?? null,
    reviewed_at: d.reviewed_at ?? null,
    created_at: d.created_at,
  }));
  const enriched = await enrichWithProfiles(baseRows);
  return enriched as DepositRow[];
}

export async function getAllWithdrawals(statusFilter?: 'pending' | 'approved' | 'rejected' | 'paid' | 'all'): Promise<WithdrawalRow[]> {
  const q: any = backend
    .from('withdrawals')
    .select('*')
    .order('created_at', { ascending: false });
  if (statusFilter && statusFilter !== 'all') q.in('status', [statusFilter]);
  const res: any = await q;
  if (res?.error) throw res.error;
  const baseRows = (res?.data ?? []).map((w: any) => ({
    id: w.id,
    profile_id: w.profile_id,
    wallet_id: w.wallet_id ?? null,
    amount: Number(w.amount ?? 0),
    fee: Number(w.fee ?? 0),
    total_deducted: Number(w.total_deducted ?? 0),
    withdrawal_method: String(w.withdrawal_method ?? ''),
    contact: String(w.contact ?? ''),
    status: w.status,
    admin_notes: w.admin_notes ?? null,
    reviewed_by: w.reviewed_by ?? null,
    reviewed_at: w.reviewed_at ?? null,
    created_at: w.created_at,
  }));
  const enriched = await enrichWithProfiles(baseRows);
  return enriched as WithdrawalRow[];
}

export async function getUserDeposits(profileId: string): Promise<DepositRow[]> {
  if (!profileId) return [];
  const res: any = await backend
    .from('deposits')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (res?.error) throw res.error;
  const baseRows = (res?.data ?? []).map((d: any) => ({
    id: d.id,
    profile_id: d.profile_id,
    wallet_id: d.wallet_id ?? null,
    amount: Number(d.amount ?? 0),
    payment_method: String(d.payment_method ?? ''),
    proof_reference: d.proof_reference ?? null,
    contact: d.contact ?? null,
    status: d.status,
    admin_notes: d.admin_notes ?? null,
    reviewed_by: d.reviewed_by ?? null,
    reviewed_at: d.reviewed_at ?? null,
    created_at: d.created_at,
  }));
  return baseRows as DepositRow[];
}

export async function getUserWithdrawals(profileId: string): Promise<WithdrawalRow[]> {
  if (!profileId) return [];
  const res: any = await backend
    .from('withdrawals')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (res?.error) throw res.error;
  const baseRows = (res?.data ?? []).map((w: any) => ({
    id: w.id,
    profile_id: w.profile_id,
    wallet_id: w.wallet_id ?? null,
    amount: Number(w.amount ?? 0),
    fee: Number(w.fee ?? 0),
    total_deducted: Number(w.total_deducted ?? 0),
    withdrawal_method: String(w.withdrawal_method ?? ''),
    contact: String(w.contact ?? ''),
    status: w.status,
    admin_notes: w.admin_notes ?? null,
    reviewed_by: w.reviewed_by ?? null,
    reviewed_at: w.reviewed_at ?? null,
    created_at: w.created_at,
  }));
  return baseRows as WithdrawalRow[];
}

export type UserInvestmentLite = {
  id: string;
  package_id: string;
  package_name?: string | null;
  amount: number;
  status: string;
  purchased_at: string;
};

export async function getUserInvestmentsAdmin(profileId: string): Promise<UserInvestmentLite[]> {
  if (!profileId) return [];
  const res: any = await backend
    .from('user_investments')
    .select('*, investment_packages(name)')
    .eq('profile_id', profileId)
    .order('purchased_at', { ascending: false })
    .limit(50);
  if (res?.error) throw res.error;
  return (res?.data ?? []).map((r: any) => ({
    id: String(r.id ?? ''),
    package_id: String(r.package_id ?? ''),
    package_name: r.investment_packages?.name ?? null,
    amount: Number(r.amount ?? 0),
    status: String(r.status ?? 'active'),
    purchased_at: r.purchased_at,
  }));
}

export type UserSavingsLite = {
  id: string;
  amount_applied: number;
  amount_to_receive: number;
  status: string;
  start_at: string;
  release_at: string;
  settled_at?: string | null;
};

export async function getUserSavingsAdmin(profileId: string): Promise<UserSavingsLite[]> {
  if (!profileId) return [];
  const res: any = await backend
    .from('savings_applications')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (res?.error) throw res.error;
  return (res?.data ?? []).map((r: any) => ({
    id: String(r.id ?? ''),
    amount_applied: Number(r.amount_applied ?? 0),
    amount_to_receive: Number(r.amount_to_receive ?? 0),
    status: String(r.status ?? r.effective_status ?? 'locked'),
    start_at: r.start_at,
    release_at: r.release_at,
    settled_at: r.settled_at ?? null,
  }));
}
