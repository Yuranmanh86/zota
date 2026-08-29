import React, { useEffect, useRef, useState } from 'react';
import { Image, RefreshControl, View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Share, Alert, Keyboard } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { getUserProfile } from '../services/auth';
import { backend } from '../services/backendClient';
import { sendChatMessage, ensureThreadMembership, getChatMessagesPage, getOrCreatePrivateChat } from '../services/chat';
import { shadow } from '../theme/appTheme';

const WA_GREEN = '#25D366';
const WA_GREEN_DARK = '#128C7E';
const WA_BG = '#ECE5DD';
const WA_BUBBLE_ME = '#D9FDD3';
const WA_BUBBLE_OTHER = '#FFFFFF';
const WA_CHECK_BLUE = '#53BDEB';
const POPULAR_EMOJIS = ['😂', '❤️', '🤣', '👍', '😭', '🙏', '😘', '🥰', '😊', '🎉', '🔥', '😍', '👏', '😁', '😢'];

const SENDER_COLORS = ['#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#2196F3', '#009688', '#795548', '#FF5722', '#FF9800', '#607D8B'];
function senderColor(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return SENDER_COLORS[h % SENDER_COLORS.length];
}

const avatarColors = ['#FF6B6B', '#4ECDC4', '#FFD93D', '#6BCB77', '#4D96FF', '#FF9F43', '#A66CFF', '#25D366', '#FF7A00', '#E1306C', '#E53935', '#43A047', '#1E88E5', '#8E24AA', '#F4511E', '#00ACC1'];
function pickColor(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return avatarColors[h % avatarColors.length];
}
function initialsOf(name: string): string {
  if (!name) return 'Z';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return name.charAt(0).toUpperCase() || 'Z';
  const first = parts[0].charAt(0).toUpperCase();
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0).toUpperCase() : '';
  return (first + last).slice(0, 2);
}

type RouteParams = {
  threadId: string;
  recipient: string;
  verified?: boolean;
  isPrivate?: boolean;
  isGroup?: boolean;
  contactPhone?: string;
  memberCount?: number;
};

type ChatMessage = {
  id: string;
  owner: 'me' | 'other';
  type: 'text' | 'photo';
  text?: string;
  uri?: string;
  time: string;
  fullCreatedAt: string;
  senderName?: string;
  senderColor?: string;
  senderProfileId?: string;
  senderPhone?: string;
  status: 'sent' | 'delivered' | 'read' | 'sending';
};

type ReplyState = {
  messageId: string;
  senderName: string;
  preview: string;
  isMine: boolean;
} | null;

function formatMessageTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-MZ', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function shouldShowDateSeparator(prev?: string, cur?: string) {
  if (!cur) return true;
  if (!prev) return true;
  const p = new Date(prev);
  const c = new Date(cur);
  return p.toDateString() !== c.toDateString();
}

function formatDateSeparator(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.toDateString());
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const dDay = new Date(d.toDateString());
  if (dDay.getTime() === today.getTime()) return 'Hoje';
  if (dDay.getTime() === yesterday.getTime()) return 'Ontem';
  const diff = Math.floor((today.getTime() - dDay.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 7) {
    const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    return dias[d.getDay()];
  }
  return d.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
}

const generateGroupLink = (threadId: string) => {
  return `zora://chat/${encodeURIComponent(threadId)}`;
};

function formatPhoneRaw(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 9) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  if (digits.length === 12) return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  return phone || '';
}

function resolveSenderIdentity(profile: any): { name: string; phone: string } {
  if (!profile) return { name: 'Zora', phone: '' };
  const rawName = String(profile.full_name || profile.nome_completo || '').trim();
  const rawPhone = String(profile.phone_number || profile.telefone || '').trim();
  const digits = rawPhone.replace(/\D/g, '');
  const phone = formatPhoneRaw(rawPhone);
  const isNameGeneric =
    !rawName ||
    /^(contacto|contactos|contato|contatos|usuário|usuario|user|users|cliente|clientes|anonymous|anonimo|convidado|guest)$/i.test(rawName) ||
    rawName.length < 2 ||
    /^\d+$/.test(rawName);
  let finalName = rawName;
  if (isNameGeneric) {
    if (digits.length >= 8) {
      const last = digits.slice(-9);
      finalName = last.length === 9 ? `${last.slice(0,3)} ${last.slice(3,6)} ${last.slice(6)}` : digits;
    } else {
      finalName = 'Zora';
    }
  }
  return { name: finalName, phone };
}

async function loadSenderProfiles(senderIds: string[]): Promise<any[]> {
  if (senderIds.length === 0) return [];
  const currentQuery = await backend
    .from('user_profiles')
    .select('id,full_name,phone_number')
    .in('id', senderIds);
  if (!currentQuery.error) return currentQuery.data || [];

  const legacyQuery = await backend
    .from('user_profiles')
    .select('id,nome_completo,telefone')
    .in('id', senderIds);
  return legacyQuery.error ? [] : legacyQuery.data || [];
}

