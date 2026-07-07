# Calendario: columna de recursos angosta + click-to-create — Diseño (2026-07-07)

## Contexto

En `/calendar`, la columna de naves (recursos) del `resourceTimeline` de FullCalendar ocupa más espacio del necesario, dejando poco espacio horizontal para las horas. Además, crear una ventana siempre requiere abrir el diálogo manualmente y llenar fecha/hora/nave a mano, aunque el usuario ya sabe exactamente en qué celda quiere agendar.

## Cambios

1. **Columna de recursos angosta:** `app/components/calendar/ShipmentCalendar.tsx` agrega `resourceAreaWidth="120px"` a la config de `FullCalendar`.
2. **Click-to-create:** `ShipmentCalendar` expone un nuevo prop opcional `onSlotClick(info: { date: string; time: string; warehouseId: string })`, conectado al evento `dateClick` de FullCalendar (disponible vía `interactionPlugin`, ya instalado). En la vista `resourceTimeline`, `dateClick` entrega tanto la fecha/hora clickeada como el recurso (nave) de esa fila.
3. En `app/routes/calendar.tsx`, la apertura del diálogo de "Nueva ventana" se extrae a `openCreateDialog(prefill?)`, que precarga `windowDate`/`time`/`warehouseId` cuando se llama con datos de un click de celda, y se comporta igual que hoy (sin precarga, salvo la fecha del calendario) cuando la llama el botón "Nueva ventana". `onSlotClick` solo se pasa a `ShipmentCalendar` cuando `canCreate` es `true`, reusando la misma restricción de rol que ya oculta el botón.
4. La granularidad del click se mantiene en la hora completa actual (`slotDuration` sin cambios) — no se agregan franjas de 30/15 minutos.

## Fuera de alcance

- No se cambia `slotDuration` ni el rango de horas visibles (`slotMinTime`/`slotMaxTime`).
- No se agrega selección por arrastre (`select`), solo click simple en una celda vacía.
