# Project Deviations & Design Decisions

This document tracks intentional deviations from the original initial draft or framework choices, along with technical rationale.

## 1. PDF Generation Engine: `pdfmake` instead of `weasyprint` / `puppeteer`
- **Rationale**: User explicitly selected `pdfmake` over WeasyPrint/Puppeteer.
- **Benefits**: Pure Node.js/TypeScript execution with no external Python runtime dependency (WeasyPrint) and no heavy headless Chromium memory footprint (Puppeteer). Generates itemized tabular bills (rent + electricity) quickly and deterministically.

## 2. Frontend Structure: Single Vite App with Two Route Trees
- **Rationale**: Rather than maintaining two completely independent Vite repositories, a single Vite application with role-protected route trees (`/admin/*` and `/tenant/*`) shares the unified UI component library, design system tokens, and API client.

## 3. Design System & Theming: Strict Compliance with `UIUX.md`
- **Rule**: Light-only theme with deep teal primary (`#0F766E`), neutral slate backgrounds (`#F7F8FA`, `#FFFFFF`), structured 8px grid, and no dark mode or whimsical animations.