export function ChatDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const params = route.params as RouteParams;
  const recipient = params?.recipient || 'Contato';
  const verified = params?.verified ?? false;
  const isGroup = params?.isGroup ?? false;
  const threadId = params?.threadId;
  const contactPhone = params?.contactPhone;
  const initialMemberCount = params?.memberCount;
  const insets = useSafeAreaInsets();

  const PAGE_SIZE = 5;
  const OLDER_PAGE_SIZE = 20;
  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [senderMap, setSenderMap] = useState<Record<string, { name: string; color: string; phone: string }>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalMessages, setTotalMessages] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [memberCount, setMemberCount] = useState<number>(initialMemberCount || 0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [reply, setReply] = useState<ReplyState>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sessionCached, setSessionCached] = useState<{ authUserId: string; profileId: string } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const lastMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    const kShow = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    });
    const kHide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => {
      kShow.remove();
      kHide.remove();
    };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadMessages(true);
    setRefreshing(false);
  };

  const getOrLoadSession = async () => {
    if (sessionCached) return sessionCached;
    const { data: { session } } = await backend.auth.getSession();
    const authUserId = session?.user?.id ?? null;
    if (!authUserId) throw new Error('Usuário não autenticado');
    const currentProfile = await getUserProfile(authUserId);
    const currentProfileId = currentProfile?.id ?? null;
    if (!currentProfileId) throw new Error('Perfil não encontrado');
    const cached = { authUserId, profileId: currentProfileId };
    setSessionCached(cached);
    setProfileId(currentProfileId);
    return cached;
  };

  const loadSenderNamesFast = async (
    rows: any[],
    existingMap: Record<string, { name: string; color: string; phone: string }>
  ) => {
    const uniqueSenderIds = Array.from(new Set(
      rows
        .map((m: any) => String(m.sender_profile_id))
        .filter(Boolean)
        .filter((id) => !existingMap[id] || existingMap[id].name === 'A carregar...')
    ));
    if (uniqueSenderIds.length === 0) return existingMap;
    try {
      const profilesRows = await loadSenderProfiles(uniqueSenderIds);
      const newMap = { ...existingMap };
      (profilesRows || []).forEach((p: any) => {
        const identity = resolveSenderIdentity(p);
        newMap[String(p.id)] = {
          name: identity.name,
          color: senderColor(String(p.id)),
          phone: identity.phone,
        };
      });
      return newMap;
    } catch {
      return existingMap;
    }
  };

  const mapMessagesToChat = (
    rows: any[],
    currentProfileId: string,
    sMap: Record<string, { name: string; color: string; phone: string }>
  ): ChatMessage[] => {
    return rows.map((item: any) => {
      const isMine = item.sender_profile_id === currentProfileId;
      const senderId = String(item.sender_profile_id || '');
      const s = sMap[senderId];
      return {
        id: item.id,
        owner: isMine ? 'me' : 'other',
        type: item.type === 'text' ? 'text' : item.attachment_url ? 'photo' : 'text',
        text: item.type === 'text' ? item.content : undefined,
        uri: item.attachment_url ?? undefined,
        time: formatMessageTime(item.created_at || new Date().toISOString()),
        fullCreatedAt: item.created_at || new Date().toISOString(),
        senderName: isGroup && !isMine ? s?.name || 'A carregar...' : undefined,
        senderColor: isGroup ? s?.color || senderColor(senderId) : undefined,
        senderProfileId: senderId,
        senderPhone: isGroup ? s?.phone || '' : undefined,
        status: isMine ? 'delivered' : 'read',
      };
    });
  };

  const loadMessages = async (reset = true) => {
    if (reset) setLoadingMessages(true);
    setError(null);
    try {
      if (!threadId) { setError('Conversa inválida'); return; }

      const sess = await getOrLoadSession();
      const currentProfileId = sess.profileId;

      await ensureThreadMembership(threadId, currentProfileId).catch(() => {});

      const pageSize = reset ? PAGE_SIZE : OLDER_PAGE_SIZE;
      const skipCount = reset ? 0 : messages.length;

      // ===== FAST PATH: Busca mensagens PRIMEIRO, o resto em background =====
      const messagesRes: any = await backend
        .from('chat_messages')
        .select('id,type,content,attachment_url,sender_profile_id,created_at')
        .eq('chat_thread_id', threadId)
        .order('created_at', { ascending: false })
        .range(reset ? 0 : skipCount, reset ? pageSize - 1 : skipCount + pageSize - 1);

      const messageRowsRaw = messagesRes?.data;
      const messageError = messagesRes?.error;

      if (messageError) { setError(String(messageError?.message || messageError)); return; }

      const messageRows = (messageRowsRaw || []).slice().reverse();

      if (messageRows.length > 0 && reset) {
        lastMessageIdRef.current = messageRows[messageRows.length - 1]?.id ?? null;
      }

      // ===== Mostra mensagens RÁPIDO sem esperar por nomes =====
      let workingSenderMap = { ...senderMap };
      messageRows.forEach((m: any) => {
        const sid = String(m.sender_profile_id || '');
        if (!workingSenderMap[sid] && sid) {
          workingSenderMap[sid] = { name: sid === currentProfileId ? 'Você' : 'A carregar...', color: senderColor(sid), phone: '' };
        }
      });

      const loaded = mapMessagesToChat(messageRows, currentProfileId, workingSenderMap);

      const currentLoadedCount = reset ? loaded.length : loaded.length + messages.length;
      if (reset) {
        setMessages(loaded);
      } else {
        setMessages((prev) => [...loaded, ...prev]);
      }
      setHasMore(loaded.length === pageSize && (totalMessages === 0 || currentLoadedCount < totalMessages));
      if (reset) setLoadingMessages(false);
      else setLoadingOlder(false);

      // ===== BACKGROUND: Carrega nomes, contagem, total =====
      setTimeout(async () => {
        try {
          const totalWrapped = (async () => { try { return await backend.from('chat_messages').select('id', { count: 'exact', head: true }).eq('chat_thread_id', threadId); } catch { return null; } })();
          const [sm, memberRes, totalRes] = await Promise.all([
            loadSenderNamesFast(messageRows, workingSenderMap),
            isGroup
              ? backend.from('chat_thread_members').select('chat_thread_id').eq('chat_thread_id', threadId)
              : Promise.resolve(null),
            totalWrapped,
          ]);

          setSenderMap(sm);

          if (memberRes && !(memberRes as any)?.error) {
            setMemberCount(((memberRes as any)?.data || []).length);
          }

          if ((totalRes as any)?.count != null) {
            const count = (totalRes as any).count;
            setTotalMessages(count);
            const currentLoaded = reset ? messageRows.length : messageRows.length + messages.length;
            setHasMore(currentLoaded < count);
          }

          if (!reset) return;

          setMessages((cur) => cur.map((m) => {
            const sid = m.senderProfileId || '';
            const s = sm[sid];
            if (!s || !isGroup) return m;
            return { ...m, senderName: m.owner === 'me' ? undefined : s.name, senderColor: s.color, senderPhone: m.owner === 'me' ? undefined : s.phone };
          }));
        } catch {}
      }, 0);
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar mensagens');
      setLoadingMessages(false);
      setLoadingOlder(false);
    }
  };

  const loadOlderMessages = async () => {
    if (loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    await loadMessages(false);
  };

  const handleSenderPress = async (senderProfileId: string, senderName: string, senderPhone: string) => {
    if (!senderProfileId) return;
    const title = senderName || 'Zora';
    const subtitle = senderPhone ? `${senderPhone}` : 'Sem contacto';
    const meProfileId = profileId;
    if (senderProfileId === meProfileId) {
      Alert.alert('O teu perfil', subtitle);
      return;
    }

    const buttons = [
      {
        text: 'Mensagem privada',
        onPress: async () => {
          if (!meProfileId || !senderProfileId) {
            Alert.alert('Erro', 'Não foi possível abrir a conversa privada.');
            return;
          }
          try {
            const res = await getOrCreatePrivateChat(meProfileId, senderProfileId);
            const threadIdResult = res?.data as any;
            if (!threadIdResult) {
              Alert.alert('Erro', 'Não foi possível abrir a conversa privada.');
              return;
            }
            let otherName = senderName || 'Contato';
            let otherPhone = senderPhone || '';
            try {
              const pRes: any = await backend
                .from('user_profiles')
                .select('full_name,phone_number')
                .eq('id', senderProfileId)
                .maybeSingle();
              if (pRes?.data) {
                const ident = resolveSenderIdentity(pRes.data);
                otherName = ident.name;
                otherPhone = ident.phone;
              }
            } catch {}

            navigation.navigate('ChatDetail', {
              recipient: otherName,
              contactPhone: otherPhone,
              threadId: threadIdResult.id ?? threadIdResult,
              isGroup: false,
              verified: false,
              memberCount: 2,
            } as never);
          } catch (err: any) {
            Alert.alert('Erro', 'Não foi possível abrir a conversa privada.');
          }
        },
      },
      { text: 'Fechar', style: 'cancel' as const },
    ];

    if (Platform.OS === 'ios') {
      (buttons[0] as any).icon = 'chatbubbles';
    }

    Alert.alert(title, subtitle, buttons);
  };

  const handleReply = (msg: ChatMessage) => {
    const sender = msg.owner === 'me' ? 'Você' : (msg.senderName || recipient);
    const preview = msg.type === 'photo' ? '📷 Foto' : (msg.text || 'Mensagem');
    setReply({
      messageId: msg.id,
      senderName: sender,
      preview: preview.length > 60 ? preview.slice(0, 60) + '…' : preview,
      isMine: msg.owner === 'me',
    });
    setSelectedId(msg.id);
    setTimeout(() => { setSelectedId(null); inputRef.current?.focus(); }, 250);
  };

  const handleMessageAction = (msg: ChatMessage) => {
    const sender = msg.owner === 'me' ? 'Enviada por você' : (msg.senderName || `De: ${recipient}`);
    const isMe = msg.owner === 'me';
    Alert.alert(
      'Opções da mensagem',
      sender,
      [
        {
          text: 'Responder',
          onPress: () => handleReply(msg),
          ...(Platform.OS === 'ios' ? { icon: 'arrowshape.turn.up.left' as const } : {}),
        },
        {
          text: isMe ? 'Editar' : 'Copiar',
          onPress: () => {
            if (msg.type === 'text' && msg.text) {
            }
          },
        },
        { text: 'Fechar', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  const clearReply = () => { setReply(null); setSelectedId(null); };

  useEffect(() => {
    (async () => {
      try { await ImagePicker.requestMediaLibraryPermissionsAsync(); } catch {}
      try { await ImagePicker.requestCameraPermissionsAsync(); } catch {}
    })();
  }, []);

  useEffect(() => {
    loadMessages();
  }, [route.params]);

  const lastCreatedAtRef = useRef<string | null>(null);
  useEffect(() => {
    if (messages.length > 0) {
      const last = messages[messages.length - 1];
      lastCreatedAtRef.current = last.fullCreatedAt;
    }
  }, [messages.length]);

  // ========= REALTIME REFORÇADO (2 camadas) =========
  useEffect(() => {
    if (!threadId) return;
    if (!profileId) return;
    let pollingInterval: ReturnType<typeof setInterval> | null = null;
    let messageChannel: any = null;
    let isMounted = true;

    const processNewRows = (rows: any[], cpid: string) => {
      if (!rows.length) return;
      const reversed = rows.slice().reverse();
      setMessages((cur) => {
        const existingIds = new Set(cur.map((m) => m.id));
        const newOnes: ChatMessage[] = [];
        let newSenderMap: Record<string, { name: string; color: string; phone: string }> | null = null;

        reversed.forEach((row: any) => {
          if (!existingIds.has(row.id)) {
            const isMine = row.sender_profile_id === cpid;
            const senderId = String(row.sender_profile_id || '');
            let s = senderMap[senderId];
            if (!s && senderId) {
              if (!newSenderMap) newSenderMap = {};
              if (!newSenderMap[senderId]) {
                newSenderMap[senderId] = { name: senderId === cpid ? 'Você' : 'A carregar...', color: senderColor(senderId), phone: '' };
              }
              s = newSenderMap[senderId];
            }
            newOnes.push({
              id: row.id,
              owner: isMine ? 'me' : 'other',
              type: row.type === 'text' ? 'text' : row.attachment_url ? 'photo' : 'text',
              text: row.type === 'text' ? row.content : undefined,
              uri: row.attachment_url ?? undefined,
              time: formatMessageTime(row.created_at || new Date().toISOString()),
              fullCreatedAt: row.created_at || new Date().toISOString(),
              senderName: isGroup && !isMine ? s?.name || 'A carregar...' : undefined,
              senderColor: isGroup ? s?.color || senderColor(senderId) : undefined,
              senderProfileId: senderId,
              senderPhone: isGroup && !isMine ? s?.phone || '' : undefined,
              status: isMine ? 'delivered' : 'read',
            });
            if (row.sender_profile_id !== cpid) {
              setIsTyping(true);
              setTimeout(() => setIsTyping(false), 2500);
            }
          }
        });

        if (newSenderMap) {
          setSenderMap((prev) => ({ ...prev, ...newSenderMap! }));
          const idsToLoad = Object.keys(newSenderMap).filter((id) => !senderMap[id]);
          if (idsToLoad.length > 0) {
            setTimeout(async () => {
              try {
                const profilesRows = await loadSenderProfiles(idsToLoad);
                const updates: Record<string, { name: string; color: string; phone: string }> = {};
                (profilesRows || []).forEach((p: any) => {
                  const identity = resolveSenderIdentity(p);
                  updates[String(p.id)] = {
                    name: identity.name,
                    color: senderColor(String(p.id)),
                    phone: identity.phone,
                  };
                });
                if (Object.keys(updates).length > 0) {
                  setSenderMap((prev) => ({ ...prev, ...updates }));
                  setMessages((mcur) => mcur.map((m) => {
                    const u = updates[m.senderProfileId || ''];
                    if (!u || !isGroup) return m;
                    return { ...m, senderName: m.owner === 'me' ? undefined : u.name, senderColor: u.color, senderPhone: m.owner === 'me' ? undefined : u.phone };
                  }));
                }
              } catch {}
            }, 0);
          }
        }

        if (newOnes.length === 0) return cur;
        return [...cur, ...newOnes];
      });
    };

    const doPollFast = async () => {
      try {
        const sess = await getOrLoadSession();
        const cpid = sess.profileId;
        const query = backend
          .from('chat_messages')
          .select('id,type,content,attachment_url,sender_profile_id,created_at')
          .eq('chat_thread_id', threadId)
          .order('created_at', { ascending: false });
        const lastCA = lastCreatedAtRef.current;
        if (lastCA) {
          query.gt('created_at', lastCA).limit(20);
        } else {
          query.limit(5);
        }
        const res: any = await query;
        if (!res?.error && isMounted) {
          processNewRows(res?.data || [], cpid);
        }
      } catch {}
    };

    const channelTopic = `chat_detail_v2:${threadId}`;

    try {
      const existing = (backend as any).getChannels?.().find((c: any) => c.topic === channelTopic);
      if (existing) {
        try { existing.unsubscribe(); backend.removeChannel(existing); } catch {}
      }
    } catch {}

    try {
      messageChannel = backend.channel(channelTopic);
      messageChannel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `chat_thread_id=eq.${threadId}`,
        },
        (payload: any) => {
          const newMsg = payload?.new;
          if (!newMsg || !profileId) return;
          processNewRows([newMsg], profileId);
        }
      );
      messageChannel.subscribe();
    } catch (e) {
      // ignora erro do realtime, usa só polling
    }

    setTimeout(() => {
      if (!pollingInterval && isMounted) {
        pollingInterval = setInterval(doPollFast, 4000);
      }
    }, 2500);

    return () => {
      isMounted = false;
      try {
        if (messageChannel) {
          try { messageChannel.unsubscribe(); } catch {}
          try { backend.removeChannel(messageChannel); } catch {}
        }
      } catch {}
      if (pollingInterval) clearInterval(pollingInterval);
    };
  }, [threadId, profileId, isGroup]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [messages]);

  const handleShareGroupLink = async () => {
    try {
      const link = generateGroupLink(threadId);
      const message = `🎟️ Convite para o grupo "${recipient}" no Zora!\n\nAceda a: ${link}\n\n${memberCount > 0 ? `Já somos ${memberCount} membros.` : ''} Não perca!`;
      const shareResult = await Share.share({
        message,
        title: `Convite: ${recipient}`,
        url: link,
      });
      if (shareResult.action === Share.sharedAction) {
        // partilhado com sucesso
      }
    } catch {
      Alert.alert('Não foi possível partilhar');
    }
  };

  const handleSendText = async () => {
    const trimmedText = messageText.trim();
    if (!threadId || !profileId) { setError('Não foi possível enviar'); return; }
    if (!trimmedText) return;

    const replyForSend = reply;
    const contentWithReply = replyForSend
      ? `> ${replyForSend.senderName}: ${replyForSend.preview}\n\n${trimmedText}`
      : trimmedText;

    if (trimmedText || replyForSend) {
      const tempId = `tmp-${Date.now()}`;
      const tempCreatedAt = new Date().toISOString();
      const displayText = trimmedText || (replyForSend ? 'Resposta rápida' : '');
      const tempMsg: ChatMessage = {
        id: tempId,
        owner: 'me',
        type: 'text',
        text: displayText,
        time: formatMessageTime(tempCreatedAt),
        fullCreatedAt: tempCreatedAt,
        status: 'sending',
      };
      setMessages((prev) => [...prev, tempMsg]);
      setMessageText('');
      clearReply();

      const res = await sendChatMessage(threadId, profileId, contentWithReply || trimmedText, 'text');
      if (res.error) {
        setError(res.error);
        setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, status: 'sent' } : m));
      } else if (res.data) {
        const inserted = res.data as any;
        setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== tempId);
          if (filtered.some((m) => m.id === inserted.id)) return filtered;
          return [...filtered, {
            id: inserted.id,
            owner: 'me',
            type: 'text',
            text: inserted.content,
            time: formatMessageTime(inserted.created_at || tempCreatedAt),
            fullCreatedAt: inserted.created_at || tempCreatedAt,
            status: 'delivered',
          }];
        });
      }
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 20);
    }
  };

  const handlePickGallery = async () => {
    setShowAttach(false);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });
    if (!result.canceled && result.assets.length > 0 && profileId && threadId) {
      const tempId = `tmp-photo-${Date.now()}`;
      const createdAt = new Date().toISOString();
      setMessages((prev) => [...prev, {
        id: tempId,
        owner: 'me',
        type: 'photo',
        uri: result.assets[0].uri,
        time: formatMessageTime(createdAt),
        fullCreatedAt: createdAt,
        status: 'sent',
      }]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 20);
    }
  };

  const handleOpenCamera = async () => {
    setShowAttach(false);
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });
    if (!result.canceled && result.assets.length > 0 && profileId && threadId) {
      const tempId = `tmp-photo-${Date.now()}`;
      const createdAt = new Date().toISOString();
      setMessages((prev) => [...prev, {
        id: tempId,
        owner: 'me',
        type: 'photo',
        uri: result.assets[0].uri,
        time: formatMessageTime(createdAt),
        fullCreatedAt: createdAt,
        status: 'sent',
      }]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 20);
    }
  };


  const renderStatusIcon = (status: ChatMessage['status']) => {
    if (status === 'sending') return <Ionicons name="time-outline" size={15} color="#667781" />;
    if (status === 'sent') return <Ionicons name="checkmark" size={15} color="#54656F" />;
    if (status === 'delivered') return <Ionicons name="checkmark-done" size={15} color="#54656F" />;
    return <Ionicons name="checkmark-done" size={15} color={WA_CHECK_BLUE} />;
  };

  const [headerTyping, setHeaderTyping] = useState(false);
  useEffect(() => {
    let t: any;
    if (isTyping) {
      setHeaderTyping(true);
      t = setTimeout(() => setHeaderTyping(false), 2500);
    } else {
      setHeaderTyping(false);
    }
    return () => clearTimeout(t);
  }, [isTyping]);

  const sendDisabled = !messageText.trim();

  const handleEmojiPress = (emoji: string) => {
    setMessageText((current) => `${current}${emoji}`);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  const kbVerticalOffset = Platform.OS === 'ios' ? 88 : 0;
  const composerBottomPad = Platform.OS === 'android'
    ? Math.max(12, insets.bottom + (keyboardHeight > 0 ? 8 : 20))
    : Math.max(12, keyboardHeight > 0 ? 8 : insets.bottom + 16);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.wrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={kbVerticalOffset}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.headerUser} activeOpacity={0.7}>
            <View style={[styles.headerAvatar, { backgroundColor: pickColor(recipient + (threadId || '')) }]}>
              {isGroup ? (
                <Ionicons name="people" size={20} color="#FFF" />
              ) : (
                <Text style={styles.headerAvatarText}>{recipient.charAt(0).toUpperCase()}</Text>
              )}
            </View>
            <View style={styles.headerText}>
              <View style={styles.headerNameRow}>
                <Text style={styles.headerName} numberOfLines={1}>{recipient}</Text>
                {verified ? <Ionicons name="shield-checkmark" size={14} color="#FFF" style={{ marginLeft: 4 }} /> : null}
              </View>
              <Text style={styles.headerStatus} numberOfLines={1}>
                {headerTyping
                  ? 'a escrever...'
                  : isGroup
                    ? memberCount > 0 ? memberCount === 1 ? '+700 membros' : `${memberCount} membros` : 'Grupo do Zora'
                    : contactPhone ? contactPhone : 'online'}
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.headerIcons}>
            {isGroup ? (
              <TouchableOpacity style={styles.headerIconBtn} onPress={handleShareGroupLink} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="share-social-outline" size={22} color="#FFF" />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.headerIconBtn}>
              <Ionicons name="search" size={20} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn}>
              <Ionicons name="ellipsis-vertical" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>

        {error ? (
          <View style={styles.errorBar}><Text style={styles.errorBarText}>{error}</Text></View>
        ) : null}

        <View style={styles.chatArea}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[
              styles.messagesContainer,
              { paddingBottom: 120 + composerBottomPad + (keyboardHeight > 0 ? 8 : 0) }
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={WA_GREEN} colors={[WA_GREEN]} />}
          >
            {!loadingMessages && messages.length > 0 && hasMore ? (
              <View style={styles.loadOlderWrap}>
                {loadingOlder ? (
                  <View style={styles.loadOlderBtn}>
                    <ActivityIndicator size="small" color={WA_GREEN} />
                    <Text style={[styles.loadOlderText, { marginLeft: 8 }]}>A carregar mensagens anteriores...</Text>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.loadOlderBtn} onPress={loadOlderMessages} activeOpacity={0.7}>
                    <Ionicons name="cloud-download-outline" size={16} color={WA_GREEN} />
                    <Text style={styles.loadOlderText}>
                      {totalMessages > messages.length
                        ? `Ver mais ${Math.min(PAGE_SIZE, totalMessages - messages.length)} mensagens (${messages.length} de ${totalMessages})`
                        : 'Ver mensagens anteriores'}
                    </Text>
                    <Ionicons name="chevron-up" size={16} color={WA_GREEN} />
                  </TouchableOpacity>
                )}
              </View>
            ) : null}

            {loadingMessages ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color={WA_GREEN} />
                <Text style={styles.loadingLabel}>A abrir conversa...</Text>
              </View>
            ) : messages.length === 0 ? (
              <View style={styles.beginBox}>
                <View style={styles.beginCard}>
                  <Ionicons name="lock-closed" size={14} color="#8696A0" />
                  <Text style={styles.beginText}>As mensagens são cifradas de ponta a ponta.</Text>
                </View>
                <Text style={styles.beginHint}>Envie a primeira mensagem para {recipient}</Text>
              </View>
            ) : (
              messages.map((item, idx) => {
                const prevItem = idx > 0 ? messages[idx - 1] : undefined;
                const isMine = item.owner === 'me';
                const showDate = shouldShowDateSeparator(prevItem?.fullCreatedAt, item.fullCreatedAt);
                const prevIsMine = prevItem?.owner === 'me';
                const isConsecutiveSameSender = prevItem && prevIsMine === isMine && !showDate;
                const isSelected = selectedId === item.id;

                return (
                  <View key={item.id}>
                    {showDate ? (
                      <View style={styles.dateSeparatorWrap}>
                        <View style={styles.dateSeparator}>
                          <Text style={styles.dateSeparatorText}>{formatDateSeparator(item.fullCreatedAt)}</Text>
                        </View>
                      </View>
                    ) : null}
                    <View
                      style={[
                        styles.messageRow,
                        isMine ? styles.messageRowRight : styles.messageRowLeft,
                        isConsecutiveSameSender ? styles.messageRowCompact : null,
                      ]}
                    >
                      <View style={[styles.bubbleContainer, isGroup && !isMine ? { marginLeft: 8 } : null]}>
                        <TouchableOpacity
                          style={[
                            styles.bubble,
                            isMine ? styles.bubbleMe : styles.bubbleOther,
                            !isConsecutiveSameSender && isMine ? styles.bubbleMeTailed : null,
                            !isConsecutiveSameSender && !isMine ? styles.bubbleOtherTailed : null,
                            item.type === 'photo' ? styles.bubblePhoto : null,
                            isSelected ? styles.bubbleSelected : null,
                          ]}
                          activeOpacity={0.85}
                          delayLongPress={250}
                          onPress={() => handleReply(item)}
                          onLongPress={() => handleMessageAction(item)}
                        >
                          {isGroup && !isMine && item.senderName ? (
                            <View style={styles.senderHeader}>
                              <Text style={[styles.senderLabel, { color: item.senderColor || WA_GREEN_DARK }]} numberOfLines={1}>
                                {item.senderName}
                              </Text>
                              {item.senderPhone ? (
                                <Text style={styles.senderPhoneLabel} numberOfLines={1}>
                                  {item.senderPhone}
                                </Text>
                              ) : null}
                            </View>
                          ) : null}
                          {item.type === 'photo' ? (
                            <View>
                              <Image source={{ uri: item.uri }} style={styles.photoBubble} />
                              <View style={[styles.metaRow, styles.photoMeta]}>
                                <Text style={[styles.msgTime, isMine ? styles.msgTimeMe : styles.msgTimeOther]}>{item.time}</Text>
                                {isMine ? <View style={styles.statusIconWrap}>{renderStatusIcon(item.status)}</View> : null}
                              </View>
                            </View>
                          ) : (
                            <View style={styles.textBubbleInner}>
                              <Text style={[styles.messageText, isMine ? styles.messageTextMe : styles.messageTextOther]}>
                                {item.text || 'Mensagem'}
                              </Text>
                              <View style={styles.metaRow}>
                                <Text style={[styles.msgTime, isMine ? styles.msgTimeMe : styles.msgTimeOther]}>{item.time}</Text>
                                {isMine ? <View style={styles.statusIconWrap}>{renderStatusIcon(item.status)}</View> : null}
                              </View>
                            </View>
                          )}
                        </TouchableOpacity>
                        {!isConsecutiveSameSender ? (
                          <View style={[
                            styles.tailShadow,
                            isMine ? styles.tailShadowMe : styles.tailShadowOther,
                          ]} />
                        ) : null}
                      </View>
                    </View>
                  </View>
                );
              })
            )}

            {headerTyping && !loadingMessages ? (
              <View style={[styles.messageRow, styles.messageRowLeft]}>
                <View style={[styles.bubble, styles.bubbleOther, styles.bubbleOtherTailed, styles.typingBubble]}>
                  <View style={styles.typingDots}>
                    <View style={[styles.typingDot, styles.typingDot1]} />
                    <View style={[styles.typingDot, styles.typingDot2]} />
                    <View style={[styles.typingDot, styles.typingDot3]} />
                  </View>
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View style={[styles.composerArea, { paddingBottom: composerBottomPad }]}> 
            {reply ? (
              <View style={[styles.replyBar, reply.isMine ? styles.replyBarMine : styles.replyBarOther]}>
                <View style={[styles.replyBarIndicator, { backgroundColor: reply.isMine ? WA_GREEN : WA_GREEN_DARK }]} />
                <View style={styles.replyBarContent}>
                  <Text style={styles.replyBarSender} numberOfLines={1}>
                    {reply.isMine ? (
                      <Text style={{ color: WA_GREEN_DARK }}>↩ A responder a você</Text>
                    ) : (
                      <Text style={{ color: WA_GREEN_DARK }}>↩ A responder a <Text style={{ fontWeight: '700' }}>{reply.senderName}</Text></Text>
                    )}
                  </Text>
                  <Text style={styles.replyBarPreview} numberOfLines={2}>{reply.preview}</Text>
                </View>
                <TouchableOpacity onPress={clearReply} style={styles.replyBarClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={20} color="#54656F" />
                </TouchableOpacity>
              </View>
            ) : null}

            {showAttach ? (
              <View style={styles.attachSheet}>
                <TouchableOpacity style={styles.attachItem} onPress={handleOpenCamera}>
                  <View style={[styles.attachIcon, { backgroundColor: '#FF5722' }]}>
                    <Ionicons name="camera" size={22} color="#FFF" />
                  </View>
                  <Text style={styles.attachLabel}>Câmara</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.attachItem} onPress={handlePickGallery}>
                  <View style={[styles.attachIcon, { backgroundColor: '#9C27B0' }]}>
                    <Ionicons name="images" size={22} color="#FFF" />
                  </View>
                  <Text style={styles.attachLabel}>Galeria</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.attachItem} onPress={() => setShowAttach(false)}>
                  <View style={[styles.attachIcon, { backgroundColor: WA_GREEN }]}>
                    <Ionicons name="document-text" size={22} color="#FFF" />
                  </View>
                  <Text style={styles.attachLabel}>Documento</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {showEmojiPicker ? (
              <View style={styles.emojiPanel}>
                {POPULAR_EMOJIS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={styles.emojiButton}
                    onPress={() => handleEmojiPress(emoji)}
                    activeOpacity={0.7}
                    accessibilityLabel={`Inserir emoji ${emoji}`}
                  >
                    <Text style={styles.emojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <View style={styles.composerRow}>
              <View style={styles.composerRow}>
                <View style={styles.inputWrap}>
                  <TouchableOpacity
                    style={styles.composerAttachBtn}
                    onPress={() => { setShowAttach((v) => !v); }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={showAttach ? 'close' : 'add'} size={24} color="#8696A0" />
                  </TouchableOpacity>
                  <TextInput
                    ref={inputRef}
                    value={messageText}
                    onChangeText={(t) => { setMessageText(t); if (t.length > 0) setShowAttach(false); }}
                    onFocus={() => { setShowAttach(false); setShowEmojiPicker(false); }}
                    placeholder="Mensagem"
                    placeholderTextColor="#8696A0"
                    style={styles.composerInput}
                    multiline
                  />
                  <TouchableOpacity
                    style={styles.composerAttachBtn}
                    activeOpacity={0.7}
                    onPress={() => { setShowEmojiPicker((value) => !value); setShowAttach(false); }}
                    accessibilityLabel="Abrir emojis"
                  >
                    <Ionicons name="happy" size={24} color={showEmojiPicker ? WA_GREEN_DARK : '#8696A0'} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.sendBtn}
                  onPress={handleSendText}
                  disabled={sendDisabled}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="send"
                    size={22}
                    color="#FFF"
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>
          
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  wrapper: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 10,
    backgroundColor: WA_GREEN_DARK,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerUser: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  headerAvatar: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  headerAvatarText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  headerText: { flex: 1 },
  headerNameRow: { flexDirection: 'row', alignItems: 'center' },
  headerName: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  headerStatus: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  headerIcons: { flexDirection: 'row', alignItems: 'center' },
  headerIconBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },

  errorBar: { marginHorizontal: 12, marginTop: 10, padding: 10, backgroundColor: '#FEE2E2', borderRadius: 10 },
  errorBarText: { color: '#B91C1C', fontSize: 12, textAlign: 'center' },

  chatArea: { flex: 1, backgroundColor: WA_BG },
  messagesContainer: { paddingHorizontal: 8, paddingTop: 10, paddingBottom: 40 },

  loadOlderWrap: { paddingTop: 14, paddingBottom: 10, alignItems: 'center', justifyContent: 'center' },
  loadOlderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(37, 211, 102, 0.25)',
    ...shadow({ color: '#000', offset: { width: 0, height: 2 }, opacity: 0.05, radius: 4, elevation: 1 }),
  },
  loadOlderText: { marginLeft: 6, color: WA_GREEN_DARK, fontSize: 12, fontWeight: '600' },

  loadingBox: { paddingVertical: 60, alignItems: 'center' },
  loadingLabel: { marginTop: 12, color: WA_GREEN_DARK, fontSize: 13, fontWeight: '600' },
  loadingSub: { marginTop: 4, color: '#667781', fontSize: 11 },

  beginBox: { paddingVertical: 60, alignItems: 'center', paddingHorizontal: 24 },
  beginCard: {
    backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8,
    flexDirection: 'row', alignItems: 'center', ...shadow({ color: '#000', offset: { width: 0, height: 2 }, opacity: 0.05, radius: 6, elevation: 1 }),
  },
  beginText: { color: '#667781', fontSize: 12, marginLeft: 6, textAlign: 'center' },
  beginHint: { color: '#667781', fontSize: 12, marginTop: 14, textAlign: 'center' },

  dateSeparatorWrap: { alignItems: 'center', marginVertical: 10 },
  dateSeparator: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    ...shadow({ color: '#000', offset: { width: 0, height: 1 }, opacity: 0.06, radius: 3, elevation: 1 }),
  },
  dateSeparatorText: { color: '#667781', fontSize: 12, fontWeight: '600' },

  messageRow: { marginBottom: 10, flexDirection: 'row', width: '100%', paddingHorizontal: 10 },
  messageRowCompact: { marginBottom: 4 },
  messageRowRight: { justifyContent: 'flex-end' },
  messageRowLeft: { justifyContent: 'flex-start' },
  senderAvatar: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  senderAvatarText: { color: '#FFF', fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },
  senderHeader: { maxWidth: '100%', paddingBottom: 5, marginBottom: 2 },
  senderLabel: { fontSize: 12.5, fontWeight: '800', color: '#128C7E' },
  senderPhoneLabel: { fontSize: 10.5, color: '#667781', fontWeight: '600', marginTop: 1 },

  bubbleContainer: {
    maxWidth: '78%',
    minWidth: 0,
    flexShrink: 1,
    paddingVertical: 2,
  },
  avatarSpacer: { width: 28 },
  bubbleWrap: {
    maxWidth: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  bubbleWrapMe: { justifyContent: 'flex-end' },
  bubbleWrapOther: { justifyContent: 'flex-start' },

  bubble: {
    maxWidth: '100%',
    minWidth: 0,
    alignSelf: 'flex-start',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    paddingRight: 14,
    overflow: 'hidden',
    ...shadow({ color: '#000', offset: { width: 0, height: 1 }, opacity: 0.08, radius: 4, elevation: 3 }),
    position: 'relative',
  },
  bubbleMe: { backgroundColor: WA_BUBBLE_ME, borderTopRightRadius: 18, alignSelf: 'flex-end' },
  bubbleOther: { backgroundColor: WA_BUBBLE_OTHER, borderTopLeftRadius: 18, alignSelf: 'flex-start' },
  bubbleMeTailed: { borderTopRightRadius: 0 },
  bubbleOtherTailed: { borderTopLeftRadius: 0 },
  bubblePhoto: { padding: 4, paddingBottom: 4 },
  bubbleSelected: {
    ...shadow({ color: WA_GREEN, offset: { width: 0, height: 0 }, opacity: 0.35, radius: 6, elevation: 4 }),
    transform: [{ scale: 1 }],
    borderWidth: 2,
    borderColor: 'rgba(37, 211, 102, 0.5)',
  },
  tailShadow: { position: 'absolute', width: 14, height: 14, top: 0 },
  tailShadowMe: {
    right: -4,
    borderLeftWidth: 12, borderLeftColor: WA_BUBBLE_ME,
    borderTopWidth: 12, borderTopColor: 'transparent',
    opacity: 1,
  },
  tailShadowOther: {
    left: -4,
    borderRightWidth: 12, borderRightColor: WA_BUBBLE_OTHER,
    borderTopWidth: 12, borderTopColor: 'transparent',
  },

  textBubbleInner: { paddingLeft: 2, paddingRight: 2, paddingTop: 2, minWidth: 0 },
  messageText: { fontSize: 15, lineHeight: 22, color: '#111B21', flexShrink: 1, flexWrap: 'wrap', minWidth: 0 },
  messageTextMe: { color: '#111B21' },
  messageTextOther: { color: '#111B21' },

  metaRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 6, marginBottom: 0 },
  photoMeta: { position: 'absolute', bottom: 6, right: 8 },
  msgTime: { fontSize: 10, marginRight: 3 },
  msgTimeMe: { color: 'rgba(17,27,33,0.55)' },
  msgTimeOther: { color: 'rgba(17,27,33,0.55)' },
  statusIconWrap: { marginLeft: 2 },

  photoBubble: { width: 220, height: 170, borderRadius: 6, marginBottom: 16 },


  typingBubble: { paddingVertical: 14, paddingHorizontal: 16, minWidth: 70 },
  typingDots: { flexDirection: 'row', alignItems: 'center' },
  typingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#8696A0', marginHorizontal: 2 },
  typingDot1: { opacity: 0.4 },
  typingDot2: { opacity: 0.7 },
  typingDot3: { opacity: 1 },


  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    marginHorizontal: 8,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    overflow: 'hidden',
    minHeight: 50,
  },
  replyBarMine: { backgroundColor: '#F2FAF0' },
  replyBarOther: { backgroundColor: '#FFFFFF' },
  replyBarIndicator: { width: 4, height: '100%', borderRadius: 2 },
  replyBarContent: { flex: 1, paddingVertical: 6, paddingHorizontal: 10, justifyContent: 'center' },
  replyBarSender: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  replyBarPreview: { fontSize: 12.5, color: '#667781', lineHeight: 15 },
  replyBarClose: { paddingHorizontal: 10, paddingVertical: 4 },

  composerArea: { backgroundColor: '#F0F2F5', paddingTop: 8, paddingBottom: 24 },
  emojiPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    marginHorizontal: 8,
    marginBottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#DDE5E8',
    ...shadow({ color: '#000', offset: { width: 0, height: 2 }, opacity: 0.08, radius: 8, elevation: 2 }),
  },
  emojiButton: {
    width: '20%',
    minWidth: 48,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  emojiText: { fontSize: 25 },
  attachSheet: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 10,
    paddingBottom: 4,
    backgroundColor: '#F0F2F5',
  },
  attachItem: { flex: 1, alignItems: 'center' },
  attachIcon: {
    width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginBottom: 6,
    ...shadow({ color: '#000', offset: { width: 0, height: 4 }, opacity: 0.1, radius: 6, elevation: 2 }),
  },
  attachLabel: { fontSize: 11, color: '#111B21', fontWeight: '600' },


  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 26,
    paddingHorizontal: 4,
    paddingVertical: 2,
    minHeight: 48,
    marginRight: 8,
  },
  composerAttachBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  composerInput: {
    flex: 1,
    fontSize: 15,
    color: '#111B21',
    paddingHorizontal: 2,
    paddingVertical: 8,
    maxHeight: 120,
    minHeight: 40,
  },
  sendBtn: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: WA_GREEN, alignItems: 'center', justifyContent: 'center',
    ...shadow({ color: WA_GREEN_DARK, offset: { width: 0, height: 3 }, opacity: 0.3, radius: 6, elevation: 3 }),
  },
  micBtn: { backgroundColor: WA_GREEN },
});
