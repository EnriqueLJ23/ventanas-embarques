# Asignación automática de nave al crear ventana — Diseño (2026-07-07)

## Contexto

Hoy, al crear una ventana en `/calendar`, el usuario elige manualmente la nave (`Warehouse`), independientemente del cliente. El negocio quiere que la nave se derive del cliente (`Client.preferredWarehouseId`) y deje de ser un campo elegible en el flujo normal. La función de "click en una celda del calendario para precargar nave" (agregada 2026-07-07 en un commit anterior) se revierte porque asume elección manual de nave.

## Cambios

**1. `app/routes/calendar.tsx`**
- El `Select` de Nave deja de mostrarse por defecto. Al elegir cliente, `warehouseId` se autoasigna desde `selectedClient.preferredWarehouseId` (nuevo campo en `ClientOption`) y se muestra como texto informativo ("Nave asignada: {nombre}").
- El `Select` de Nave solo se renderiza si el cliente elegido no tiene `preferredWarehouseId` (clientes con nave ambigua en la lista importada).
- Se elimina: el `useEffect` de conflicto en vivo (`/api/windows/conflicts`), el estado `conflict`, el `Alert` de conflicto, el diálogo "Solicitar excepción" (`overrideOpen`/`overrideReason`/`handleOverrideRequest`), y el prop `onSlotClick` pasado a `ShipmentCalendar` (con su lógica de `openCreateDialog(prefill)` simplificada de vuelta a abrir el diálogo sin precarga).
- `handleSubmit` interpreta la respuesta de `POST /api/windows`: si viene `overridden: true`, muestra un toast distinto indicando que quedó pendiente de revisión del administrador por conflicto de horario.

**2. `app/components/calendar/ShipmentCalendar.tsx`**
- Se revierte `SlotClickInfo`, el prop `onSlotClick` y el handler `dateClick`. Se mantiene `resourceAreaWidth="120px"` y los estilos de distinción visual (no relacionados con este cambio).

**3. `app/routes/api/windows.ts` (acción de creación)**
- La nave a usar es `body.warehouseId` si viene (caso cliente sin nave preferida) o `client.preferredWarehouseId`. Si ninguna está disponible, 400 `warehouse_required`.
- Si hay conflicto de horario en esa nave: crea la ventana igual (no bloquea) y crea una `OverrideRequest` en la misma transacción con motivo autogenerado (incluye cliente y horario de la ventana en conflicto). Responde `201` con `{ window, qrPayload, overridden: true }`.
- Sin conflicto: comportamiento actual, `{ window, qrPayload }`.

**4. Eliminados por quedar sin uso:** `app/routes/api/overrides.ts` (creación manual de excepción) y `app/routes/api/windows.conflicts.ts` (preview de conflicto en vivo), junto con sus entradas en `app/routes.ts`.

**5. `app/routes/admin/overrides.tsx` + `app/routes/api/overrides.$id.ts`**
- El loader también carga naves activas. Cada fila de excepción pendiente muestra un `Select` de nave (default: la nave actual de la ventana).
- Al aprobar, si la nave seleccionada difiere de la actual, el `PATCH /api/overrides/:id` también actualiza `Window.warehouseId` en la misma transacción antes de marcar la excepción como `APPROVED`. Rechazar sigue cancelando la ventana, sin cambios.

## Fuera de alcance

- No se revalida conflicto de horario al reasignar nave desde la revisión de excepciones — es una acción manual de un administrador que ya está mirando el calendario.
- No se cambia `Client.preferredWarehouseId` a obligatorio; los 5 clientes sin nave preferida seguirán pidiendo nave manualmente hasta que alguien se la asigne en `/admin/clientes`.
