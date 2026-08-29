import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { getGlobalQueryClient } from '../providers/QueryProvider';

type Props = { children: React.ReactNode };

type State = { hasError: boolean; error?: Error; info?: any };

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    try {
      console.error(
        '[AppErrorBoundary] getDerivedStateFromError:',
        '\nMessage:', error?.message,
        '\nStack:', error?.stack ? String(error.stack).slice(0, 800) : '(no stack)',
      );
    } catch {}
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    try {
      console.error(
        '[AppErrorBoundary] componentDidCatch:',
        '\nMessage:', error?.message,
        '\nComponentStack:', info?.componentStack ? String(info.componentStack).slice(0, 800) : '(no component stack)',
      );
    } catch {}
    this.setState({ info });
  }

  reset = () => {
    try {
      const qc = getGlobalQueryClient();
      if (qc) {
        try { qc.clear(); } catch (e: any) { console.warn('[AppErrorBoundary] qc.clear error:', e?.message); }
      }
    } catch {}
    try { this.setState({ hasError: false, error: undefined, info: undefined }); } catch {}
  };

  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message || '';
      const stack = this.state.error?.stack ? String(this.state.error.stack).slice(0, 400) : '';
      const compStack = this.state.info?.componentStack ? String(this.state.info.componentStack).slice(0, 300) : '';
      return (
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.scrollInner} showsVerticalScrollIndicator={false}>
            <Text style={styles.emoji}>🛡️</Text>
            <Text style={styles.title}>Encontrámos um problema</Text>
            <Text style={styles.subtitle}>
              O app recuperou automaticamente de um erro. Toque em "Recomeçar" para tentar de novo.
            </Text>
            {msg ? (
              <View style={styles.errBox}>
                <Text style={styles.errLabel}>Erro:</Text>
                <Text style={styles.errLine}>{String(msg).slice(0, 220)}</Text>
                {stack ? (
                  <>
                    <Text style={styles.errLabel}>Stack:</Text>
                    <Text style={styles.errLineSmall}>{stack}</Text>
                  </>
                ) : null}
                {compStack ? (
                  <>
                    <Text style={styles.errLabel}>Componente:</Text>
                    <Text style={styles.errLineSmall}>{compStack}</Text>
                  </>
                ) : null}
              </View>
            ) : null}
            <TouchableOpacity style={styles.btn} onPress={this.reset} activeOpacity={0.85}>
              <Text style={styles.btnLabel}>🔄 Recomeçar app</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8F3',
  },
  scrollInner: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  emoji: { fontSize: 56, marginBottom: 16 },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13.5,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 20,
  },
  errBox: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  errLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#9A3412',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: 6,
    marginBottom: 3,
  },
  errLine: {
    fontSize: 12,
    color: '#B45309',
    fontWeight: '600',
    lineHeight: 16,
  },
  errLineSmall: {
    fontSize: 10,
    color: '#9A3412',
    lineHeight: 14,
    opacity: 0.9,
  },
  btn: {
    marginTop: 8,
    backgroundColor: '#FF7A00',
    paddingHorizontal: 28,
    paddingVertical: 15,
    borderRadius: 16,
    shadowColor: '#FF7A00',
    shadowOpacity: 0.32,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  btnLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
});
