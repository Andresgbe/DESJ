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
| Cerebro (inicio) | **Worker local con la suscripción de Andrés** (`desj-worker/`, mismo patrón que NEXUS): la app deja el mensaje en cola y Claude Code lo responde en el computador de Andrés. Solo responde con ese computador prendido. Más adelante: API key (créditos) para atender 24/7; se cambia por persona con `profiles.brain` = `api`, sin tocar la app. |
| Hosting de servidor | Evitar planes gratis que "se duermen" (p. ej. Render free: tarda en despertar). Supabase responde sin ese retraso. |
| Instalar en iPhone gratis (22 oct 2026) | Mientras no se pague Apple Developer (99 USD/año), Steven usa la **versión web instalable** (PWA): se publica en **EAS Hosting** (plan gratis) y en Safari se agrega con Compartir → "Agregar a pantalla de inicio". Sin vencimiento y sin el PC de Andrés (salvo el cerebro `worker`). En web no hay calendario del teléfono, dictado nativo ni recordatorios locales confiables. Con la cuenta pagada se pasa a EAS Build + TestFlight. |

## 5. Módulos

| Módulo | Qué hace | Fase |
|---|---|---|
| Núcleo | Saludo, resumen del día, accesos rápidos | 0 ✅ |
| Chat + voz | Hablar/escribir con DESJ; responde en texto y voz | 0 (demo) → 1 (Claude) |
| Recordatorios / rutinas | Avisos a su hora; resumen diario 07:40 | 0 ✅ (locales) |
| Calendario | Mes y día: calendario del iPhone (Apple + Google vía el teléfono), recordatorios de DESJ y pastillas | 1 ✅ (calendario del teléfono requiere development build) |
| Conocimiento | Archivos Markdown por usuario (perfil, salud, negocios, preferencias) que DESJ lee siempre; entrevista para llenarlos | 1 ✅ (guiada sin nube; con Claude al conectar) |
| Pendientes | Lista de tareas por usuario (reemplaza la pestaña Rutinas) | 1 ✅ |
| Historial de chats | Varias conversaciones por usuario; la memoria es común a todas | 1 ✅ |
| Salud · medicamentos | Plan diario, marcar tomadas, avisos diarios | 0 ✅ |
| Salud · historial médico y contactos | YO · Salud: historial de consultas, laboratorios, estudios y procedimientos, agrupado por año y mes (lo más reciente arriba), cada registro con sus archivos tipificados (informe, orden, resultado, receta) que se ven y descargan; contactos (doctores, clínicas, laboratorios). DESJ los ve, lee los archivos (`leer_registro_medico`), anota resultados y guarda registros, archivos (`adjuntar_a_registro_medico`) y contactos desde el chat | 1 ✅ |
| Salud · pastillas | Varias dosis al día (1–12), cada una con hora opcional; se marca cada dosis; avisos solo para dosis con hora | 1 ✅ |
| Mis datos | YO · Mis datos: formulario de datos básicos y médicos que escribe en perfil.md y salud.md (se ve en Conocimiento) | 1 ✅ |
| Finanzas | YO · Finanzas: Ingresos y gastos en Bs, dólar BCV, efectivo, USDT y euro llevados a dólar BCV (tasas de DolarAPI), con gráfica diaria, desglose por categoría, tasas y categorías editables; Deudas; Presupuesto mensual (recurrentes + puntuales). DESJ registra movimientos desde el chat (`registrar_movimiento`, `actualizar_tasas`, `fijar_tasa`) | 1 ✅ |
| Módulos | Pestaña MÓDULOS con catálogo cerrado: la persona agrega, quita y ordena módulos, y cada tipo tiene su propia vista. Hoy: **Negocios** (uno) y **Vehículo** (uno por carro: ficha y kilometraje, mantenimientos con el próximo por km o fecha, papeles con vencimiento y foto/PDF, y "Próximos" arriba). DESJ: `registrar_mantenimiento`, `actualizar_km`, `guardar_papel_vehiculo` | 1 ✅ |
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
  app/                     ← cada archivo es una pantalla (Expo Router)
    _layout.tsx            ← raíz: sesión, datos, pila (Stack) con las pestañas y las pantallas del menú de perfil
    (tabs)/_layout.tsx     ← 5 pestañas: Núcleo, Calendario, YO, Módulos, Pendientes
    (tabs)/index.tsx       ← Núcleo: al entrar solo el cerebro grande + botón "Hablar con DESJ"; al tocarlo el cerebro se achica y aparece el chat, estado del día y el chat con DESJ (con historial)
    (tabs)/calendario.tsx  ← mes + día: calendario del teléfono, recordatorios de DESJ y pastillas; agregar
    (tabs)/yo/index.tsx    ← módulo YO: armadura holográfica que gira + altura, peso, IMC, edad, sangre, pastillas; entrada a los módulos personales
    (tabs)/yo/salud.tsx    ← YO · Salud: pestañas Pastillas (dosis múltiples, horas opcionales, recordatorios), Historial (año → mes → día) y Contactos
    (tabs)/yo/examen/[id].tsx ← detalle de un registro del historial: datos, archivos por tipo con vista previa y descarga, editar, borrar
    (tabs)/yo/mis-datos.tsx ← YO · Mis datos: formulario que escribe en perfil.md / salud.md
    (tabs)/yo/finanzas.tsx ← YO · Finanzas: pestañas Ingresos y gastos, Deudas, Presupuesto
    (tabs)/modulos/index.tsx ← MÓDULOS: tus módulos; catálogo para agregar; quitar y ordenar
    (tabs)/modulos/[id].tsx ← módulo Vehículo: próximos, ficha, mantenimientos y papeles
    (tabs)/modulos/negocios.tsx ← ganadería, legal, mercado (datos de EJEMPLO)
    (tabs)/pendientes.tsx  ← tareas por hacer (Atrasados, Hoy, Próximos, Sin fecha, Hechos); DESJ las crea/completa
    conocimiento.tsx       ← entrevista + archivos Markdown que DESJ lee antes de cada respuesta
    ajustes.tsx            ← cuenta, permisos, versión, cerrar sesión
  components/
    ui.tsx                 ← Screen (header con círculo de perfil), Card, Title, Label, Mono, Row, HudRing
    desj-core.tsx          ← DesjCore: el cerebro + línea de estado (D·E·S·J · hora · estado)
    brain-graph.ts         ← modelo del cerebro: genera la red 3D (grupos = módulos) y proyecta cada cuadro
    neural-core.tsx        ← dibujo del cerebro con Skia (teléfono) · neural-core.web.tsx ← con <canvas> (web)
    neural-bg.tsx          ← red 2D sutil de fondo de todas las pantallas
    suit-graph.ts          ← modelo de la armadura de YO (superficies con anillos y costuras) · suit-core.tsx (Skia) / suit-core.web.tsx (canvas)
    chat-panel.tsx         ← conversación (texto + voz) · chat-history.tsx ← hoja de historial
    chat-menu.tsx          ← menú hamburguesa del Núcleo: historial, nueva conversación, voz, volver a DESJ
  lib/motion.tsx           ← interruptor ANIM ON/OFF del header (se guarda en el dispositivo): en OFF todo queda estático
    profile-menu.tsx       ← círculo de perfil y menú desplegable
    login.tsx, icons.tsx
    form.tsx               ← Field, Choice, Btn: controles de formulario de los módulos
    health.tsx             ← piezas de Salud: formulario y fila de examen, contactos, selector de archivos
    modules.tsx            ← ícono por tipo de módulo y catálogo de módulos disponibles
    vehicle.tsx            ← módulo Vehículo: ficha, mantenimientos y papeles (formularios y tarjetas)
    finance.tsx            ← Finanzas: gráfica SVG del mes, tasas, categorías, totales, lista y formulario de movimiento
    finance-lists.tsx      ← Finanzas: pestañas Deudas y Presupuesto, selector de mes
  lib/
    store.tsx              ← pastillas, tomas y rutinas (local o Supabase)
    chats.tsx              ← historial de conversaciones (local o Supabase)
    knowledge.ts           ← archivos de conocimiento + entrevista guiada sin nube; writeField (Mis datos)
    health.ts              ← exámenes, archivos de exámenes y contactos de salud (local o Supabase)
    modules.ts             ← catálogo (CATALOG) y módulos de la persona (local o Supabase)
    vehicles.ts            ← módulo Vehículo: ficha, mantenimientos, papeles y cálculo de "Próximos"
    dates.ts               ← fechas DD/MM/AAAA ↔ YYYY-MM-DD, "14 mar 2023", "hace 3 años"
    finance.ts             ← Finanzas: conversión a dólar BCV, totales, datos (local o Supabase) · dolar-api.ts ← tasas de hoy: Edge Function `tasas` (DolarAPI + USDT de Binance P2P, como cc-sacramento; código en supabase/functions/_shared/dolar.ts) o DolarAPI directo sin sesión
    reminders.ts           ← registro de recordatorios de DESJ (notificaciones locales)
    brain.ts               ← askDesj() (Edge Function) y think() (reglas, modo demo)
    calendar.ts, notifications.ts, supabase.ts, auth.tsx, confirm.ts
  theme.ts                 ← C, S, R: se arman desde design/tokens.json
