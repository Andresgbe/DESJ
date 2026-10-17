# DESJ — Contexto completo del proyecto

> Documento vivo. Léelo antes de tocar el código (personas e IAs).
> Última actualización: 2026-10-05.

---

## 1. Qué es DESJ

**DESJ** es un asistente personal con IA estilo "JARVIS" para **Steven**, cliente de AG Software Agency (Andrés Gil). Vive en una **app nativa de iPhone** (y más adelante también en web). Su objetivo es **ahorrarle tiempo en tareas repetitivas** de su vida personal y de sus negocios: Steven le habla o le escribe como a una persona y DESJ **actúa**, no solo contesta.

- **Nombre:** DESJ (antes se le llamaba "JARVIS").
- **Usuario principal:** Steven (usa **iPhone**).
- **Desarrollador:** Andrés Gil (AG Software Agency). Primera app móvil que programa; viene de React/Next.js.
- **Pago:** acordado aparte. No se cotiza ni se habla de presupuesto en este proyecto.

## 2. Origen y referencia

Steven se inspiró en el **JARVIS de @adrian.alvarezl** (Instagram), que se arma en 8 módulos:

1. **El cerebro:** Claude Code en su computadora.
2. **El contexto:** una carpeta con quién eres y cómo trabajas (Obsidian).
3. **Las conexiones:** Gmail, Calendar, Drive, Notion (y Composio para el resto).
4. **Las habilidades:** skills, procesos escritos una vez que salen igual siempre.
5. **La puerta:** un bot de Telegram (notas de voz).
6. **Las rutinas:** agentes que se activan solos a su hora (resumen a las 07:40).
7. **Un panel:** todo el sistema en una pantalla.
8. **Chatbots:** responden DMs automáticamente.

**Diferencia clave con DESJ:** el de Adrián corre en su computadora con su suscripción. DESJ debe estar **24/7 en el teléfono de Steven**, así que vive en la nube y usa la API de Claude. Y en vez de Telegram, **el chat y la voz están dentro de la propia app**.

## 3. Lo que pidió Steven (requerimientos)

Encuesta: propósito = *ahorrar tiempo en tareas repetitivas*; tipo = *app o plataforma con usuarios, login y datos*.

### Personal (prioridad: "más que todo es la parte de la salud")
- **Recordatorios y alarmas.**
- **Medicamentos:** "tómate las pastillas de tal cosa a esta hora".
- **Exámenes de sangre:** guardarlos y que la IA haga un análisis (lectura, rangos, tendencias).
- **Entrenamiento:** enlazar con su reloj **Garmin**.

### Negocios
- **Inmobiliaria:** basada en los aspectos **legales de Venezuela**.
- **Compraventa de carros:** también "muy bien amarrada en la parte legal".
- **Commodities:** oro, plata y otras materias primas.
- **Ganadería:** donde está entrando de lleno; quiere foco fuerte aquí.
- **Abierto a otros negocios** (legal y mercado financiero).

## 4. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Plataforma | **App nativa**, Steven usa iPhone. Android sale del mismo código. |
| Tecnología | **Expo (React Native) + Expo Router + TypeScript**, SDK 57. |
| Canal de conversación | **Chat dentro de la app**, con texto y **voz de ida y vuelta**. Nada de WhatsApp/Telegram. |
| Avisos | Notificaciones del teléfono (locales al principio; push después). |
| Costo inicial | Andrés y Steven lo deben poder usar **gratis al principio**. |
| Código | Repositorio **privado en GitHub** de Andrés (`desj`). Carpeta local: `C:\desj`. |
| Cerebro IA | **Claude**, llamado desde una **Edge Function de Supabase**. La API key **nunca** va dentro de la app. |
| Base de datos y login | **Supabase** (Postgres, Auth, Storage, pgvector para la base legal). |
| Garmin | La API de Garmin está **cerrada a nuevos desarrolladores** (2026). Se leen los datos vía **Apple Health** (Garmin Connect sincroniza ahí). Terra cuesta $499/mes: descartado. |
| Calendario | **Calendario del propio teléfono** con `expo-calendar` (Google Calendar aparece ahí si la cuenta está agregada en el iPhone). $0, sin OAuth. **No funciona en Expo Go** (SDK 57): requiere development build. Google Calendar API (OAuth) queda para cuando el servidor necesite la agenda con la app cerrada. |
| Usuarios | Por ahora **2 usuarios** (Andrés y Steven). Cada uno tiene su **contexto privado** (perfil, memorias, chat, pastillas, recordatorios) aislado con RLS. Las cuentas se crean desde el panel de Supabase; no hay registro público. |
| Modelo de Claude | `claude-sonnet-5` por defecto (cambiable con el secreto `CLAUDE_MODEL`). |
| Hosting de servidor | Evitar planes gratis que "se duermen" (p. ej. Render free: tarda en despertar). Supabase responde sin ese retraso. |

## 5. Módulos

