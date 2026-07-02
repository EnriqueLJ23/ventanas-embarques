# Control de retrasos (avisos automáticos) — Diseño

> Sub-proyecto 2 de 4 derivados del flujo de operación compartido por el cliente. Depende del
> checkpoint de llegada introducido en el sub-proyecto 1
> (`2026-07-02-arrival-checkin-design.md`): mientras una ventana siga en `SCHEDULED` (no ha
> llegado), este sub-proyecto la vigila y escala avisos por correo si se pasa de su hora
> programada.

## Contexto y problema

El flujo del cliente pide que, si una unidad no llega a la hora programada, el sistema mande
avisos automáticos por correo en cascada: a los 15, 30, 45 y 60 minutos de retraso. Hoy el
sistema no tiene ningún mecanismo de vigilancia periódica ni worker en background — es un único
contenedor `app` sirviendo requests, sin cron ni cola de trabajos.

## Decisión de mecanismo

Se evaluaron tres opciones: un timer en el mismo proceso del servidor, `pg-boss` (cola de trabajos
persistente en Postgres, ya documentada en `docs/email-scheduler-implementation.md` para otro
propósito), y un cron externo pegándole a un endpoint HTTP. Se eligió el **timer en el mismo
proceso** — a esta escala (4 naves, pocas ventanas por día) no se justifica una cola de trabajos
ni infraestructura externa; un `setInterval` que revisa la base de datos cada 60 segundos es
suficiente y no agrega dependencias nuevas.

## Cambios de modelo de datos

`prisma/schema.prisma`:

- `Window` gana el campo `lastDelayNotifiedMinutes Int?` — guarda el umbral más alto (15, 30, 45
  o 60) ya notificado para esa ventana. `null` significa que no se ha enviado ningún aviso. Como
  los umbrales son crecientes, un solo entero basta para saber qué ya se avisó sin repetir
  correos ni necesitar una tabla aparte.

Migración nueva: `add_window_delay_notification`.

## Función pura de umbral

`app/lib/delayThresholds.ts` (sin sufijo `.server`, para poder testearla con Vitest igual que
`windowTransitions.ts`):

```ts
export const DELAY_THRESHOLDS_MINUTES = [15, 30, 45, 60] as const;

export function getDelayThresholdToNotify(
  elapsedMinutes: number,
  lastNotified: number | null
): number | null {
  const applicable = DELAY_THRESHOLDS_MINUTES.filter((t) => elapsedMinutes >= t);
  if (applicable.length === 0) return null;
  const highest = applicable[applicable.length - 1];
  if (lastNotified !== null && lastNotified >= highest) return null;
  return highest;
}
```

Si una ventana lleva 70 minutos de retraso la primera vez que se revisa (por ejemplo, tras
reiniciar el servidor), esta función devuelve únicamente `60` — el umbral más severo aplicable —
en vez de reproducir en cascada los avisos de 15/30/45 que ya no tiene sentido mandar. Esto es
intencional: evita una ráfaga de correos atrasados para una ventana vieja.

## El worker

`app/lib/delayEscalation.server.ts` expone `startDelayEscalationWorker()`:

- Usa un guard en `globalThis` (`globalThis.__delayEscalationStarted`) para garantizar que solo
  exista un `setInterval` activo, incluso si el módulo se vuelve a importar (hot-reload en
  desarrollo, múltiples requests concurrentes al arrancar).
- Cada 60 segundos, `checkDelays()`:
  1. Busca `Window` con `status: "SCHEDULED"` y `scheduledStart` de al menos 15 minutos atrás
     (filtro en la query para no traer ventanas futuras o recién creadas).
  2. Para cada una, calcula `elapsedMinutes = (now - scheduledStart) / 60000` y llama a
     `getDelayThresholdToNotify(elapsedMinutes, window.lastDelayNotifiedMinutes)`.
  3. Si devuelve un umbral: actualiza `lastDelayNotifiedMinutes` en la BD, intenta enviar el
     correo (try/catch no bloqueante — igual que el correo de llegada del sub-proyecto 1, un
     fallo de envío no debe impedir que se registre el umbral como notificado), y crea un
     `ActivityLog` con `action: "DELAY_NOTIFY"`, `detail` indicando el umbral, y `userId: 0` (no
     hay usuario humano detrás de esta acción; `ActivityLog.userId` es un `Int` simple sin
     relación `@relation` en el schema, así que no hay integridad referencial que romper).
- El estado `SCHEDULED` en la query ya excluye automáticamente ventanas `ARRIVED`,
  `IN_PROGRESS`, `COMPLETED` o `CANCELLED` — en cuanto una ventana pasa de `SCHEDULED`, deja de
  ser candidata a nuevos avisos sin lógica adicional.

**Contenido del correo:**
- Asunto: `Unidad con {N} minutos de retraso` (N = 15, 30, 45 o 60).
- Cuerpo: Folio, Cliente, Operador, Placas, Nave, Tipo de operación, hora programada, minutos de
  retraso.
- Destinatario: `process.env.ARRIVAL_NOTIFICATION_EMAIL` — la misma persona que recibe el aviso
  de llegada del sub-proyecto 1 (confirmado con el cliente: un solo punto de contacto operativo).
  Si no está configurado, se omite el envío con un `console.warn`, igual que en el flujo de
  llegada.

## Arranque del worker

`app/root.tsx` gana un `loader` mínimo:

```ts
export async function loader() {
  startDelayEscalationWorker();
  return null;
}
```

Se ejecuta en el primer request que llega al servidor (el guard de `globalThis` hace que las
siguientes invocaciones sean no-ops baratos). No afecta el bundle de cliente porque
`delayEscalation.server.ts` sigue la convención `.server.ts` de React Router.

## Fuera de alcance de este spec

- Catálogo de motivos de retraso categorizados (falta de material en PT, retrasos por operación,
  cambio de requerimiento) — sub-proyecto 3.
- Mostrar `lastDelayNotifiedMinutes` en el calendario o el detalle de la ventana — no lo pidió el
  cliente; se puede agregar después si hace falta visibilidad en la UI.
- Configurar los umbrales (15/30/45/60) o el intervalo de revisión (60s) vía variables de
  entorno — se dejan fijos en código porque el cliente los especificó como valores concretos.

## Testing

- `getDelayThresholdToNotify`: casos por umbral (justo en 15/30/45/60, entre umbrales, antes de
  15, con `lastNotified` ya igual o mayor al umbral aplicable, con `lastNotified: null`).
- Igual que en el sub-proyecto 1, no hay arnés de pruebas de integración con base de datos en
  este repo (`vitest.config.ts` solo corre `app/**/*.test.ts` sin Postgres) — `checkDelays()` y
  el arranque del worker se verifican manualmente (crear una ventana con `scheduledStart` en el
  pasado, invocar la revisión, y confirmar el correo enviado, el `ActivityLog` creado, y
  `lastDelayNotifiedMinutes` actualizado), no con Vitest.
