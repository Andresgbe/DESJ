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

export const IconChat = ({ color, size = 22 }: P) => (
  <Svg {...base(size, color)}>
    <Path d="M21 12a8 8 0 0 1-12 7l-5 1 1-4a8 8 0 1 1 16-4z" />
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

export const IconRoutines = ({ color, size = 22 }: P) => (
  <Svg {...base(size, color)}>
    <Circle cx={12} cy={13} r={8} />
    <Path d="M12 9v4l3 2" />
    <Path d="M9 2h6" />
  </Svg>
);