| Módulo | Qué hace | Fase |
|---|---|---|
| Núcleo | Saludo, resumen del día, accesos rápidos | 0 ✅ |
| Chat + voz | Hablar/escribir con DESJ; responde en texto y voz | 0 (demo) → 1 (Claude) |
| Recordatorios / rutinas | Avisos a su hora; resumen diario 07:40 | 0 ✅ (locales) |
| Salud · medicamentos | Plan diario, marcar tomadas, avisos diarios | 0 ✅ |
| Salud · exámenes | Subir PDF/foto, extraer valores, comparar con rango y exámenes previos, preguntas para el médico | 2 |
| Salud · Garmin | Sueño, FC reposo, pasos, entrenos vía Apple Health | 2 |
| Ganadería | Rebaño por lotes, pesajes, vacunas, partos, alertas sanitarias | 2 |
| Legal (inmuebles y carros) | Responde con base en leyes venezolanas cargadas, cita la fuente, checklists y plantillas | 2 |
| Mercado / commodities | Precios de oro, plata, materias primas, ganado en pie; alertas | 3 |
| Panel web | Todo en una pantalla desde la computadora | 3 |

## 6. Hoja de ruta

- **Fase 0 (hecha):** esqueleto Expo con 5 pestañas, estética HUD, salud con recordatorios reales, chat demo con voz, rutinas.
- **Fase 1:** Supabase (login de Steven, datos en la nube) + Edge Function con Claude como cerebro del chat (con memoria de Steven y herramientas: crear recordatorio, registrar toma, etc.).
- **Fase 2:** micrófono (voz a texto) → requiere *development build*; exámenes de sangre con IA; Garmin vía Apple Health; ganadería; base legal.
- **Fase 3:** commodities con alertas, panel web, otros negocios.

Punto de control entre fases: Steven lo usa ~2 semanas y lo aprueba. La base legal la valida un abogado antes de activarse.

## 7. Arquitectura

```
iPhone (app DESJ, Expo)
  ├─ Chat + voz ──────────────┐
  ├─ Notificaciones locales   │
  └─ Apple Health (Garmin)    │
                              ▼
            Supabase Edge Function  ──►  Claude API (cerebro, tool use)
                              │
                              ▼
            Supabase: Postgres · Auth · Storage · pgvector
            (datos, archivos, login, memoria; RLS: cada dato solo de Steven)
```

## 8. Estado actual del código (fase 0)

```
src/
  app/                 ← cada archivo es una pantalla (Expo Router)
    _layout.tsx        ← 5 pestañas: Núcleo, Chat, Salud, Negocios, Rutinas
    index.tsx          ← Núcleo: saludo por hora, anillo HUD, resumen
    chat.tsx           ← Chat; responde en voz (expo-speech), VOZ ON/OFF
    salud.tsx          ← Pastillas: marcar, agregar, quitar (long-press), recordatorios diarios
    negocios.tsx       ← Ganadería, legal, mercado (datos de EJEMPLO)
    rutinas.tsx        ← Interruptores que programan avisos diarios
  components/
    ui.tsx             ← Screen, Card, Title, Label, Mono, Row, HudRing
    icons.tsx          ← íconos SVG de las pestañas
  lib/
    store.tsx          ← estado global en AsyncStorage (meds, tomas por día, rutinas)
    notifications.ts   ← permisos y avisos locales (diarios / una vez)
    brain.ts           ← cerebro DEMO por reglas (será reemplazado por Claude)
  theme.ts             ← colores y fuente mono
```

Fase 1 (código listo, falta desplegar):

```
src/components/login.tsx   ← pantalla de entrada (correo + contraseña)
src/lib/supabase.ts        ← cliente Supabase (si faltan variables de entorno → modo local/demo)
src/lib/auth.tsx           ← sesión y nombre del perfil
src/lib/calendar.ts        ← agenda de hoy y crear eventos (expo-calendar; inactivo en Expo Go)
supabase/migrations/       ← tablas + RLS: profiles, memories, messages, meds, med_intakes, reminders, documents + bucket "documentos"
supabase/functions/chat/   ← Edge Function: contexto del usuario + Claude con herramientas
```

- **Sin `.env`** la app funciona como antes: datos solo en el teléfono y `think()` por reglas (demo).
- **Con `.env` y sesión:** pastillas y tomas en Supabase; el chat llama a `chat`, que arma el contexto privado del usuario (perfil, memorias, pastillas, recordatorios, agenda de hoy, últimos 20 mensajes) y deja que Claude use herramientas: `guardar_memoria`, `borrar_memoria`, `crear_recordatorio`, `crear_evento`, `registrar_toma`, `agregar_medicamento`.
- Recordatorios y eventos los ejecuta el teléfono (notificación local / calendario) con lo que devuelve la función.
- El contexto "se va alimentando": Claude guarda memorias solo cuando aprende algo duradero. También se pueden cargar a mano en la tabla `memories` (source `manual`) o en `profiles.about`.
- Los medicamentos de ejemplo del modo demo (Omega 3, Magnesio, Vitamina D) son **ficticios**.

## 9. Diseño (estética HUD morada)

