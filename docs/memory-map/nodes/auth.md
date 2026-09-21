# Memory Map Node: 01. Authentication & Core Schema

## Responsibilities
- Manages authentication for both admins and tenants.
- Issues JWT tokens with user id and role (`admin` vs `tenant`).
- Enforces role-based authorization in backend routes.
- Applies Supabase Row Level Security (RLS) policies to tenant-scoped tables.

## Key Files
- Server Routes: [`server/src/routes/auth.routes.ts`](file:///c:/Users/shiva/Desktop/PG%20project/server/src/routes/auth.routes.ts)
- Server Service: [`server/src/services/auth.service.ts`](file:///c:/Users/shiva/Desktop/PG%20project/server/src/services/auth.service.ts)
- Auth Middleware: [`server/src/middleware/auth.ts`](file:///c:/Users/shiva/Desktop/PG%20project/server/src/middleware/auth.ts)
- Frontend Pages: [`web/src/pages/Login.tsx`](file:///c:/Users/shiva/Desktop/PG%20project/web/src/pages/Login.tsx), [`web/src/pages/Register.tsx`](file:///c:/Users/shiva/Desktop/PG%20project/web/src/pages/Register.tsx)
- Frontend Auth Hook: [`web/src/hooks/useAuth.tsx`](file:///c:/Users/shiva/Desktop/PG%20project/web/src/hooks/useAuth.tsx)
- DB Migration: [`db/migrations/001_core_schema.sql`](file:///c:/Users/shiva/Desktop/PG%20project/db/migrations/001_core_schema.sql)
