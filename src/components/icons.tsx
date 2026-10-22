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

export const IconMenu = ({ color, size = 22 }: P) => (
  <Svg {...base(size, color)}>
    <Path d="M4 7h16M4 12h16M4 17h10" />
  </Svg>
);

export const IconUser = ({ color, size = 22 }: P) => (
  <Svg {...base(size, color)}>
    <Circle cx={12} cy={7} r={3.5} />
    <Path d="M5 21v-2.5A4.5 4.5 0 0 1 9.5 14h5a4.5 4.5 0 0 1 4.5 4.5V21" />
    <Path d="M12 14v3" />
  </Svg>
);

export const IconBack = ({ color, size = 22 }: P) => (
  <Svg {...base(size, color)}>
    <Path d="M15 5l-7 7 7 7" />
  </Svg>
);

export const IconChevron = ({ color, size = 18 }: P) => (
  <Svg {...base(size, color)}>
    <Path d="M9 5l7 7-7 7" />
  </Svg>
);

// Pestaña Módulos y tipos de módulo.
export const IconGrid = ({ color, size = 22 }: P) => (
  <Svg {...base(size, color)}>
    <Rect x={3.5} y={3.5} width={7} height={7} rx={1.6} />
    <Rect x={13.5} y={3.5} width={7} height={7} rx={1.6} />
    <Rect x={3.5} y={13.5} width={7} height={7} rx={1.6} />
    <Rect x={13.5} y={13.5} width={7} height={7} rx={1.6} />
  </Svg>
);

export const IconCar = ({ color, size = 22 }: P) => (
  <Svg {...base(size, color)}>
    <Path d="M5 16V11l2-5h10l2 5v5" />
    <Path d="M3 16h18v2H3z" />
    <Path d="M5 11h14" />
    <Circle cx={7.5} cy={18.5} r={1.5} />
    <Circle cx={16.5} cy={18.5} r={1.5} />
  </Svg>
);

export const IconHome = ({ color, size = 22 }: P) => (
  <Svg {...base(size, color)}>
    <Path d="M3 11l9-7 9 7" />
    <Path d="M5 9.5V20h14V9.5" />
    <Path d="M10 20v-6h4v6" />
  </Svg>
);

export const IconPaw = ({ color, size = 22 }: P) => (
  <Svg {...base(size, color)}>
    <Path d="M12 13c-3 0-5 3-5 5 0 1.5 1.2 2 2.5 2 1 0 1.7-.5 2.5-.5s1.5.5 2.5.5c1.3 0 2.5-.5 2.5-2 0-2-2-5-5-5z" />
    <Circle cx={6.5} cy={10} r={1.6} />
    <Circle cx={9.5} cy={5.8} r={1.6} />
    <Circle cx={14.5} cy={5.8} r={1.6} />
    <Circle cx={17.5} cy={10} r={1.6} />
  </Svg>
);

export const IconPlane = ({ color, size = 22 }: P) => (
  <Svg {...base(size, color)}>
    <Path d="M10.5 13.5L3 11l1.5-1.5 8 .5 4.5-4.5c1-1 2.5-1.2 3-.5.7.5.5 2-.5 3L15 12.5l.5 8L14 22l-2.5-7.5" />
  </Svg>
);

export const IconFolder = ({ color, size = 22 }: P) => (
  <Svg {...base(size, color)}>
    <Path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Svg>
);

export const IconArrowUp = ({ color, size = 18 }: P) => (
  <Svg {...base(size, color)}>
    <Path d="M12 19V5M6 11l6-6 6 6" />
  </Svg>
);

export const IconArrowDown = ({ color, size = 18 }: P) => (
  <Svg {...base(size, color)}>
    <Path d="M12 5v14M6 13l6 6 6-6" />
  </Svg>
);
