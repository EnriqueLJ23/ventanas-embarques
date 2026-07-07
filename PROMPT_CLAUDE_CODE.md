# Sistema de Gestión de Ventanas de Embarques — Prompt para Claude Code

> Copia y pega el contenido de este archivo directamente en Claude Code para iniciar el desarrollo del sistema.

---

## Contexto del proyecto

Necesito que construyas un sistema web completo de gestión de ventanas de embarques para una empresa con 4 almacenes (naves). El proyecto ya tiene un template base con las siguientes tecnologías: React + React Router, Prisma como ORM, PostgreSQL, todo dockerizado, autenticación con Entra ID, y ShadCN UI ya instalado.

---

## Restricciones de diseño (crítico)

- Usar EXCLUSIVAMENTE componentes de ShadCN. No agregar clases de Tailwind que modifiquen el tema base de ShadCN definido en `index.css`.
- El tema visual debe ser el default de ShadCN sin personalizaciones adicionales.
- Estilo moderno tipo SaaS empresarial, elegante y limpio.
- Para la visualización del calendario de ventanas usar la librería `@fullcalendar/react` con las vistas de timeline y/o resourceTimeline para mostrar las 4 naves como recursos en el mismo calendario.

---

## Roles del sistema (4 roles)

### 1. Ventas
- Registrar nuevas ventanas (visitas de embarque): seleccionar cliente, nave, fecha/hora, nombre del operador, número de placas.
- Visualizar el calendario de ventanas.
- Al registrar una ventana, se genera automáticamente un código QR con: nombre del operador, placas y fecha. El QR debe poderse visualizar en pantalla y descargar como PNG.
- NO puede modificar configuraciones del sistema.

### 2. Carga
- Registrar entrada/salida de embarques de SALIDA de material (embarques que salen de la empresa).
- Al registrar una salida: ingresar número de rollos embarcados, seleccionar hora de llegada al almacén.
- Al cerrar/registrar la salida completa: si el tiempo superó el estimado promedio del cliente, el sistema solicita obligatoriamente ingresar un motivo/comentario del retraso.
- Puede ver el calendario de ventanas.

### 3. Descarga
- Registrar entrada/salida de RECEPCIÓN de material (material que entra a la empresa).
- Mismos flujos que Carga pero para ingresos de material.
- Al cerrar: si el tiempo superó el estimado, solicitar motivo del retraso.
- Puede ver el calendario de ventanas.

### 4. Administrador
- Panel completo con control total del sistema.
- Gestión de usuarios: crear, editar, desactivar usuarios y asignar roles.
- Configuración de clientes: nombre, tiempo promedio de embarque (en horas/minutos), tier de prioridad (Tier 1, Tier 2, Tier 3, etc.), nave asignada preferida, hora habitual de llegada.
- Configuración de almacenes/naves: nombre de la nave (Nave 1, Nave 2, Nave 3, Nave 4), capacidad de ventanas simultáneas.
- Visualización completa del calendario con todas las naves.
- Puede aprobar solicitudes para romper restricciones de solapamiento (recibe notificación cuando un usuario de ventas solicita override).
- Puede editar o eliminar cualquier ventana.
- Historial completo de actividad del sistema.
- Dashboard con métricas en tiempo real: ventanas activas, tiempos promedio por cliente, retardos del día.
- Gestión de tiers: crear/editar/eliminar tiers y definir su nivel de prioridad.
- Página de reportes (ver sección de reportes).

---

## Modelo de datos (Prisma Schema)

Crear los siguientes modelos:

