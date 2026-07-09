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
import { startDelayEscalationWorker } from "~/lib/delayEscalation.server";
import "./app.css";

export async function loader() {
  startDelayEscalationWorker();
  return null;
}

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

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
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
