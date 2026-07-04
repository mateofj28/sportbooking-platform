# SportBooking — Guía de Roles y Acciones

## Credenciales de prueba

| Rol | Email | Contraseña |
|-----|-------|------------|
| Admin | admin@sportbooking.com | Admin123! |
| Cliente | client@sportbooking.com | Client123! |

---

## 👤 Cliente

El cliente es el usuario final que busca y reserva instalaciones deportivas.

### Acciones disponibles

| Acción | Ruta | Descripción |
|--------|------|-------------|
| Registrarse | `/register` | Crear una cuenta nueva con nombre, email y contraseña |
| Iniciar sesión | `/login` | Acceder con email y contraseña |
| Recuperar contraseña | `/forgot-password` | Solicitar un enlace de restablecimiento |
| Explorar instalaciones | `/facilities` | Ver listado de canchas disponibles con filtros |
| Filtrar por deporte | `/facilities` | Filtrar instalaciones por tipo de deporte |
| Buscar por nombre | `/facilities` | Buscar instalaciones por texto |
| Ver detalle de instalación | `/facilities/[id]` | Ver horarios, precios y disponibilidad |
| Reservar una instalación | `/facilities/[id]` | Seleccionar día, hora y duración → confirmar reserva |
| Ver mis reservas | `/bookings` | Consultar historial de reservas con estado |
| Cancelar una reserva | `/bookings` | Cancelar reserva pendiente o confirmada (con motivo) |
| Editar mi perfil | `/profile` | Actualizar nombre, apellido y teléfono |

### Reglas que aplican al cliente

- No puede reservar en fechas/horas pasadas
- No puede reservar fuera del horario de atención
- No puede reservar instalaciones inactivas
- No puede reservar horarios ya ocupados o bloqueados
- Debe respetar la duración mínima y máxima de la instalación
- Al cancelar, el horario se libera automáticamente

---

## 🔑 Administrador

El administrador gestiona toda la plataforma: instalaciones, reservas, usuarios y configuraciones.

### Dashboard (`/dashboard`)

| Acción | Descripción |
|--------|-------------|
| Ver métricas | Ingresos totales, total de reservas, tasa de confirmación, instalaciones activas |
| Ver reservas recientes | Últimas reservas con estado y monto |
| Ver distribución por deporte | Porcentaje de reservas por cada deporte |
| Ver indicadores clave | Instalación más popular, precio promedio, reservas de la semana |

### Gestión de Reservas (`/dashboard/bookings`)

| Acción | Descripción |
|--------|-------------|
| Ver todas las reservas | Tabla con instalación, usuario, fecha, precio y estado |
| Confirmar reserva | Aprobar una reserva pendiente |
| Cancelar reserva | Cancelar cualquier reserva activa |
| Crear reserva manual | Reservar para cualquier usuario seleccionando instalación, usuario, fecha y hora |

### Gestión de Instalaciones (`/dashboard/facilities`)

| Acción | Descripción |
|--------|-------------|
| Ver instalaciones | Tabla con nombre, deporte, sede, superficie y estado |
| Crear instalación | Nueva cancha con deporte, sede, superficie, duración mín/máx |
| Editar instalación | Modificar nombre, descripción, superficie y duraciones |
| Desactivar instalación | Inhabilitar una cancha (no se puede reservar) |

### Gestión de Sedes (`/dashboard/venues`)

| Acción | Descripción |
|--------|-------------|
| Ver sedes | Lista de complejos deportivos |
| Crear sede | Nueva sede con nombre, dirección, ciudad y país |
| Desactivar sede | Inhabilitar un complejo completo |

### Gestión de Deportes (`/dashboard/sports`)

| Acción | Descripción |
|--------|-------------|
| Ver deportes | Catálogo de deportes disponibles |
| Crear deporte | Nuevo deporte con nombre, slug e ícono |
| Editar deporte | Modificar nombre, slug o ícono |
| Desactivar deporte | Remover deporte del catálogo |

### Configuración de Horarios (`/dashboard/schedules`)

| Acción | Descripción |
|--------|-------------|
| Ver horarios | Horarios configurados por instalación y día |
| Agregar horario | Definir hora de apertura y cierre para un día específico |
| Eliminar horario | Remover un horario de un día |

### Configuración de Precios (`/dashboard/pricing`)

| Acción | Descripción |
|--------|-------------|
| Ver tarifas | Precios por franja horaria de cada instalación |
| Agregar tarifa | Definir precio/hora para un rango horario (opcionalmente por día) |
| Eliminar tarifa | Remover una tarifa |

### Bloqueo de Horarios (`/dashboard/blocked-slots`)

| Acción | Descripción |
|--------|-------------|
| Ver bloqueos | Horarios bloqueados por instalación |
| Crear bloqueo | Bloquear un rango de fecha/hora (por mantenimiento, eventos, etc.) |
| Eliminar bloqueo | Liberar un horario bloqueado |

### Gestión de Usuarios (`/dashboard/users`)

| Acción | Descripción |
|--------|-------------|
| Ver usuarios | Lista de todos los usuarios registrados |
| Desactivar usuario | Inhabilitar una cuenta de cliente |

---

## Flujos principales

### Cliente reservando una cancha
```
Login → Explorar instalaciones → Filtrar por deporte → 
Seleccionar instalación → Elegir día → Elegir hora → 
Elegir duración → Confirmar reserva → Ver en "Mis Reservas"
```

### Admin gestionando el día
```
Login → Dashboard (ver métricas) → Reservas (confirmar pendientes) → 
Instalaciones (verificar estado) → Bloqueos (si hay mantenimiento)
```

### Admin configurando nueva instalación
```
Dashboard → Sedes (crear si no existe) → Deportes (crear si no existe) → 
Instalaciones (crear nueva) → Horarios (configurar apertura/cierre) → 
Precios (definir tarifas por hora)
```
