// Diseño según el ancho de la ventana: teléfono por debajo de S.breakpoint, computadora desde ahí.
// Se decide por ancho (no por Platform.OS) para que la web abierta en el teléfono se vea como el teléfono.
import { useWindowDimensions } from 'react-native';

import { S } from '@/theme';

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const wide = width >= S.breakpoint;
  /** Ancho máximo de la columna de contenido para este tamaño de ventana. */
  const column = wide ? S.columnDesk : S.column;
  return { width, height, wide, column };
}
