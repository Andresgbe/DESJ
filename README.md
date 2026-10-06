# DESJ — asistente personal de Steven

App nativa para iPhone (y Android) hecha con **Expo + React Native**. Si sabes React, ya sabes el 80%: en lugar de `<div>` usas `<View>`, en lugar de `<p>` usas `<Text>`, y los estilos son objetos JS (flexbox por defecto, en columna).

## Qué hay hoy (fase 0 · esqueleto)

| Pestaña | Qué hace |
|---|---|
| Núcleo | Saludo según la hora, anillo HUD, resumen del día |
| Chat | Chat con DESJ en modo demo, **responde en voz** (botón VOZ ON/OFF) |
| Salud | Pastillas del día: marcar tomadas, agregar/quitar, **recordatorios diarios reales** |
| Negocios | Ganadería, legal y mercado con datos de ejemplo |
| Rutinas | Interruptores que programan avisos diarios (ej. resumen 07:40) |

Todo se guarda en el teléfono. Los recordatorios los programa el propio iPhone, no hace falta servidor.

En el chat prueba: `¿qué pastillas me faltan?` o `recuérdame llamar al notario a las 4 de la tarde`.

---

## Paso a paso para correrlo en tu iPhone (gratis)

### 1. Instala en tu computadora (una sola vez)

- **Node.js LTS** → https://nodejs.org (verifica con `node -v`)
- **Git** → https://git-scm.com
- **VS Code** (recomendado)

No necesitas Mac ni Xcode.

### 2. Instala en el iPhone

- **Expo Go** desde el App Store (gratis).

### 3. Arranca el proyecto

```bash
cd desj
npm install
npx expo start
```

Sale un **código QR** en la terminal. Ábrelo con la **cámara del iPhone** → toca el aviso → se abre en Expo Go.

> El iPhone y la computadora deben estar en el **mismo Wi-Fi**. Si no conecta (redes de oficina, VPN), usa:
> `npx expo start --tunnel`

### 4. Programa con la app abierta

Edita cualquier archivo en `src/` y guarda: el teléfono se actualiza solo en 1–2 segundos.
Agita el teléfono para abrir el menú de desarrollo (recargar, ver errores).

### 5. Que Steven lo pruebe

- **Rápido:** que instale Expo Go y escanee el mismo QR mientras tú tienes `npx expo start --tunnel` corriendo.
- **Sin depender de tu computadora:** más adelante publicamos con `eas update` (plan gratis de Expo) y Steven lo abre desde un link.

---

## Subirlo a tu GitHub

1. En github.com → **New repository** → nombre `desj` → **Private** → sin README → Create.
2. En la carpeta del proyecto:

```bash
git remote add origin https://github.com/TU_USUARIO/desj.git
git branch -M main
git push -u origin main
```

(El proyecto ya trae el primer commit hecho.)

---

## Estructura

```
src/
  app/              ← cada archivo es una pantalla (Expo Router)
    _layout.tsx     ← las 5 pestañas de abajo
    index.tsx       ← Núcleo
    chat.tsx        ← Chat + voz
    salud.tsx       ← Pastillas y recordatorios
    negocios.tsx
    rutinas.tsx
  components/
    ui.tsx          ← Screen, Card, Title, Label, HudRing…
    icons.tsx       ← íconos de las pestañas
  lib/
    store.tsx       ← estado guardado en el teléfono
    notifications.ts← recordatorios locales
    brain.ts        ← "cerebro" demo del chat (aquí entrará Claude)
  theme.ts          ← colores y fuentes
```

## Comandos útiles

```bash
npx expo start            # arrancar
npx tsc --noEmit          # revisar tipos
npx expo install <pkg>    # instalar librerías (SIEMPRE así, no con npm install)
```

---

## Costos

| Etapa | Costo |
|---|---|
| Desarrollar y probar en Expo Go (tú y Steven) | **$0** |
| Base de datos y login (Supabase, plan gratis) | **$0** |
| Cerebro real (Claude API) | Se paga por uso; con 1–2 personas en prueba son centavos a pocos dólares al mes |
| App propia instalada en iPhone / App Store | Apple Developer **$99/año** (solo cuando la quieran como app independiente) |

## Siguientes pasos

1. **Supabase**: login de Steven y guardar pastillas/rutinas en la nube.
2. **Cerebro real**: Edge Function de Supabase que llama a Claude (la API key nunca va en la app) y reemplaza `src/lib/brain.ts`.
3. **Micrófono** (hablarle a DESJ): necesita *development build* (`eas build`), no corre en Expo Go.
4. **Exámenes de sangre**: subir PDF/foto y que Claude extraiga los valores.
5. **Garmin vía Apple Health**: requiere development build y la cuenta de Apple.
