# SportBooking

Plataforma de reserva de canchas deportivas para Argentina.

## Arquitectura

```
Frontend (Next.js 14 - Vercel)
    │
    ├── Supabase SDK (@supabase/supabase-js)
    │     ├── Auth          → login, register, roles (CLIENT / VENUE_ADMIN / ADMIN)
    │     ├── Database      → queries directas con Row Level Security
    │     ├── Storage       → imágenes de complejos, canchas y avatars
    │     └── Realtime      → notificaciones in-app en tiempo real
    │
    └── Supabase Edge Functions (Deno/TypeScript)
          ├── create-booking        → crear reserva con validaciones
          ├── create-recurring      → turno fijo (8 ocurrencias)
          ├── cancel-booking        → cancelar (regla 24h para clientes)
          ├── cancel-recurring      → cancelar serie de turno fijo
          ├── mark-paid             → marcar reserva como pagada
          ├── cron-cancel-unpaid    → cancelar impagas < 24h (pg_cron)
          ├── cron-send-reminders   → recordatorios < 2h (pg_cron)
          └── cron-complete-bookings → completar turnos pasados (pg_cron)

Supabase (olrmhtimfndshayvuowc)
    ├── PostgreSQL    → 12 tablas con RLS, RPC functions, pg_cron
    └── Storage       → buckets: venues / facilities / avatars
```

## Stack

- **Frontend**: Next.js 14, TypeScript, HeroUI, TanStack Query, Zustand
- **Backend**: Supabase (Postgres + Auth + Storage + Edge Functions + Realtime)
- **Emails**: Resend
- **Deploy**: Vercel (frontend) + Supabase (backend)

## Variables de entorno

### Frontend (Vercel)
```
NEXT_PUBLIC_SUPABASE_URL=https://olrmhtimfndshayvuowc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

### Edge Functions (Supabase Secrets)
```
SUPABASE_URL=https://olrmhtimfndshayvuowc.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=SportBooking <onboarding@resend.dev>
```

## Base de datos

Migraciones en `supabase/migrations/`:
- `001_schema.sql` — 12 tablas + 5 enums + índices
- `002_triggers.sql` — triggers (profiles, updated_at) + funciones RLS
- `003_rls.sql` — Row Level Security en las 12 tablas
- `004_rpc.sql` — Postgres RPC: calculate_price, get_availability, get_stats
- `006_storage.sql` — Storage buckets y políticas

## Desarrollo local

```bash
# Frontend
cd frontend
npm install
npm run dev

# Supabase (requiere Supabase CLI)
supabase start       # levantar Supabase local con Docker
supabase db push     # aplicar migraciones
supabase functions serve  # Edge Functions en modo dev
```

## Pendientes antes de producción

- [ ] Verificar dominio en Resend para envío a cualquier email
- [ ] Configurar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en Vercel
- [ ] Completar migración de páginas que aún usan el wrapper `api-client.ts`
