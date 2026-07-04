# SportBooking Platform - Especificación del Sistema

## Visión General

Plataforma genérica para la gestión y reserva de instalaciones deportivas (fútbol, tenis, pádel, baloncesto, voleibol y otros deportes). Diseñada desde el inicio para escalar a múltiples sedes, múltiples deportes y miles de usuarios concurrentes. No es una app específica para un deporte, sino una plataforma donde cualquier tipo de instalación deportiva puede registrarse y reservarse.

---

## Stack Tecnológico

### Frontend
- Next.js 15 (App Router)
- React 19
- TypeScript
- TailwindCSS 4
- HeroUI (v2 - @heroui/react)
- React Hook Form
- Zod
- TanStack Query
- Zustand
- Framer Motion
- Lucide React

### Backend
- NestJS
- TypeScript
- Prisma ORM
- PostgreSQL
- JWT Authentication
- Swagger

### Infraestructura
- Base de datos: PostgreSQL (Neon)
- Almacenamiento: Cloudinary
- Frontend hosting: Vercel
- Backend hosting: Railway

---

## Principios de Diseño

- SOLID
- Clean Architecture
- Domain Driven Design
- Separation of Concerns
- Repository Pattern
- Service Layer
- DTO Pattern
- Validaciones con Zod (frontend) y class-validator (backend)
- Código completamente tipado
- No código duplicado
- Componentes reutilizables

---

## Análisis del Dominio

### Entidades Principales

1. **User** - Usuario del sistema (cliente o administrador)
2. **Venue** - Sede/complejo deportivo
3. **Facility** - Instalación deportiva específica (cancha, pista, campo)
4. **Sport** - Tipo de deporte soportado
5. **Booking** - Reserva de una instalación
6. **Schedule** - Configuración de horarios de una instalación
7. **BlockedSlot** - Horarios bloqueados por el administrador
8. **Pricing** - Configuración de precios

### Agregados

1. **User Aggregate**
   - Root: User
   - Gestiona autenticación, perfil y roles

2. **Venue Aggregate**
   - Root: Venue
   - Contiene: Facility, Schedule, BlockedSlot, Pricing
   - Gestiona la configuración completa de una sede

3. **Booking Aggregate**
   - Root: Booking
   - Gestiona el ciclo de vida de las reservas

4. **Sport Aggregate**
   - Root: Sport
   - Catálogo de deportes disponibles

### Relaciones

```
User (1) ────> (*) Booking
Venue (1) ────> (*) Facility
Facility (1) ────> (*) Booking
Facility (1) ────> (*) Schedule
Facility (1) ────> (*) BlockedSlot
Facility (1) ────> (*) Pricing
Facility (*) ────> (1) Sport
Venue (*) <───> (*) Sport (deportes disponibles en la sede)
```

---

## Modelo de Base de Datos

### Tabla: users
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | UUID | PK |
| email | VARCHAR(255) | UNIQUE, NOT NULL |
| password_hash | VARCHAR(255) | NOT NULL |
| first_name | VARCHAR(100) | NOT NULL |
| last_name | VARCHAR(100) | NOT NULL |
| phone | VARCHAR(20) | NULLABLE |
| avatar_url | VARCHAR(500) | NULLABLE |
| role | ENUM(CLIENT, ADMIN) | NOT NULL, DEFAULT CLIENT |
| is_active | BOOLEAN | DEFAULT TRUE |
| email_verified | BOOLEAN | DEFAULT FALSE |
| reset_token | VARCHAR(255) | NULLABLE |
| reset_token_expires | TIMESTAMP | NULLABLE |
| created_at | TIMESTAMP | NOT NULL |
| updated_at | TIMESTAMP | NOT NULL |

### Tabla: venues
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | UUID | PK |
| name | VARCHAR(200) | NOT NULL |
| slug | VARCHAR(200) | UNIQUE, NOT NULL |
| description | TEXT | NULLABLE |
| address | VARCHAR(500) | NOT NULL |
| city | VARCHAR(100) | NOT NULL |
| state | VARCHAR(100) | NULLABLE |
| country | VARCHAR(100) | NOT NULL |
| latitude | DECIMAL(10,8) | NULLABLE |
| longitude | DECIMAL(11,8) | NULLABLE |
| phone | VARCHAR(20) | NULLABLE |
| email | VARCHAR(255) | NULLABLE |
| image_url | VARCHAR(500) | NULLABLE |
| is_active | BOOLEAN | DEFAULT TRUE |
| created_at | TIMESTAMP | NOT NULL |
| updated_at | TIMESTAMP | NOT NULL |