```prisma
model User {
  id         String   @id @default(cuid())
  entraId    String   @unique
  name       String
  email      String   @unique
  role       Role     @default(VENTAS)
  active     Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}

enum Role {
  VENTAS
  CARGA
  DESCARGA
  ADMINISTRADOR
}

model Tier {
  id           String    @id @default(cuid())
  name         String    @unique // "Tier 1", "Tier 2", etc.
  priority     Int       @unique // 1 = mayor prioridad
  description  String?
  clients      Client[]
  createdAt    DateTime  @default(now())
}

model Client {
  id              String    @id @default(cuid())
  name            String
  tierId          String
  tier            Tier      @relation(fields: [tierId], references: [id])
  avgLoadTime     Int       // minutos promedio de embarque
  preferredWarehouse String? // nave preferida
  defaultArrivalTime String? // hora habitual "HH:MM"
  active          Boolean   @default(true)
  windows         Window[]
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

model Warehouse {
  id        String   @id @default(cuid())
  name      String   @unique // "Nave 1", "Nave 2", etc.
  code      String   @unique // "N1", "N2", etc.
  active    Boolean  @default(true)
  windows   Window[]
}

model Window {
  id               String        @id @default(cuid())
  clientId         String
  client           Client        @relation(fields: [clientId], references: [id])
  warehouseId      String
  warehouse        Warehouse     @relation(fields: [warehouseId], references: [id])
  scheduledStart   DateTime
  scheduledEnd     DateTime      // calculado: scheduledStart + avgLoadTime del cliente
  operatorName     String
  licensePlate     String
  qrCode           String?       // base64 del QR generado
  status           WindowStatus  @default(SCHEDULED)
  actualStart      DateTime?
  actualEnd        DateTime?
  rollsCount       Int?
  delayReason      String?
  overrideRequest  OverrideRequest?
  type             WindowType    @default(CARGA)
  createdBy        String        // userId
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt
}

enum WindowStatus {
  SCHEDULED   // programada
  IN_PROGRESS // en curso
  COMPLETED   // completada
  CANCELLED   // cancelada
}

enum WindowType {
  CARGA     // salida de material
  DESCARGA  // entrada de material
}

model OverrideRequest {
  id          String   @id @default(cuid())
  windowId    String   @unique
  window      Window   @relation(fields: [windowId], references: [id])
  requestedBy String   // userId
  reason      String
  status      OverrideStatus @default(PENDING)
  reviewedBy  String?
  reviewedAt  DateTime?
  createdAt   DateTime @default(now())
}

enum OverrideStatus {
  PENDING
  APPROVED
  REJECTED
}
```

---

## Lógica de negocio crítica

### Validación de solapamiento de horarios
- Dentro de la MISMA nave: NO pueden existir dos ventanas con horarios que se traslapen.
- Entre DISTINTAS naves: sí se permiten horarios iguales o traslapados.
- El horario de fin se calcula automáticamente: `scheduledStart + client.avgLoadTime`.
- Al crear una ventana, el sistema debe verificar conflictos en la misma nave ANTES de guardar.
- Si hay conflicto, mostrar qué ventana existente genera el conflicto (cliente, horario) y mostrar un botón "Solicitar excepción al administrador".
- Al solicitar excepción: mostrar modal para ingresar motivo, luego enviar notificación al administrador (puede ser un registro en BD + indicador en el panel admin).

### Prioridad por Tier
- El tier define la prioridad del cliente. Tier 1 = mayor prioridad.
- Al mostrar conflictos, indicar visualmente qué cliente tiene mayor prioridad.
- El administrador puede configurar qué significa cada tier.

### Código QR
- Al registrar una ventana, generar un QR con la siguiente información en formato texto estructurado:
  ```
  VENTANA DE EMBARQUE
  Cliente: [nombre]
  Operador: [nombre operador]
  Placas: [placas]
  Nave: [nombre nave]
  Fecha: [fecha]
  Hora: [hora inicio] - [hora fin estimada]
  ID: [id ventana]
  ```
- Usar la librería `qrcode` o `qrcode.react` para generar el QR.
- El QR debe mostrarse en un modal con botón de descarga como PNG usando `html-to-image` o `canvas`.

---

## Vistas y páginas

### `/` - Dashboard (según rol)
- **Admin**: métricas del día (ventanas programadas, en curso, completadas, retardos), gráfica de ocupación por nave, solicitudes de override pendientes.
- **Ventas**: acceso rápido a crear ventana + calendario.
- **Carga/Descarga**: ventanas asignadas del día con acciones rápidas.

### `/calendar` - Calendario de ventanas
- Usar `@fullcalendar/react` con vista `resourceTimeline` (timeline horizontal).
- Los 4 recursos son las 4 naves.
- Cada evento muestra: nombre del cliente, hora inicio-fin, estado (color por status).
- Filtros: por fecha, por nave, por estado.
- Click en evento: modal con detalle completo de la ventana.
- Botón flotante "+ Nueva Ventana" (solo roles con permiso).

### `/windows/new` - Crear nueva ventana
- Formulario: seleccionar cliente (con tier visible), seleccionar nave, seleccionar fecha, seleccionar hora de llegada.
- Al seleccionar cliente: autocompletar hora habitual si tiene una configurada, mostrar tiempo promedio estimado.
- Hora fin = calculada automáticamente y mostrada como preview.
- Ingresar nombre del operador y placas.
- Validación en tiempo real de solapamiento (query al backend).
- Si hay conflicto: mostrar alerta con detalle y opción de solicitar override.
- Al guardar exitosamente: mostrar modal con QR generado + botón descarga PNG.

### `/windows/:id` - Detalle de ventana
- Info completa de la ventana.
- Si status = SCHEDULED: botones para iniciar (marcar como IN_PROGRESS).
- Si status = IN_PROGRESS: botón para cerrar (marcar COMPLETED).
  - Al cerrar: modal que pide número de rollos embarcados.
  - Si `actualEnd - actualStart > client.avgLoadTime`: campo obligatorio de motivo de retraso.
- Mostrar QR si existe.
- Historial de cambios de status.

