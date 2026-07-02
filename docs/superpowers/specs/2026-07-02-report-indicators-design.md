# Indicadores clave — Diseño

> Sub-proyecto 4 de 4 derivados del flujo de operación compartido por el cliente. Consume
> `actualArrival` (sub-proyecto 1) y `delayReasonCategory` (sub-proyecto 3). No depende
> directamente del worker de escalación del sub-proyecto 2, aunque reutiliza su constante de
> umbral de 15 minutos para mantener una sola definición de "tarde" en todo el sistema.

## Contexto y problema

El flujo del cliente pide cuatro grupos de indicadores — Puntualidad, Operación, Tiempo,
Retrasos — con 16 métricas concretas. Hoy `/reports` solo muestra una tabla de tiempo real vs.
estimado por cliente; el endpoint `api/reports/summary` ya calcula `delaysByClient`,
`occupancyByWarehouse` y `rollsByPeriod` pero ninguno de los tres se renderiza en pantalla.

No se requieren cambios de schema: todo se deriva de campos que ya existen en `Window`
(`scheduledStart`, `actualArrival`, `actualStart`, `actualEnd`, `status`, `type`,
`delayReasonCategory`).

## Decisiones confirmadas con el cliente

- **Ubicación:** las cuatro categorías viven en `/reports`, que ya tiene los filtros de
  fecha/nave/cliente/tier que estos indicadores necesitan. "Unidades en planta" y "unidades
  pendientes" son estado actual — ignoran el filtro de fecha (pero sí respetan
  nave/cliente/tier) — el resto respeta el rango de fechas seleccionado.
- **Llegada puntual:** `actualArrival - scheduledStart <= 15 minutos`. Tardía es cualquier
  llegada por encima de ese umbral. Se usa la misma constante `DELAY_THRESHOLDS_MINUTES[0]` de
  `app/lib/delayThresholds.ts` (sub-proyecto 2) para no tener dos definiciones de "tarde" en el
  sistema.
- **% de cumplimiento:** `llegadas puntuales / citas programadas × 100` — penaliza tanto las
  citas que llegaron tarde como las que aún no se han atendido dentro del rango.

## Lógica pura — `app/lib/reportIndicators.ts`

A diferencia de los sub-proyectos 2 y 3, aquí hay suficiente lógica de agregación (promedios,
agrupaciones, rankings) para justificar extraerla a funciones puras, testeables con Vitest sin
tocar la base de datos — mismo principio que `windowOverlap.ts`. El módulo recibe un array de
objetos planos (no un `Window` de Prisma directamente), para poder testear con fixtures simples:

```ts
export interface WindowForIndicators {
  clientName: string;
  type: WindowType;
  status: WindowStatus;
  scheduledStart: Date;
  actualArrival: Date | null;
  actualStart: Date | null;
  actualEnd: Date | null;
  delayReasonCategory: DelayReasonCategory | null;
}
```

- `computePuntualidad(windows)` → `{ citasProgramadas, citasAtendidas, llegadasPuntuales,
  llegadasTardias, porcentajeCumplimiento }`. Atendida = `actualArrival !== null`.
- `computeTiempo(windows)` → `{ tiempoPromedioEspera, tiempoPromedioCarga,
  tiempoPromedioDescarga, tiempoPromedioTotalEnPlanta }` (minutos, `null` si no hay datos
  suficientes). Espera = `actualStart - actualArrival`. Carga/descarga =
  `actualEnd - actualStart` filtrado por `type` y `status: COMPLETED`. Total en planta =
  `actualEnd - actualArrival`, `status: COMPLETED`.
- `computeOperacionRealizadas(windows)` → `{ cargasRealizadas, descargasRealizadas }`, ventanas
  `COMPLETED` por tipo dentro del rango.
