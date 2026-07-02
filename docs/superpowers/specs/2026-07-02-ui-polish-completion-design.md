# Cierre del rediseño SaaS — Diseño

> Extiende `2026-06-24-saas-ui-refactor-design.md` y `2026-06-24-dark-blue-frontend-remake-design.md`,
> no los reemplaza. La mayor parte de ese trabajo (shell con sidebar colapsable, breadcrumbs,
> `PageHeader`, badges, empty states, tema oscuro azul, edición inline en clientes/tiers/naves)
> ya está construida — solo estaba sin commitear en el working tree. Este spec cubre únicamente
> lo que falta para cerrar ese trabajo y lo que el usuario pidió puntualmente ahora.

## Contexto

Al revisar el working tree encontré una cantidad grande de trabajo de UI ya terminado y
funcional (sidebar, header, badges de estado, formularios de edición en `/admin/clients` con
soporte `PATCH` en `api/clients.ts`/`tiers.ts`/`warehouses.ts`, empty states, etc.) — evidencia
de que la ejecución de `2026-06-24-dark-blue-frontend-remake-design.md` llegó más lejos de lo que
sus commits reflejan. Nada de esto necesita rediseñarse: se revisó (`admin/clients.tsx`,
`admin/activity.tsx`, `admin/overrides.tsx`, `dashboard.tsx`, `AppSidebar.tsx`) y está completo,
consistente y usa solo tokens semánticos del tema.

Lo que falta, y coincide con lo que pidió el usuario:

1. `/windows/new` sigue existiendo como página separada y sigue en el menú — pero
   `app/routes/calendar.tsx` ya tiene un diálogo "Nueva ventana" con el mismo formulario completo
   (cliente, nave, horario, operador, placas, detección de conflictos, solicitud de excepción).
   La página separada es puramente redundante.
2. El calendario se ve comprimido: `ShipmentCalendar.tsx` usa `height="auto"` en FullCalendar.

## Decisiones

- **Altura del calendario:** fija en `720px` con `expandRows={true}` (las filas de cada nave se
  reparten uniformemente en ese alto) — consistente en cualquier tamaño de pantalla, en vez de
  calcular el alto disponible del viewport dentro del shell.
- **Eliminación de `/windows/new`:** se borra el archivo de ruta y su registro en `routes.ts`, no
  se deja como redirect — no hay razón para mantener una URL muerta cuando el diálogo del
  calendario ya cubre el 100% del flujo (incluyendo el override de conflictos).

## Alcance de esta pasada

**1. Commitear el trabajo ya terminado tal cual está** (sin cambios): `app/app.css` (el ajuste
menor de quitar `dark` del `@apply` en `html`, redundante con `class="dark"` ya fijado en
`root.tsx`), `app/routes/admin/{activity,clients,layout,overrides,tiers,users,warehouses}.tsx`,
`app/routes/api/{clients,tiers,warehouses}.ts`, `app/routes/dashboard.tsx`, y los archivos nuevos
sin trackear: `app/components/layout/*`, `app/hooks/*`, `app/lib/navigation.ts`.

**2. Eliminar `/windows/new`:**
- Borrar `app/routes/windows/new.tsx`.
- Quitar su entrada de `app/routes.ts`.
- Quitar el ítem de nav "Nueva ventana" inyectado en `AppSidebar.tsx` (la vía normal para crear
  una ventana pasa a ser exclusivamente el botón "+ Nueva ventana" dentro de `/calendar`).
- Quitar la entrada `["/windows/new", "Nueva ventana"]` de `STATIC_LABELS` en
  `app/lib/navigation.ts`.
- En `app/routes/_root.tsx` (vista de Ventas), la tarjeta de acceso rápido "Nueva ventana" que
  hoy enlaza a `/windows/new` se elimina, dejando solo la tarjeta "Ver calendario" — ambas
  terminarían apuntando al mismo lugar una vez que el formulario vive únicamente ahí, así que
  mantener las dos sería redundante.

**3. Calendario más alto:** en `app/components/calendar/ShipmentCalendar.tsx`, cambiar
`height="auto"` por `height={720}` y agregar `expandRows={true}` a las props de `FullCalendar`.

**4. Verificación de coherencia de navegación:** grep de `/windows/new` en todo `app/` después de
los cambios anteriores para confirmar que no queda ningún enlace muerto.

## Fuera de alcance

- No se rediseña nada que ya esté terminado (shell, admin, tema) — solo se commitea.
- No se toca lógica de negocio, validaciones, ni endpoints (más allá del PATCH ya presente en el
  trabajo existente, que se commitea tal cual).
- No se agrega un modo claro ni un selector de tema — eso quedó explícitamente descartado en el
  spec de dark-blue-remake.

## Testing

- `npm run typecheck` debe pasar después de eliminar `/windows/new` (confirma que no queda
  ninguna referencia rota a esa ruta o sus tipos generados).
- `npx vitest run` no debería verse afectado — ninguna de estas rutas tiene lógica pura cubierta
  por tests.
- Verificación manual: recorrer `/calendar` (confirmar que el diálogo "Nueva ventana" sigue
  funcionando igual y que el calendario se ve notablemente más alto), el sidebar (confirmar que
  "Nueva ventana" ya no aparece), y cada página de `/admin/*` y el dashboard como cada rol.
