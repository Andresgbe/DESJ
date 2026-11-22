// Holograma de YO en el teléfono (app nativa): por ahora la armadura de siempre (SuitCore). El cuerpo 3D con
// three.js existe solo en web (hologram.web.tsx), que es la versión instalada en el iPhone; en la app nativa
// necesitaría expo-gl y un development build.
import { SUIT_RATIO, SuitCore } from '@/components/suit-core';

export const HOLOGRAM_RATIO = SUIT_RATIO;

export function Hologram({ height, active = true }: { height: number; active?: boolean }) {
  return <SuitCore height={height} active={active} />;
}
