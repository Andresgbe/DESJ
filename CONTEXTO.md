# DESJ — Contexto completo del proyecto

> Documento vivo. Léelo antes de tocar el código (personas e IAs).
> Última actualización: 2026-11-18.

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
| Calendario | Estilo Google Calendar: vistas Agenda, Día, Semana y Mes con eventos en los 11 colores de Google, detalle al tocar y botón "+" para crear (con color). Google Calendar si está conectado (si no, el del teléfono), recordatorios de DESJ y pastillas | 1 ✅ (calendario del teléfono requiere development build) |
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
    (tabs)/calendario.tsx  ← estilo Google Calendar: Agenda / Día / Semana / Mes, detalle del evento, "+" flotante (Screen overlay) para crear con color
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
    desj-core.tsx          ← DesjCore: el cerebro con el prisma en el centro + línea de estado (D·E·S·J · hora · estado)
    prism.tsx              ← Prism (logo animado con 5 estados, centro del cerebro) y PrismMark (logo quieto; hoy sin uso, el header ya no lleva marca)
    prism-shape.ts         ← forma del prisma como texto SVG (la usan la app y design/logo.mjs)
    brain-graph.ts         ← modelo del cerebro: genera la red 3D (grupos = módulos) y proyecta cada cuadro
    neural-core.tsx        ← dibujo del cerebro con Skia (teléfono) · neural-core.web.tsx ← con <canvas> (web)
    neural-bg.tsx          ← red 2D sutil de fondo de todas las pantallas
    suit-graph.ts          ← modelo de la armadura de YO (superficies con anillos y costuras) · suit-core.tsx (Skia) / suit-core.web.tsx (canvas)
    chat-panel.tsx         ← conversación (texto + voz) · chat-history.tsx ← hoja de historial
    chat-menu.tsx          ← menú hamburguesa del Núcleo: historial, nueva conversación, voz, volver a DESJ
    chat-panel.tsx         ← la conversación: burbujas ("En cola" / "Sin respuesta"), franja "Reintentar conexión", barra del chat
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
    brain.ts               ← askDesj() (Edge Function o cola del worker), retryQueue() ("Reintentar conexión") y think() (reglas, modo demo)
    layout.ts              ← useLayout(): teléfono o computadora según el ancho de la ventana
    calendar.ts, notifications.ts, supabase.ts, auth.tsx, confirm.ts
  theme.ts                 ← C, S, R: se arman desde design/tokens.json
