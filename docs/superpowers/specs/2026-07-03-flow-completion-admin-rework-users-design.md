# Cierre del flujo operativo, rework de admin y gestión de usuarios — Diseño

**Fecha:** 2026-07-03
**Estado:** Aprobado por el usuario, pendiente de plan de implementación

## Contexto

Una auditoría del código actual (React Router v7 + Prisma/Postgres + Microsoft Entra ID) contra el flujo de negocio propuesto encontró que la mayoría de los KPIs y la escalación de retrasos (15/30/45/60 min) ya están implementados. Los gaps reales son:

1. El formulario de nueva ventana no pregunta Carga/Descarga — toda ventana se crea como CARGA por default silencioso del backend (`app/routes/api/windows.ts`).
2. El motivo de retraso existe como enum fijo (`DelayReasonCategory`) capturado al completar la ventana, pero no está confirmado que funcione end-to-end.
3. El correo de llegada/retraso va a un solo destinatario fijo por variable de entorno (`ARRIVAL_NOTIFICATION_EMAIL`), no a listas configurables por evento (Embarques, Almacén).
4. Los paneles de admin (`app/routes/admin/*.tsx`) duplican el mismo formulario CRUD inline en 3 de 6 páginas, sin navegación agrupada, sin catálogos de negocio editables, y `Client.preferredWarehouse` guarda el *nombre* del almacén como texto en vez de su FK.
5. `User.name` existe en el esquema pero nunca se llena; el login por Entra ID auto-crea cualquier cuenta del tenant con rol VENTAS (auto-registro); no existe búsqueda de directorio de Microsoft Graph para dar de alta usuarios.

Fuera de alcance por decisión explícita del usuario: no se agrega entidad "Transportista" separada (Cliente ya cumple ese rol en el negocio); no se toca el relabeling de reportes.

## Sección 1 — Completar el flujo de programación y retrasos

### Tipo de operación (Carga/Descarga)

- Agregar un `Select` obligatorio "Tipo de operación" (Carga/Descarga) al diálogo de nueva ventana en `app/routes/calendar.tsx`.
- `app/routes/api/windows.ts` deja de hacer `type: body.type ?? "CARGA"` — el campo se vuelve requerido en el body; si falta, la API responde 400.
- El QR, el correo de llegada (`api/windows.$id.arrive.ts`) y los reportes ya leen `window.type`; no requieren cambios.

### Motivo de retraso como catálogo editable

- Reemplazar el enum Prisma `DelayReasonCategory` por una tabla `DelayReason` (`id`, `label`, `active Boolean`, timestamps), sembrada con los 4 valores actuales: Falta de material en PT, Retraso por operación, Cambio de requerimiento, Otro.
- `Window.delayReasonCategory` (relación al enum) pasa a `Window.delayReasonId` (FK a `DelayReason`, nullable). Migración de datos: mapear los valores de enum existentes a las filas sembradas equivalentes.
- Se mantiene la captura en el diálogo de completar ventana (`app/routes/windows/detail.tsx`) — se verifica en pruebas manuales que el `Select` de motivo efectivamente se guarde y se refleje en el detalle de la ventana y en `/reports`, corrigiendo cualquier bug encontrado.

### Destinatarios de notificación como catálogo editable

- Nueva tabla `NotificationRecipient` (`id`, `event` enum: `ARRIVAL`, `DELAY_15`, `DELAY_30`, `DELAY_45`, `DELAY_60`, `email`, `active Boolean`).
- `api/windows.$id.arrive.ts` y `lib/delayEscalation.server.ts` dejan de leer `process.env.ARRIVAL_NOTIFICATION_EMAIL` y en su lugar consultan las filas activas de `NotificationRecipient` para el evento correspondiente, enviando a todos los correos de la lista (`to` o `cc` múltiple).
- Si no hay destinatarios configurados para un evento, se registra un warning en `ActivityLog` (igual que hoy) pero no falla la operación.

## Sección 2 — Rework de paneles de admin

### Navegación agrupada

El sidebar de admin pasa de lista plana a 4 grupos con encabezado, en `app/components/layout/AppSidebar.tsx` (o el componente de nav de admin que resulte):

- **Catálogos** — Clientes, Tiers, Almacenes, Motivos de retraso *(nuevo)*
- **Notificaciones** — Destinatarios por evento *(nuevo)*
- **Usuarios y accesos** — Usuarios
- **Operación** — Overrides, Actividad, Reportes

