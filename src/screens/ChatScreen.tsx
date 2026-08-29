import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, SectionList, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store/appStore';
import { getUserProfile } from '../services/auth';
import { backend } from '../services/backendClient';
import { getContacts, joinChatThread, getOrCreatePrivateChat, getLastReadAll, setLastRead, getLastRead } from '../services/chat';
import { shadow } from '../theme/appTheme';
import { SUPPORT_THREAD_ID, ALL_ZORA_GROUP_IDS } from '../services/auth';

const WA_GREEN = '#25D366';
const WA_GREEN_DARK = '#128C7E';
const WA_GREEN_LIGHT = 'rgba(37, 211, 102, 0.12)';

const groupThreadIds = ALL_ZORA_GROUP_IDS;

type Tab = 'all' | 'private' | 'groups';

function formatChatTime(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString('pt-MZ', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  if (isYesterday) return 'Ontem';
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) {
    const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return dias[date.getDay()];
  }
  return date.toLocaleDateString('pt-MZ', { day: '2-digit', month: '2-digit' });
}

const threadPreview = (title: string, category: string) => {
  if (title.toLowerCase().includes('suporte')) return 'Grupo oficial de suporte do Zora.';
  if (title.toLowerCase().includes('poupança') || title.toLowerCase().includes('poupanca')) return 'Discussões sobre metas e rendimento.';
  if (category === 'support') return 'Converse com a equipe de suporte.';
  if (category === 'private') return 'Conversa privada do Zora.';
  return 'Conversa do Zora.';
};

const threadColor = (title: string) => {
  if (title.toLowerCase().includes('suporte')) return '#0EA5E9';
  if (title.toLowerCase().includes('poupança') || title.toLowerCase().includes('poupanca')) return '#FB7185';
  return WA_GREEN_DARK;
};

function sortConversationsByActivity<T extends { unread?: number; lastMessageAt?: string; name?: string; nome_completo?: string }>(a: T, b: T) {
  const aUnread = Number(a.unread ?? 0);
  const bUnread = Number(b.unread ?? 0);
  if (aUnread !== bUnread) return bUnread - aUnread;

  const aTime = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
  const bTime = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
  if (aTime !== bTime) return bTime - aTime;

  const aName = String((a as any).nome_completo || (a as any).name || '').toLowerCase();
  const bName = String((b as any).nome_completo || (b as any).name || '').toLowerCase();
  return aName.localeCompare(bName, 'pt');
}

const avatarColors = ['#FF6B6B', '#4ECDC4', '#FFD93D', '#6BCB77', '#4D96FF', '#FF9F43', '#A66CFF', '#25D366', '#FF7A00', '#E1306C', '#E53935', '#43A047', '#1E88E5', '#8E24AA', '#F4511E', '#00ACC1'];
function pickColor(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return avatarColors[h % avatarColors.length];
}

type Conversation = {
  id: string;
  name: string;
  status: string;
  preview: string;
  unread: number;
  verified: boolean;
  color: string;
  timestamp: string;
  isPublic: boolean;
  lastMessageAt?: string;
  messageCount?: number;
  isMine?: boolean;
  memberCount?: number;
};

type ProfileContact = {
  id: string;
  nome_completo: string;
  full_name?: string;
  telefone: string;
  phone_number?: string;
};

type PrivateChat = {
  threadId: string;
  contactId: string;
  nome_completo: string;
  telefone: string;
  preview: string;
  timestamp: string;
  verified: boolean;
  lastMessageAt?: string;
  messageCount?: number;
  unread: number;
  isMine?: boolean;
};

type ContactSection = {
  title: string;
  data: ProfileContact[];
};

function groupContactsAlphabetically(contacts: ProfileContact[]): ContactSection[] {
  const sorted = [...contacts].sort((a, b) => a.nome_completo.localeCompare(b.nome_completo, 'pt'));
  const map = new Map<string, ProfileContact[]>();
  for (const c of sorted) {
    const letter = (c.nome_completo || '#').charAt(0).toUpperCase();
    const key = /[A-Z]/.test(letter) ? letter : '#';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([title, data]) => ({ title, data }));
}

const SUPPORT_THREAD_TITLE = 'Suporte Zora';

