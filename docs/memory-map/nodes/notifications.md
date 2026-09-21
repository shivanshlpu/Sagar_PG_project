# Memory Map Node: 10. Notifications & Audit Log

## Responsibilities
- System notification center for tenants and admins (rent due alerts, payment verification, complaint updates, general announcements).
- Severity and type indication with visual left borders.
- Mark as read functionality.
- Immutable admin audit logging for critical operations (room edits, tenant changes, rent generation, payment approvals).

## Key Files
- Server Notifications: [`server/src/routes/notifications.routes.ts`](file:///c:/Users/shiva/Desktop/PG%20project/server/src/routes/notifications.routes.ts)
- Server Audit Log: [`server/src/services/auditLog.service.ts`](file:///c:/Users/shiva/Desktop/PG%20project/server/src/services/auditLog.service.ts)
- Admin Audit Log UI: [`web/src/admin/AuditLog.tsx`](file:///c:/Users/shiva/Desktop/PG%20project/web/src/admin/AuditLog.tsx)
- Tenant Notifications UI: [`web/src/tenant/Notifications.tsx`](file:///c:/Users/shiva/Desktop/PG%20project/web/src/tenant/Notifications.tsx)
