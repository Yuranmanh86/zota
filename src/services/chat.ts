import { backend } from './backendClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ALL_ZORA_GROUP_IDS as ZORA_GROUP_IDS } from './auth';

const BACKFILL_KEY = '@zora:group_backfill_v1';
const LAST_READ_KEY = '@zora:last_read_v1';

export type ProfileContact = {
  id: string;
  nome_completo: string;
  full_name?: string;
  telefone: string;
  phone_number?: string;
};

export type ChatMessageRow = {
  id: string;
  chat_thread_id: string;
  sender_profile_id: string;
  type: string;
  content?: string;
  attachment_url?: string;
  is_deleted: boolean;
  created_at: string;
};

export async function backfillAllZoraGroupsMemberships(): Promise<{ done: boolean; count: number }> {
  try {
    const done = await AsyncStorage.getItem(BACKFILL_KEY);
    if (done === '1') return { done: true, count: 0 };

    const profiles: any = await backend.from('user_profiles').select('id').order('id', { ascending: true }).limit(1000);
    if (profiles?.error) throw profiles.error;
    const profileIds = ((profiles?.data ?? []) as { id: string }[]).map((p) => p.id);
    if (profileIds.length === 0) {
      await AsyncStorage.setItem(BACKFILL_KEY, '1');
      return { done: true, count: 0 };
    }

    let insertedCount = 0;
    for (const gid of ZORA_GROUP_IDS) {
      const existing: any = await backend
        .from('chat_thread_members')
        .select('profile_id')
        .eq('chat_thread_id', gid);
      const existingIds = new Set(((existing?.data ?? []) as { profile_id: string }[]).map((m) => m.profile_id));
      const missing = profileIds.filter((pid) => !existingIds.has(pid));
      if (missing.length > 0) {
        const chunkSize = 100;
        for (let i = 0; i < missing.length; i += chunkSize) {
          const chunk = missing.slice(i, i + chunkSize);
          const rows = chunk.map((pid) => ({
            chat_thread_id: gid,
            profile_id: pid,
            joined_at: new Date().toISOString(),
            role: 'participant',
          }));
          try {
            await backend.from('chat_thread_members').insert(rows);
            insertedCount += chunk.length;
          } catch (e) {
            // Insert one by one as fallback
            for (const pid of chunk) {
              try {
                await backend.from('chat_thread_members').insert({
                  chat_thread_id: gid,
                  profile_id: pid,
                  joined_at: new Date().toISOString(),
                  role: 'participant',
                });
                insertedCount += 1;
              } catch {}
            }
          }
        }
      }
    }
    await AsyncStorage.setItem(BACKFILL_KEY, '1');
    return { done: true, count: insertedCount };
  } catch (e: any) {
    console.warn('backfillAllZoraGroupsMemberships failed:', e?.message || e);
    return { done: false, count: 0 };
  }
}

export async function setLastRead(threadId: string, messageCreatedAt: string) {
  try {
    const raw = await AsyncStorage.getItem(LAST_READ_KEY);
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    if (!map[threadId] || new Date(map[threadId]).getTime() < new Date(messageCreatedAt).getTime()) {
      map[threadId] = messageCreatedAt;
      await AsyncStorage.setItem(LAST_READ_KEY, JSON.stringify(map));
    }
  } catch {}
}

