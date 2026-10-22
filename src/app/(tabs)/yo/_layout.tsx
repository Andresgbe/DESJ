// Módulo YO: una pila dentro de la pestaña. La portada (index) y sus módulos personales (Salud,
// Finanzas, Mis datos, el detalle de un examen). Cada pantalla trae su propio header con `Screen`, así que la pila no muestra el suyo.
import { Stack } from 'expo-router/stack';

import { C } from '@/theme';

export default function YoLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} />;
}
