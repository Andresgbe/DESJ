// Logotipo D.E.S.J Monolith (marca): wordmark vectorial ultra-condensado con los puntos cuadrados.
// Los trazos son los del SVG oficial (design/marca/desj-wordmark-monolith.svg); no depende de fuentes.
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { BRAND } from '@/theme';

/** Proporción ancho / alto del dibujo (sin márgenes). */
const W = 373;
const H = 210;

export function Wordmark({ height = 40, label = 'D.E.S.J' }: { height?: number; label?: string }) {
  return (
    <Svg width={(height * W) / H} height={height} viewBox={`0 0 ${W} ${H}`} accessibilityRole="image" accessibilityLabel={label}>
      <Defs>
        <LinearGradient id="desjWord" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={BRAND.wordTop} />
          <Stop offset="0.55" stopColor={BRAND.word} />
          <Stop offset="1" stopColor={BRAND.wordDeep} />
        </LinearGradient>
      </Defs>
      {/* D */}
      <Path
        fill="url(#desjWord)"
        fillRule="evenodd"
        d="M 0,5 L 35,5 C 55,5 64,17 64,39 L 64,171 C 64,193 55,205 35,205 L 0,205 Z M 23,27 L 32,27 C 39,27 41,32 41,42 L 41,168 C 41,178 39,183 32,183 L 23,183 Z"
      />
      <Rect x={74} y={183} width={22} height={22} fill={BRAND.dot} />
      {/* E */}
      <Path fill="url(#desjWord)" d="M 106,5 L 162,5 L 162,27 L 129,27 L 129,91 L 158,91 L 158,113 L 129,113 L 129,183 L 162,183 L 162,205 L 106,205 Z" />
      <Rect x={172} y={183} width={22} height={22} fill={BRAND.dot} />
      {/* S */}
      <Path
        fill="none"
        stroke="url(#desjWord)"
        strokeWidth={23}
        strokeLinejoin="round"
        d="M 256.5,68 L 256.5,35 C 256.5,8 215.5,8 215.5,35 L 215.5,68 C 215.5,95 256.5,103 256.5,134 L 256.5,175 C 256.5,202 215.5,202 215.5,175 L 215.5,136"
      />
      <Rect x={278} y={183} width={22} height={22} fill={BRAND.dot} />
      {/* J */}
      <Path fill="none" stroke="url(#desjWord)" strokeWidth={23} strokeLinejoin="round" d="M 360.5,5 L 360.5,175 C 360.5,202 321.5,202 321.5,175 L 321.5,142" />
    </Svg>
  );
}
