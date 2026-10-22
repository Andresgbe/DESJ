// Confirmación sí/no y avisos. En web, Alert de React Native no muestra nada: se usan window.confirm y window.alert.
import { Alert, Platform } from 'react-native';

export function confirm(title: string, message: string, action = 'Aceptar'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

/** Aviso con un solo botón. En web, Alert de React Native no se muestra: se usa window.alert. */
export function notify(message: string, title = 'DESJ') {
  if (Platform.OS === 'web') window.alert(message);
  else Alert.alert(title, message);
}
