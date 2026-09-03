import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { AuthProvider } from './src/providers/AuthProvider';
import { QueryProvider } from './src/providers/QueryProvider';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { setPendingInstallPrompt } from './src/components/PWAInstallButton';

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    setPendingInstallPrompt(event);
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
      </View>
    </View>
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
