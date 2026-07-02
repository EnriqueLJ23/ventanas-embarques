# Llegada a planta (check-in por QR) — Diseño

> Sub-proyecto 1 de 4 derivados del flujo de operación compartido por el cliente. Los otros tres
> (control de retrasos por escalación, catálogo de motivos de retraso, ampliación de
> indicadores/reportes) dependen de que exista el timestamp de llegada que este spec introduce, y
> se diseñarán como specs independientes después de este.

## Contexto y problema

El flujo operativo que compartió el cliente separa dos eventos que hoy el sistema trata como uno
solo:

- **Llegada a planta**: el camión llega y se escanea el QR de la ventana. Es un evento pasivo que
  debe registrar hora real de llegada y avisar por correo a una persona de control.
- **Inicio de operación**: el personal de almacén empieza a cargar/descargar la unidad. Puede
  ocurrir minutos u horas después de la llegada.

Hoy solo existe el botón "Iniciar" en `/windows/:id`, que registra `actualStart` y mueve el estado
a `IN_PROGRESS` — no hay forma de saber cuándo llegó el camión, y el QR generado al crear la
ventana solo se muestra/descarga, nunca se escanea de vuelta al sistema.

## Cambios de modelo de datos

`prisma/schema.prisma`:

- `WindowStatus` gana el valor `ARRIVED`, insertado entre `SCHEDULED` e `IN_PROGRESS`:
  `SCHEDULED → ARRIVED → IN_PROGRESS → COMPLETED` (más `CANCELLED` como hoy).
- `Window` gana el campo `actualArrival DateTime?`.

Migración nueva: `add-window-arrival`.

## QR: de texto a URL escaneable

`app/lib/qr.ts` gana una función `buildCheckinUrl(origin: string, windowId: string): string` que
devuelve `${origin}/checkin/${windowId}`.

El QR (`WindowQrDialog.tsx`) codifica esa URL en vez del bloque de texto plano. El texto legible
(`buildQrPayload`, sin cambios) se sigue mostrando debajo del QR para lectura humana. Así, la
cámara nativa de cualquier celular o tablet abre la URL directamente al escanear — no se necesita
un lector de QR embebido en la app.

`origin` se obtiene de `new URL(request.url).origin` en el momento de renderizar, no se persiste.

## Ruta `/checkin/:id`

Archivo nuevo `app/routes/checkin.tsx`, registrado dentro del layout con sesión (mismo grupo que
`calendar`, `windows/:id`, etc. en `routes.ts`):

```
route("checkin/:id", "./routes/checkin.tsx")
```

- `loader`: `requireUser(request, ["CARGA", "DESCARGA", "ADMINISTRADOR"])`, carga la ventana con
  `client` y `warehouse`.
- Si `status !== "SCHEDULED"`: la página muestra el estado actual de la ventana (badge + hora de
  llegada si ya existe) en vez del botón de confirmación — evita check-ins duplicados si alguien
  escanea el mismo QR dos veces.
- Si `status === "SCHEDULED"`: tarjeta con resumen (cliente, operador, placas, nave, hora
  programada) y un botón grande "Confirmar llegada".

## Acción `POST /api/windows/:id/arrive`

Archivo nuevo `app/routes/api/windows.$id.arrive.ts`, registrado en `routes.ts`:

```
route("api/windows/:id/arrive", "./routes/api/windows.$id.arrive.ts")
```

- `requireUser(request, ["CARGA", "DESCARGA", "ADMINISTRADOR"])`.
- Solo transiciona si el estado actual es `SCHEDULED`; si no, responde `409` con la ventana actual
  (mismo patrón que el conflicto de solapamiento en `api/windows.ts`) — idempotente ante doble
  scan.
- Actualiza `actualArrival = new Date()`, `status: "ARRIVED"`.
- `logActivity({ action: "ARRIVE", entity: "Window", entityId })`.
- Envía el correo "Unidad ingresó a planta" con `sendEmail()` (`app/services/email.server.ts`,
  hoy sin usar en ningún flujo):
  - `fromEmail`: `process.env.MAIL_SENDER` (ya configurado en `.env`).
  - Destinatario: `process.env.ARRIVAL_NOTIFICATION_EMAIL` (variable nueva, una sola dirección).
  - Asunto: `Unidad ingresó a planta`.
  - Cuerpo: Folio (id de la ventana), Operador, Placas, Tipo de operación, Hora de llegada.
  - El envío va en `try/catch`: si falla, se loggea el error pero **no** revierte el check-in ni
    responde error al usuario — la llegada física ya ocurrió y debe quedar registrada
    independientemente de si el correo se pudo enviar.

## Ajuste a "Iniciar" (`api/windows.$id.start.ts`)

Acepta transición desde `SCHEDULED` **o** `ARRIVED` (antes solo tenía sentido desde `SCHEDULED`).
Si `actualArrival` sigue siendo `null` al iniciar (el guardia no escaneó), se rellena en ese mismo
momento con la hora de inicio — así ningún reporte de tiempos futuro se topa con un hueco.

## UI

- `app/lib/windowStatus.ts`: `ARRIVED` → label `"Llegó a planta"`, badge variant `"outline"`.
- `app/components/calendar/ShipmentCalendar.tsx`: `STATUS_COLORS.ARRIVED` con un tono ámbar,
  visualmente entre el gris de `SCHEDULED` y el azul de `IN_PROGRESS`.
- `app/routes/calendar.tsx` (`STATUS_LEGEND`): entrada nueva para `ARRIVED`.
- `app/routes/windows/detail.tsx`: botón "Confirmar llegada" visible cuando
  `status === "SCHEDULED"` (respaldo manual para cuando no se puede escanear el QR físicamente),
  junto al botón "Iniciar" existente.

## Variables de entorno nuevas

- `ARRIVAL_NOTIFICATION_EMAIL` — dirección única que recibe el aviso de llegada. Se agrega vacía
  a `.env`; debe llenarse antes de salir a producción.

## Prerrequisito de infraestructura (fuera de este spec)

El permiso de aplicación `Mail.Send` de Microsoft Graph debe estar concedido en Azure Entra ID
para que `sendEmail()` funcione — ver `docs/email-scheduler-implementation.md`, sección 2.1. Sin
este permiso, el check-in se sigue registrando correctamente, pero el correo fallará
silenciosamente (quedará el error en logs).

## Fuera de alcance de este spec

- Escalación automática de correos por retraso (15/30/45/60 min) — sub-proyecto 2.
- Catálogo de motivos de retraso categorizados — sub-proyecto 3.
- Indicadores de puntualidad, tiempo de espera, ranking de transportistas — sub-proyecto 4
  (consume `actualArrival` una vez que exista).
- Lector de QR embebido en la app (cámara vía JS) — no es necesario porque la cámara nativa del
  dispositivo ya abre URLs codificadas en el QR.

## Testing

- Prueba del guard de estado en `api/windows.$id.arrive.ts`: no permite transicionar si el estado
  no es `SCHEDULED` (409 idempotente en doble scan).
- Prueba de `api/windows.$id.start.ts`: acepta `SCHEDULED` y `ARRIVED`; rellena `actualArrival` si
  estaba vacío.
- Sin cambios necesarios en `windowOverlap.test.ts` (la validación de solapamiento no depende del
  nuevo estado).