design/
  tokens.json              ← copia exacta de los tokens del Design System (https://claude.ai/artifact/7CsREDLrakrXsKvdy7WDVu)
  README.md                ← cómo sincronizar
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

## 9. Diseño (estética HUD azul tecnología)

**Fuente oficial: el Design System de DESJ** (https://claude.ai/artifact/7CsREDLrakrXsKvdy7WDVu). La app lee sus tokens desde `design/tokens.json`. La tabla de abajo es un resumen.

Inspirada en el carrusel de Adrián y en los grafos tipo "Jarvis": fondo casi negro azulado, el **cerebro** (una red neuronal 3D grande que gira, con un grupo de nodos por módulo, conexiones, señales que viajan y una esfera de alambre en el centro), etiquetas en mayúsculas monoespaciadas ("MÓDULO 04 · SALUD") y una palabra del título resaltada en azul.

**Decisión (18 oct 2026):** el HUD de anillos concéntricos se reemplazó por el cerebro. Se dibuja con `@shopify/react-native-skia` en el teléfono (viene en Expo Go) y con `<canvas>` en web. Cuando DESJ piensa, el cerebro acelera, salen más señales y el núcleo brilla más.

**Núcleo (18 oct 2026):** sin saludo ni fecha. Al entrar solo se ve DESJ grande y centrado con el botón **HABLAR CON DESJ**; al tocarlo el cerebro se achica y sube (450 ms) y aparece la conversación. Historial, conversación nueva, voz y "Volver a DESJ" están en el menú hamburguesa del header.

**Módulo YO (18 oct 2026):** la pestaña Salud se reemplazó por **YO**. Muestra una armadura holográfica genérica que gira (inspirada en la referencia; no es el modelo de Iron Man, que es de Marvel) con tus datos a los lados, leídos de perfil.md y salud.md con el formato `- **Campo:** valor` (Talla, Peso, Tipo de sangre, Fecha de nacimiento o Edad). Adentro viven los módulos personales: Salud, Plan físico y Tus datos.

**Google: Drive, Gmail y Calendar (25 oct 2026):** cada persona conecta su cuenta en Ajustes → Cuenta de Google (solo en la versión web por ahora). OAuth con el proyecto de Google Cloud "DESJ" (publicado sin verificar: al conectar sale "Google no verificó esta app" → Avanzado → Ir a DESJ; sirve hasta 100 usuarios). Permisos mínimos: `drive.file` (solo lo que crea DESJ, en la carpeta "DESJ"), `gmail.send` (no lee correo), `calendar.events`, `userinfo.email`. Flujo: la app abre Google → vuelve a la Edge Function `google-auth` (sin verify_jwt; URI registrada) → reenvía a `/google` de la app → `google-auth` cambia el código y guarda el acceso en `google_accounts` (RLS, con la sesión de la persona). Herramientas: `crear_documento_drive` (Markdown → Doc, CSV → Sheet), `guardar_en_drive`, `enviar_correo` (siempre borrador primero y confirmación), `ver_google_calendar`, `crear_evento_google`. Secretos: `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en Supabase y en `desj-worker/.env`. Política de privacidad pública: https://desj.expo.app/privacidad (`public/privacidad.html`).

**Conocimiento libre y contexto por área (24 oct 2026):** además de los 4 archivos de base (perfil, salud, negocios, preferencias; si se borran vuelven vacíos porque Mis datos y YO los usan) la persona crea, renombra y borra los suyos (`knowledge.slug` libre + `title`). DESJ lee SIEMPRE todo Conocimiento, perfil, memorias, pendientes, recordatorios y agenda; las áreas Salud, Finanzas y Módulos se cargan solo si el mensaje (o los 2 últimos de la persona) habla de ellas (`detectSections` en `context.ts`, por palabras clave y nombres de módulos; con archivos se carga todo). Si le falta un área, Claude la pide con `abrir_seccion`. Los chats se pueden renombrar desde el Historial. Las fechas de los formularios usan `DateField` (mini calendario con mes y año).

**Módulos con catálogo (24 oct 2026):** "Agregar módulo" muestra el catálogo; cada módulo es distinto (no hay bitácora genérica: `module_entries` quedó sin uso). Por ahora el catálogo tiene Negocios (uno por persona, índice único) y Vehículo (varios; tablas `vehicles`, `vehicle_services`, `vehicle_documents`; archivos en `documentos/<usuario>/vehiculos/<módulo>/`). "Próximos" avisa papeles que vencen en 30 días o menos y servicios a 1.000 km o 30 días. Los avisos son en pantalla y por DESJ; no hay notificación push en la versión web.

**Finanzas (23 oct 2026):** réplica del módulo Finance de NEXUS adaptada a DESJ (español de "tú", tokens HUD, chips en vez de selects). Regla: `amount_usd = amount / rate_per_usd`, guardado con el movimiento (cambiar una tasa no toca lo registrado); las tasas nacen en null y nunca se inventan. Tablas `finance_categories`, `finance_rates`, `finance_transactions`, `finance_bills`, `finance_monthly_budget`; se siembran al abrir Finanzas si la cuenta no tiene categorías ni tasas. Los colores de categoría son datos de la persona (paleta en `lib/finance.ts`), no tokens de la interfaz.

**Varios archivos por mensaje (22 oct 2026):** el chat acepta hasta 5 archivos (18 MB entre todos). Van en `messages.attachments` (jsonb; el primero también en las columnas viejas) y llegan a Claude numerados (Archivo 1, 2…); `guardar_registro_medico` y `adjuntar_a_registro_medico` reciben `archivos: [{ numero, tipo_documento }]`.

**Historial médico y dosis (22 oct 2026):** la pestaña Exámenes pasó a ser **Historial**: cada consulta, laboratorio, estudio o procedimiento es un registro con fecha (tabla `health_exams`, tipo `consulta` por defecto) y sus archivos llevan `doc_type` (informe, orden, resultado, receta, imagen, otro). Pastillas: `meds.doses_per_day` + `meds.times` (horas opcionales) reemplazan a `hour`/`minute`; `med_intakes.dose` registra cada dosis.

**YO y Módulos (22 oct 2026):** YO tiene tres módulos: **Salud** (pestañas Pastillas, Exámenes y Contactos; los exámenes se ordenan por la fecha en que se hicieron), **Finanzas** ([pendiente] el MD con la vista) y **Mis datos** (formulario que escribe en perfil.md y salud.md sin tocar el resto del archivo; respeta sinónimos como Altura/Talla). Plan físico se quitó. La pestaña Negocios pasó a ser **MÓDULOS**: cada persona arma su lista (tablas `modules` y `module_entries`); Negocios es el primero por defecto. Archivos de exámenes en Storage: `documentos/<usuario>/salud/<examen>/`.

**Rendimiento (18 oct 2026):** botón **ANIM ON/OFF** en el header de todas las pantallas; en OFF el cerebro y la red de fondo se dibujan una vez y quedan quietos (0 % de CPU). Con animaciones, el cerebro avanza a 30 cuadros por segundo y se pausa cuando el Núcleo no está a la vista. Medido en Chrome sin GPU: ~29 % de un núcleo en ON (casi todo es pintar píxeles; el cálculo es ~3 %), 0 % en OFF; la memoria casi no cambia (~20 MB).

| Token | Color | Uso |
|---|---|---|
| `bg` | `#03070F` | fondo |
| `card` | `#08132A` | tarjetas |
| `cardBorder` | `#15294D` | bordes |
| `border` | `#2763B8` | bordes destacados |
| `accent` | `#2F9BFF` | botones principales, día de hoy |
| `neural-*` | azules, cian, índigo, verde azulado | grupos del cerebro (solo ahí) |
| `accentSoft` | `#8FD0FF` | links, horas |
| `accentText` | `#5CC2FF` | palabra resaltada del título |
| `text` | `#E6F2FF` | texto |
| `muted` | `#8AA3C4` | texto secundario |
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

### Cerebro en el PC de Andrés (worker)

- Requisitos: Node 24, Claude Code de terminal con sesión iniciada (`irm https://claude.ai/install.ps1 | iex`, luego `claude`) y `desj-worker/.env` con la clave secreta de Supabase (copiar `.env.example`).
- Arranque automático: `desj-worker\instalar-inicio.ps1` crea la tarea programada "DESJ worker", que corre `start-worker.bat` sin ventana al iniciar sesión en Windows y lo reinicia si se cae. Log: `desj-worker/worker.log`. Para quitarla: `instalar-inicio.ps1 -Quitar`.
- Solo responde con el PC prendido, con la sesión iniciada y sin suspender.

### Publicar la versión web instalable (iPhone gratis)

```bash
npx eas-cli@latest login   # una vez
npm run deploy:web         # exporta a dist/ y publica en producción (EAS Hosting)
```

- Necesita el `.env` con Supabase: las variables `EXPO_PUBLIC_` quedan dentro del sitio al exportar. El script exporta con `--clear` (Metro guarda esas variables en caché) y corre `scripts/web-index-routes.mjs`, que copia `yo/index.html` como `yo.html`: sin eso, recargar `/yo` o `/modulos` da 404 en EAS Hosting.
- `src/app/+html.tsx` pone las etiquetas de iOS (pantalla completa, ícono, nombre) y enlaza `public/manifest.json`; los íconos están en `public/`. Hoy son el ícono genérico de Expo: [pendiente] ícono propio de DESJ.
- En el iPhone: abrir la URL en **Safari** → Compartir → "Agregar a pantalla de inicio".

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
