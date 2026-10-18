// Confirmación sí/no. En web, Alert de React Native no muestra botones: se usa window.confirm.
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
