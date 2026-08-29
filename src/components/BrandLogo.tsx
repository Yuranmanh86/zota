import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { appTheme } from '../theme/appTheme';

const ZORA_ORANGE = '#FF6A2B';

type BrandLogoSize = 'sm' | 'md' | 'lg' | 'xl' | 'splash';

type BrandLogoProps = {
  size?: BrandLogoSize;
  showText?: boolean;
  textColor?: string;
  iconBg?: string;
  letterColor?: string;
  flashColor?: string;
  style?: ViewStyle;
};

const sizeMap: Record<BrandLogoSize, {
  iconBox: number;
  iconBoxRadius: number;
  letter: number;
  flash: number;
  title: number;
  letterOffset: number;
  flashRight: number;
  flashBottom: number;
  iconTextGap: number;
}> = {
  sm: {
    iconBox: 32,
    iconBoxRadius: 10,
    letter: 18,
    flash: 11,
    title: 22,
    letterOffset: 2,
    flashRight: -3,
    flashBottom: -3,
    iconTextGap: 8,
  },
  md: {
    iconBox: 44,
    iconBoxRadius: 14,
    letter: 26,
    flash: 16,
    title: 34,
    letterOffset: 4,
    flashRight: -4,
    flashBottom: -4,
    iconTextGap: 10,
  },
  lg: {
    iconBox: 64,
    iconBoxRadius: 20,
    letter: 38,
    flash: 22,
    title: 46,
    letterOffset: 6,
    flashRight: -6,
    flashBottom: -6,
    iconTextGap: 14,
  },
  xl: {
    iconBox: 88,
    iconBoxRadius: 26,
    letter: 52,
    flash: 30,
    title: 62,
    letterOffset: 8,
    flashRight: -8,
    flashBottom: -8,
    iconTextGap: 18,
  },
  splash: {
    iconBox: 110,
    iconBoxRadius: 32,
    letter: 66,
    flash: 38,
    title: 78,
    letterOffset: 10,
    flashRight: -10,
    flashBottom: -10,
    iconTextGap: 22,
  },
};

export function BrandLogo({
  size = 'md',
  showText = true,
  textColor,
  iconBg = ZORA_ORANGE,
  letterColor = '#FFFFFF',
  flashColor = '#FFFFFF',
  style,
}: BrandLogoProps) {
  const s = sizeMap[size];
  const effectiveShadowColor = iconBg === 'transparent' ? ZORA_ORANGE : iconBg;

  return (
    <View style={[styles.row, style]}>
      <View
        style={[
          styles.iconBox,
          {
            width: s.iconBox,
            height: s.iconBox,
            borderRadius: s.iconBoxRadius,
            backgroundColor: iconBg,
            shadowColor: effectiveShadowColor,
            shadowRadius: iconBg === 'transparent' ? 0 : s.iconBox * 0.25,
            shadowOpacity: iconBg === 'transparent' ? 0 : 0.3,
            shadowOffset: { width: 0, height: iconBg === 'transparent' ? 0 : s.iconBox * 0.1 },
            elevation: iconBg === 'transparent' ? 0 : Math.round(s.iconBox * 0.15),
          },
        ]}
      >
        <Text
          style={[
            styles.letter,
            {
              fontSize: s.letter,
              marginRight: s.letterOffset,
              color: letterColor,
            },
          ]}
        >
          Z
        </Text>
        <Ionicons
          name="flash"
          size={s.flash}
          color={flashColor}
          style={{
            position: 'absolute',
            right: s.flashRight,
            bottom: s.flashBottom,
          }}
        />
      </View>
      {showText ? (
        <Text
          style={[
            styles.title,
            {
              fontSize: s.title,
              marginLeft: s.iconTextGap,
              color: textColor ?? (iconBg === 'transparent' ? ZORA_ORANGE : iconBg),
            },
          ]}
        >
          Zora
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontWeight: '900',
    fontFamily: appTheme.fontFamily,
  },
  title: {
    fontWeight: '900',
    fontFamily: appTheme.fontFamily,
    letterSpacing: -0.5,
  },
});