### `/admin` - Panel de Administración (solo Administrador)
Subpáginas:
- `/admin/users` - Gestión de usuarios (CRUD + asignar roles)
- `/admin/clients` - Gestión de clientes (CRUD: nombre, tier, tiempo promedio, nave preferida, hora habitual)
- `/admin/warehouses` - Gestión de naves
- `/admin/tiers` - Gestión de tiers (nombre, nivel de prioridad, descripción)
- `/admin/overrides` - Solicitudes de excepción pendientes (aprobar/rechazar con comentario)
- `/admin/activity` - Log de actividad del sistema

### `/reports` - Reportes (solo Administrador)
- Filtros: rango de fechas, nave, cliente, tier.
- Métricas mostradas:
  - Tiempo promedio real vs estimado por cliente
  - Número de retardos por cliente/nave/período
  - Ventanas por nave (ocupación)
  - Rollos embarcados por período
  - Tabla detallada de todas las ventanas con todos sus campos
- Botón "Exportar a Excel" que genera un archivo `.xlsx` con:
  - Hoja 1: Resumen general con tablas de métricas
  - Hoja 2: Detalle de ventanas (todas las columnas)
  - Hoja 3: Retardos y motivos
  - Gráficas embebidas en las hojas (barras para tiempos, líneas para tendencias)
  - Usar la librería `exceljs` para generar el archivo.

---

## Estructura de archivos sugerida

```
src/
  components/
    ui/           # componentes ShadCN (ya existentes)
    calendar/     # componentes del fullcalendar
    windows/      # componentes de ventanas
    qr/           # componente QR viewer/downloader
    admin/        # componentes del panel admin
  pages/
    Dashboard.tsx
    Calendar.tsx
    windows/
      NewWindow.tsx
      WindowDetail.tsx
    admin/
      Users.tsx
      Clients.tsx
      Warehouses.tsx
      Tiers.tsx
      Overrides.tsx
      Activity.tsx
    Reports.tsx
  lib/
    prisma.ts
    auth.ts
    validations/
      windowOverlap.ts  # lógica de validación de solapamiento
  hooks/
    useWindowConflicts.ts
    useCalendarEvents.ts
  types/
    index.ts
```

---

## Dependencias a instalar

```bash
npm install @fullcalendar/react @fullcalendar/resource-timeline @fullcalendar/interaction @fullcalendar/core
npm install qrcode qrcode.react
npm install html-to-image
npm install exceljs
npm install date-fns
```

---

## Consideraciones adicionales

1. **Manejo de fechas**: Usar `date-fns` para toda manipulación de fechas. Mostrar fechas en formato legible en español (es-MX).

2. **Notificaciones de override**: Implementar como un badge/contador en el menú del admin que muestre cuántas solicitudes pendientes hay. Al hacer click en el badge ir a `/admin/overrides`.

3. **Responsive**: El calendario debe funcionar en desktop principalmente. En mobile mostrar vista de lista.

4. **Loading states**: Usar el componente `Skeleton` de ShadCN para todos los estados de carga.

5. **Toasts**: Usar `Sonner` o el `useToast` de ShadCN para feedback de acciones.

6. **Protección de rutas**: Implementar guards por rol. Si un usuario intenta acceder a una ruta sin permiso, redirigir al dashboard con un toast de error.

7. **API Routes**: Organizar los endpoints REST en:
   - `GET/POST /api/windows` - listar/crear ventanas
   - `GET/PATCH /api/windows/:id` - detalle/actualizar ventana
   - `GET /api/windows/conflicts` - validar solapamiento (query params: warehouseId, start, end, excludeId?)
   - `POST /api/windows/:id/start` - iniciar ventana
   - `POST /api/windows/:id/complete` - completar ventana (body: rollsCount, delayReason?)
   - `GET/POST /api/clients` - listar/crear clientes
   - `GET/POST /api/tiers` - listar/crear tiers
   - `GET/POST /api/warehouses` - listar/crear naves
   - `GET/POST /api/users` - listar/crear usuarios (admin only)
   - `POST /api/overrides` - solicitar override
   - `PATCH /api/overrides/:id` - aprobar/rechazar override (admin only)
   - `GET /api/reports/summary` - datos para reportes con filtros
   - `GET /api/reports/export` - generar y devolver archivo Excel

8. **Seed de datos**: Crear un seed de Prisma con datos de ejemplo: 4 naves, 3 tiers, 5 clientes de ejemplo con distintos tiempos promedio y tiers, 1 usuario admin.

---

Por favor implementa este sistema completo siguiendo todas las especificaciones anteriores. Comienza por el schema de Prisma, luego las API routes, y finalmente las páginas de React. Asegúrate de que la lógica de validación de solapamiento sea robusta y esté tanto en el frontend (para UX inmediata) como en el backend (para integridad de datos).