export async function getLastReadAll(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(LAST_READ_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function getLastRead(threadId: string): Promise<string | null> {
  const all = await getLastReadAll();
  return all[threadId] || null;
}

export async function getContacts() {
  try {
    // Try to get session but do not require it. If session exists, exclude current user from contacts.
    const sessionRes = await backend.auth.getSession();
    const session = (sessionRes as any)?.data?.session ?? (sessionRes as any)?.session ?? null;
    const authUserId = session?.user?.id ?? null;

    let query: any = backend
      .from('user_profiles')
      .select('id,full_name,phone_number')
      .order('full_name', { ascending: true });
    if (authUserId) {
      query = query.neq('auth_user_id', authUserId);
    }

    let { data, error } = await query;

    if (error) {
      let legacyQuery: any = backend
        .from('user_profiles')
        .select('id,nome_completo,telefone')
        .order('nome_completo', { ascending: true });
      if (authUserId) {
        legacyQuery = legacyQuery.neq('auth_user_id', authUserId);
      }
      const legacyResult = await legacyQuery;
      data = legacyResult.data;
      error = legacyResult.error;
    }

    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error: any) {
    return { data: [], error: error.message };
  }
}

export async function joinChatThread(threadId: string, profileId: string) {
  try {
    const { error } = await backend.from('chat_thread_members').insert({
      chat_thread_id: threadId,
      profile_id: profileId,
      joined_at: new Date().toISOString(),
      role: 'participant',
    });

    if (error) throw error;
    return { error: null };
  } catch (error: any) {
    return { error: error.message };
  }
}

export type ChatRestriction = {
  suspended: boolean;
  suspended_until: string | null;
  reason: string | null;
};

export async function getChatRestriction(): Promise<ChatRestriction> {
  const response: any = await backend.rpc('get_my_chat_restriction');
  if (response?.error) throw response.error;
  const result = Array.isArray(response?.data) ? response.data[0] : (response?.data ?? {});
  return {
    suspended: Boolean(result.suspended),
    suspended_until: result.suspended_until ?? null,
    reason: result.reason ?? null,
  };
}

export async function ensureThreadMembership(threadId: string, profileId: string) {
  try {
    const { data: membershipRows, error } = await backend
      .from('chat_thread_members')
      .select('id')
      .eq('chat_thread_id', threadId)
      .eq('profile_id', profileId)
      .limit(1);

    if (error) throw error;
    if (Array.isArray(membershipRows) && membershipRows.length > 0) {
      return { error: null };
    }

    const { error: insertError } = await backend.from('chat_thread_members').insert({
      chat_thread_id: threadId,
      profile_id: profileId,
      joined_at: new Date().toISOString(),
      role: 'participant',
    });

    if (insertError) throw insertError;
    return { error: null };
  } catch (error: any) {
    return { error: error.message };
  }
}

export async function getChatMessages(threadId: string) {
  try {
    const { data, error } = await backend
      .from('chat_messages')
      .select('id,chat_thread_id,sender_profile_id,type,content,attachment_url,created_at')
      .eq('chat_thread_id', threadId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error: any) {
    return { data: [], error: error.message };
  }
}

const CHAT_PAGE_SIZE = 20;

export async function getChatMessagesPage(
  threadId: string,
  oldestLoadedCreatedAt?: string | null,
  pageSize: number = CHAT_PAGE_SIZE
) {
  try {
    let query = backend
      .from('chat_messages')
      .select('id,chat_thread_id,sender_profile_id,type,content,attachment_url,created_at')
      .eq('chat_thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(pageSize);

    if (oldestLoadedCreatedAt) {
      query = query.lt('created_at', oldestLoadedCreatedAt);
    }

    const { data, error } = await query;
    if (error) throw error;

    const sorted = (data || []).slice().sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const totalRes: any = await backend
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('chat_thread_id', threadId);

    return {
      data: sorted,
      total: totalRes?.count ?? sorted.length,
      error: null,
    };
  } catch (error: any) {
    return { data: [], total: 0, error: error.message };
  }
}

export async function getThreadMemberCounts(threadIds: string[]) {
  try {
    if (threadIds.length === 0) return {};
    const { data, error } = await backend
      .from('chat_thread_members')
      .select('chat_thread_id')
      .in('chat_thread_id', threadIds);
    if (error) throw error;
    const counts: Record<string, number> = {};
    (data || []).forEach((row: any) => {
      const tid = row.chat_thread_id;
      counts[tid] = (counts[tid] || 0) + 1;
    });
    return counts;
  } catch {
    return {};
  }
}

export async function sendChatMessage(
  threadId: string,
  senderProfileId: string,
  content: string,
  messageType: string = 'text'
) {
  try {
    const { data, error } = await backend
      .from('chat_messages')
      .insert([
        {
          chat_thread_id: threadId,
          sender_profile_id: senderProfileId,
          type: messageType,
          content,
          created_at: new Date().toISOString(),
        },
      ])
      .select('id,chat_thread_id,sender_profile_id,type,content,attachment_url,created_at');

    if (error) throw error;

    return { data: data?.[0] || null, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function getOrCreatePrivateChat(profileId: string, contactId: string) {
  try {
    // Try RPC first (fast, atomic). If RPC fails (common on some web setups), fallback to manual approach.
    try {
      const { data, error } = await backend.rpc('get_or_create_private_chat', { p1: profileId, p2: contactId });
      if (!error) {
        // Supabase may return scalar or array; handle both.
        if (typeof data === 'string') return { data, error: null };
        if (Array.isArray(data) && data.length > 0) return { data: data[0], error: null };
        if (data && typeof data === 'object') return { data: (data as any).id ?? JSON.stringify(data), error: null };
      }
      if (error) throw error;
    } catch (rpcErr) {
      // continue to fallback
    }

    // Fallback: search for an existing private chat that contains both participants.
    const { data: privateThreads } = await backend.from('chat_threads').select('id').eq('is_private', true);
    if (privateThreads && Array.isArray(privateThreads) && privateThreads.length > 0) {
      for (const t of privateThreads) {
        const tid = t.id;
        const { data: members } = await backend.from('chat_thread_members').select('profile_id').eq('chat_thread_id', tid);
        const memberIds = (members ?? []).map((m: any) => m.profile_id);
        if (memberIds.includes(profileId) && memberIds.includes(contactId)) {
          return { data: tid, error: null };
        }
      }
    }

    // Create new private thread and add members.
    const { data: created, error: createErr } = await backend.from('chat_threads').insert([
      {
        title: 'Conversa privada',
        is_group: false,
        thread_category: 'private',
        status: 'Ativo',
        is_public: false,
        is_private: true,
        is_verified: false,
        created_by: profileId,
      },
    ]).select('id');

    if (createErr) throw createErr;
    const newThreadId = Array.isArray(created) ? created[0]?.id : (created as any)?.id;
    if (!newThreadId) throw new Error('Falha ao criar thread privada');

    const { error: membersErr } = await backend.from('chat_thread_members').insert([
      { profile_id: profileId, chat_thread_id: newThreadId, joined_at: new Date().toISOString(), role: 'participant' },
      { profile_id: contactId, chat_thread_id: newThreadId, joined_at: new Date().toISOString(), role: 'participant' },
    ]);

    if (membersErr) throw membersErr;
    return { data: newThreadId, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}
