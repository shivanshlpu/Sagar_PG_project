# Memory Map Node: 06. PDF Bills (pdfmake)

## Responsibilities
- Generates clean, itemized PDF invoices for monthly dues (Rent + Electricity + any Late Fees).
- Built using `pdfmake` (pure JavaScript, fast, low memory footprint).
- Generates PDF buffers that can be uploaded to Supabase Storage or streamed directly.

## Key Files
- Microservice / Utility: `services/pdf/`
- Server Endpoint: `server/src/routes/bills.routes.ts`
