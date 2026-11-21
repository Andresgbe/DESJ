This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

# DESJ

DESJ is a personal AI assistant ("JARVIS"-style) iPhone app for two users: Steven (the client) and Andrés (the developer). It saves them time on repetitive tasks in their personal life and businesses. **Read `CONTEXTO.md` before changing anything**: it holds the product context, decisions, modules, roadmap and file map, and it is kept up to date.

- **Language:** all UI text, code comments and messages to the user are in **Spanish** (neutral Latin American, "tú"). Code identifiers stay in English or Spanish as the surrounding code does.
- **Users:** Andrés works in Spanish and is new to mobile; explain Expo/EAS/Supabase steps plainly.

## Architecture

```
iPhone app (Expo SDK 57, Expo Router, TypeScript)
  └─ src/lib/brain.ts askDesj() ──► Supabase Edge Function `chat` ──► Gemini API (function calling)
                                       │ uses the user's JWT, so every query goes through RLS
                                       ▼
                        Supabase project DESJ (ref ffdddvzpoczaljcqlwhc, us-west-2)
                        Postgres · Auth · Storage bucket `documentos`
```

- **Two modes.** Without `.env` the app runs **local** (AsyncStorage, rule-based `think()` in `brain.ts`). With `.env` (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) it requires login and uses Supabase. Every data module (`store.tsx`, `chats.tsx`, `knowledge.ts`, `tasks.ts`, `reminders.ts`) supports both; keep it that way.
- **Privacy is the core rule.** Every table has `user_id default auth.uid()` and RLS "own rows only". New tables must follow the same pattern (add them to the policy loop in the migration). Never use the service-role or secret key in the app or the Edge Function.
- **One brain: Gemini (since 19 Nov 2026).** The app calls the Edge Function `chat`, which answers with Gemini (`supabase/functions/chat/gemini.ts`, plain REST `generateContent`), 24/7. The old Claude worker (`desj-worker/`, subscription on Andrés's PC, queue in `messages.status`) is retired: the app no longer queues messages and `profiles.brain` is always `api`. Every tool and context query filters by an explicit `userId`.
- **Gemini API.** The API key lives only in Supabase Edge Function secrets (`GEMINI_API_KEY`, optional `GEMINI_MODEL`, default `gemini-3.8-flash`, and `GEMINI_THINKING`, default `MEDIUM`). Never put an API key in the app, `.env` or the repo, and never ask the user to paste one in chat.
- **Context Gemini reads on every message** (built in `supabase/functions/chat/index.ts`): profile, the four **knowledge files** (`perfil.md`, `salud.md`, `negocios.md`, `preferencias.md`), memories, meds, reminders, pending tasks, today's phone agenda and the conversation history. Fixed instructions are in `prompt.ts` (keep per-user or time-dependent text out of it). Tools are in `tools.ts`.
- **Phone-side actions.** The function returns `actions` (reminders, calendar events…); the phone executes them (local notifications, `expo-calendar`).

## Supabase workflow

- Schema lives in `supabase/migrations/`. Apply changes with the Supabase MCP (`apply_migration`) or the dashboard SQL editor. **This machine's network blocks direct Postgres connections**, so `supabase db push` and `supabase db query --linked` hang; don't use them.
- Deploy the function with `npx supabase functions deploy chat --project-ref ffdddvzpoczaljcqlwhc --use-api` (HTTPS only, no Docker).
- After any schema change, run the security advisors and confirm RLS is on for every table.
- The function is Deno; it is excluded from the app's `tsconfig`/ESLint. Typecheck it separately against the real `@anthropic-ai/sdk` and `@supabase/supabase-js` types before deploying.

## Design standards

The look is a **dark tech-blue HUD**. Every screen must follow it; when a request conflicts with these rules, say so before building.

**Source of truth: the DESJ Design System** — https://claude.ai/artifact/7CsREDLrakrXsKvdy7WDVu (palette with usage per token, type scale, spacing, radii, component guidelines with previews). Before designing or changing any screen, read its `project/README.md` and `project/tokens.json` with the Artifact tool (`action: "read"`, `path`). `design/tokens.json` is an exact copy of the Design System's `project/tokens.json`, and `src/theme.ts` reads it (`C`, `S`, `R`). To sync after the Design System changes, read its `project/tokens.json` and copy it over `design/tokens.json`; to add a token from the code side, add it to both in the same task, then expose it in `theme.ts`.

- **Tokens only.** Colors, spacing and radii come from `src/theme.ts` (`C`, `S`, `R`, `mono`, `BRAND`), which is generated from `design/tokens.json`. No hex values or new fonts in screens (none exist today outside `theme.ts`; keep it that way); add a token first if one is truly missing.
- **Typography: DESJ Aether** (Sora titles, Plus Jakarta Sans text, JetBrains Mono HUD), loaded with `@expo-google-fonts/*` in `app/_layout.tsx`, one family per weight (`FONTS` in `theme.ts`). Always import `Text` and `TextInput` from `@/components/text`, never from `react-native`: it maps `fontWeight` / `fontFamily: mono` / size to the right family. Brand assets (wordmark, lockups, squircle) are in `design/marca/`; the wordmark component is `components/wordmark.tsx`.
- **Background:** near-black `C.bg` with the subtle `NeuralBackground` (2D network) behind every `Screen`.
- **Signature elements:** the brain (`DesjCore` → `NeuralCore`: a large rotating 3D neural network, one node cluster per module, with the **Corazón de DESJ** ("DESJ's heart": the Prism logo; always call it that in UI text and docs) at its center (`Prism` in `prism.tsx`, colored by DESJ's state: online, listening, thinking, responding, alert; tokens `prism-*`); only on Núcleo and login; Skia on native, `<canvas>` on web, model in `brain-graph.ts`). The Núcleo opens with only the big brain and a "Hablar con DESJ" button; tapping it shrinks the brain and shows the chat. History, New chat, voice and back to DESJ live only in the hamburger menu (`ChatMenu`, passed to `Screen menu=`, at the **left** of the header, opens toward the right); nothing sits above the chat (no agenda chip, no History/New buttons). No status line under the brain: the state shows in the heart's color and the time is in the header (`HeaderClock`, `lib/clock.ts`). When the worker left messages unanswered, a bar above the input offers "Reintentar conexión" (`retryQueue()` in `brain.ts`). No greeting title on the Núcleo. The YO tab (`(tabs)/yo/`, a nested stack) shows a rotating generic holographic suit (`SuitCore`, same performance rules as the brain) with personal stats read via `readField` from perfil.md/salud.md, and holds the personal modules (Salud, Plan físico); inner screens use `Screen back`, uppercase monospaced labels with letter-spacing (`Label`), one highlighted word in titles (`Title accent=`).
- **Logo:** the Corazón de DESJ, i.e. the Prism (Prisma B). One shape in `src/components/prism-shape.ts` feeds the app (`Prism`; `PrismMark` is a static version, unused since the header brand was removed) and the icons (`design/logo.mjs` → `node scripts/render-logo.mjs` writes favicon, PWA, iPhone icon and splash). Original SVGs per state in `design/prisma/`; source proposal and Pantone palette: https://gemini.google.com/share/a6e977fe4c45?social_preview=true&skid=b4415182-9fcf-44bd-9474-36238675a063 (details in `CONTEXTO.md` §9). Inside the brain: the triangle plus its own ring (two thin circles + a dotted one, translucent, with a very light dark veil, `prismRing`; keep it subtle like the Gemini reference); the big rings and orbit dots belong to the icon only.
- **Surfaces:** `Card` for grouped content; don't put borders, fills and shadows on everything.
- **Motion:** only where it has a purpose (the brain, state changes). Every continuous animation must honor `useMotion().still` (`src/lib/motion.tsx`: the header "ANIM ON/OFF" switch, saved per device, plus Reduce Motion) and pause when its screen is not focused. The brain steps at 30 fps. Use Reanimated (CSS animations or shared values), animate only `transform`/`opacity`, and respect Reduce Motion. No emoji as decoration.
- **Layout:** `Screen` wraps every tab screen (header: the screen's `menu` on the left, no "DESJ" brand; ANIM switch and profile circle on the right (no module tag; `Screen module=` is kept but not shown), with the clock just left of ANIM; on wide windows the header spans the full window with 44 pt controls and larger text, sizes from `useLayout().header`; content stays in a max-width column). Touch targets ≥ 44 pt. Screens must work at phone width and on web.
- New screens: propose or mock up first when the change is visual and large; confirm before replacing an established pattern.

## Product rules (non-negotiable)

- **Health:** DESJ does not diagnose or change doses; it organizes, compares with reference ranges and prepares questions for the doctor.
- **Legal:** answers only from uploaded documents, cites the source, recommends a lawyer before signing.
- **Markets:** prices and alerts only, never buy/sell advice.
- **No invented data** in real screens: missing values show empty or "[pendiente]". Sample data must be labeled as an example.

## Working agreements

- Run `npx tsc --noEmit` and `npx expo lint` before saying a task is done. For visual changes, check the web build in headless Chrome at phone width (≥ 500 px, Chrome's minimum window) and at desktop width.
- Native-only features (`expo-calendar`, `expo-speech-recognition`) don't work in Expo Go: load them lazily behind an availability check and show a clear message instead of crashing.
- Update `CONTEXTO.md` when modules, structure or decisions change.
- Don't commit unless asked.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
