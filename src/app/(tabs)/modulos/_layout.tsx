// Pestaña MÓDULOS: una pila con la lista de módulos (index), Negocios y la bitácora de cada módulo.
// Cada pantalla trae su propio header con `Screen`, así que la pila no muestra el suyo.
import { Stack } from 'expo-router/stack';

import { C } from '@/theme';

export default function ModulosLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} />;
}
