# Catálogo de motivos de retraso — Diseño

> Sub-proyecto 3 de 4 derivados del flujo de operación compartido por el cliente. Es
> independiente de los sub-proyectos 1 y 2 (no depende de `actualArrival` ni de
> `lastDelayNotifiedMinutes`), pero sub-proyecto 4 (indicadores) sí consumirá el campo
> categorizado que aquí se introduce para poder reportar "retrasos por motivo".

## Contexto y problema

La sección "Retardos por carga interno" del flujo del cliente lista motivos concretos para
cuando una operación de carga/descarga toma más tiempo del estimado: falta de material en PT,
retrasos por operación, cambio de requerimiento. Esto corresponde exactamente al campo
`Window.delayReason` que ya existe hoy — se captura como texto libre en el diálogo "Completar
ventana" cuando `actualEnd - actualStart > client.avgLoadTime`, y es obligatorio en ese caso.

El problema: siendo texto libre, no hay forma de agregar reportes por motivo ("¿cuántos retrasos
fueron por falta de material vs. cambio de requerimiento?") sin depender de que el texto se haya
escrito de forma consistente.

## Decisión: catálogo fijo en código

Se optó por un enum de Prisma con los motivos del cliente (más una opción "Otro" de respaldo),
siguiendo el mismo patrón ya usado en el proyecto para categorías fijas de negocio
(`WindowStatus`, `WindowType`, `Role`) — en vez de un modelo administrable tipo `Tier`/`Warehouse`
con su propia página CRUD en `/admin`. Para 3-4 valores fijos que el cliente ya especificó, un
catálogo administrable habría sido sobre-ingeniería; si en el futuro se necesita que el
administrador agregue motivos sin desplegar código, se puede migrar a un modelo CRUD entonces.

## Cambios de modelo de datos

`prisma/schema.prisma`:

```prisma
enum DelayReasonCategory {
  FALTA_MATERIAL_PT
  RETRASO_OPERACION
  CAMBIO_REQUERIMIENTO
  OTRO
}
```

- `Window` gana `delayReasonCategory DelayReasonCategory?` — el campo que se vuelve
  **obligatorio** al completar una ventana fuera de tiempo (reemplaza esa obligatoriedad que hoy
  recae en `delayReason`).
- `Window.delayReason String?` no cambia de tipo, pero cambia de rol: deja de ser el campo
  obligatorio y pasa a ser un **detalle adicional opcional** (ej. "cliente solicitó cambio de
  color"), libre para dar contexto más allá de la categoría.

Migración nueva: `add_delay_reason_category`.

## Labels

`app/lib/delayReasons.ts` (nuevo archivo, sigue el mismo patrón que
`WINDOW_STATUS_LABEL`/`WINDOW_TYPE_LABEL` en `app/lib/windowStatus.ts`, pero en su propio archivo
porque es un concepto separado de status/type):

```ts
export const DELAY_REASON_CATEGORY_LABEL: Record<DelayReasonCategory, string> = {
  FALTA_MATERIAL_PT: "Falta de material en PT",
  RETRASO_OPERACION: "Retrasos por operación",
  CAMBIO_REQUERIMIENTO: "Cambio de requerimiento",
  OTRO: "Otro",
};
```

## Cambio de la señal "esta ventana tuvo retraso"

Hoy cuatro lugares usan `delayReason: { not: null }` (o el equivalente en JS, `w.delayReason`)
como señal booleana de "esta ventana tuvo retraso". Como `delayReason` ahora es un detalle
opcional que puede quedar vacío aunque sí hubo retraso, esa señal deja de ser confiable. Los
cuatro lugares cambian a usar `delayReasonCategory` en su lugar:

- `app/routes/_root.tsx:40` — contador de "retardos del día" en el dashboard del administrador.
- `app/routes/api/reports.summary.ts:41` — conteo de retardos por cliente.
- `app/routes/api/reports.export.ts:29` — conteo de retardos en la hoja "Resumen" del Excel.
- `app/routes/api/reports.export.ts:52` — filtro de filas en la hoja "Retardos y motivos" del
  Excel.

En `reports.export.ts`, la hoja "Detalle de ventanas" (columna "Motivo de retraso", línea 46) y
la hoja "Retardos y motivos" (columna "Motivo", línea 53) muestran la etiqueta legible de
`delayReasonCategory` vía `DELAY_REASON_CATEGORY_LABEL`, en vez del texto libre crudo. El detalle
libre (`delayReason`) se agrega como columna adicional en ambas hojas para no perder esa
información.

## API — `api/windows.$id.complete.ts`

- La validación que hoy es `if (actualMinutes > existing.client.avgLoadTime &&
  !body.delayReason)` pasa a `if (actualMinutes > existing.client.avgLoadTime &&
  !body.delayReasonCategory)` — el campo obligatorio cambia de `delayReason` a
  `delayReasonCategory`.
- Al actualizar la ventana, se guardan ambos campos: `delayReasonCategory: body.delayReasonCategory
  ?? null` y `delayReason: body.delayReason ?? null` (detalle, sigue siendo opcional).
- El log de actividad usa la etiqueta legible en vez del código del enum:
  `detail: body.delayReasonCategory ? `Retraso: ${DELAY_REASON_CATEGORY_LABEL[body.delayReasonCategory]}${body.delayReason ? " — " + body.delayReason : ""}` : undefined`.

No se agrega validación adicional de que `body.delayReasonCategory` sea un valor válido del enum
más allá de lo que Prisma ya hace en tiempo de ejecución (lanza error si el valor no coincide) —
mismo nivel de rigor que el resto de los endpoints de este proyecto (ej. `type: body.type ??
"CARGA"` tampoco valida explícitamente).

## UI — `app/routes/windows/detail.tsx`

- El diálogo "Completar ventana" gana un `<Select>` de motivo, mostrado con el mismo disparador
  que hoy usa el campo de texto (`needsDelayReason`, activado cuando el backend responde 400).
  Poblado desde `DELAY_REASON_CATEGORY_LABEL`.
- El botón "Confirmar" exige `rollsCount` y, cuando `needsDelayReason` está activo, también
  `delayReasonCategory` seleccionado.
- El `Textarea` existente se conserva sin cambios de comportamiento, pero se re-etiqueta de
  "Motivo del retraso" a "Detalle adicional (opcional)" — dejó de ser obligatorio.
- La vista de detalle (no el diálogo) muestra la categoría traducida vía
  `DELAY_REASON_CATEGORY_LABEL[window.delayReasonCategory]` bajo la etiqueta "Motivo de retraso",
  y si `window.delayReason` existe, se muestra aparte bajo "Detalle adicional".

## Fuera de alcance de este spec

- Reportes agregados de "retrasos por motivo" (tabla/gráfica por categoría) — sub-proyecto 4.
- Catálogo administrable vía `/admin` — ver "Decisión" arriba; se puede revisitar si el negocio
  lo pide.
- Categorización de los avisos de retraso por llegada tardía (sub-proyecto 2) — esa sección del
  flujo del cliente ("Control de retrasos", 15/30/45/60 min) es sobre la unidad no llegando a
  tiempo, no sobre por qué la carga/descarga interna tomó más de lo estimado; son conceptos
  distintos y el cliente no pidió categorizar la primera.

## Testing

- No hay lógica pura nueva que amerite un test unitario aislado (a diferencia de los
  sub-proyectos 1 y 2, aquí no hay una función de decisión con ramas — es una validación de
  presencia de campo, ya cubierta implícitamente por el tipo `DelayReasonCategory | null` en
  TypeScript).
- Verificación manual: completar una ventana fuera de tiempo sin seleccionar motivo (debe
  rechazar), completarla con motivo (debe aceptar y guardar), confirmar que el contador de
  "retardos del día" y el Excel exportado reflejan el conteo correcto usando
  `delayReasonCategory` en vez de `delayReason`.
