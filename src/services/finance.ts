import { backend } from './backendClient';
import { invalidateReferralCache } from './referrals';
import { getGlobalQueryClient } from '../providers/QueryProvider';

const DASHBOARD_QUERY_KEY = ['dashboardSummary'] as const;

let sessionCache: { data: any; expiresAt: number } | null = null;
const SESSION_CACHE_TTL_MS = 2 * 60 * 1_000;
const profileCache = new Map<string, { data: any; expiresAt: number }>();
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1_000;
let rpcHomeCache: { [userId: string]: { data: any; expiresAt: number; epoch: number } } = {};
let _financeCacheEpoch = 0;

async function getCachedSession(forceFresh = false): Promise<any> {
  const now = Date.now();
  if (!forceFresh && sessionCache && sessionCache.expiresAt > now) return sessionCache.data;
  const sessRes: any = await backend.auth.getSession();
  const session = sessRes?.data?.session;
  sessionCache = { data: session ?? null, expiresAt: now + SESSION_CACHE_TTL_MS };
  return session ?? null;
}

export function invalidateFinanceCache() {
  _financeCacheEpoch += 1;
  sessionCache = null;
  profileCache.clear();
  rpcHomeCache = {};
  try {
    const qc = getGlobalQueryClient();
    if (qc) {
      try { qc.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY }); } catch {}
      try { qc.refetchQueries({ queryKey: DASHBOARD_QUERY_KEY, type: 'active' }); } catch {}
    }
  } catch {}
}

export function getFinanceEpoch(): number {
  return _financeCacheEpoch;
}

export type DailyProfitResult = {
  success: boolean;
  message: string;
  totalCredited: number;
  investmentsUpdated: number;
};

const DAILY_PROCESS_CACHE_KEY_TTL_MS = 3 * 60 * 1000;
let _lastDailyProcessAt: { [userId: string]: number } = {};

export async function processDailyProfits(force: boolean = false): Promise<DailyProfitResult | null> {
  try {
    const session = await getCachedSession();
    const authUserId: string | undefined = session?.user?.id;
    if (!authUserId) return null;

    const now = Date.now();
    const lastRan = _lastDailyProcessAt[authUserId] ?? 0;
    if (!force && (now - lastRan) < DAILY_PROCESS_CACHE_KEY_TTL_MS) {
      return null;
    }
    _lastDailyProcessAt[authUserId] = now;

    const rpcRes: any = await backend.rpc('process_daily_profits');
    if (rpcRes?.error) {
      console.warn('[finance.processDailyProfits] RPC error:', rpcRes.error?.message || rpcRes.error);
      return null;
    }
    const payload: any = rpcRes?.data ?? null;
    if (!payload) return null;

    const ok = Boolean(payload?.success ?? false);
    const totalCredited = Number(payload?.total_credited ?? 0);
    const updated = Number(payload?.investments_updated ?? 0);

    if (ok && updated > 0 && totalCredited > 0) {
      invalidateFinanceCache();
    }

    return {
      success: ok,
      message: String(payload?.message ?? ''),
      totalCredited,
      investmentsUpdated: updated,
    };
  } catch (e: any) {
    console.warn('[finance.processDailyProfits] exception:', e?.message);
    return null;
  }
}

export async function getUserProfile(forceFresh = false) {
  const session = await getCachedSession();
  if (!session?.user?.id) throw new Error('Sessão não encontrada');

  const cacheKey = String(session.user.id);
  const now = Date.now();
  if (!forceFresh) {
    const cached = profileCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.data;
  }

  const { data, error } = await backend
    .from('user_profiles')
    .select('*')
    .eq('auth_user_id', session.user.id)
    .maybeSingle();

  if (error) throw error;
  profileCache.set(cacheKey, { data, expiresAt: now + PROFILE_CACHE_TTL_MS });
  return data;
}

export async function getUserId(forceFresh = false) {
  const profile = await getUserProfile(forceFresh);
  if (!profile) throw new Error('Perfil não encontrado');
  return profile.id;
}

const DAILY_RATE = 3.5;

