import { Alert, Platform } from 'react-native';

export function showUserMessage(title: string, message?: string) {
  const body = message || title;
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
    try {
      const display = message ? `${title}\n\n${message}` : title;
      window.alert(display);
      return;
    } catch {}
  }
  try {
    if (message) {
      Alert.alert(title, message);
    } else {
      Alert.alert(title);
    }
  } catch {
    if (typeof console !== 'undefined') {
      console.log('[FEEDBACK]', title, body);
    }
  }
}

export function confirmAction(title: string, message: string, onConfirm: () => void): boolean {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.confirm === 'function') {
    try {
      const ok = window.confirm(`${title}\n\n${message}`);
      if (ok) onConfirm();
      return ok;
    } catch {
      return false;
    }
  }
  try {
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', style: 'destructive', onPress: onConfirm },
    ]);
    return true;
  } catch {
    return false;
  }
}
