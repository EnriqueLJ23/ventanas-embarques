# Calendario responsivo + glassmorphism ligero — Diseño

> Ajuste pequeño y puntual sobre el trabajo de `2026-07-02-ui-polish-completion-design.md`
> (que ya fijó el calendario en `height={720}`). Este spec corrige ese valor fijo y agrega dos
> retoques visuales adicionales pedidos después de ver el resultado en pantalla: glassmorphism
> ligero y un tema azul apenas más claro.

## Problema

1. `height={720}` en `ShipmentCalendar.tsx` es un número fijo en píxeles — en pantallas más
   chicas empuja la página entera a hacer scroll vertical, viéndose desproporcionado.
2. El usuario pidió un efecto de vidrio esmerilado (glassmorphism) sutil — fondos
   semitransparentes con blur — en la UI en general.
3. El usuario pidió que el tema azul oscuro actual sea apenas un poco más claro, un cambio muy
   ligero, no un retokenizado completo.

## Decisiones

### 1. Alto del calendario relativo al viewport

`ShipmentCalendar.tsx` cambia `height={720}` por `height="100%"` (el modo de FullCalendar donde
hereda el alto de su contenedor — documentado como el modo correcto para "el padre define el
alto"). El componente envuelve el `<FullCalendar>` en un `<div>` con:

```
className="h-[clamp(520px,calc(100vh-260px),880px)]"
```

- `520px` — piso mínimo utilizable en pantallas bajas.
- `calc(100vh - 260px)` — resta el espacio que ya ocupan el header (`h-14` = 56px), el
  `PageHeader` de `/calendar`, y el padding de `<main>` en `dashboard.tsx` por encima del
  calendario (estimado en ~260px combinados).
- `880px` — techo para no verse desproporcionado en monitores muy altos.

Este cambio vive dentro de `ShipmentCalendar.tsx` (no en `calendar.tsx`), para que el componente
sea responsable de su propio tamaño sin que la página que lo usa necesite conocer el offset
mágico.

### 2. Glassmorphism ligero en los componentes compartidos

En vez de tocar página por página, se aplica en los primitivos de `app/components/ui/` que ya
usa toda la app, para que el efecto sea consistente y el cambio quede concentrado en pocos
archivos:

- **`card.tsx`** (`Card`): `bg-card` sólido → `bg-card/70 backdrop-blur-md`, conservando el
  `ring-1 ring-foreground/10` existente como borde de "vidrio". Como `TableCard` y `EmptyState`
  ya envuelven `Card`, heredan el efecto automáticamente sin tocarlos.
- **`dialog.tsx`** (`DialogContent`): mismo tratamiento — fondo semitransparente + blur — para
  que los modales de creación/edición se sientan parte del mismo lenguaje visual.
- **`popover.tsx`** y **`dropdown-menu.tsx`** (contenido de menús/popovers, ej. el `UserMenu` y
  los `Select`): mismo tratamiento.
- El header de `dashboard.tsx` ya tiene `bg-background/95 backdrop-blur-sm` — no se toca, ya es
  el mismo patrón.
- El contenedor del **sidebar** (`Sidebar` en `sidebar.tsx`) gana un fondo semitransparente +
  blur equivalente sobre el token `--sidebar`.

### 3. Tema azul apenas más claro

En `app/app.css`, dentro del bloque `.dark`, se sube la luminosidad (`oklch`) en +0.03 de
exactamente estos tres tokens — y solo estos, para mantener el cambio "muy ligero" como se pidió:

- `--background`: `oklch(0.16 0.025 255)` → `oklch(0.19 0.025 255)`
- `--card` / `--popover`: `oklch(0.205 0.03 255)` → `oklch(0.235 0.03 255)`
- `--sidebar`: `oklch(0.13 0.02 255)` → `oklch(0.16 0.02 255)`

`--primary` (el azul de acento en botones/links/foco), `--muted`, `--border`, `--accent` y el
resto de los tokens semánticos no cambian — solo las tres superficies de fondo mencionadas.

## Fuera de alcance

- No se retokeniza el resto de la paleta ni se agrega un selector de tema/modo claro.
- No se aplica glassmorphism dentro de `WindowQrDialog` — su fondo debe seguir siendo blanco
  sólido para que el QR sea escaneable (ya documentado como excepción intencional en el spec de
  dark-blue-remake).
- No se cambia el contenido ni la lógica de `/calendar` — solo el contenedor de alto del
  `ShipmentCalendar`.

## Testing

- Sin lógica pura nueva que testear con Vitest — son cambios de CSS/props visuales.
- `npm run typecheck` debe pasar (el `height="100%"` sigue siendo un valor válido del tipo de
  prop de FullCalendar).
- Verificación manual: abrir `/calendar` y confirmar que ya no genera scroll de página en una
  ventana de navegador de tamaño normal; abrir cualquier `Card`, un diálogo, un dropdown y el
  sidebar para confirmar el efecto de vidrio; comparar el tono de fondo antes/después para
  confirmar que el cambio es sutil, no un rediseño de color completo.
