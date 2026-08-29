import { Platform, ViewStyle } from 'react-native';

export const appTheme = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  border: '#F3DCE8',
  primary: '#E1306C',
  primarySoft: '#FCE7F3',
  secondary: '#833AB4',
  accent: '#FEDA75',
  accentAlt: '#FA7E1E',
  text: '#111827',
  muted: '#64748B',
  shadow: 'rgba(15, 23, 42, 0.06)',
  radius: 18,
  fontFamily: undefined,
};

type ShadowInput = {
  color?: string;
  offset?: { width?: number; height?: number };
  opacity?: number;
  radius?: number;
  elevation?: number;
};

export function shadow(input: ShadowInput = {}): ViewStyle {
  const {
    color = '#000',
    offset = { width: 0, height: 0 },
    opacity = 0,
    radius = 0,
    elevation = 0,
  } = input;

  const ow = offset.width ?? 0;
  const oh = offset.height ?? 0;

  const native: ViewStyle = {
    shadowColor: color,
    shadowOpacity: opacity,
    shadowRadius: radius,
    shadowOffset: { width: ow, height: oh },
  };
  if (elevation > 0) (native as any).elevation = elevation;

  if (Platform.OS !== 'web') return native;

  const rgba = (hex: string, alpha: number) => {
    if (hex.startsWith('rgba') || hex.startsWith('rgb')) {
      const parts = hex.match(/[\d.]+/g);
      if (parts && parts.length >= 3) {
        const r = parts[0], g = parts[1], b = parts[2];
        const a = parts[3] != null ? Number(parts[3]) * alpha : alpha;
        return `rgba(${r},${g},${b},${a})`;
      }
    }
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const r = parseInt(full.substring(0, 2), 16);
    const g = parseInt(full.substring(2, 4), 16);
    const b = parseInt(full.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  };

  return {
    ...(Platform.OS === 'web'
      ? { boxShadow: `${ow}px ${oh}px ${radius}px ${rgba(color, opacity)}` }
      : {
          ...native,
        }),
  } as any;
}
