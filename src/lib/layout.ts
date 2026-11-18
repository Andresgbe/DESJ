// Diseño según el ancho de la ventana: teléfono por debajo de S.breakpoint, computadora desde ahí.
// Se decide por ancho (no por Platform.OS) para que la web abierta en el teléfono se vea como el teléfono.
import { useWindowDimensions } from 'react-native';

import { S } from '@/theme';

/**
 * Medidas del header. Mismo diseño en teléfono y computadora, en otra proporción: en computadora el
 * header va a todo lo ancho de la ventana y sus controles son más grandes (44 pt, el mínimo táctil).
 */
const HEADER_PHONE = { control: 32, icon: 20, avatarText: 12, avatarIcon: 16, label: 10.5, labelSpacing: 2, toggleText: 10, dot: 6, padX: S.pad + 4, padY: 8, gap: 8 };
const HEADER_DESK = { control: S.touch, icon: 24, avatarText: 15, avatarIcon: 20, label: 13, labelSpacing: 3, toggleText: 12, dot: 8, padX: S.pad * 2, padY: 16, gap: 14 };
export type HeaderSizes = typeof HEADER_PHONE;

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const wide = width >= S.breakpoint;
  /** Ancho máximo de la columna de contenido para este tamaño de ventana. */
  const column = wide ? S.columnDesk : S.column;
  const header: HeaderSizes = wide ? HEADER_DESK : HEADER_PHONE;
  return { width, height, wide, column, header };
}
