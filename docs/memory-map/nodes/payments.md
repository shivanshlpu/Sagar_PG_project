# Memory Map Node: 07. Payments

## Responsibilities
- Tenant payment submission (amount, payment method: UPI/cash/bank_transfer, transaction id, screenshot upload).
- Admin verification and rejection workflow with rejection reason.
- Auto-updates corresponding rent/electricity record status to `paid` upon verification.

## Key Files
- Server Routes: [`server/src/routes/payments.routes.ts`](file:///c:/Users/shiva/Desktop/PG%20project/server/src/routes/payments.routes.ts)
- Server Service: [`server/src/services/payments.service.ts`](file:///c:/Users/shiva/Desktop/PG%20project/server/src/services/payments.service.ts)
- Admin UI: [`web/src/admin/Payments.tsx`](file:///c:/Users/shiva/Desktop/PG%20project/web/src/admin/Payments.tsx)