export function ChatScreen() {
  const { theme } = useAppStore();
  const navigation = useNavigation<any>();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [privateChats, setPrivateChats] = useState<PrivateChat[]>([]);
  const [allContacts, setAllContacts] = useState<ProfileContact[]>([]);
  const [groupThreads, setGroupThreads] = useState<Conversation[]>([]);
  const [joinedThreads, setJoinedThreads] = useState<string[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({
    [SUPPORT_THREAD_ID]: 50,
    '00000000-0000-0000-0000-000000000002': 50,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllContacts, setShowAllContacts] = useState(false);
  const [lastReadMapState, setLastReadMapState] = useState<Record<string, string>>({});
  const lastReadMapRef = useRef<Record<string, string>>({});
  const privateChatsRef = useRef<PrivateChat[]>([]);
  const groupThreadsRef = useRef<Conversation[]>([]);
  const profileCacheRef = useRef<{ profileId: string } | null>(null);

  const normalizeProfile = (p: any): ProfileContact | null => {
    if (!p) return null;
    const profile = Array.isArray(p) ? p[0] : p;
    if (!profile || !profile.id) return null;
    const rawName = profile.full_name || profile.nome_completo || '';
    const nome = String(rawName || '').trim();
    const rawPhone = profile.phone_number || profile.telefone || '';
    const phone = String(rawPhone || '').trim();
    const cleanPhone = phone.replace(/\D/g, '');
    const isNameGeneric =
      !nome ||
      /^(contacto|contactos|contato|contatos|usuário|usuario|user|users|cliente|clientes|anonymous|anonimo|convidado|guest)$/i.test(nome) ||
      nome.length < 2 ||
      /^\d+$/.test(nome);
    const hasValidPhone = cleanPhone.length >= 8;
    const hasValidName = !isNameGeneric && nome.length >= 2;
    if (!hasValidPhone && !hasValidName) return null;
    let finalName = nome;
    if (!hasValidName && hasValidPhone) {
      const digits = cleanPhone.slice(-9);
      finalName = `+${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7)}`;
    }
    let finalPhone = phone;
    if (!hasValidPhone) {
      finalPhone = 'Sem número';
    } else {
      const digits = cleanPhone;
      if (digits.length === 9) finalPhone = `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
      else if (digits.length === 12) finalPhone = `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
    }
    return {
      id: profile.id,
      nome_completo: finalName,
      full_name: profile.full_name,
      telefone: finalPhone,
      phone_number: profile.phone_number,
    };
  };

  const normalizePhone = (phone: string) => {
    const digits = (phone || '').replace(/\D/g, '');
    if (!digits) return phone || '';
    if (digits.length === 9) return `${digits.slice(0,3)} ${digits.slice(3,6)} ${digits.slice(6)}`;
    if (digits.length === 12) return `+${digits.slice(0,3)} ${digits.slice(3,5)} ${digits.slice(5,8)} ${digits.slice(8)}`;
    return digits;
  };

  const getPrivateThreadContact = async (threadId: string, currentProfileId: string): Promise<ProfileContact | null> => {
    try {
      const { data: members, error } = await backend
        .from('chat_thread_members')
        .select('profile_id')
        .eq('chat_thread_id', threadId);

      if (error || !members?.length) return null;

      const otherMemberIds = Array.from(new Set(
        (members || [])
          .map((m: any) => m.profile_id)
          .filter((id: string | null | undefined) => Boolean(id) && id !== currentProfileId)
      ));

      if (otherMemberIds.length === 0) return null;

      const { data: profiles, error: profilesError } = await backend
        .from('user_profiles')
        .select('id,full_name,phone_number')
        .in('id', otherMemberIds);

      if (profilesError || !profiles?.length) return null;

      return (profiles || [])
        .map((profile: any) => normalizeProfile(profile))
        .find((profile): profile is ProfileContact => Boolean(profile)) ?? null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    privateChatsRef.current = privateChats;
  }, [privateChats]);

  useEffect(() => {
    groupThreadsRef.current = groupThreads;
  }, [groupThreads]);

  const getOrLoadProfileFast = async (): Promise<string> => {
    if (profileCacheRef.current?.profileId) return profileCacheRef.current.profileId;
    const { data: { session } } = await backend.auth.getSession();
    const userId = session?.user?.id ?? null;
    if (!userId) throw new Error('No session');
    const profile = await getUserProfile(userId);
    const pid = profile?.id ?? null;
    if (!pid) throw new Error('No profile');
    profileCacheRef.current = { profileId: pid };
    setProfileId(pid);
    return pid;
  };

  useEffect(() => {
    async function loadChatData() {
      setLoading(true);
      try {
        const currentProfileId = await getOrLoadProfileFast();

        const [membershipsRes, groupsRes, lastReadMap] = await Promise.all([
          backend.from('chat_thread_members').select('chat_thread_id').eq('profile_id', currentProfileId),
          backend
            .from('chat_threads')
            .select('id,title,thread_category,status,created_at,is_public,is_private,is_verified')
            .in('id', groupThreadIds),
          getLastReadAll(),
        ]);
        setLastReadMapState(lastReadMap);
        lastReadMapRef.current = lastReadMap;

        const memberships = (membershipsRes as any)?.data || [];
        const groupThreadsData = (groupsRes as any)?.data || [];

        let joinedIds = memberships.map((member: any) => member.chat_thread_id) || [];
        groupThreadIds.forEach((gid) => { if (!joinedIds.includes(gid)) joinedIds.push(gid); });
        joinedIds = Array.from(new Set(joinedIds));
        setJoinedThreads(joinedIds);

        const privateThreadIds = joinedIds.filter((id: string) => !groupThreadIds.includes(id));
        const allThreadIds = Array.from(new Set([...groupThreadIds, ...privateThreadIds]));

        const summaries: Record<string, any> = {};
        if (allThreadIds.length > 0) {
          const msgRes: any = await backend
            .from('chat_messages')
            .select('chat_thread_id,content,created_at,sender_profile_id')
            .in('chat_thread_id', allThreadIds)
            .order('created_at', { ascending: false })
            .limit(100);
          if (!msgRes?.error) {
            (msgRes?.data ?? []).forEach((row: any) => {
              const threadId = row.chat_thread_id;
              summaries[threadId] = summaries[threadId] || { count: 0, unreadCount: 0 };
              summaries[threadId].count += 1;
              const lr = lastReadMap[threadId];
              const fromOther = row.sender_profile_id !== currentProfileId;
              if (fromOther && (!lr || new Date(row.created_at).getTime() > new Date(lr).getTime())) {
                summaries[threadId].unreadCount += 1;
              }
              if (!summaries[threadId].latest) summaries[threadId].latest = row;
            });
          }
        }

        const groups = groupThreadsData.map((thread: any) => {
          const title = thread.title || (thread.id === SUPPORT_THREAD_ID ? SUPPORT_THREAD_TITLE : 'Grupo Zora');
          const category = thread.thread_category || '';
          const verified = thread.is_verified || /suporte|poupança|poupanca/i.test(title) || category === 'support' || category === 'savings' || thread.id === SUPPORT_THREAD_ID;
          const summary = summaries[thread.id];
          const latestContent = summary?.latest?.content;
          const latestPreview = latestContent ? `${latestContent.slice(0, 40)}${latestContent.length > 40 ? '…' : ''}` : threadPreview(title, category);
          const isMine = summary?.latest?.sender_profile_id === currentProfileId;
          const groupUnread = joinedIds.includes(thread.id) ? Math.min(summary?.unreadCount ?? 0, 99) : 0;
          return {
            id: thread.id,
            name: title,
            status: thread.status || 'Público',
            preview: latestPreview,
            unread: groupUnread,
            verified,
            color: threadColor(title),
            isPublic: thread.is_public ?? true,
            timestamp: formatChatTime(summary?.latest?.created_at || thread.created_at),
            lastMessageAt: summary?.latest?.created_at,
            messageCount: summary?.count ?? 0,
            isMine,
            memberCount: memberCounts[thread.id] || 50,
          } as Conversation;
        });

        setGroupThreads(groups.sort((a: Conversation, b: Conversation) => {
          const order = sortConversationsByActivity(a as any, b as any);
          if (order !== 0) return order;
          return groupThreadIds.indexOf(a.id) - groupThreadIds.indexOf(b.id);
        }));

        setLoading(false);

        setTimeout(async () => {
          try {
            const mcountRes: any = await backend
              .from('chat_thread_members')
              .select('chat_thread_id')
              .in('chat_thread_id', groupThreadIds);
            if (!mcountRes?.error) {
              const counts: Record<string, number> = {};
              (mcountRes?.data || []).forEach((m: any) => { counts[m.chat_thread_id] = (counts[m.chat_thread_id] || 0) + 1; });
              if (Object.keys(counts).length > 0) {
                setMemberCounts((prev) => ({ ...prev, ...counts }));
                setGroupThreads((prev) => prev.map((g) => ({ ...g, memberCount: counts[g.id] || g.memberCount || 50 })));
              }
            }

            const [contactsRes, privateThreads] = await Promise.all([
              getContacts(),
              privateThreadIds.length > 0
                ? backend
                    .from('chat_threads')
                    .select('id,title,thread_category,status,created_at,is_public,is_private,is_verified')
                    .in('id', privateThreadIds)
                    .eq('is_private', true)
                    .order('created_at', { ascending: false })
                : Promise.resolve({ data: [], error: null }),
            ]);
            const profilesData = (contactsRes as any)?.data || [];
            const normalizedContacts = (profilesData)
              .map((p: any) => normalizeProfile(p))
              .filter((c: ProfileContact | null): c is ProfileContact => c !== null && c.id !== currentProfileId);
            setAllContacts(normalizedContacts);

            const membersRes: any = privateThreadIds.length > 0
              ? await backend
                  .from('chat_thread_members')
                  .select('chat_thread_id,profile_id')
                  .in('chat_thread_id', privateThreadIds)
              : { data: [], error: null };

            const memberByThread = new Map<string, ProfileContact>();
            const memberRows = (membersRes?.data ?? []) as Array<{ chat_thread_id: string; profile_id: string }>;
            const contactIdsToLoad = Array.from(new Set(
              memberRows
                .map((member) => member.profile_id)
                .filter((id) => Boolean(id) && id !== currentProfileId)
            ));

            if (contactIdsToLoad.length > 0) {
              const profilesRes: any = await backend
                .from('user_profiles')
                .select('id,full_name,phone_number')
                .in('id', contactIdsToLoad);

              const profilesById = new Map<string, ProfileContact>();
              (profilesRes?.data ?? []).forEach((profile: any) => {
                const normalized = normalizeProfile(profile);
                if (normalized) profilesById.set(normalized.id, normalized);
              });

              memberRows.forEach((member) => {
                if (member.chat_thread_id && member.profile_id && member.profile_id !== currentProfileId) {
                  const profile = profilesById.get(member.profile_id);
                  if (profile && !memberByThread.has(member.chat_thread_id)) {
                    memberByThread.set(member.chat_thread_id, profile);
                  }
                }
              });
            }

            const privateChatsList = await Promise.all(((privateThreads as any).data ?? []).map(async (thread: any) => {
              const contact = memberByThread.get(thread.id) || await getPrivateThreadContact(thread.id, currentProfileId);
              const summary = summaries[thread.id];
              const latestContent = summary?.latest?.content;
              const latestPreview = latestContent ? `${latestContent.slice(0, 40)}${latestContent.length > 40 ? '…' : ''}` : threadPreview(contact?.nome_completo || 'Conversa privada', 'private');
              const isMine = summary?.latest?.sender_profile_id === currentProfileId;
              const unreadCount = Math.min(summary?.unreadCount ?? 0, 99);
              return {
                threadId: thread.id,
                contactId: contact?.id ?? '',
                nome_completo: contact?.nome_completo ?? 'Contato',
                telefone: contact?.telefone ?? '',
                preview: latestPreview,
                timestamp: formatChatTime(summary?.latest?.created_at || thread.created_at),
                verified: false,
                lastMessageAt: summary?.latest?.created_at,
                messageCount: summary?.count ?? 0,
                unread: unreadCount,
                isMine,
              };
            }));

            setPrivateChats(privateChatsList.sort((a: PrivateChat, b: PrivateChat) => sortConversationsByActivity(a as any, b as any)));
          } catch {}
        }, 0);
      } catch (e: any) {
        setError(e?.message || 'Erro ao carregar');
        setLoading(false);
      }
    }

    loadChatData();

    let messageChannel: any = null;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const startRealtime = async () => {
      try {
        await getOrLoadProfileFast().catch(() => null);
      } catch {}

      try {
        const existing = (backend as any).getChannels?.().find((c: any) => c.topic === 'chat_messages_list_v3');
        if (existing) {
          try { existing.unsubscribe(); await backend.removeChannel(existing); } catch {}
        }
      } catch {}

      if (cancelled) return;

      try {
        messageChannel = backend.channel('chat_messages_list_v3');
        messageChannel.on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages',
          },
          (payload: any) => {
            const newMessage = payload?.new;
            if (!newMessage) return;
            const threadId = newMessage.chat_thread_id;
            const latestCreatedAt = newMessage.created_at || new Date().toISOString();
            const rawContent = newMessage.content || 'Nova mensagem';
            const latestPreview = `${rawContent.slice(0, 40)}${rawContent.length > 40 ? '…' : ''}`;
            const cpid = profileCacheRef.current?.profileId ?? profileId;
            const isMine = newMessage.sender_profile_id === cpid;
            const lr = lastReadMapRef.current[threadId];
            const shouldCountUnread = !isMine && (!lr || new Date(latestCreatedAt).getTime() > new Date(lr).getTime());

            setGroupThreads((prev) => {
              const idx = prev.findIndex((thread) => thread.id === threadId);
              if (idx === -1) return prev;
              const updated = [...prev];
              const current = updated[idx];
              updated[idx] = {
                ...current,
                preview: latestPreview,
                timestamp: formatChatTime(latestCreatedAt),
                lastMessageAt: latestCreatedAt,
                messageCount: (current.messageCount ?? 0) + 1,
                unread: shouldCountUnread ? Math.min(current.unread + 1, 99) : current.unread,
                isMine,
              };
              return updated.sort((a, b) => {
                const order = sortConversationsByActivity(a as any, b as any);
                if (order !== 0) return order;
                return groupThreadIds.indexOf(a.id) - groupThreadIds.indexOf(b.id);
              });
            });

            setPrivateChats((prev) => {
              const idx = prev.findIndex((chat) => chat.threadId === threadId);
              if (idx !== -1) {
                const updated = [...prev];
                const current = updated[idx];
                updated[idx] = {
                  ...current,
                  preview: latestPreview,
                  timestamp: formatChatTime(latestCreatedAt),
                  lastMessageAt: latestCreatedAt,
                  messageCount: (current.messageCount ?? 0) + 1,
                  unread: shouldCountUnread ? Math.min(current.unread + 1, 99) : current.unread,
                  isMine,
                };
                return updated.sort((a, b) => sortConversationsByActivity(a as any, b as any));
              } else if (!groupThreadIds.includes(threadId) && !isMine && cpid) {
                (async () => {
                  try {
                    const thr: any = await backend
                      .from('chat_threads')
                      .select('id,is_private')
                      .eq('id', threadId)
                      .maybeSingle();
                    if (!thr?.data?.is_private) return;

                    const contact = await getPrivateThreadContact(threadId, cpid);
                    if (!contact) return;

                    setPrivateChats((cur2) => {
                      if (cur2.some((c) => c.threadId === threadId)) return cur2;
                      const novo: PrivateChat = {
                        threadId,
                        contactId: contact.id,
                        nome_completo: contact.nome_completo,
                        telefone: contact.telefone,
                        preview: latestPreview,
                        timestamp: formatChatTime(latestCreatedAt),
                        verified: false,
                        lastMessageAt: latestCreatedAt,
                        messageCount: 1,
                        unread: 1,
                        isMine: false,
                      };
                      return [novo, ...cur2].sort((a: any, b: any) => {
                        const aT = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
                        const bT = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
                        return bT - aT;
                      });
                    });
                    setJoinedThreads((jt) => Array.from(new Set([...jt, threadId])));
                  } catch {}
                })();
                return prev;
              }
              return prev;
            });
          }
        );
        messageChannel.subscribe();
      } catch (e) {
      }

      fallbackInterval = setInterval(async () => {
        try {
          const cpid = profileCacheRef.current?.profileId ?? await getOrLoadProfileFast().catch(() => null);
          if (!cpid) return;

          const membershipsRes = await backend.from('chat_thread_members').select('chat_thread_id').eq('profile_id', cpid);
          const memberships = (membershipsRes as any)?.data || [];
          const joinedIds = memberships.map((m: any) => m.chat_thread_id) || [];
          const allIds = Array.from(new Set([...groupThreadIds, ...joinedIds]));
          setJoinedThreads(Array.from(new Set([...joinedIds])));

          if (allIds.length > 0) {
            const msgRes: any = await backend
              .from('chat_messages')
              .select('chat_thread_id,content,created_at,sender_profile_id')
              .in('chat_thread_id', allIds)
              .order('created_at', { ascending: false })
              .limit(150);
            if (!msgRes?.error) {
              type Summ = { count: number; unreadCount: number; latest?: any };
              const localSummaries: Record<string, Summ> = {};
              (msgRes?.data || []).forEach((row: any) => {
                const tid = row.chat_thread_id;
                const isMine = row.sender_profile_id === cpid;
                localSummaries[tid] = localSummaries[tid] || { count: 0, unreadCount: 0 };
                localSummaries[tid].count += 1;
                const lr = lastReadMapRef.current[tid];
                if (!isMine && (!lr || new Date(row.created_at).getTime() > new Date(lr).getTime())) {
                  localSummaries[tid].unreadCount += 1;
                }
                if (!localSummaries[tid].latest) localSummaries[tid].latest = row;
              });

              setGroupThreads((prev) => prev.map((g) => {
                const s = localSummaries[g.id];
                if (!s) return g;
                const latestContent = s.latest?.content;
                const isMine = s.latest?.sender_profile_id === cpid;
                return {
                  ...g,
                  preview: latestContent ? `${latestContent.slice(0,40)}${latestContent.length>40?'…':''}` : g.preview,
                  timestamp: formatChatTime(s.latest?.created_at || g.lastMessageAt),
                  lastMessageAt: s.latest?.created_at || g.lastMessageAt,
                  messageCount: Math.max(g.messageCount || 0, s.count),
                  isMine,
                  unread: Math.min(s.unreadCount, 99),
                };
              }).sort((a, b) => {
                const aT = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
                const bT = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
                if (aT === bT) return groupThreadIds.indexOf(a.id) - groupThreadIds.indexOf(b.id);
                return bT - aT;
              }));

              const privateTidsInMemberships = joinedIds.filter((id: string) => !groupThreadIds.includes(id));
              const existingTids = new Set(privateChatsRef.current.map((p) => p.threadId));
              let additions: PrivateChat[] = [];
              const missingTids = privateTidsInMemberships.filter((id: string) => !existingTids.has(id));
              if (missingTids.length > 0) {
                try {
                  const thr: any = await backend
                    .from('chat_threads')
                    .select('id,created_at')
                    .in('id', missingTids)
                    .eq('is_private', true);
                  const memb: any = await backend
                    .from('chat_thread_members')
                    .select('chat_thread_id,profile_id,profile:user_profiles(id,full_name,phone_number)')
                    .in('chat_thread_id', missingTids)
                    .neq('profile_id', cpid);
                  const mbThread = new Map<string, any>();
                  (memb?.data ?? []).forEach((m: any) => {
                    if (!mbThread.has(m.chat_thread_id)) {
                      const prof = normalizeProfile(m.profile);
                      if (prof) mbThread.set(m.chat_thread_id, prof);
                    }
                  });
                  (thr?.data ?? []).forEach((t: any) => {
                    const contact = mbThread.get(t.id);
                    if (contact) {
                      const s = localSummaries[t.id];
                      const latestC = s?.latest?.content || 'Nova conversa';
                      additions.push({
                        threadId: t.id,
                        contactId: contact.id,
                        nome_completo: contact.nome_completo,
                        telefone: contact.telefone,
                        preview: `${latestC.slice(0, 40)}${latestC.length > 40 ? '…' : ''}`,
                        timestamp: formatChatTime(s?.latest?.created_at || t.created_at),
                        verified: false,
                        lastMessageAt: s?.latest?.created_at || t.created_at,
                        messageCount: s?.count ?? 0,
                        unread: Math.min(s?.unreadCount ?? 1, 99),
                        isMine: s?.latest?.sender_profile_id === cpid,
                      });
                    }
                  });
                } catch {}
              }

              setPrivateChats((prev) => {
                const prevUpdated = prev.map((p) => {
                  const s = localSummaries[p.threadId];
                  if (!s) return p;
                  const latestContent = s.latest?.content;
                  const isMine = s.latest?.sender_profile_id === cpid;
                  return {
                    ...p,
                    preview: latestContent ? `${latestContent.slice(0,40)}${latestContent.length>40?'…':''}` : p.preview,
                    timestamp: formatChatTime(s.latest?.created_at || p.lastMessageAt),
                    lastMessageAt: s.latest?.created_at || p.lastMessageAt,
                    messageCount: Math.max(p.messageCount || 0, s.count),
                    isMine,
                    unread: Math.min(s.unreadCount, 99),
                  };
                });
                const withAdditions = additions.length > 0
                  ? [...additions.filter(a => !prevUpdated.some(p => p.threadId === a.threadId)), ...prevUpdated]
                  : prevUpdated;
                return withAdditions.sort((a: PrivateChat, b: PrivateChat) => sortConversationsByActivity(a as any, b as any));
              });
            }
          }
        } catch {}
      }, 30000);
    };

    startRealtime();

    return () => {
      cancelled = true;
      try {
        if (messageChannel) {
          try { messageChannel.unsubscribe(); } catch {}
          try { backend.removeChannel(messageChannel); } catch {}
        }
      } catch {}
      if (fallbackInterval) clearInterval(fallbackInterval);
    };
  }, []);

  const filteredPrivateChats = useMemo(
    () => privateChats.filter((chat) =>
      chat.nome_completo.toLowerCase().includes(search.toLowerCase()) || chat.telefone.toLowerCase().includes(search.toLowerCase())
    ),
    [privateChats, search]
  );

  const filteredGroups = useMemo(
    () => groupThreads.filter((thread) =>
      thread.name.toLowerCase().includes(search.toLowerCase()) || thread.preview.toLowerCase().includes(search.toLowerCase())
    ),
    [groupThreads, search]
  );

  const combinedConversations = useMemo(() => {
    const all = [...filteredPrivateChats.map((p) => ({
      ...p,
      id: p.threadId,
      isGroup: false,
    })), ...filteredGroups.map((g) => ({
      ...g,
      contactId: '',
      telefone: '',
      verified: g.verified,
      isGroup: true,
      memberCount: g.memberCount,
    }))];
    return all.sort((a: any, b: any) => {
      const order = sortConversationsByActivity(a, b);
      if (order !== 0) return order;
      if (a.isGroup !== b.isGroup) return a.isGroup ? 1 : -1;
      return 0;
    });
  }, [filteredPrivateChats, filteredGroups]);

  const filteredAllContacts = useMemo(
    () => allContacts.filter((contact) =>
      contact.nome_completo.toLowerCase().includes(search.toLowerCase()) || contact.telefone.toLowerCase().includes(search.toLowerCase())
    ),
    [allContacts, search]
  );

  const contactSections = useMemo(() => groupContactsAlphabetically(filteredAllContacts), [filteredAllContacts]);
  const totalContacts = allContacts.length;

  const handleJoinThread = async (threadId: string) => {
    if (!profileId) return;
    const { error } = await joinChatThread(threadId, profileId);
    if (!error) {
      setJoinedThreads((prev) => Array.from(new Set([...prev, threadId])));
      setTimeout(async () => {
        const countRes: any = await backend.from('chat_thread_members').select('chat_thread_id').in('chat_thread_id', groupThreadIds);
        if (!countRes?.error) {
          const counts: Record<string, number> = {};
          (countRes?.data || []).forEach((m: any) => { counts[m.chat_thread_id] = (counts[m.chat_thread_id] || 0) + 1; });
          setMemberCounts(counts);
          setGroupThreads((prev) => prev.map((g) => ({ ...g, memberCount: counts[g.id] || g.memberCount || 1 })));
        }
      }, 500);
    }
  };

  const markThreadAsRead = (threadId: string, lastMsgAt?: string) => {
    const ts = lastMsgAt || new Date().toISOString();
    setLastRead(threadId, ts).catch(() => {});
    lastReadMapRef.current = { ...lastReadMapRef.current, [threadId]: ts };
    setLastReadMapState((prev) => ({ ...prev, [threadId]: ts }));
  };

  const openGroupChat = async (item: Conversation) => {
    markThreadAsRead(item.id, item.lastMessageAt);
    if (!joinedThreads.includes(item.id)) await handleJoinThread(item.id);
    setGroupThreads((prev) => prev.map((g) => g.id === item.id ? { ...g, unread: 0 } : g));
    navigation.navigate('ChatDetail', {
      threadId: item.id,
      recipient: item.name,
      verified: item.verified,
      isGroup: true,
      memberCount: item.memberCount || 0,
    });
  };

  const openPrivateChat = (chat: PrivateChat) => {
    markThreadAsRead(chat.threadId, chat.lastMessageAt);
    setPrivateChats((prev) => prev.map((c) => c.threadId === chat.threadId ? { ...c, unread: 0 } : c));
    navigation.navigate('ChatDetail', {
      threadId: chat.threadId,
      recipient: chat.nome_completo,
      verified: false,
      isPrivate: true,
      contactPhone: chat.telefone,
    });
  };

  const handleOpenPrivateChat = async (contact: ProfileContact) => {
    if (!profileId) return;
    const existingChat = privateChats.find((chat) => chat.contactId === contact.id);
    if (existingChat) {
      openPrivateChat(existingChat);
      return;
    }
    const res = await getOrCreatePrivateChat(profileId, contact.id);
    if (res.error) { setError(res.error); return; }
    if (!res.data) { setError('Não foi possível iniciar a conversa privada.'); return; }
    setJoinedThreads((prev) => Array.from(new Set([...prev, res.data as string])));
    markThreadAsRead(res.data, undefined);
    navigation.navigate('ChatDetail', {
      threadId: res.data,
      recipient: contact.nome_completo,
      verified: false,
      isPrivate: true,
      contactPhone: contact.telefone,
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={WA_GREEN} />
          <Text style={styles.loadingText}>A carregar mensagens...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const showPrivate = activeTab === 'all' || activeTab === 'private';
  const showGroup = activeTab === 'all' || activeTab === 'groups';
  const allList = activeTab === 'all' ? combinedConversations : [];
  const showCombined = activeTab === 'all';
  const hasAnything = (filteredPrivateChats.length + filteredGroups.length) > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header} />

      {/* ===== ABA MENU ESTILO WHATSAPP ===== */}
      <View style={styles.tabsHeader}>
        {([
          { key: 'all', label: 'Todas', count: privateChats.length + groupThreads.length, icon: 'chatbubbles-outline' },
          { key: 'private', label: 'Conversas', count: privateChats.length, icon: 'chatbubble-outline' },
          { key: 'groups', label: 'Grupos', count: groupThreads.length, icon: 'people-outline' },
        ] as { key: Tab; label: string; count: number; icon: string }[]).map((tab) => {
          const active = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={[styles.tabBtn, active ? styles.tabBtnActive : null]}
              onPress={() => setActiveTab(tab.key)}
              android_ripple={{ color: 'rgba(255,255,255,0.08)' }}
            >
              <Ionicons
                name={tab.icon as any}
                size={16}
                color={active ? '#FFF' : 'rgba(255,255,255,0.75)'}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.tabText, active ? styles.tabTextActive : null]}>
                {tab.label}
              </Text>
              <View style={[styles.tabBadge, active ? styles.tabBadgeActive : null]}>
                <Text style={[styles.tabBadgeText, active ? styles.tabBadgeTextActive : null]}>
                  {tab.count}
                </Text>
              </View>
              {active ? <View style={styles.tabIndicator} /> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.searchWrapper}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color="#8696A0" style={{ marginRight: 8 }} />
          <TextInput
            placeholder={showAllContacts ? "Pesquisar contatos..." : "Pesquisar..."}
            placeholderTextColor="#8696A0"
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
          />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        {error ? (
          <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
        ) : null}

        {showAllContacts ? (
          <View style={{ paddingBottom: 40 }}>
            <View style={styles.sectionHeaderWA}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity onPress={() => setShowAllContacts(false)} style={{ marginRight: 10 }}>
                  <Ionicons name="arrow-back" size={20} color={WA_GREEN_DARK} />
                </TouchableOpacity>
                <View>
                  <Text style={styles.sectionTitleWA}>Contatos no Zora</Text>
                  <Text style={styles.sectionSubtitle}>{totalContacts} contatos • A-Z</Text>
                </View>
              </View>
            </View>

            {filteredAllContacts.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="people-outline" size={48} color="#C4CDD1" />
                <Text style={styles.emptyText}>Nenhum contato encontrado.</Text>
              </View>
            ) : (
              <SectionList
                sections={contactSections}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                stickySectionHeadersEnabled={false}
                renderSectionHeader={({ section: { title } }) => (
                  <View style={styles.alphaHeader}>
                    <Text style={styles.alphaHeaderText}>{title}</Text>
                  </View>
                )}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.contactItem}
                    onPress={() => handleOpenPrivateChat(item)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.avatar, { backgroundColor: pickColor(item.id) }]}>
                      <Text style={styles.avatarText}>{(item.nome_completo || 'C').charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.chatBody}>
                      <Text style={styles.contactName} numberOfLines={1}>{item.nome_completo}</Text>
                      <View style={styles.contactPhoneRow}>
                        <Ionicons name="call-outline" size={12} color="#667781" style={{ marginRight: 5 }} />
                        <Text style={styles.contactPhone}>{normalizePhone(item.telefone) || 'Sem número'}</Text>
                      </View>
                    </View>
                    <Ionicons name="chatbubble-outline" size={22} color={WA_GREEN} />
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        ) : (
          <>
            {!hasAnything && !error ? (
              <View style={styles.emptyBox}>
                <Ionicons name="chatbubbles-outline" size={56} color="#C4CDD1" />
                <Text style={styles.emptyBig}>Sem conversas ainda</Text>
                <Text style={styles.emptySub}>Toque no botão abaixo para iniciar uma conversa</Text>
              </View>
            ) : null}

            {showCombined ? (
              <>
                <View style={styles.sectionHeaderWA}>
                  <Text style={styles.sectionTitleWA}>Todas as conversas</Text>
                  <Text style={styles.sectionCount}>{allList.length}</Text>
                </View>
                {allList.length === 0 && hasAnything ? (
                  <Text style={styles.noMatchesText}>Sem correspondências para sua pesquisa.</Text>
                ) : null}
                {allList.map((item: any) => item.isGroup ? (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.chatItem}
                    onPress={() => openGroupChat(item)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.avatar, styles.avatarGroup, { backgroundColor: item.color }]}>
                      <Ionicons name="people" size={22} color="#FFF" />
                    </View>
                    <View style={styles.chatBody}>
                      <View style={styles.chatTopRow}>
                        <View style={styles.chatNameRow}>
                          <Text style={[styles.chatName, item.unread > 0 && styles.chatNameBold]} numberOfLines={1}>{item.name}</Text>
                          {item.verified ? (
                            <Ionicons name="shield-checkmark" size={14} color={WA_GREEN} style={{ marginLeft: 4 }} />
                          ) : null}
                        </View>
                        <Text style={[styles.chatTime, item.unread > 0 && styles.chatTimeUnread]}>{item.timestamp}</Text>
                      </View>
                      <View style={styles.chatPreviewRow}>
                        {item.isMine ? (
                          <Ionicons name="checkmark-done" size={14} color={WA_GREEN} style={{ marginRight: 4 }} />
                        ) : null}
                        <Text style={[styles.chatPreview, item.unread > 0 && styles.chatPreviewBold]} numberOfLines={1}>
                          {item.preview}
                        </Text>
                      </View>
                      <View style={styles.groupMetaRow}>
                        <View style={styles.memberChip}>
                          <Ionicons name="people-outline" size={11} color="#667781" />
                          <Text style={styles.memberChipText}>{(item.memberCount || 1) === 1 ? '+700 membros' : `${item.memberCount} membros`}</Text>
                        </View>
                        {!joinedThreads.includes(item.id) ? (
                          <View style={styles.joinChip}>
                            <Text style={styles.joinChipText}>Entrar</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    {item.unread > 0 ? (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>{item.unread > 99 ? '99+' : item.unread}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.chatItem}
                    onPress={() => openPrivateChat(item)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.avatar, { backgroundColor: pickColor(item.id) }]}>
                      <Text style={styles.avatarText}>{(item.nome_completo || 'C').charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.chatBody}>
                      <View style={styles.chatTopRow}>
                        <View style={styles.chatNameRow}>
                          <Text style={[styles.chatName, item.unread > 0 && styles.chatNameBold]} numberOfLines={1}>
                            {item.nome_completo}
                          </Text>
                        </View>
                        <Text style={[styles.chatTime, item.unread > 0 && styles.chatTimeUnread]}>{item.timestamp}</Text>
                      </View>
                      {item.telefone && item.telefone !== 'Sem número' ? (
                        <View style={styles.contactPhoneMiniRow}>
                          <Ionicons name="call-outline" size={11} color="#667781" style={{ marginRight: 4 }} />
                          <Text style={styles.contactPhoneMini} numberOfLines={1}>{item.telefone}</Text>
                        </View>
                      ) : null}
                      <View style={styles.chatPreviewRow}>
                        {item.isMine ? (
                          <Ionicons name="checkmark-done" size={14} color={WA_GREEN} style={{ marginRight: 4 }} />
                        ) : null}
                        <Text style={[styles.chatPreview, item.unread > 0 && styles.chatPreviewBold]} numberOfLines={1}>
                          {item.preview}
                        </Text>
                      </View>
                    </View>
                    {item.unread > 0 ? (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>{item.unread > 99 ? '99+' : item.unread}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </>
            ) : null}

            {showPrivate && !showCombined ? (
              <>
                <View style={styles.sectionHeaderWA}>
                  <Text style={styles.sectionTitleWA}>Conversas privadas</Text>
                  <Text style={styles.sectionCount}>{filteredPrivateChats.length}</Text>
                </View>
                {filteredPrivateChats.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Ionicons name="chatbubble-outline" size={40} color="#C4CDD1" />
                    <Text style={styles.emptySub}>Ainda não tem conversas privadas.</Text>
                  </View>
                ) : null}
                {filteredPrivateChats.map((chat) => (
                  <TouchableOpacity
                    key={chat.threadId}
                    style={styles.chatItem}
                    onPress={() => openPrivateChat(chat)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.avatar, { backgroundColor: pickColor(chat.threadId) }]}>
                      <Text style={styles.avatarText}>{(chat.nome_completo || 'C').charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.chatBody}>
                      <View style={styles.chatTopRow}>
                        <View style={styles.chatNameRow}>
                          <Text style={[styles.chatName, chat.unread > 0 && styles.chatNameBold]} numberOfLines={1}>
                            {chat.nome_completo}
                          </Text>
                        </View>
                        <Text style={[styles.chatTime, chat.unread > 0 && styles.chatTimeUnread]}>{chat.timestamp}</Text>
                      </View>
                      {chat.telefone && chat.telefone !== 'Sem número' ? (
                        <View style={styles.contactPhoneMiniRow}>
                          <Ionicons name="call-outline" size={11} color="#667781" style={{ marginRight: 4 }} />
                          <Text style={styles.contactPhoneMini} numberOfLines={1}>{chat.telefone}</Text>
                        </View>
                      ) : null}
                      <View style={styles.chatPreviewRow}>
                        {chat.isMine ? (
                          <Ionicons name="checkmark-done" size={14} color={WA_GREEN} style={{ marginRight: 4 }} />
                        ) : null}
                        <Text style={[styles.chatPreview, chat.unread > 0 && styles.chatPreviewBold]} numberOfLines={1}>
                          {chat.preview}
                        </Text>
                      </View>
                    </View>
                    {chat.unread > 0 ? (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>{chat.unread > 99 ? '99+' : chat.unread}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </>
            ) : null}

            {showGroup && !showCombined ? (
              <>
                <View style={styles.sectionHeaderWA}>
                  <Text style={styles.sectionTitleWA}>Grupos da comunidade</Text>
                  <Text style={styles.sectionCount}>{filteredGroups.length}</Text>
                </View>
                {filteredGroups.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Ionicons name="people-outline" size={40} color="#C4CDD1" />
                    <Text style={styles.emptySub}>Nenhum grupo disponível.</Text>
                  </View>
                ) : null}
                {filteredGroups.map((item) => {
                  const members = item.memberCount ?? memberCounts[item.id] ?? 1;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.chatItem}
                      onPress={() => openGroupChat({ ...item, memberCount: members })}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.avatar, styles.avatarGroup, { backgroundColor: item.color }]}>
                        <Ionicons name="people" size={22} color="#FFF" />
                      </View>
                      <View style={styles.chatBody}>
                        <View style={styles.chatTopRow}>
                          <View style={styles.chatNameRow}>
                            <Text style={[styles.chatName, item.unread > 0 && styles.chatNameBold]} numberOfLines={1}>{item.name}</Text>
                            {item.verified ? (
                              <Ionicons name="shield-checkmark" size={14} color={WA_GREEN} style={{ marginLeft: 4 }} />
                            ) : null}
                          </View>
                          <Text style={[styles.chatTime, item.unread > 0 && styles.chatTimeUnread]}>{item.timestamp}</Text>
                        </View>
                        <View style={styles.chatPreviewRow}>
                          {item.isMine ? (
                            <Ionicons name="checkmark-done" size={14} color={WA_GREEN} style={{ marginRight: 4 }} />
                          ) : null}
                          <Text style={[styles.chatPreview, item.unread > 0 && styles.chatPreviewBold]} numberOfLines={1}>
                            {item.preview}
                          </Text>
                        </View>
                        <View style={styles.groupMetaRow}>
                          <View style={styles.memberChip}>
                            <Ionicons name="people-outline" size={11} color="#667781" />
                            <Text style={styles.memberChipText}>{members === 1 ? '+700 membros' : `${members} membros`}</Text>
                          </View>
                          {!joinedThreads.includes(item.id) ? (
                            <View style={styles.joinChip}>
                              <Text style={styles.joinChipText}>Entrar</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      {item.unread > 0 ? (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadBadgeText}>{item.unread > 99 ? '99+' : item.unread}</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* FAB CANTO INFERIOR DIREITO (padrão WhatsApp) */}
      <View style={styles.fabContainer}>
        <TouchableOpacity
          style={styles.fab}
          onPress={() => { setSearch(''); setShowAllContacts(true); }}
          activeOpacity={0.8}
        >
          <Ionicons name="chatbubble-outline" size={26} color="#FFF" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  content: { paddingBottom: 200 },

  header: {
    backgroundColor: WA_GREEN_DARK,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleRow: { flex: 1 },
  headerTitle: { color: '#FFF', fontSize: 22, fontWeight: '800', letterSpacing: 0.2 },

  // ======== TABS WHATSAPP ========
  tabsHeader: {
    backgroundColor: WA_GREEN_DARK,
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 0,
    position: 'relative',
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 0,
    position: 'relative',
    overflow: 'hidden',
    marginHorizontal: 2,
  },
  tabBtnActive: { backgroundColor: 'transparent' },
  tabText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '700',
  },
  tabTextActive: { color: '#FFF', fontWeight: '800' },
  tabBadge: {
    marginLeft: 8,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeActive: { backgroundColor: '#FFF' },
  tabBadgeText: { color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: '800' },
  tabBadgeTextActive: { color: WA_GREEN_DARK },
  tabIndicator: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 0,
    height: 3,
    backgroundColor: '#FFF',
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },

  searchWrapper: { backgroundColor: WA_GREEN_DARK, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 18 },
  searchBox: {
    backgroundColor: '#FFF',
    borderRadius: 26,
    paddingHorizontal: 16,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111B21', padding: 0 },

  sectionHeaderWA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionTitleWA: { color: WA_GREEN_DARK, fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionSubtitle: { color: '#8696A0', fontSize: 12, fontWeight: '500', marginTop: 1 },
  sectionCount: { color: '#8696A0', fontSize: 12, fontWeight: '700' },

  alphaHeader: {
    backgroundColor: '#F0F2F5',
    paddingHorizontal: 18,
    paddingVertical: 8,
    marginTop: 4,
  },
  alphaHeaderText: {
    color: WA_GREEN_DARK,
    fontSize: 13,
    fontWeight: '800',
  },

  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFF',
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarGroup: { borderRadius: 22 },
  avatarText: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  chatBody: { flex: 1, justifyContent: 'center' },
  chatTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  chatNameRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  chatName: { fontSize: 16, color: '#111B21', fontWeight: '500' },
  contactName: { fontSize: 16, color: '#111B21', fontWeight: '600' },
  contactPhoneRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  contactPhone: { color: '#667781', fontSize: 13 },
  chatNameBold: { fontWeight: '800' },
  chatTime: { fontSize: 12, color: '#667781' },
  chatTimeUnread: { color: WA_GREEN, fontWeight: '700' },
  chatPreviewRow: { flexDirection: 'row', alignItems: 'center' },
  groupMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 7 },
  chatPreview: { fontSize: 14, color: '#667781', flex: 1 },
  chatPreviewBold: { color: '#111B21', fontWeight: '600' },
  contactPhoneMiniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 2,
  },
  contactPhoneMini: { color: '#8696A0', fontSize: 12, fontWeight: '500' },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F2F5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  memberChipText: { color: '#667781', fontSize: 11, fontWeight: '600', marginLeft: 4 },

  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: WA_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginTop: 4,
  },
  unreadBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  joinChip: {
    backgroundColor: WA_GREEN,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  joinChipText: { color: '#FFF', fontSize: 11, fontWeight: '800' },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  loadingText: { color: '#667781', marginTop: 14, fontSize: 14 },
  errorBox: { marginHorizontal: 16, marginTop: 16, padding: 14, borderRadius: 12, backgroundColor: '#FEE2E2' },
  errorText: { color: '#B91C1C', fontSize: 13, textAlign: 'center' },
  emptyBox: { paddingVertical: 60, paddingHorizontal: 40, alignItems: 'center' },
  emptyBig: { color: '#111B21', fontSize: 18, fontWeight: '700', marginTop: 16, textAlign: 'center' },
  emptySub: { color: '#667781', fontSize: 13, marginTop: 6, textAlign: 'center' },
  emptyText: { color: '#667781', fontSize: 13, marginTop: 14, textAlign: 'center' },
  noMatchesText: { color: '#8696A0', fontSize: 12, textAlign: 'center', paddingVertical: 20 },

  // FAB CANTO INFERIOR DIREITO
  fabContainer: {
    position: 'absolute',
    right: 20,
    bottom: 140,
    zIndex: 50,
    pointerEvents: 'auto',
  },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: WA_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow({
      color: WA_GREEN_DARK,
      offset: { width: 0, height: 8 },
      opacity: 0.45,
      radius: 14,
      elevation: 12,
    }),
  },
});
