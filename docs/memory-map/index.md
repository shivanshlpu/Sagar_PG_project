# System Memory Map

The memory map provides a persistent cross-session knowledge base for each module in the system.

## Module Nodes

| Module | Node File | Status | Description |
| :--- | :--- | :--- | :--- |
| **01. Auth & Core** | [`nodes/auth.md`](file:///c:/Users/shiva/Desktop/PG%20project/docs/memory-map/nodes/auth.md) | Completed | Admin & tenant authentication, JWTs, role guards, RLS |
| **02. Rooms & Beds** | [`nodes/rooms.md`](file:///c:/Users/shiva/Desktop/PG%20project/docs/memory-map/nodes/rooms.md) | Completed | Room CRUD, bed capacity, occupancy tracking |
| **03. Tenants** | [`nodes/tenants.md`](file:///c:/Users/shiva/Desktop/PG%20project/docs/memory-map/nodes/tenants.md) | Completed | Tenant profiles, onboarding links, document storage |
| **04. Rent Records** | [`nodes/rent.md`](file:///c:/Users/shiva/Desktop/PG%20project/docs/memory-map/nodes/rent.md) | Completed | Monthly rent generation, late fees, status transitions |
| **05. Electricity** | [`nodes/electricity.md`](file:///c:/Users/shiva/Desktop/PG%20project/docs/memory-map/nodes/electricity.md) | Completed | Meter readings, unit consumption calculation, bill generation |
| **06. PDF Bills** | [`nodes/pdf-bills.md`](file:///c:/Users/shiva/Desktop/PG%20project/docs/memory-map/nodes/pdf-bills.md) | Ready for impl | pdfmake bill invoice generator |
| **07. Payments** | [`nodes/payments.md`](file:///c:/Users/shiva/Desktop/PG%20project/docs/memory-map/nodes/payments.md) | Completed | Tenant payment proofs, admin verification/rejection |
| **08. Complaints** | [`nodes/complaints.md`](file:///c:/Users/shiva/Desktop/PG%20project/docs/memory-map/nodes/complaints.md) | Completed | Complaint ticketing, category/priority, resolution workflow |
| **09. Tenant Dashboard** | [`nodes/tenant-dashboard.md`](file:///c:/Users/shiva/Desktop/PG%20project/docs/memory-map/nodes/tenant-dashboard.md) | Completed | Dues summary, rent history, WiFi credentials & contacts |
| **10. Notifications** | [`nodes/notifications.md`](file:///c:/Users/shiva/Desktop/PG%20project/docs/memory-map/nodes/notifications.md) | Completed | In-app notification center, read receipts, audit logging |
| **11. Reports** | [`nodes/reports.md`](file:///c:/Users/shiva/Desktop/PG%20project/docs/memory-map/nodes/reports.md) | Completed | Financial aggregation, collection metrics, Recharts |
| **12. WhatsApp** | [`nodes/whatsapp.md`](file:///c:/Users/shiva/Desktop/PG%20project/docs/memory-map/nodes/whatsapp.md) | Ready for impl | Baileys microservice + BullMQ queue worker |