Inspirada en el carrusel de Adrián: fondo casi negro con puntos, anillos concéntricos, etiquetas en mayúsculas monoespaciadas ("MÓDULO 04 · SALUD"), una palabra del título resaltada en lila.

| Token | Color | Uso |
|---|---|---|
| `bg` | `#07050D` | fondo |
| `card` | `#120C1F` | tarjetas |
| `cardBorder` | `#2B2142` | bordes |
| `border` | `#4C3780` | bordes destacados |
| `accent` | `#A855F7` | botones principales, anillos |
| `accentSoft` | `#C4B5FD` | links, horas |
| `accentText` | `#C9A7FF` | palabra resaltada del título |
| `text` | `#F1EAFE` | texto |
| `muted` | `#A99BC4` | texto secundario |
| `ok` / `warn` / `bad` | `#6EE7B7` / `#F5B451` / `#FB7185` | estados |

Mockups de referencia (10 pantallas + 4 propuestas de la vista de salud: A Puntaje, B Línea del día, C Voz primero, D Monitor). Recomendado: **C como principal de salud y B como segunda pestaña**.

## 10. Reglas del producto (no negociables)

- **Salud:** DESJ **no diagnostica** ni cambia dosis. Ordena, compara con rangos, muestra tendencias y prepara preguntas para el médico. Debe decirlo en la app.
- **Legal:** responde **solo con documentos cargados**, **cita la fuente** y recomienda validar con abogado antes de firmar.
- **Commodities:** precios, alertas y resúmenes sí; **no es asesoría financiera**, no recomienda comprar/vender.
- **Datos sensibles:** cifrados y con acceso solo de Steven (RLS en Supabase). Nada se comparte con terceros.
- **No inventar datos** en pantallas reales: si falta un valor, se muestra vacío o "[pendiente]".

## 11. Costos

| Concepto | Costo |
|---|---|
| Desarrollo y prueba en **Expo Go** | $0 |
| Supabase plan gratis | $0 |
| Recordatorios locales | $0 |
| **Claude API** | por uso (centavos a pocos $/mes en pruebas) |
| Apple Developer (app propia / App Store) | $99/año, solo cuando se necesite |

Estimado en producción (servicios a nombre de Steven): **~$65–$125/mes**, comunicado como "~$100/mes" (Claude $15–40, Supabase Pro $25, Vercel Pro $20 si hay panel web, voz $5–15, datos de mercado $0–15, Apple ~$8/mes, dominio ~$1).

## 12. Cómo se trabaja en el código

```bash
npm install            # una vez (en Windows, desde la terminal de VS Code)
npx expo start         # arrancar; escanear QR con el iPhone (Expo Go)
npx expo start --tunnel# si el iPhone no está en el mismo Wi-Fi
npx tsc --noEmit       # revisar tipos
npx expo install <pkg> # instalar librerías (NUNCA npm install <pkg>)
```

- Guardar en VS Code → el iPhone se actualiza solo.
- Expo cambia mucho entre versiones: antes de usar una API, revisar la doc de **SDK 57** (`https://docs.expo.dev/versions/v57.0.0/`). Ver también `AGENTS.md`.
- Expo Go solo trae sus módulos incluidos. Micrófono (voz a texto), HealthKit y otras librerías nativas requieren **development build** (`eas build --profile development`).
- No editar carpetas `ios/` ni `android/` a mano (se generan).

### Conectar la nube (una vez)

1. Crear proyecto en Supabase y aplicar `supabase/migrations/20261005000000_desj_init.sql`.
2. Desplegar `supabase/functions/chat` (con verificación de JWT activada).
3. Secretos de la función: `ANTHROPIC_API_KEY` (de platform.claude.com) y opcional `CLAUDE_MODEL`.
4. Authentication → desactivar registro público y crear los 2 usuarios (correo + contraseña). Opcional: escribir en `profiles.display_name` y `profiles.about` quién es cada uno.
5. Copiar `.env.example` como `.env` con la URL y la publishable key, y reiniciar `npx expo start`.

## 13. Pendiente de definir con Steven

- [ ] Plazo de la primera versión.
- [ ] Prioridad de arranque: salud o ganadería.
- [ ] Modelo de Garmin.
- [ ] ¿Solo él usa DESJ, o también encargado de finca / asistente?
- [ ] Salud: cuántos medicamentos reales y formato de los exámenes (PDF o foto).
- [ ] Ganadería: cabezas, ceba o leche, qué lleva hoy en cuaderno/Excel.
- [ ] Legal: abogado que valide la base de documentos; trámites más frecuentes.
- [ ] Commodities: solo ver precios o también llevar posiciones.

## 14. Enlaces

- Documento de concepto: https://claude.ai/code/artifact/cfc073d2-84f4-4bbc-a24f-b3d96cb515ba
- Mockups (app, web y propuestas de salud): https://claude.ai/artifact/USELQwhxi7JreX7RcAGWJX
- Referencia: @adrian.alvarezl en Instagram (carrusel "JARVIS").
