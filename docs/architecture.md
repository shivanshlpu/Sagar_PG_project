# PG Management & Tenant Communication Platform — Architecture

## 1. System Overview

A full-stack multi-role web platform for PG (Paying Guest) / co-living management with two primary user personas:
- **Admins (Owners/Managers)**: Full operational control over rooms, beds, tenants, billing, payments, complaints, reports, and settings.
- **Tenants**: Self-service portal for dues summary, rent/electricity payment history, complaint logging, WiFi/emergency contacts, and notifications.

## 2. Technology Stack

- **Frontend (`web/`)**:
  - React 19 + Vite + TypeScript
  - Tailwind CSS v4 (with strict custom color tokens matching `UIUX.md`)
  - Lucide React for consistent icons
  - React Hook Form + Zod for type-safe validation
  - Recharts for financial and occupancy reports
  - Light-only theme with refined fintech aesthetics

- **Backend (`server/`)**:
  - Express + TypeScript
  - Supabase (PostgreSQL + Auth + Storage)
  - Zod validation middleware for all request payloads
  - JWT authentication with role extraction (`admin`, `tenant`)
  - Express Rate Limit and Helmet for security
  - Audit logging for all administrative actions

- **Microservices (`services/`)**:
  - `services/pdf/`: In-process PDF generation for rent & electricity bills using `pdfmake`
  - `services/queue/`: BullMQ worker for asynchronous background jobs (message dispatch, reminders)
  - `services/whatsapp/`: Baileys-based WhatsApp integration for automated receipts, reminders, and alerts

- **Database (`db/`)**:
  - PostgreSQL schema with Row Level Security (RLS)
  - Tables: `admins`, `tenants`, `rooms`, `beds`, `rent_records`, `electricity_bills`, `payments`, `complaints`, `complaint_comments`, `assets`, `notifications`, `audit_log`, `contacts`, `settings`

## 3. Communication & Data Flow

```
[ Tenant / Admin Browser ]
            │
            ▼
   [ Express API Server ] ──── (Auth / Queries) ────► [ Supabase PostgreSQL ]
            │                                                 ▲
            ├──── (Store Receipts/Docs) ──────────────────────┤ (Storage Buckets)
            │
            ├──── (Enqueue Notification) ──► [ Redis / BullMQ ]
            │                                       │
            ▼                                       ▼
    [ PDF Service ]                         [ WhatsApp Worker ]
   (pdfmake bill gen)                       (Baileys socket)
            │                                       │
            └─────────── (Signed URL) ──────────────┴──────► [ WhatsApp Network ]
```