### Tabla: sports
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | UUID | PK |
| name | VARCHAR(100) | UNIQUE, NOT NULL |
| slug | VARCHAR(100) | UNIQUE, NOT NULL |
| icon | VARCHAR(50) | NULLABLE |
| description | TEXT | NULLABLE |
| is_active | BOOLEAN | DEFAULT TRUE |
| created_at | TIMESTAMP | NOT NULL |
| updated_at | TIMESTAMP | NOT NULL |

### Tabla: facilities
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | UUID | PK |
| venue_id | UUID | FK -> venues.id, NOT NULL |
| sport_id | UUID | FK -> sports.id, NOT NULL |
| name | VARCHAR(200) | NOT NULL |
| description | TEXT | NULLABLE |
| image_url | VARCHAR(500) | NULLABLE |
| surface_type | VARCHAR(50) | NULLABLE |
| is_indoor | BOOLEAN | DEFAULT FALSE |
| capacity | INTEGER | NULLABLE |
| is_active | BOOLEAN | DEFAULT TRUE |
| min_booking_duration | INTEGER | NOT NULL (en minutos) |
| max_booking_duration | INTEGER | NOT NULL (en minutos) |
| created_at | TIMESTAMP | NOT NULL |
| updated_at | TIMESTAMP | NOT NULL |

### Tabla: schedules
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | UUID | PK |
| facility_id | UUID | FK -> facilities.id, NOT NULL |
| day_of_week | INTEGER | NOT NULL (0=Lunes, 6=Domingo) |
| open_time | TIME | NOT NULL |
| close_time | TIME | NOT NULL |
| is_active | BOOLEAN | DEFAULT TRUE |
| created_at | TIMESTAMP | NOT NULL |
| updated_at | TIMESTAMP | NOT NULL |

### Tabla: pricing
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | UUID | PK |
| facility_id | UUID | FK -> facilities.id, NOT NULL |
| day_of_week | INTEGER | NULLABLE (null = aplica todos los días) |
| start_time | TIME | NOT NULL |
| end_time | TIME | NOT NULL |
| price_per_hour | DECIMAL(10,2) | NOT NULL |
| currency | VARCHAR(3) | DEFAULT 'USD' |
| is_active | BOOLEAN | DEFAULT TRUE |
| created_at | TIMESTAMP | NOT NULL |
| updated_at | TIMESTAMP | NOT NULL |

### Tabla: blocked_slots
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | UUID | PK |
| facility_id | UUID | FK -> facilities.id, NOT NULL |
| start_datetime | TIMESTAMP | NOT NULL |
| end_datetime | TIMESTAMP | NOT NULL |
| reason | VARCHAR(500) | NULLABLE |
| created_by | UUID | FK -> users.id, NOT NULL |
| created_at | TIMESTAMP | NOT NULL |
| updated_at | TIMESTAMP | NOT NULL |

### Tabla: bookings
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| id | UUID | PK |
| facility_id | UUID | FK -> facilities.id, NOT NULL |
| user_id | UUID | FK -> users.id, NOT NULL |
| start_datetime | TIMESTAMP | NOT NULL |
| end_datetime | TIMESTAMP | NOT NULL |
| status | ENUM(PENDING, CONFIRMED, CANCELLED, COMPLETED) | NOT NULL |
| total_price | DECIMAL(10,2) | NOT NULL |
| currency | VARCHAR(3) | DEFAULT 'USD' |
| notes | TEXT | NULLABLE |
| cancelled_at | TIMESTAMP | NULLABLE |
| cancelled_by | UUID | FK -> users.id, NULLABLE |
| cancellation_reason | VARCHAR(500) | NULLABLE |
| created_by | UUID | FK -> users.id, NOT NULL |
| created_at | TIMESTAMP | NOT NULL |
| updated_at | TIMESTAMP | NOT NULL |

### Tabla: venue_sports (many-to-many)
| Campo | Tipo | Restricciones |
|-------|------|---------------|
| venue_id | UUID | FK -> venues.id |
| sport_id | UUID | FK -> sports.id |
| PK | (venue_id, sport_id) | |

---

