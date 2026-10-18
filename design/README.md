# Diseño de DESJ

- **Fuente oficial:** el Design System de DESJ en Claude Design — https://claude.ai/artifact/7CsREDLrakrXsKvdy7WDVu (paleta, tipografía, espaciados, radios y guías de componentes).
- **`tokens.json`** es la copia exacta de los tokens de ese Design System. `src/theme.ts` lee este archivo: la app no tiene colores ni tamaños escritos a mano.

## Sincronizar

- **Cambiaste algo en el Design System (la página):** pídele a Claude "sincroniza el diseño". Lee el `tokens.json` del artefacto, lo copia aquí y revisa la app.
- **Hace falta un token nuevo desde el código:** agrégalo aquí y en el Design System en la misma tarea, y luego en `src/theme.ts`.

Si se borra o renombra un token que la app usa, la app avisa al arrancar (`theme.ts` lanza un error con el nombre que falta).
