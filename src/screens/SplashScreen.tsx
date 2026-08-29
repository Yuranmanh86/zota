import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandLogo } from '../components/BrandLogo';
import { appTheme } from '../theme/appTheme';

type SplashScreenProps = {
  message?: string;
  minDurationMs?: number;
  onReady?: () => void;
};

export function SplashScreen({
  message = 'A preparar o Zora...',
  minDurationMs = 1200,
  onReady,
}: SplashScreenProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const readyFiredRef = useRef(false);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.back(1.15)),
        useNativeDriver: true,
      }),
    ]).start();

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.06,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();

    if (onReady && !readyFiredRef.current) {
      timerRef.current = setTimeout(() => {
        if (!readyFiredRef.current) {
          readyFiredRef.current = true;
          try { onReady(); } catch {}
        }
      }, minDurationMs);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      pulseLoop.stop();
    };
  }, [fadeAnim, scaleAnim, pulseAnim, minDurationMs, onReady]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.bgDecorA} pointerEvents="none" />
      <View style={styles.bgDecorB} pointerEvents="none" />
      <View style={styles.bgDecorC} pointerEvents="none" />

      <Animated.View
        style={[
          styles.logoWrap,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <BrandLogo size="splash" showText={true} />
        </Animated.View>
        <Text style={styles.tagline}>Carteira digital inteligente</Text>
      </Animated.View>

      <Animated.View style={[styles.bottomWrap, { opacity: fadeAnim }]}>
        <ActivityIndicator
          size={Platform.OS === 'web' ? 'large' : 32}
          color="#FF6A2B"
          style={styles.spinner}
        />
        <Text style={styles.message}>{message}</Text>
        <Text style={styles.footer}>Zora © {new Date().getFullYear()}</Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF7ED',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 48,
    overflow: 'hidden',
  },
  bgDecorA: {
    position: 'absolute',
    top: -80,
    left: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(255, 106, 43, 0.08)',
  },
  bgDecorB: {
    position: 'absolute',
    bottom: -100,
    right: -60,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(255, 45, 45, 0.06)',
  },
  bgDecorC: {
    position: 'absolute',
    top: '40%',
    right: -80,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255, 156, 46, 0.07)',
  },
  logoWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  tagline: {
    marginTop: 22,
    fontSize: 15,
    color: '#9A4F1A',
    fontWeight: '600',
    letterSpacing: 0.3,
    fontFamily: appTheme.fontFamily,
    opacity: 0.85,
  },
  bottomWrap: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  spinner: {
    marginBottom: 14,
  },
  message: {
    color: '#FF7A00',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: appTheme.fontFamily,
    letterSpacing: 0.2,
  },
  footer: {
    marginTop: 28,
    fontSize: 11.5,
    color: '#B98A66',
    fontWeight: '500',
    fontFamily: appTheme.fontFamily,
    opacity: 0.8,
  },
});