## Arquitectura de Carpetas

### Backend (NestJS)

```
backend/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── common/
│   │   ├── decorators/
│   │   ├── filters/
│   │   ├── guards/
│   │   ├── interceptors/
│   │   ├── pipes/
│   │   ├── interfaces/
│   │   └── utils/
│   ├── config/
│   │   ├── database.config.ts
│   │   ├── jwt.config.ts
│   │   └── app.config.ts
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── strategies/
│   │   │   ├── guards/
│   │   │   └── dto/
│   │   ├── users/
│   │   │   ├── users.module.ts
│   │   │   ├── users.controller.ts
│   │   │   ├── users.service.ts
│   │   │   ├── users.repository.ts
│   │   │   └── dto/
│   │   ├── venues/
│   │   │   ├── venues.module.ts
│   │   │   ├── venues.controller.ts
│   │   │   ├── venues.service.ts
│   │   │   ├── venues.repository.ts
│   │   │   └── dto/
│   │   ├── sports/
│   │   │   ├── sports.module.ts
│   │   │   ├── sports.controller.ts
│   │   │   ├── sports.service.ts
│   │   │   ├── sports.repository.ts
│   │   │   └── dto/
│   │   ├── facilities/
│   │   │   ├── facilities.module.ts
│   │   │   ├── facilities.controller.ts
│   │   │   ├── facilities.service.ts
│   │   │   ├── facilities.repository.ts
│   │   │   └── dto/
│   │   ├── bookings/
│   │   │   ├── bookings.module.ts
│   │   │   ├── bookings.controller.ts
│   │   │   ├── bookings.service.ts
│   │   │   ├── bookings.repository.ts
│   │   │   └── dto/
│   │   ├── schedules/
│   │   │   ├── schedules.module.ts
│   │   │   ├── schedules.controller.ts
│   │   │   ├── schedules.service.ts
│   │   │   ├── schedules.repository.ts
│   │   │   └── dto/
│   │   └── pricing/
│   │       ├── pricing.module.ts
│   │       ├── pricing.controller.ts
│   │       ├── pricing.service.ts
│   │       ├── pricing.repository.ts
│   │       └── dto/
│   └── prisma/
│       ├── prisma.module.ts
│       ├── prisma.service.ts
│       └── schema.prisma
├── test/
├── .env
├── .env.example
├── nest-cli.json
├── tsconfig.json
└── package.json
```

### Frontend (Next.js 15)

```
frontend/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   ├── register/
│   │   │   └── forgot-password/
│   │   ├── (client)/
│   │   │   ├── facilities/
│   │   │   │   ├── page.tsx (listado + búsqueda)
│   │   │   │   └── [id]/page.tsx (detalle + reservar)
│   │   │   ├── bookings/
│   │   │   │   └── page.tsx (mis reservas)
│   │   │   └── profile/
│   │   │       └── page.tsx
│   │   ├── (admin)/
│   │   │   └── dashboard/
│   │   │       ├── page.tsx
│   │   │       ├── facilities/
│   │   │       ├── users/
│   │   │       ├── bookings/
│   │   │       ├── schedules/
│   │   │       ├── pricing/
│   │   │       └── sports/
│   │   ├── layout.tsx
│   │   ├── page.tsx (landing)
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/ (shadcn/ui)
│   │   ├── layout/
│   │   │   ├── header.tsx
│   │   │   ├── footer.tsx
│   │   │   ├── sidebar.tsx
│   │   │   └── mobile-nav.tsx
│   │   ├── forms/
│   │   │   ├── login-form.tsx
│   │   │   ├── register-form.tsx
│   │   │   ├── booking-form.tsx
│   │   │   └── facility-form.tsx
│   │   ├── cards/
│   │   │   ├── facility-card.tsx
│   │   │   └── booking-card.tsx
│   │   ├── tables/
│   │   │   ├── data-table.tsx
│   │   │   └── columns/
│   │   └── shared/
│   │       ├── search-filters.tsx
│   │       ├── date-picker.tsx
│   │       ├── time-slot-picker.tsx
│   │       ├── sport-selector.tsx
│   │       ├── status-badge.tsx
│   │       ├── loading-skeleton.tsx
│   │       └── empty-state.tsx
│   ├── hooks/
│   │   ├── use-auth.ts
│   │   ├── use-bookings.ts
│   │   ├── use-facilities.ts
│   │   └── use-debounce.ts
│   ├── lib/
│   │   ├── api-client.ts
│   │   ├── utils.ts
│   │   ├── constants.ts
│   │   └── validations/
│   │       ├── auth.schema.ts
│   │       ├── booking.schema.ts
│   │       └── facility.schema.ts
│   ├── stores/
│   │   ├── auth-store.ts
│   │   └── booking-store.ts
│   ├── types/
│   │   ├── api.types.ts
│   │   ├── auth.types.ts
│   │   ├── booking.types.ts
│   │   ├── facility.types.ts
│   │   └── common.types.ts
│   └── providers/
│       ├── query-provider.tsx
│       └── theme-provider.tsx
├── public/
├── .env.local
├── .env.example
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Flujo de Navegación

### Cliente
```
Landing → Login/Register → Explorar Instalaciones → Filtrar (deporte/fecha/hora)
→ Ver Detalle → Seleccionar Horario → Confirmar Reserva → Mis Reservas
→ Editar Perfil
```

### Administrador
```
Login → Dashboard → Gestionar Instalaciones (CRUD)
                  → Gestionar Usuarios (CRUD)
                  → Gestionar Reservas (CRUD + confirmar/cancelar)
                  → Configurar Horarios
                  → Configurar Precios
                  → Bloquear Horarios
                  → Gestionar Deportes
