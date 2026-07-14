import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import { Toaster } from "~/components/ui/sonner";
import "./app.css";

/* Inter se sirve self-hosted vía @fontsource-variable/inter (app.css) — sin
   dependencia de Google Fonts, funciona sin salida a internet. */

const THEME_INIT_SCRIPT = `try {
  if (localStorage.getItem("theme") === "light") {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "light";
  }
} catch (e) {}`;

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <title>Embarques</title>
        <Meta />
        <Links />
      </head>
      <body>
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="animate-blob-drift absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full bg-[oklch(0.58_0.22_255)] opacity-10 dark:opacity-30 blur-[130px]" />
          <div className="animate-blob-drift [animation-delay:-7s] absolute -top-24 -right-32 h-[500px] w-[500px] rounded-full bg-[oklch(0.6_0.20_340)] opacity-10 dark:opacity-20 blur-[130px]" />
          <div className="animate-blob-drift [animation-delay:-13s] absolute -bottom-40 -left-20 h-[520px] w-[520px] rounded-full bg-[oklch(0.65_0.16_195)] opacity-10 dark:opacity-20 blur-[130px]" />
          <div className="animate-blob-drift [animation-delay:-4s] absolute -bottom-32 -right-40 h-[420px] w-[420px] rounded-full bg-[oklch(0.55_0.20_300)] opacity-10 dark:opacity-15 blur-[130px]" />
        </div>
        {children}
        <Toaster />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Error inesperado";
  let details = "Ocurrió un error inesperado. Intenta de nuevo más tarde.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : `Error ${error.status}`;
    details =
      error.status === 404
        ? "La página que buscas no existe o fue eliminada."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-6xl font-bold tracking-tight text-primary">
        {message}
      </h1>
      <p className="max-w-md text-muted-foreground">{details}</p>
      <a
        href="/"
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Volver al inicio
      </a>
      {stack && (
        <pre className="max-h-80 w-full max-w-3xl overflow-auto rounded-lg border bg-card p-4 text-left text-xs">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
