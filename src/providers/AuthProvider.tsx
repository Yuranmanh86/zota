import * as React from 'react';
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { Session } from '../services/backendClient';
import { backend } from '../services/backendClient';

interface User {
  id: string;
  email?: string;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isSigningUp: boolean;
  isSigningIn: boolean;
  signUp: (email: string, password: string, fullName: string, phone?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

let globalListenerAttached = false;
let globalState = { session: null as any, user: null as User | null };
const globalSubscribers = new Set<(s: any, u: User | null) => void>();

function ensureGlobalAuthListener() {
  if (globalListenerAttached) return;
  globalListenerAttached = true;

  try {
    const onSubRes: any = backend.auth.onAuthStateChange(
      (_event: any, currentSession: any) => {
        const user = currentSession?.user
          ? { id: currentSession.user.id, email: currentSession.user.email }
          : null;
        globalState = { session: currentSession ?? null, user };
        globalSubscribers.forEach((fn) => {
          try { fn(currentSession ?? null, user); } catch {}
        });
      }
    );
    const subscription = onSubRes?.data?.subscription;
    if (subscription) {
      subscription.__globalAuth = true;
    }
  } catch (e: any) {
    console.warn('[AuthProvider] ensureGlobalAuthListener error:', e?.message);
    globalListenerAttached = false;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(globalState.session);
  const [user, setUserState] = useState<User | null>(globalState.user);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const isMountedRef = useRef(true);
  const hydratedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    ensureGlobalAuthListener();

    const subscriber = (newSession: any, newUser: User | null) => {
      if (!isMountedRef.current) return;
      setSessionState(newSession);
      setUserState(newUser);
    };
    globalSubscribers.add(subscriber);

    (async function hydrateInitial() {
      try {
        if (!globalState.session) {
          const res: any = await backend.auth.getSession().catch(() => ({ data: { session: null } }));
          const currentSession = res?.data?.session ?? null;
          const currentUser = currentSession?.user
            ? { id: currentSession.user.id, email: currentSession.user.email }
            : null;
          globalState = { session: currentSession, user: currentUser };
        }
        if (!isMountedRef.current) return;
        setSessionState(globalState.session);
        setUserState(globalState.user);
      } catch (error: any) {
        console.warn('[AuthProvider] hydrateInitial error:', error?.message);
      } finally {
        hydratedRef.current = true;
        if (isMountedRef.current) {
          try { setIsLoading(false); } catch {}
        }
      }
    })();

    return () => {
      isMountedRef.current = false;
      globalSubscribers.delete(subscriber);
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string, phone?: string) => {
    setIsSigningUp(true);
    try {
      const { data, error } = await backend.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            phone_number: phone,
          },
        },
      });

      if (error) throw error;
      if (!data.user) throw new Error('Falha ao criar usuário');

      const { error: profileError } = await backend.from('user_profiles').insert([
        {
          auth_user_id: data.user.id,
          full_name: fullName,
          phone_number: phone || null,
        },
      ]);

      if (profileError) throw profileError;
    } finally {
      setIsSigningUp(false);
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setIsSigningIn(true);
    try {
      const { error } = await backend.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      const { error } = await backend.auth.signOut();
      if (error) throw error;
      globalState = { session: null, user: null };
      setUserState(null);
      setSessionState(null);
    } catch (error: any) {
      console.warn('[AuthProvider] signOut error:', error?.message);
      throw error;
    }
  }, []);

  const value = React.useMemo(
    () => ({
      session,
      user,
      isLoading,
      isSigningUp,
      isSigningIn,
      signUp,
      signIn,
      signOut,
    }),
    [session, user, isLoading, isSigningUp, isSigningIn, signUp, signIn, signOut]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return context;
}
