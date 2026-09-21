# Memory Map Node: 12. WhatsApp Integration (Baileys + BullMQ)

## Responsibilities
- Automated notification channel via Baileys (pairing QR code, multi-device socket session persistence).
- BullMQ queue workers for asynchronous message dispatch, exponential retry, and anti-ban rate limiting.
- Templates for rent generation alerts, payment receipts, complaint updates, and broadcast announcements.
- Status monitoring card in Admin Settings (disconnected / pairing / connected).

## Key Files
- Baileys Microservice: `services/whatsapp/`
- Queue Worker: `services/queue/`
- Server WhatsApp Routes: [`server/src/routes/settings.routes.ts`](file:///c:/Users/shiva/Desktop/PG%20project/server/src/routes/settings.routes.ts)
- Admin Settings UI: [`web/src/admin/Settings.tsx`](file:///c:/Users/shiva/Desktop/PG%20project/web/src/admin/Settings.tsx)