function toFinite(...values: any[]): number {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

// Correção para valores que eventualmente chegam em "centavos" do backend.
// Heurísticas CONSERVADORAS — NUNCA afetam valores monetários normais em MZN.
// Aplica apenas casos EXTREMAMENTE claros de erro de unidade:
//   A) Valor >= 1 000 000 (1 milhão de meticais em centavos = 10k MZN, por ex.)
//      E divisível por 100 → divide por 100.
//   B) Com valor de referência: SE valor absoluto >= ref * 100
//      (impossível ser o dobro/100% em cenário real, só possível se for
//      centavos acidentais) E divisível por 100 → divide por 100.
// Qualquer valor abaixo destes limites é respeitado TAL COMO VEM.
export function normalizeMZNUnits(
  value: number | string | null | undefined,
  refValue?: number
): number {
  let num = Number(value ?? 0);
  if (!Number.isFinite(num)) return 0;
  if (num === 0) return 0;
  const abs = Math.abs(num);

  if (abs >= 1_000_000 && abs % 100 === 0) {
    num = num / 100;
  } else if (typeof refValue === 'number' && Number.isFinite(refValue) && refValue > 0) {
    if (abs >= refValue * 100 && abs % 100 === 0) {
      num = num / 100;
    }
  }
  return Math.round(num * 100) / 100;
}

function fmtMZN(value: number | string | null | undefined, refValue?: number): string {
  const num = normalizeMZNUnits(value, refValue);
  const fixed = num.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `MZN ${intFormatted},${decPart}`;
}

const CACHED_API_BASE: string | undefined =
  (typeof process !== 'undefined' && (process.env.EXPO_PUBLIC_API_URL as string)) || undefined;

const RPC_HOME_TTL_MS = 5 * 60 * 1_000;

export async function getDashboardSummary(forceFresh = false) {
  const session = await getCachedSession(forceFresh);
  const authUserId: string | undefined = session?.user?.id;

  let sqlData: any = null;
  let apiWelcome: string | null = null;
  let dailyWelcome: string | null = null;

  // REGRA UNIFICADA A) + B):
  // 1) PRIMEIRO: processa rendas diárias vencidas.
  //    Isso garante que wallets.profits / user_profiles.accumulated_profits / balance
  //    estejam actualizados ANTES de qualquer leitura para o summary.
  let dailyResult: DailyProfitResult | null = null;
  if (authUserId) {
    try {
      dailyResult = await processDailyProfits(false);
    } catch (e: any) {
      console.warn('[finance.getDashboardSummary] daily error:', e?.message);
      dailyResult = null;
    }
  }

  // Se daily creditou valores, invalida cache local para forçar releitura do banco
  if (dailyResult && dailyResult.success && dailyResult.investmentsUpdated > 0 && dailyResult.totalCredited > 0) {
    const val = fmtMZN(dailyResult.totalCredited);
    dailyWelcome = dailyResult.message
      ? `${dailyResult.message}`
      : `Rendas diárias creditadas: +${val}`;
    // Limpa caches locais para forçar a próxima leitura a ir ao banco
    if (authUserId) {
      try { delete rpcHomeCache[authUserId]; } catch {}
    }
  }

  // 2) SÓ DEPOIS: busca home_summary e api welcome
  const rpcTask = (async () => {
    if (!authUserId) return null;
    const now = Date.now();
    const cached = rpcHomeCache[authUserId];
    if (!forceFresh && cached && cached.expiresAt > now && cached.epoch === _financeCacheEpoch) {
      return cached.data;
    }

    try {
      const rpcRes = await backend.rpc('home_summary', {
        p_auth_user_id: authUserId,
      });
      if (rpcRes?.error) {
        console.warn('[finance.getDashboardSummary] RPC home_summary error:', rpcRes.error?.message || rpcRes.error);
        return null;
      }
      const result = Array.isArray(rpcRes?.data) ? rpcRes.data[0] ?? null : rpcRes?.data ?? null;
      rpcHomeCache[authUserId] = {
        data: result,
        expiresAt: now + RPC_HOME_TTL_MS,
        epoch: _financeCacheEpoch,
      };
      return result;
    } catch (e: any) {
      console.warn('[finance.getDashboardSummary] RPC home_summary exception:', e?.message);
      return null;
    }
  })();

  const apiTask = (async (): Promise<string | null> => {
    const API_BASE = CACHED_API_BASE;
    if (!API_BASE || String(API_BASE).trim() === '') {
      return null;
    }
    try {
      const controller =
        typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeout = controller ? setTimeout(() => controller.abort(), 2500) : undefined;
      try {
        const res = await fetch(`${API_BASE}/home`, {
          headers: {},
          signal: controller?.signal as any,
        });
        if (!res.ok) return null;
        const body = await res.json().catch(() => ({}));
        return body?.data?.welcome ?? null;
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    } catch (e: any) {
      if (String(e?.message || '').includes('aborted')) {
        return null;
      }
      console.warn('[finance.getDashboardSummary] apiTask fetch failed (EXPO_PUBLIC_API_URL inacessível):', e?.message);
      return null;
    }
  })();

  const [rpcResult, apiResult] = await Promise.all([rpcTask, apiTask]);
  sqlData = rpcResult ?? null;
  apiWelcome = apiResult ?? null;

  // 3) Por fim, direct fallback (leitura directa das tabelas, sem cache)
  let directData: any = null;
  if (authUserId) {
    try {
      directData = await fetchDashboardDirect(authUserId);
    } catch (fbErr: any) {
      console.warn('[finance.getDashboardSummary] fallback direto falhou:', fbErr?.message);
      directData = null;
    }
  }

  // Merge: campos vindos do RPC sao preferidos, mas se forem 0/nulos
  // usamos valores equivalentes do fetchDashboardDirect (busca direta em tabelas).
  // Garante que invested/profits/total_invested aparecem mesmo se o RPC
  // antigo estiver quebrado ou nao tiver calculado corretamente.
  const effectivePrincipal = toFinite(sqlData?.principal, directData?.principal);
  const effectiveAvailable = toFinite(sqlData?.available, directData?.available);

  // REGRA UNIFICADA B): Lucros = valor REAL / PERSISTIDO (já creditado).
  // Prefere sempre accumulated_profits real do RPC/profile/wallet.
  // Só usa cálculo via JOIN (directData.accumulated_profits_calc) como fallback estrito.
  const persistedAccumulated = toFinite(
    sqlData?.accumulated_profits,
    directData?.accumulated_profits
  );
  const effectiveAccumulated = persistedAccumulated;

  const effectiveSavings = toFinite(sqlData?.savings_value, directData?.savings_value);
  const effectiveActiveCount = toFinite(sqlData?.active_investments, directData?.active_investments);
  const effectiveRpcInvested = toFinite(sqlData?.invested, sqlData?.total_invested);
  const effectiveInvested = effectiveRpcInvested !== 0
    ? effectiveRpcInvested
    : toFinite(directData?.invested, directData?.total_invested);
  const effectiveTotalInvested = effectiveInvested;
  const estimatedDaily = toFinite(sqlData?.estimated_daily_profit) || effectiveInvested * DAILY_RATE / 100;
  const estimatedMonthly = toFinite(sqlData?.estimated_monthly_profit) || estimatedDaily * 30;
  const lastProfitRaw = sqlData?.last_profit ?? directData?.last_profit;
  const lastProfitValue = toFinite(lastProfitRaw, estimatedDaily);
  const lastProfitText = `+${fmtMZN(lastProfitValue)}`;

  // Ordem de prioridade para mensagem de boas-vindas:
  // 1) dailyWelcome (rendas diárias creditadas AGORA)
  // 2) apiWelcome (mensagem do backend)
  // 3) lastProfitText (lucro estimado)
  const finalLastProfit = dailyWelcome || apiWelcome || lastProfitText;

  return {
    principal: fmtMZN(effectivePrincipal),
    accumulatedProfits: fmtMZN(effectiveAccumulated),
    savingsValue: fmtMZN(effectiveSavings),
    activeInvestments: effectiveActiveCount,
    lastProfit: finalLastProfit,
    available: fmtMZN(effectiveAvailable),
    totalInvested: fmtMZN(effectiveTotalInvested),
    estimatedDailyProfit: fmtMZN(estimatedDaily),
    estimatedMonthlyProfit: fmtMZN(estimatedMonthly),
    dailyRate: DAILY_RATE,
    _dailyCredited: dailyResult?.totalCredited ?? 0,
    _dailyUpdated: dailyResult?.investmentsUpdated ?? 0,
  } as any;
}

async function fetchDashboardDirect(authUserId: string): Promise<any | null> {
  try {
    const profileRes: any = await backend
      .from('user_profiles')
      .select('id, balance, total_invested, accumulated_profits, available_balance, bonus_balance, pending_withdrawals, is_verified')
      .eq('auth_user_id', authUserId)
      .maybeSingle();
    if (profileRes?.error) throw profileRes.error;
    const profile = profileRes?.data;
    if (!profile) return null;

    const profileId = profile.id;

    const walletPromise = backend
      .from('wallets')
      .select('balance, invested, profits, available_balance, bonus_balance, pending_withdrawals')
      .eq('profile_id', profileId)
      .maybeSingle()
      .then(res => res, () => ({ data: null }));

    const uiPromise = backend
      .from('user_investments')
      .select('amount, status, package_id, investment_packages(daily_profit, minimum_investment)')
      .or(`user_id.eq.${profileId},profile_id.eq.${profileId}`)
      .then(res => res, () => ({ data: [] }));

    const saPromise = backend
      .from('savings_applications')
      .select('amount_applied, status')
      .eq('profile_id', profileId)
      .in('status', ['active', 'locked'])
      .then(res => res, () => ({ data: [] }));

    const [walletRaw, uiRaw, saRaw] = await Promise.all([walletPromise, uiPromise, saPromise]);

    const wallet = walletRaw?.data;

    const uiRows: any[] = Array.isArray(uiRaw?.data) ? uiRaw.data : [];
    const activeUi = uiRows.filter((r: any) => r?.status === 'active');
    const totalInvestedActive = activeUi.reduce(
      (s: number, r: any) => s + toFinite(r?.amount),
      0
    );
    const activeInvestmentsCount = activeUi.length;

    const totalProfitsUi = uiRows
      .filter((r: any) => r?.status === 'active' || r?.status === 'completed')
      .reduce((s: number, r: any) => {
        const pkg: any = r?.investment_packages;
        const dp = toFinite(pkg?.daily_profit);
        const minv = toFinite(pkg?.minimum_investment);
        const amt = toFinite(r?.amount);
        if (minv > 0) {
          return s + amt * (dp / minv);
        }
        return s + amt * 0.035;
      }, 0);

    const saRows: any[] = Array.isArray(saRaw?.data) ? saRaw.data : [];
    const savingsValue = saRows.reduce(
      (s: number, r: any) => s + toFinite(r?.amount_applied),
      0
    );

    const balance = toFinite(
      wallet?.balance,
      profile?.balance
    );
    const available_balance = toFinite(
      wallet?.available_balance,
      profile?.available_balance,
      wallet?.balance,
      profile?.balance
    );
    const investedOrTotalInvested = toFinite(
      wallet?.invested,
      profile?.total_invested
    );
    const invested = investedOrTotalInvested !== 0
      ? investedOrTotalInvested
      : totalInvestedActive;
    const profitsOrAccumulated = toFinite(
      wallet?.profits,
      profile?.accumulated_profits
    );

    // REGRA UNIFICADA B):
    // Lucros = valor REAL (já creditado).
    // Apenas usa o cálculo estimado (totalProfitsUi) SE NÃO existir
    // qualquer valor persistido (0 e NÃO zero literal? cuidado: 0 = nunca lucrou).
    // Para distinguir de "nunca sincronizado", usamos 0 apenas se
    // totalInvested também for 0 (sem investimentos).
    const profits =
      profitsOrAccumulated > 0
        ? profitsOrAccumulated
        : (investedOrTotalInvested > 0
            ? (profitsOrAccumulated === 0 ? 0 : totalProfitsUi)
            : 0);

    const accumulated_profits_real = profitsOrAccumulated;

    const total_invested_final = investedOrTotalInvested !== 0
      ? investedOrTotalInvested
      : totalInvestedActive;
    const bonus = toFinite(wallet?.bonus_balance, profile?.bonus_balance);
    const pending_w = toFinite(wallet?.pending_withdrawals, profile?.pending_withdrawals);

    const estDaily = invested * DAILY_RATE / 100;

    return {
      principal: balance,
      available: available_balance,
      invested: invested,
      accumulated_profits: profits,
      active_investments: activeInvestmentsCount,
      total_invested: total_invested_final,
      estimated_daily_profit: estDaily,
      estimated_monthly_profit: estDaily * 30,
      last_profit: estDaily,
      savings_value: savingsValue,
      balance: balance,
      available_balance: available_balance,
      bonus_balance: bonus,
      pending_withdrawals: pending_w,
      pending_withdrawals_count: 0,
      pending_deposits: 0,
    };
  } catch (e: any) {
    console.warn('[finance.fetchDashboardDirect] erro:', e?.message);
    return null;
  }
}

export async function getInvestmentPackages() {
  const ipRes: any = await backend
    .from('investment_packages')
    .select('*')
    .eq('is_active', true)
    .order('package_number', { ascending: true });
  if (ipRes?.error) throw ipRes.error;
  return ipRes?.data || [];
}

export async function getUserInvestments() {
  const userId = await getUserId();
  const uiRes: any = await backend
    .from('user_investments')
    .select('*, investment_packages(name, daily_profit, monthly_profit)')
    .eq('user_id', userId)
    .order('purchased_at', { ascending: false });
  if (uiRes?.error) throw uiRes.error;
  return uiRes?.data || [];
}

export async function getUserSavings() {
  const userId = await getUserId();
  try {
    await backend.rpc('refresh_savings_status');
  } catch (_e: any) {
    console.warn('[finance.getUserSavings] refresh_savings_status RPC failed (fallback to raw table):', _e?.message);
  }
  const saRes: any = await backend
    .from('savings_applications_view')
    .select('*')
    .eq('profile_id', userId)
    .order('start_at', { ascending: false });
  if (saRes?.error) {
    console.warn('[finance.getUserSavings] savings_applications_view failed, falling back:', saRes.error?.message);
    const saFallback: any = await backend
      .from('savings_applications')
      .select('*')
      .eq('profile_id', userId)
      .order('start_at', { ascending: false });
    if (saFallback?.error) throw saFallback.error;
    return saFallback?.data || [];
  }
  return saRes?.data || [];
}

export type SavingsCreateResult = {
  success: boolean;
  message: string;
  savingsId?: string | null;
  startAt?: string | null;
  releaseAt?: string | null;
  amountApplied?: number | null;
  amountToReceive?: number | null;
  newAvailableBalance?: number | null;
  newBalance?: number | null;
};

export async function createSavingsApplication(amount: number): Promise<SavingsCreateResult> {
  try {
    const rpcRes = await backend.rpc('create_savings_application', {
      p_amount: amount,
    });
    if (rpcRes?.error) {
      return {
        success: false,
        message: rpcRes.error?.message || 'Erro ao criar poupança.',
      };
    }
    const rows: any[] = Array.isArray(rpcRes?.data) ? rpcRes.data : (rpcRes?.data ? [rpcRes.data] : []);
    const first = rows[0] ?? {};
    return {
      success: Boolean(first.success ?? false),
      message: String(first.message ?? 'Operação concluída.'),
      savingsId: first.savings_id ?? null,
      startAt: first.start_at ?? null,
      releaseAt: first.release_at ?? null,
      amountApplied: first.amount_applied != null ? Number(first.amount_applied) : null,
      amountToReceive: first.amount_to_receive != null ? Number(first.amount_to_receive) : null,
      newAvailableBalance: first.new_available_balance != null ? Number(first.new_available_balance) : null,
      newBalance: first.new_balance != null ? Number(first.new_balance) : null,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Erro de conexão ao criar poupança.',
    };
  }
}

export type SavingsSettleResult = {
  success: boolean;
  message: string;
  savingsId?: string | null;
  amountReceived?: number | null;
  newAvailableBalance?: number | null;
  newBalance?: number | null;
};

export async function settleSavingsApplication(savingsId: string): Promise<SavingsSettleResult> {
  try {
    const rpcRes = await backend.rpc('settle_savings_application', {
      p_savings_id: savingsId,
    });
    if (rpcRes?.error) {
      return {
        success: false,
        message: rpcRes.error?.message || 'Erro ao receber poupança.',
      };
    }
    const rows: any[] = Array.isArray(rpcRes?.data) ? rpcRes.data : (rpcRes?.data ? [rpcRes.data] : []);
    const first = rows[0] ?? {};
    return {
      success: Boolean(first.success ?? false),
      message: String(first.message ?? 'Operação concluída.'),
      savingsId: first.savings_id ?? null,
      amountReceived: first.amount_received != null ? Number(first.amount_received) : null,
      newAvailableBalance: first.new_available_balance != null ? Number(first.new_available_balance) : null,
      newBalance: first.new_balance != null ? Number(first.new_balance) : null,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Erro de conexão ao receber poupança.',
    };
  }
}

export async function getWallet() {
  const profile = await getUserProfile();
  if (!profile) return null;

  const profileWalletRes: any = await backend
    .from('user_profiles')
    .select('balance, total_invested, accumulated_profits')
    .eq('id', profile.id)
    .maybeSingle();

  if (profileWalletRes?.data) {
    return profileWalletRes.data;
  }

  const walletRes: any = await backend
    .from('wallets')
    .select('*')
    .eq('profile_id', profile.id)
    .maybeSingle();

  if (walletRes?.error && !walletRes?.error?.message?.includes('does not exist')) {
    try {
      await backend.rpc('get_or_create_wallet', { p_profile_id: profile.id });
      const retry: any = await backend
        .from('wallets')
        .select('*')
        .eq('profile_id', profile.id)
        .maybeSingle();
      if (retry?.error) throw retry.error;
      return retry?.data ?? null;
    } catch (_e) {
      return null;
    }
  }
  return walletRes?.data ?? null;
}

export type PurchaseResult = {
  success: boolean;
  message: string;
  userInvestmentId?: string | null;
  newBalance?: number | null;
  referralBonusPaid?: number | null;
  referralPaidTo?: string | null;
};

export async function purchaseInvestment(
  packageId: string,
  amount: number,
): Promise<PurchaseResult> {
  const sessRes: any = await backend.auth.getSession();
  const session = sessRes?.data?.session;
  if (!session?.user?.id) {
    return { success: false, message: 'Sessão expirada. Faça login novamente.' };
  }

  try {
    const rpcRes = await backend.rpc('purchase_investment_package', {
      p_package_id: packageId,
      p_amount: amount,
    });

    if (rpcRes?.error) {
      const msg = rpcRes.error?.message || 'Erro ao processar investimento.';
      return { success: false, message: msg };
    }

    const rows: any[] = Array.isArray(rpcRes?.data) ? rpcRes.data : (rpcRes?.data ? [rpcRes.data] : []);
    const first = rows[0] ?? {};
    const success = Boolean(first.success ?? false);
    if (success) {
      invalidateFinanceCache();
      try { invalidateReferralCache(); } catch {}
    }
    return {
      success,
      message: String(first.message ?? (success ? 'Investimento realizado com sucesso.' : 'Não foi possível concluir o investimento.')),
      userInvestmentId: first.user_investment_id ?? null,
      newBalance: first.new_balance != null ? Number(first.new_balance) : null,
      referralBonusPaid: first.referral_bonus_paid != null ? Number(first.referral_bonus_paid) : null,
      referralPaidTo: first.referral_paid_to ?? null,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Erro de conexão ao processar investimento.',
    };
  }
}

export type CreateDepositResult = {
  success: boolean;
  message: string;
  deposit_id?: string | null;
  amount?: number | null;
  status?: string | null;
};

export async function createDepositRequest(
  amount: number,
  paymentMethod: string,
  contact?: string | null,
  proofReference?: string | null
): Promise<CreateDepositResult> {
  try {
    if (!Number.isFinite(amount) || amount <= 0) {
      return { success: false, message: 'Informe um valor válido para recarregar.' };
    }
    const rpcRes = await backend.rpc('create_deposit_request', {
      p_amount: amount,
      p_payment_method: paymentMethod || 'mpesa',
      p_contact: contact ?? null,
      p_proof_reference: proofReference ?? null,
    });
    if (rpcRes?.error) {
      return { success: false, message: rpcRes.error?.message || 'Erro ao criar pedido de recarga.' };
    }
    const rows: any[] = Array.isArray(rpcRes?.data) ? rpcRes.data : (rpcRes?.data ? [rpcRes.data] : []);
    const first = rows[0] ?? {};
    invalidateFinanceCache();
    return {
      success: Boolean(first.success ?? false),
      message: String(first.message ?? 'Operação concluída.'),
      deposit_id: first.deposit_id ?? null,
      amount: first.amount != null ? Number(first.amount) : null,
      status: first.status ?? null,
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Erro de conexão.' };
  }
}

export type CreateWithdrawResult = {
  success: boolean;
  message: string;
  withdrawal_id?: string | null;
  amount?: number | null;
  fee?: number | null;
  total_deducted?: number | null;
  status?: string | null;
};

export async function createWithdrawalRequest(
  amount: number,
  withdrawalMethod: string,
  contact: string,
  fee?: number | null
): Promise<CreateWithdrawResult> {
  try {
    if (!Number.isFinite(amount) || amount <= 0) {
      return { success: false, message: 'Informe um valor válido para saque.' };
    }
    if (!contact || contact.replace(/\D/g, '').length < 6) {
      return { success: false, message: 'Informe o contacto para receber o valor.' };
    }
    const rpcRes = await backend.rpc('create_withdrawal_request', {
      p_amount: amount,
      p_withdrawal_method: withdrawalMethod || 'mpesa',
      p_contact: contact,
      p_fee: 0,
    });
    if (rpcRes?.error) {
      return { success: false, message: rpcRes.error?.message || 'Erro ao criar pedido de saque.' };
    }
    const rows: any[] = Array.isArray(rpcRes?.data) ? rpcRes.data : (rpcRes?.data ? [rpcRes.data] : []);
    const first = rows[0] ?? {};
    invalidateFinanceCache();
    return {
      success: Boolean(first.success ?? false),
      message: String(first.message ?? 'Operação concluída.'),
      withdrawal_id: first.withdrawal_id ?? null,
      amount: first.amount != null ? Number(first.amount) : null,
      fee: first.fee != null ? Number(first.fee) : null,
      total_deducted: first.total_deducted != null ? Number(first.total_deducted) : null,
      status: first.status ?? null,
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Erro de conexão.' };
  }
}

export type MyDepositRow = {
  id: string;
  amount: number;
  payment_method: string;
  contact?: string | null;
  proof_reference?: string | null;
  status: string;
  created_at: string;
  reviewed_at?: string | null;
  admin_notes?: string | null;
};

export type MyWithdrawalRow = {
  id: string;
  amount: number;
  fee: number;
  total_deducted: number;
  withdrawal_method: string;
  contact: string;
  status: string;
  created_at: string;
  reviewed_at?: string | null;
  admin_notes?: string | null;
};

export async function getMyDeposits(): Promise<MyDepositRow[]> {
  let res: any = await backend.from('my_deposits_view').select('*').order('created_at', { ascending: false });
  if (res?.error) {
    const fallback: any = await backend
      .from('deposits')
      .select('id, amount, payment_method, contact, proof_reference, status, created_at, reviewed_at, admin_notes')
      .order('created_at', { ascending: false });
    if (fallback?.error) throw fallback.error;
    res = fallback;
  }
  const rows: any[] = res?.data ?? [];
  return rows.map((d) => ({
    id: d.id,
    amount: Number(d.amount ?? 0),
    payment_method: String(d.payment_method ?? ''),
    contact: d.contact ?? null,
    proof_reference: d.proof_reference ?? null,
    status: String(d.status ?? ''),
    created_at: d.created_at,
    reviewed_at: d.reviewed_at ?? null,
    admin_notes: d.admin_notes ?? null,
  }));
}

export async function getMyWithdrawals(): Promise<MyWithdrawalRow[]> {
  let res: any = await backend.from('my_withdrawals_view').select('*').order('created_at', { ascending: false });
  if (res?.error) {
    const fallback: any = await backend
      .from('withdrawals')
      .select('id, amount, fee, total_deducted, withdrawal_method, contact, status, created_at, reviewed_at, admin_notes')
      .order('created_at', { ascending: false });
    if (fallback?.error) throw fallback.error;
    res = fallback;
  }
  const rows: any[] = res?.data ?? [];
  return rows.map((w) => ({
    id: w.id,
    amount: Number(w.amount ?? 0),
    fee: Number(w.fee ?? 0),
    total_deducted: Number(w.total_deducted ?? 0),
    withdrawal_method: String(w.withdrawal_method ?? ''),
    contact: String(w.contact ?? ''),
    status: String(w.status ?? ''),
    created_at: w.created_at,
    reviewed_at: w.reviewed_at ?? null,
    admin_notes: w.admin_notes ?? null,
  }));
}


