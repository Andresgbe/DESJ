// HTML base de la versión web (solo web; se ejecuta en Node al exportar, sin DOM).
// Incluye lo que iOS necesita para "Agregar a pantalla de inicio": manifiesto, ícono,
// pantalla completa y barra de estado sobre el fondo oscuro.
import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

import { C } from '@/theme';

// Barra de desplazamiento fina y oscura (en vez de la blanca del navegador): casi invisible hasta que se usa.
const SCROLLBAR_CSS = `
html, body { background-color: ${C.bg}; color-scheme: dark; }
* { scrollbar-width: thin; scrollbar-color: ${C.border} transparent; }
*::-webkit-scrollbar { width: 8px; height: 8px; }
*::-webkit-scrollbar-track, *::-webkit-scrollbar-corner { background: transparent; }
*::-webkit-scrollbar-thumb { background-color: ${C.border}; border-radius: 8px; border: 2px solid transparent; background-clip: padding-box; }
*::-webkit-scrollbar-thumb:hover { background-color: ${C.accent}; }
*::-webkit-scrollbar-button { display: none; }
`;

export default function Root({ children }: PropsWithChildren) {
  const { headNodes, bodyNodes, htmlAttributes, bodyAttributes } = useServerDocumentContext();

  return (
    <html lang="es" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, shrink-to-fit=no" />

        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content={C.bg} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="DESJ" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: SCROLLBAR_CSS }} />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