```

---

## Endpoints REST API

### Auth
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | /api/auth/register | Registro de usuario |
| POST | /api/auth/login | Inicio de sesión |
| POST | /api/auth/forgot-password | Solicitar reset de contraseña |
| POST | /api/auth/reset-password | Resetear contraseña |
| GET | /api/auth/me | Obtener usuario actual |
| POST | /api/auth/refresh | Refrescar token |

### Users (Admin)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | /api/users | Listar usuarios (paginado) |
| GET | /api/users/:id | Obtener usuario |
| PATCH | /api/users/:id | Actualizar usuario |
| DELETE | /api/users/:id | Desactivar usuario |
| PATCH | /api/users/profile | Actualizar perfil propio |

### Venues
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | /api/venues | Listar sedes |
| GET | /api/venues/:id | Obtener sede |
| POST | /api/venues | Crear sede (Admin) |
| PATCH | /api/venues/:id | Actualizar sede (Admin) |
| DELETE | /api/venues/:id | Desactivar sede (Admin) |

### Sports
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | /api/sports | Listar deportes |
| POST | /api/sports | Crear deporte (Admin) |
| PATCH | /api/sports/:id | Actualizar deporte (Admin) |
| DELETE | /api/sports/:id | Desactivar deporte (Admin) |

### Facilities
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | /api/facilities | Listar instalaciones (con filtros) |
| GET | /api/facilities/:id | Obtener instalación |
| GET | /api/facilities/:id/availability | Obtener disponibilidad |
| POST | /api/facilities | Crear instalación (Admin) |
| PATCH | /api/facilities/:id | Actualizar instalación (Admin) |
| DELETE | /api/facilities/:id | Desactivar instalación (Admin) |

### Bookings
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | /api/bookings | Listar reservas (Admin: todas, Cliente: propias) |
| GET | /api/bookings/:id | Obtener reserva |
| POST | /api/bookings | Crear reserva |
| PATCH | /api/bookings/:id/confirm | Confirmar reserva (Admin) |
| PATCH | /api/bookings/:id/cancel | Cancelar reserva |
| POST | /api/bookings/manual | Crear reserva manual (Admin) |

### Schedules
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | /api/facilities/:id/schedules | Obtener horarios |
| POST | /api/facilities/:id/schedules | Crear horario (Admin) |
| PATCH | /api/schedules/:id | Actualizar horario (Admin) |
| DELETE | /api/schedules/:id | Eliminar horario (Admin) |

### Pricing
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | /api/facilities/:id/pricing | Obtener precios |
| POST | /api/facilities/:id/pricing | Crear precio (Admin) |
| PATCH | /api/pricing/:id | Actualizar precio (Admin) |
| DELETE | /api/pricing/:id | Eliminar precio (Admin) |

### Blocked Slots
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | /api/facilities/:id/blocked-slots | Obtener bloqueos |
| POST | /api/facilities/:id/blocked-slots | Crear bloqueo (Admin) |
| DELETE | /api/blocked-slots/:id | Eliminar bloqueo (Admin) |

---

## Reglas de Negocio

1. **Sin conflicto de horarios**: Una instalación no puede tener dos reservas superpuestas en el mismo horario.
2. **Dentro del horario de atención**: No permitir reservas fuera del horario configurado para esa instalación en ese día.
3. **Sin fechas pasadas**: No permitir reservas en fechas/horas que ya pasaron.
4. **Instalaciones activas**: No permitir reservar instalaciones inactivas (`is_active = false`).
5. **Duración mínima**: La reserva debe cumplir con la duración mínima configurada en la instalación.
6. **Duración máxima**: La reserva no puede exceder la duración máxima configurada.
7. **Bloqueos**: No permitir reservas en horarios bloqueados por el administrador.
8. **Reservas manuales**: El administrador puede crear reservas para cualquier usuario.
9. **Cancelación libera horario**: Al cancelar una reserva, el horario vuelve a estar disponible.
10. **Cancelación registrada**: Toda cancelación registra quién canceló, cuándo y por qué.

---

## Casos de Uso

### Cliente
1. UC-01: Registrarse en la plataforma
2. UC-02: Iniciar sesión
3. UC-03: Recuperar contraseña
4. UC-04: Explorar instalaciones disponibles
5. UC-05: Filtrar instalaciones por deporte, fecha y horario
6. UC-06: Ver detalle de una instalación
7. UC-07: Ver disponibilidad de horarios
8. UC-08: Crear una reserva
9. UC-09: Ver mis reservas
10. UC-10: Cancelar mi reserva
11. UC-11: Editar mi perfil

### Administrador
12. UC-12: Ver dashboard con métricas
13. UC-13: CRUD de instalaciones
14. UC-14: CRUD de usuarios
15. UC-15: CRUD de reservas
16. UC-16: Confirmar reserva pendiente
17. UC-17: Cancelar reserva
18. UC-18: Crear reserva manual
19. UC-19: Configurar horarios de una instalación
20. UC-20: Configurar precios de una instalación
21. UC-21: Bloquear horarios
22. UC-22: CRUD de deportes
23. UC-23: CRUD de sedes

---

## Componentes Reutilizables (Frontend)

| Componente | Uso |
|------------|-----|
| DataTable | Tablas con paginación, filtros y ordenación |
| SearchFilters | Barra de búsqueda con filtros combinables |
| DatePicker | Selector de fecha |
| TimeSlotPicker | Selector visual de horarios disponibles |
| SportSelector | Selector de deporte (chips/dropdown) |
| FacilityCard | Tarjeta de instalación para listados |
| BookingCard | Tarjeta de reserva |
| StatusBadge | Badge de estado (confirmada, pendiente, etc.) |
| LoadingSkeleton | Skeletons para loading states |
| EmptyState | Estado vacío con ilustración |
| ConfirmDialog | Modal de confirmación |
| FormField | Wrapper de campo de formulario con error handling |
| PageHeader | Header reutilizable de páginas |
| Pagination | Paginación reutilizable |
| StatCard | Tarjeta de estadística para dashboard |

---

## Plan de Implementación (por módulos)

### Fase 1: Fundamentos
1. Setup del proyecto (monorepo o separado)
2. Configuración de Prisma + PostgreSQL
3. Módulo de autenticación (registro, login, JWT)
4. Layout base del frontend

### Fase 2: Core
5. Módulo de deportes (CRUD admin)
6. Módulo de sedes (CRUD admin)
7. Módulo de instalaciones (CRUD admin)
8. Módulo de horarios (configuración)
9. Módulo de precios (configuración)

### Fase 3: Reservas
10. Motor de disponibilidad
11. Módulo de reservas (cliente)
12. Módulo de reservas (admin)
13. Bloqueo de horarios

### Fase 4: UI/UX
14. Landing page
15. Búsqueda y filtros
16. Dashboard admin con métricas
17. Perfil de usuario
18. Animaciones y polish

---

## Notas de Escalabilidad

- El modelo de datos soporta multi-sede desde el inicio (Venue → Facilities)
- Los deportes son un catálogo configurable, no hardcodeado
- Los precios son dinámicos por día/hora
- Los horarios son configurables por día de la semana
- El sistema de bloqueos permite mantenimiento y eventos especiales
- Preparado para agregar: pagos online, notificaciones, multi-idioma, roles granulares