### Formulario CRUD compartido

- Extraer el patrón que ya usa `clients.tsx` (`ClientForm` compartido entre crear/editar) a un componente reutilizable en `app/components/admin/` y aplicarlo a `tiers.tsx`, `warehouses.tsx`, `users.tsx` y las dos páginas nuevas (Motivos de retraso, Destinatarios de notificación), eliminando la duplicación de JSX inline.
- Mantener el patrón actual de fetch manual + `useState` + `navigate(".", {replace:true})` para refrescar — no se introduce una librería de data-fetching nueva, para no ampliar el alcance.

### Actividad: búsqueda y paginación

- `admin/activity.tsx` agrega filtros por usuario/acción/entidad y paginación (reemplaza el tope fijo de 200 filas sin controles).

### Corrección de `Client.preferredWarehouse`

- Cambiar `Client.preferredWarehouse String?` a `Client.preferredWarehouseId String?` (FK a `Warehouse.id`).
- Migración de datos: resolver cada valor de texto existente contra `Warehouse.name` y poblar el nuevo FK; los que no encuentren match quedan `null` (se revisan manualmente si aparecen).
- `ClientForm` cambia el campo de "nombre de almacén" a un `Select` sobre `warehouseId` (ya carga warehouses vía loader, solo cambia qué valor se guarda).

## Sección 3 — Gestión de usuarios y búsqueda Entra ID

### Quitar auto-registro

- `app/services/auth-server.ts`: `findOrCreateUser` se reemplaza por `findUserByEmail`, que no crea filas.
- `app/routes/auth/callback.tsx`: si `findUserByEmail` no encuentra al usuario, no se crea sesión; se redirige a una pantalla de error con el mensaje "Tu cuenta no está registrada, contacta al administrador".
- En el mismo callback, si el usuario existe pero `name` está vacío, se llama a Graph `/me` (con el scope delegado `User.Read` que ya se solicita) para leer `displayName` y hacer backfill de `User.name` — autocorrección pasiva de las cuentas ya creadas por el auto-registro anterior.

### Alta de usuario por admin con búsqueda de directorio

- Nuevo endpoint server-side (p. ej. `app/routes/api/users.search.ts`) que, con un token de aplicación (mismo patrón `getAppAccessToken` que ya usa `email.server.ts`), llama a Graph `GET /v1.0/users?$search="displayName:{q}" OR "mail:{q}"&$select=displayName,mail,userPrincipalName` y devuelve `{name, email}[]`.
- **Requiere permiso de aplicación `User.Read.All` (o `People.Read.All`) con consentimiento de administrador en Azure AD** — no existe hoy (solo está `Mail.Send` app-only y `User.Read` delegado). El usuario confirmó que puede otorgar este consentimiento en el portal de Azure.
- El diálogo "Crear usuario" en `admin/users.tsx` reemplaza los inputs manuales de email/nombre por un combobox de búsqueda (debounce ~300ms) contra ese endpoint. Al seleccionar un resultado, Correo y Nombre se autollenan (solo lectura) y aparece el `Select` de Rol para completar el alta.
- **Fallback:** si la búsqueda falla (permiso no propagado aún, error de red, o la persona no aparece en el directorio), un enlace "Ingresar datos manualmente" habilita los campos de email/nombre como texto libre, para no bloquear el alta de usuarios mientras se resuelve el permiso.

## Fuera de alcance

- Entidad Transportista separada de Cliente.
- Relabeling de "Cliente" → "Transportista" en reportes.
- Personalización visual de UI (temas, columnas configurables) — el rework de admin es de organización/navegación y catálogos de negocio, no de theming.
- Cambiar el patrón de fetch manual por loaders/actions de React Router (se mantiene el patrón existente).

## Testing

- Tests unitarios existentes de `delayThresholds`, `windowTransitions`, `reportIndicators`, `windowOverlap` no deben romperse; se agregan casos para el nuevo flujo de `DelayReason` como tabla y `NotificationRecipient`.
- Verificación manual end-to-end del flujo completo: crear ventana con tipo de operación → escanear QR → confirmar llegada tardía → completar con motivo de retraso → revisar que los correos lleguen a la lista configurada → revisar KPIs en `/reports`.
- Verificación manual del flujo de usuarios: login con cuenta no registrada (debe bloquear), login con cuenta existente sin nombre (debe autocompletar desde Graph), alta de usuario por admin vía búsqueda Entra ID y vía fallback manual.