- `computeRetrasos(windows)` → `{ porTransportista, porMotivo, masPuntuales, masIncidencias }`.
  Una ventana cuenta como "incidencia" si llegó tarde (por el umbral de 15 min) O tiene
  `delayReasonCategory` — así "retrasos por transportista" refleja ambos tipos de problema
  operativo, no solo uno. "Por motivo" agrupa únicamente por `delayReasonCategory` (los retrasos
  de llegada no tienen motivo categorizado, son solo tiempo). Los dos rankings
  (`masPuntuales`/`masIncidencias`) se limitan a los 5 primeros, ordenados descendente, y solo
  incluyen clientes con al menos una cita atendida/incidencia respectivamente.

## `api/reports.summary.ts`

El `where` existente se separa en dos funciones: `buildDimensionalWhere(url)` (nave/cliente/tier,
sin fecha) y `buildWhere(url)` (la de siempre, que reutiliza la dimensional y le agrega el rango
de fechas). El loader agrega dos `prisma.window.count()` más, usando solo el `where` dimensional:

- `unidadesEnPlanta`: `status: { in: ["ARRIVED", "IN_PROGRESS"] }`.
- `unidadesPendientes`: `status: "SCHEDULED"`.

Los `windows` ya cargados (con `client` incluido) se mapean a `WindowForIndicators[]` y se pasan
a las cuatro funciones de `reportIndicators.ts`. La respuesta JSON gana cuatro campos nuevos:
`puntualidad`, `operacion` (con `unidadesEnPlanta`/`unidadesPendientes` de los counts
dimensionales y `cargasRealizadas`/`descargasRealizadas` de `computeOperacionRealizadas`),
`tiempo`, `retrasos`. Los campos existentes (`avgByClient`, `delaysByClient`,
`occupancyByWarehouse`, `rollsByPeriod`, `windows`) no cambian.

## `app/routes/reports.tsx`

Cuatro secciones nuevas de tarjetas, con el mismo patrón visual de tiles que ya usa el dashboard
de administrador (`Card` con `CardHeader`/ícono + `CardContent` con el número grande):

- **Puntualidad:** 5 tiles — Programadas, Atendidas, Puntuales, Tardías, % Cumplimiento.
- **Operación:** 4 tiles — Cargas realizadas, Descargas realizadas, Unidades en planta*,
  Unidades pendientes* (las dos últimas con una nota "ahora mismo" bajo el número, para dejar
  claro que no respetan el filtro de fecha).
- **Tiempo:** 4 tiles — Espera promedio, Carga promedio, Descarga promedio, Total en planta
  promedio (cada uno "X min" o "—" si no hay datos).
- **Retrasos:** dos tablas — "Por motivo" (motivo, conteo) y, lado a lado o apiladas, dos
  rankings ("Transportistas más puntuales" y "Transportistas con más incidencias").

La tabla existente de tiempo real vs. estimado por cliente no cambia.

## Fuera de alcance de este spec

- Agregar estos indicadores como hoja nueva en el Excel exportado (`reports.export.ts`) — el
  cliente no lo pidió para esta sección; ya se cubrió "retardos y motivos" en el sub-proyecto 3.
  Se puede agregar después si hace falta.
- Renderizar `occupancyByWarehouse`/`rollsByPeriod` en la UI — ya existían en el JSON antes de
  este sub-proyecto y siguen sin usarse en pantalla; no forman parte de los indicadores que pidió
  el cliente, así que no se tocan aquí.

## Testing

- `computePuntualidad`, `computeTiempo`, `computeOperacionRealizadas`, `computeRetrasos`: casos
  unitarios con fixtures de `WindowForIndicators[]` cubriendo: ventana puntual (llegada exacta al
  umbral), ventana tardía, ventana nunca atendida, ventana sin `actualEnd` (excluida de
  promedios de tiempo), agrupación por motivo con múltiples categorías, empates en los rankings.
- Igual que en los sub-proyectos previos, `api/reports.summary.ts` y la UI de `reports.tsx` se
  verifican manualmente contra una Postgres alcanzable — no hay arnés de integración en este
  repo.
