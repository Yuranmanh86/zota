import 'react-native-gesture-handler';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { AuthProvider } from './src/providers/AuthProvider';
import { QueryProvider } from './src/providers/QueryProvider';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';

let pendingInstallPrompt = null;

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    pendingInstallPrompt = event;
    window.dispatchEvent(new Event('zora-install-available'));
  });
}

function WebPerformanceOptimizer() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    try {
      if (!document.querySelector('link[rel="manifest"]')) {
        const manifestLink = document.createElement('link');
        manifestLink.rel = 'manifest';
        manifestLink.href = '/manifest.json';
        document.head.appendChild(manifestLink);
      }
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).catch((error) => {
          console.warn('[PWA] service worker registration failed:', error?.message);
        });
      }
      const styleId = 'zora-web-optimizations';
      if (document.getElementById(styleId)) return;
      const style = document.createElement('style');
      style.id = styleId;
      style.innerHTML = `
        html, body, #root {
          overscroll-behavior-y: contain;
          -webkit-overflow-scrolling: touch;
          scroll-behavior: smooth;
          height: 100%;
        }
        #root {
          height: 100vh;
        }
        body {
          background-color: #FFF2E4 !important;
          margin: 0;
          padding: 0;
          text-rendering: optimizeLegibility;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          background-image:
            radial-gradient(circle at 10% 20%, rgba(255,106,43,0.06) 0%, transparent 40%),
            radial-gradient(circle at 90% 80%, rgba(255,45,45,0.05) 0%, transparent 40%);
          background-attachment: fixed;
        }
        * {
          -webkit-tap-highlight-color: transparent;
          outline: none;
        }
        [role="button"], button {
          cursor: pointer;
        }
        img {
          user-select: none;
          -webkit-user-drag: none;
        }
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        ::-webkit-scrollbar-track {
          background: #FFF7ED;
        }
        ::-webkit-scrollbar-thumb {
          background: #FFD3A7;
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #FFB06A;
        }
        .zora-modal-backdrop {
          backdrop-filter: blur(10px) saturate(140%);
          -webkit-backdrop-filter: blur(10px) saturate(140%);
        }
        @keyframes zoraFadeIn {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .zora-card-pop {
          animation: zoraFadeIn 320ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `;
      document.head.appendChild(style);

      try {
        document.body.setAttribute('data-platform', 'web');
      } catch {}

      return () => {
        try {
          const existing = document.getElementById(styleId);
          if (existing) existing.remove();
        } catch {}
      };
    } catch (e) {
      console.warn('[WebOptimizer] failed', e?.message);
    }
  }, []);
  return null;
}

function WebAppShell({ children }) {
  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }
  return (
    <View style={webShellStyles.desktopWrapper}>
      <View style={webShellStyles.deviceFrame}>
        <View style={webShellStyles.deviceInner}>{children}</View>
        <PWAInstallButton />
      </View>
    </View>
  );
}

function PWAInstallButton() {
  const [isInstalled, setIsInstalled] = useState(false);
  const deferredPrompt = useRef(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    setIsInstalled(isStandalone);
    deferredPrompt.current = pendingInstallPrompt;

    const handleBeforeInstallPrompt = (event) => {
      deferredPrompt.current = event;
    };
    const handleInstallAvailable = () => {
      deferredPrompt.current = pendingInstallPrompt;
    };
    const handleInstalled = () => {
      deferredPrompt.current = null;
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('zora-install-available', handleInstallAvailable);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('zora-install-available', handleInstallAvailable);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  if (Platform.OS !== 'web' || isInstalled) return null;

  const handleInstall = async () => {
    if (deferredPrompt.current) {
      deferredPrompt.current.prompt();
      const result = await deferredPrompt.current.userChoice;
      if (result?.outcome === 'accepted') setIsInstalled(true);
      deferredPrompt.current = null;
      return;
    }

    window.alert(
      /iPhone|iPad|iPod/i.test(window.navigator.userAgent)
        ? 'No Safari, toque em Partilhar e depois em “Adicionar ao Ecrã Principal”.'
        : 'A instalação funciona em HTTPS ou localhost. Abra o menu do navegador e escolha “Instalar Zora” ou “Adicionar à tela inicial”.'
    );
  };

  return (
    <Pressable
      style={webShellStyles.installButton}
      onPress={handleInstall}
      accessibilityLabel="Instalar aplicação Zora"
    >
      <Ionicons name="download-outline" size={16} color="#FFFFFF" />
      <Text style={webShellStyles.installButtonText}>Instalar Zora</Text>
    </Pressable>
  );
}

const webShellStyles = StyleSheet.create({
  desktopWrapper: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  deviceFrame: {
    width: '100%',
    maxWidth: 480,
    height: '100%',
    maxHeight: '100%',
    backgroundColor: '#FFF8F3',
    shadowColor: '#FF4D00',
    shadowOpacity: 0.12,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 20 },
    elevation: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  deviceInner: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  installButton: {
    position: 'absolute',
    bottom: 150,
    right: 12,
    zIndex: 10000,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16A34A',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#14532D',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  installButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    marginLeft: 6,
  },
});

export default function App() {
  return (
    <AppErrorBoundary>
      <WebPerformanceOptimizer />
      <QueryProvider>
        <SafeAreaProvider>
          <AuthProvider>
            <StatusBar style="dark" />
            <WebAppShell>
              <AppNavigator />
            </WebAppShell>
          </AuthProvider>
        </SafeAreaProvider>
      </QueryProvider>
    </AppErrorBoundary>
  );
}
