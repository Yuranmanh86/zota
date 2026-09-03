import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type InstallPrompt = {
  prompt: () => void;
  userChoice: Promise<{ outcome?: string }>;
};

let pendingInstallPrompt: InstallPrompt | null = null;

export function setPendingInstallPrompt(event: InstallPrompt) {
  pendingInstallPrompt = event;
}

export function PWAInstallButton() {
  const [isInstalled, setIsInstalled] = useState(false);
  const deferredPrompt = useRef<InstallPrompt | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsInstalled(isStandalone);
    deferredPrompt.current = pendingInstallPrompt;

    const handleBeforeInstallPrompt = (event: Event) => {
      const installEvent = event as Event & InstallPrompt;
      installEvent.preventDefault();
      deferredPrompt.current = installEvent;
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
      style={styles.installButton}
      onPress={handleInstall}
      accessibilityLabel="Instalar aplicação Zora"
    >
      <Ionicons name="download-outline" size={16} color="#FFFFFF" />
      <Text style={styles.installButtonText}>Instalar Zora</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  installButton: {
    position: 'absolute',
    bottom: 190,
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
