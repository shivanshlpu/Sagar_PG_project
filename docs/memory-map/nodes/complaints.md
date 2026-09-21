# Memory Map Node: 08. Complaints

## Responsibilities
- Tenant complaint logging (categories: maintenance, noise, cleanliness, security, billing, other; priorities: low, medium, high, urgent).
- Admin complaint status transitions: `open` -> `in_progress` -> `resolved` -> `closed`.
- Internal comments/resolution notes between admins and tenants.

## Key Files
- Server Routes: [`server/src/routes/complaints.routes.ts`](file:///c:/Users/shiva/Desktop/PG%20project/server/src/routes/complaints.routes.ts)
- Server Service: [`server/src/services/complaints.service.ts`](file:///c:/Users/shiva/Desktop/PG%20project/server/src/services/complaints.service.ts)
- Admin UI: [`web/src/admin/Complaints.tsx`](file:///c:/Users/shiva/Desktop/PG%20project/web/src/admin/Complaints.tsx)
- Tenant UI: [`web/src/tenant/Complaints.tsx`](file:///c:/Users/shiva/Desktop/PG%20project/web/src/tenant/Complaints.tsx)