design/
  tokens.json              ← copia exacta de los tokens del Design System (https://claude.ai/artifact/7CsREDLrakrXsKvdy7WDVu)
  README.md                ← cómo sincronizar
  logo.mjs                 ← variantes del ícono (Prisma); scripts/render-logo.mjs genera los PNG
  prisma/                  ← los 5 SVG originales del Prisma (uno por estado)
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

Inspirada en el carrusel de Adrián y en los grafos tipo "Jarvis": fondo casi negro azulado, el **cerebro** (una red neuronal 3D grande que gira, con un grupo de nodos por módulo, conexiones, señales que viajan y el **Corazón de DESJ** (el Prisma, el logo) en el centro), etiquetas en mayúsculas monoespaciadas ("MÓDULO 04 · SALUD") y una palabra del título resaltada en azul.

**Decisión (18 oct 2026):** el HUD de anillos concéntricos se reemplazó por el cerebro. Se dibuja con `@shopify/react-native-skia` en el teléfono (viene en Expo Go) y con `<canvas>` en web. Cuando DESJ piensa, el cerebro acelera, salen más señales y el núcleo brilla más.

**Logo: el Corazón de DESJ (18 nov 2026).** El logo de DESJ se llama **Corazón de DESJ** (así se le dice desde el 18 nov 2026). Es el **Prisma Interconectado, versión B**: tres cuchillas de vidrio biselado que forman un triángulo, repetidas cada 120°, con un triángulo punteado y un nodo en el centro. Se diseñó con Gemini: https://gemini.google.com/share/a6e977fe4c45?social_preview=true&skid=b4415182-9fcf-44bd-9474-36238675a063 (propuesta "Vista Maestra A+B+C"). Los 5 SVG originales están en `design/prisma/` (`online`, `listening`, `thinking`, `responding`, `alert`).
- **Dónde va:** en el centro del cerebro, al 42 % del lado del cerebro (reemplazó a la esfera de alambre; el cerebro bajó de 1.500 a 1.200 nodos para que el corazón respire) y como ícono: favicon, ícono de la web instalable (PWA), ícono del iPhone y splash. Dentro del cerebro va el triángulo con un anillo propio, fino y translúcido como en la referencia de Gemini (dos círculos finos y uno punteado, del color del estado, con un velo oscuro muy leve: los nodos de atrás se siguen viendo); los nodos interiores del cerebro están un poco apartados del centro para dejarle espacio; los anillos grandes y los 4 puntos en órbita van solo en el ícono.
- **Código:** la forma está en `src/components/prism-shape.ts` (texto SVG puro, sin React Native) y la usan la app (`prism.tsx`) y los íconos (`design/logo.mjs`). Los colores salen de los tokens `prism-*`; las luces y sombras de cada estado se calculan mezclando su color con blanco y con el fondo.
- **Estados** (cambian el color del prisma y la línea de estado bajo el cerebro):

| Estado | Token | Color (Pantone) | Cuándo | Movimiento |
|---|---|---|---|---|
| En línea | `prism-online` | `#3993F5` Azul Eléctrico (PMS 2727 C) | reposo | respira despacio |
| Escuchando | `prism-listening` | `#45B6FE` Cian Holográfico (PMS 2985 C) | dictado por voz activo | cuchillas un poco abiertas |
| Pensando | `prism-thinking` | `#8EE0FF` azul muy clarito, con las sombras del vidrio en azul (`border`) para que no se vea plateado (antes `#A9DDFF`, y en la propuesta original `#596D8C` Gris Pizarra Azulado, PMS 7545 C) | DESJ prepara la respuesta | todo se acelera: el cerebro gira ~2× más rápido y las señales vuelan; las cuchillas del corazón laten rápido por turnos y respira más rápido |
| Respondiendo | `prism-responding` | `#64F4AC` Verde Menta Neón (PMS 3385 C; antes `#8EA4C8` Azul Acero Claro, cambiado el 18 nov 2026) | lee la respuesta en voz alta (o 1,5 s al llegar si la voz está apagada) | cuchillas apenas abiertas |
| Alerta | `prism-alert` | `#FF2A54` Rojo Neón Alerta (PMS 1925 C) | pendientes atrasados | cuchillas abiertas y respiración rápida |

  [pendiente] conectar **Alerta** a los pendientes atrasados: el componente ya la soporta, pero hoy el Núcleo solo usa En línea, Escuchando, Pensando y Respondiendo.
- **Resto de la paleta de la propuesta (referencia, no son tokens):** Abismo Nocturno `#040811` (PMS 296 C, fondo), Pizarra HUD `#0A1224` (PMS 282 C, tarjetas), Rojo Carmesí Vencido `#C8102E` (PMS 186 C, notificaciones pasadas y bordes de alerta). La app sigue con sus fondos `bg`/`card` y su verde `ok`; si se quiere adoptar alguno, primero se agrega como token.
- **Regenerar los íconos** después de cambiar el logo: `node scripts/render-logo.mjs` (con Playwright) o `node scripts/render-logo.mjs <ruta a puppeteer-core>` (Chrome en Windows). Necesita Node 22.18 o más nuevo.

**Núcleo (18 oct 2026):** sin saludo ni fecha. Al entrar solo se ve DESJ grande y centrado con el botón **HABLAR CON DESJ**; al tocarlo el cerebro se achica y sube (450 ms) y aparece la conversación. Historial, conversación nueva, voz y "Volver a DESJ" están en el menú hamburguesa, a la **izquierda** del header.

**Header (18 nov 2026):** se quitó la marca "DESJ" (y el logo) de la izquierda del header. Ahí va el menú de la pantalla si tiene uno (la hamburguesa del Núcleo, que abre su lista hacia la derecha); si no, ese lado queda vacío. Las pantallas internas siguen con la flecha "‹ DESJ" para volver. **Mismo diseño, otra proporción:** en computadora (ventana ≥ 900 px) el header va a todo lo ancho de la ventana (no en la columna) y sus controles crecen a 44 pt (hamburguesa, ANIM, perfil) con textos más grandes; las medidas están en `useLayout().header` (`lib/layout.ts`). El tag "MÓDULO 0X · NOMBRE" se quitó del header (18 nov 2026): a la derecha quedan la hora, ANIM y el perfil.

**Núcleo más limpio (18 nov 2026):** se quitó la línea "D·E·S·J · hora · estado" de debajo del cerebro (el estado se ve en el color del Corazón de DESJ y la hora está en el header, `HeaderClock` con `lib/clock.ts`). Con la conversación abierta ya no hay nada encima del chat: se quitaron el chip de la agenda ("Día libre") y los botones Historial y Nueva, que viven solo en la hamburguesa.

**Chat más claro (11 nov 2026):** con la conversación abierta, **Historial** y **Nueva** quedan a la vista arriba a la derecha (botones de contorno con ícono y texto); el menú hamburguesa los repite y suma la voz y "Volver a DESJ". Tus mensajes que el worker no respondió muestran "● En cola" (o "● Sin respuesta" si fallaron), y sobre la barra aparece una franja con **Reintentar conexión**: vuelve a poner en la cola todo lo pendiente o fallido (hasta 50 por toque) (con la agenda de hoy y `context.retried_at`, para que el worker no lo dé por vencido), espera ~25 s a que el worker lo tome (si no, sigue apagado y todo queda en cola), muestra el avance, recarga la conversación y ejecuta en el teléfono los avisos y eventos de cada respuesta. El worker guarda `context.reply_to` en cada respuesta para que la app sepa a qué mensaje contesta, y si el mensaje esperó más de 1 h le dice a Claude cuándo se escribió (para que "ayer" sea el día correcto).

**Campo del chat y mensajes largos (11 nov 2026):** el campo es multilínea y crece hasta ~6 líneas (después hace scroll). En computadora Enter envía y Shift+Enter baja de línea; en el iPhone la tecla de retorno baja de línea y se envía con el botón. El foco se marca en el borde de la barra, sin el anillo del navegador. En el worker, un mensaje de más de 4000 caracteres (hasta 60.000, `DESJ_WORKER_MAX_LONG_CHARS`) ya no se rechaza: se guarda en `mensaje.md` de la carpeta temporal y Claude lo lee por partes con Read, hace lo que pida cada parte y responde sobre el conjunto; en el historial de los mensajes siguientes se recorta a 3000 caracteres. El cerebro `api` (Edge Function) sigue con el límite de 4000.

**Módulo YO (18 oct 2026):** la pestaña Salud se reemplazó por **YO**. Muestra una armadura holográfica genérica que gira (inspirada en la referencia; no es el modelo de Iron Man, que es de Marvel) con tus datos a los lados, leídos de perfil.md y salud.md con el formato `- **Campo:** valor` (Talla, Peso, Tipo de sangre, Fecha de nacimiento o Edad). Adentro viven los módulos personales: Salud, Plan físico y Tus datos.

**Teléfono y computadora (7 nov 2026):** la web y el iPhone son el mismo código (React Native Web). El diseño cambia según el **ancho de la ventana**, no según la plataforma, para que la web abierta en el teléfono se vea como el teléfono: `useLayout()` (`src/lib/layout.ts`) devuelve `wide` cuando la ventana mide ≥ `breakpoint-wide` (900 px) y la columna máxima (`column-max` 640 px en teléfono, `column-desk` 960 px en computadora). `Screen` la aplica sola; el Núcleo y YO la usan para el tamaño del cerebro y de la armadura. Para que algo cambie solo en computadora: `const { wide } = useLayout()` y `style={[styles.x, wide && styles.xAncho]}`. El Calendario conserva su propio corte de 700 px para las celdas del mes.

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
- **NEXUS desde DESJ (11 nov 2026):** para la cuenta `DESJ_NEXUS_USER_ID` (solo Andrés) el worker suma el MCP de NEXUS (`career-os/mcp-server/index.js`, ruta cambiable con `DESJ_NEXUS_MCP`) y permite `mcp__nexus__*`; así "DESJ, agrega una tarea al tablero de Lorenzo Broker" funciona. Ese MCP entra con el login de Andrés en `career-os/mcp-server/.env` (anon key, RLS de NEXUS) y trae herramientas genéricas de ver/crear/editar/borrar (`crud.js`): contraseñas ocultas, borrar solo con confirmación. Steven y el cerebro `api` no lo tienen.

### Publicar la versión web instalable (iPhone gratis)

```bash
npx eas-cli@latest login   # una vez
npm run deploy:web         # exporta a dist/ y publica en producción (EAS Hosting)
```

- Necesita el `.env` con Supabase: las variables `EXPO_PUBLIC_` quedan dentro del sitio al exportar. El script exporta con `--clear` (Metro guarda esas variables en caché) y corre `scripts/web-index-routes.mjs`, que copia `yo/index.html` como `yo.html`: sin eso, recargar `/yo` o `/modulos` da 404 en EAS Hosting.
- `src/app/+html.tsx` pone las etiquetas de iOS (pantalla completa, ícono, nombre) y enlaza `public/manifest.json`; los íconos están en `public/`. Son el **Prisma** (ver §9), generados con `scripts/render-logo.mjs`.
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
- Logo Prisma B y paleta Pantone (propuesta en Gemini): https://gemini.google.com/share/a6e977fe4c45?social_preview=true&skid=b4415182-9fcf-44bd-9474-36238675a063
- Referencia: @adrian.alvarezl en Instagram (carrusel "JARVIS").

**Calendario Semana/Día y archivos en mosaico (25 oct 2026):** la pestaña Calendario tiene vistas Mes, Semana y Día; en Semana y Día los eventos se ubican por hora (los que se pisan van en columnas), los de todo el día arriba, y una línea marca la hora actual. Tocar un espacio vacío abre Agregar con esa hora; tocar el día en la cabecera abre la vista Día. En Salud, los archivos de un registro se ven como mosaicos pequeños (2 por fila en el teléfono, 3 o 4 en pantallas anchas); la foto en grande solo se abre con "Ampliar" (visor dentro de la app; los PDF se abren en el visor del teléfono o del navegador).

**Finanzas más legible (25 oct 2026):** la sección (Ingresos y gastos / Deudas / Presupuesto) se elige en una lista plegable. Ingresos y Gastos van en una fila y el Balance del mes en otra. El desglose por categoría y los movimientos son plegables y muestran 5; el resto con "Ver N más", que siempre empieza cerrado. La gráfica se dibuja aunque el mes esté vacío (todo en cero) y, al cambiar de mes, la vista se vacía enseguida y descarta las respuestas tardías (`loadMonth`).

**Módulos NO MORE y TO BUY (25 oct 2026):** el catálogo de Módulos ahora tiene cuatro tipos: Negocios, Vehículo, No more y To buy (los dos nuevos, uno por persona).
- **No more** (`/modulos/nomore`, `lib/nomore.ts`, `lib/nomore-content.ts`, `components/nomore.tsx`, migración `20261026000000_nomore`): contadores de días sin lo que la persona está dejando (varios a la vez), con reloj en vivo, próxima meta (1, 3, 7, 14, 21, 30, 60, 90, 180, 365 días y luego cada año), mejor racha, "Perdí la racha" (guarda cuánto duró y una nota en `nomore_resets`) e historial. También tiene un mensaje de aliento por día, otro mensaje al perder la racha y versículos Reina-Valera 1960 con "Otro versículo". Pide un PIN de 4 dígitos cada vez que se entra y se bloquea al salir de la pantalla. El PIN se guarda como SHA-256 de "sal:pin" (`expo-crypto`) y tras 5 intentos fallidos hay que esperar 30 s. Si se olvida, con sesión se recupera con la contraseña de la cuenta. DESJ no lee estos datos (el prompt lo dice).
- **To buy** (`/modulos/tobuy`, `lib/tobuy.ts`, migración `20261026010000_tobuy`): lista de compras con categorías (se siembran Supermercado, Farmacia y Hogar; se agregan, renombran, cambian de color y borran) y filtro por categoría. Solo se ven las pendientes, agrupadas por categoría; lo marcado pasa a "Completado", que está plegado. DESJ todavía no lee ni edita la lista.

**Calendario estilo Google (26 oct 2026):** se rehízo para parecerse a Google Calendar.
- Vistas Agenda, Día, Semana y Mes (la de 3 días se quitó el 11 nov 2026); la elegida se recuerda en el dispositivo (`desj:calendar:view`).
- Los eventos van en bloques de color sólido. Para Google se usan sus 11 colores de evento (`GOOGLE_COLORS` en `lib/calendar.ts`, según el `colorId`; sin color, Pavo real). Los recordatorios de DESJ van en ámbar (`C.warn`). El texto sobre cada color se elige claro u oscuro según la luminancia.
- Tocar un evento abre su detalle (fecha, hora, lugar, origen y Borrar).
- El botón flotante "+" (`Screen overlay`) abre Crear: título, Evento o Recordatorio, fecha, desde/hasta y color. El color llega a Google como `colorId` por `google-auth` → `calendarInsert`.
- En Mes, tocar un día lo elige y el día elegido se ve abajo como en la Agenda; tocarlo otra vez abre la vista Día.

**Módulos UNIVERSIDAD y HORARIOS (26 oct 2026):** dos tipos más en el catálogo, uno de cada uno por persona (migración `20261026020000_universidad_horarios`). Los dos usan `lib/module-db.ts` (`useModuleDb`): un hook genérico para módulos sencillos que maneja las tablas en Supabase o en el teléfono (`desj:<key>:<módulo>`), con insert, update y remove. En local las hijas se borran a mano.
- **Universidad** (`/modulos/universidad`, `/modulos/materia/[id]`, `lib/university.ts`, `components/university.tsx`): materias (nombre, profesor y color) y plan de evaluación (evaluación, %, nota sobre 20 u otro máximo, fecha). Muestra el acumulado sobre 20, el % evaluado y el promedio que falta para llegar a 10, y avisa si el plan no suma 100%. Las 15 semanas de clases son plegables ("Semana 5 · MAR · Integrales por partes"). Los links rápidos llevan el logo del sitio (favicon por el servicio público de Google, que solo recibe el dominio; si falla, sale la inicial) y pueden ser del módulo o de una materia.
- **Horarios** (`/modulos/horarios`, `lib/schedules.ts`): personas ("Yo" se crea solo, más los amigos, con color y teléfono para WhatsApp) y sus bloques semanales (día, entra, sale, materia). Por día muestra "¿Quién te da la cola?": para ir, amigos que llegan hasta 90 min antes que tú (o 15 min después); para volver, amigos que salen hasta 90 min después (o 15 min antes). Debajo, una línea de tiempo de 6:00 a 22:00 por persona.
- DESJ todavía no lee estos módulos (lo dice el prompt).

**Links de Universidad: ordenar y borrar (26 oct 2026):** mantener presionado un link entra en modo edición (como en el iPhone): se arrastra para cambiarlo de orden (`react-native-gesture-handler` Pan con `activateAfterLongPress`, más Reanimated) y la ✕ lo borra; un toque corto lo abre. Los mosaicos van posicionados en absoluto y siempre en el mismo orden en la vista: si se reordenaran los nodos durante el arrastre, en la web el gesto se cancela. El logo y el texto no reciben el puntero, porque si no el navegador arrastra la imagen y corta el gesto. El orden se guarda en lote (`updateMany` de `module-db`). La app ahora está envuelta en `GestureHandlerRootView` (`_layout.tsx`).

**Módulo GOALS (26 oct 2026):** uno por persona (`/modulos/goals`, `lib/goals.ts`, migración `20261026030000_goals`, con `module-db`).
- Metas con plazo corto (este año), mediano (1 a 3 años) o largo (3 años o más) y categoría editable. Se siembran Finanzas, Universidad, Personal, Escritura y Salud.
- Cada meta tiene fecha opcional ("faltan 3 meses"), descripción y pasos marcables.
- El progreso sale de lo que se lleva sobre la meta numérica (`target_amount`/`current_amount`, "$1.200 de $5.000"); si no hay número, de los pasos hechos; si tampoco hay pasos, del porcentaje a mano (0, 25, 50, 75 o 100 %).
- Las pestañas son Corto, Mediano, Largo y Logrados (`done_at`), y se puede filtrar por categoría.
- DESJ todavía no lee las metas (lo dice el prompt).

