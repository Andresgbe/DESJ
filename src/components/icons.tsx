// Íconos de la barra de pestañas, dibujados en SVG.
import { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

type P = { color: ColorValue; size?: number };
const base = (size: number, color: ColorValue) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: color,
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export const IconCore = ({ color, size = 22 }: P) => (
  <Svg {...base(size, color)}>
    <Circle cx={12} cy={12} r={9} />
    <Circle cx={12} cy={12} r={3.5} />
  </Svg>
);

export const IconCalendar = ({ color, size = 22 }: P) => (
  <Svg {...base(size, color)}>
    <Rect x={3} y={5} width={18} height={16} rx={2} />
    <Path d="M3 10h18M8 3v4M16 3v4" />
    <Circle cx={12} cy={15} r={1.2} />
  </Svg>
);

export const IconHealth = ({ color, size = 22 }: P) => (
  <Svg {...base(size, color)}>
    <Path d="M3 12h4l2-5 4 10 2-5h6" />
  </Svg>
);

export const IconBusiness = ({ color, size = 22 }: P) => (
  <Svg {...base(size, color)}>
    <Rect x={3} y={7} width={18} height={13} rx={2} />
    <Path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </Svg>
);

export const IconTasks = ({ color, size = 22 }: P) => (
  <Svg {...base(size, color)}>
    <Rect x={3} y={4} width={18} height={17} rx={3} />
    <Path d="M7.5 12.5l3 3 6-6.5" />
  </Svg>
);

// Íconos de la interfaz (misma receta que las pestañas: 24×24, trazo 1.8, puntas redondeadas).

export const IconPill = ({ color, size = 16 }: P) => (
  <Svg {...base(size, color)}>
    <Rect x={2.5} y={8.5} width={19} height={7} rx={3.5} transform="rotate(-35 12 12)" />
    <Path d="M9.7 7.2l4.1 9.6" />
  </Svg>
);

export const IconClip = ({ color, size = 20 }: P) => (
  <Svg {...base(size, color)}>
    <Path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9" />
  </Svg>
);

export const IconMic = ({ color, size = 20 }: P) => (
  <Svg {...base(size, color)}>
    <Rect x={9} y={3} width={6} height={11} rx={3} />
    <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </Svg>
);

/** Cuadrado relleno para "detener" (dictado). */
export const IconStop = ({ color, size = 16 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x={5} y={5} width={14} height={14} rx={3} fill={color} />
  </Svg>
);

export const IconClose = ({ color, size = 16 }: P) => (
  <Svg {...base(size, color)}>
    <Path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const IconCheck = ({ color, size = 16 }: P) => (
  <Svg {...base(size, color)}>
    <Path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);

export const IconPlus = ({ color, size = 16 }: P) => (
  <Svg {...base(size, color)}>
    <Path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconFile = ({ color, size = 16 }: P) => (
  <Svg {...base(size, color)}>
    <Path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <Path d="M14 3v5h5" />
  </Svg>
);
