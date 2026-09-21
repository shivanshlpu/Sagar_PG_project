# PG Management & Tenant Communication Platform — UI/UX Specification

**Document type:** Standalone UI/UX `prompt.md`, companion to the master build spec (`prompt.md`)
**Applies to:** Admin Web App + Tenant Portal
**Theme:** Light only — no dark mode, no theme toggle unless separately requested

---

## 1. Design Philosophy

- Operational clarity over decoration. This is a daily-use ops tool for a PG admin and a self-service portal for tenants — every screen should answer "what needs my attention" in under 3 seconds.
- Numbers and status are the heroes: rent pending, complaints open, rooms vacant. Typography and color hierarchy should make these scannable, not buried in prose.
- Calm, trustworthy, slightly institutional — closer to a banking/fintech dashboard than a consumer app. Tenants are trusting this with rent money and ID documents; the UI should feel secure and serious, not playful.
- No AI-generated look. Avoid generic purple-gradient SaaS clichés, avoid emoji anywhere (headers, empty states, buttons, toasts), avoid stock illustration packs. Use a real icon library only (lucide-react or similar), monochrome/tinted, never colorful cartoon icons.
- Every screen must work with zero data (empty states) and with dense data (100+ tenants) without breaking.

---

## 2. Color System

Light theme only. Base neutrals + one primary + semantic status colors.

| Token | Use | Example |
|---|---|---|
| `--bg-base` | Page background | Off-white, e.g. `#F7F8FA` |
| `--bg-surface` | Cards, panels, table rows | White `#FFFFFF` |
| `--bg-surface-alt` | Subtle section separation, hover states | `#F1F3F6` |
| `--border` | Card borders, dividers | `#E3E6EA` |
| `--text-primary` | Headings, key values | `#1A1D23` |
| `--text-secondary` | Labels, helper text | `#5C6370` |
| `--text-muted` | Timestamps, placeholders | `#9AA1AC` |
| `--primary` | Primary actions, active nav, links | A single deliberate brand color — deep blue or teal, not purple-gradient default |
| `--primary-hover` | Hover/active state of primary | Darker shade of primary |
| `--success` | Paid, resolved, connected | Green, e.g. `#1E8E5A` |
| `--warning` | Due soon, pending | Amber, e.g. `#B8790E` |
| `--danger` | Overdue, rejected, disconnected | Red, e.g. `#C13A3A` |
| `--info` | In progress, informational | Blue-gray, e.g. `#3A6FC1` |

Rules:
- Status color is never the only signal — always pair color with a text label or icon (accessibility, and because color-blind users exist).
- No pure black text on pure white — use `--text-primary` (near-black) for less eye strain.
- Backgrounds stay light across every screen, including modals, tables, and the WhatsApp QR pairing screen.

---

## 3. Typography

- Font: one clean system/humanist sans-serif (e.g. Inter, or system font stack) — no decorative or script fonts.
- Minimum body size 12pt, per standing preference — treat this as a hard floor, not a suggestion, across dashboard cards, table cells, and form labels.
- Scale (adjust proportionally, keep it simple — 4–5 sizes max):
  - Page title: 24–28px, semi-bold
  - Section heading: 18–20px, semi-bold
  - Card/table label: 13–14px, medium, `--text-secondary`
  - Body/value: 14–16px, regular, `--text-primary`
  - Key metric numbers (dashboard cards): 22–28px, bold, `--text-primary`
  - Caption/timestamp: 12px, `--text-muted`
- Line height generous enough for scanning (1.4–1.6 for body text).
- Numbers (currency, units, dates) use tabular/monospaced figures where the library supports it, so columns of numbers align cleanly.

---

## 4. Spacing & Layout Grid

- 8px base spacing unit; all margins/padding/gaps are multiples of 8 (4 allowed for tight inline spacing only).
- Admin layout: fixed left sidebar navigation (Dashboard, Rooms, Tenants, Rent, Electricity, Payments, Complaints, Assets, Reports, Settings) + top bar (search, notification bell, profile) + main content area with consistent 24px page padding.
- Tenant portal: simpler top nav or bottom nav on mobile (Dashboard, Payments, Complaints, Wi-Fi/Contacts, Notifications) — no dense sidebar needed for a smaller feature set.
- Dashboard summary cards: consistent grid (e.g. 4 cards per row on desktop, 2 on tablet, 1 on mobile), equal height, consistent internal padding (16–20px).
- Tables: comfortable row height (44–48px minimum) for tap/click targets, sticky header row on scroll, zebra striping optional but subtle (`--bg-surface-alt`) if used.
- Max content width on large screens (e.g. 1440px) so dashboards don't stretch awkwardly on ultra-wide monitors — center with side padding beyond that.

---

## 5. Component Library & Patterns

- **Buttons:** one primary style (filled, `--primary`), one secondary style (outlined/ghost), one destructive style (`--danger`, used for Disconnect WhatsApp, Delete Tenant, Reject Payment). No more than these three variants — resist adding one-off button styles per screen.
- **Status badges/pills:** rounded, small, colored background at low opacity + colored text (e.g. amber-tinted background + amber text for "Pending"), consistent across rent status, complaint status, payment status, WhatsApp connection status.
- **Cards:** white surface, subtle border or shadow (not both heavy), consistent corner radius (8–12px) used everywhere — same radius on buttons, inputs, cards, modals for visual consistency.
- **Tables:** sortable column headers, inline filters/search above the table, row-level actions in a trailing column (icon buttons, not a wall of text buttons), pagination or virtual scroll for tenant/payment lists.
- **Forms:** label above input (not placeholder-as-label), inline validation error below the field in `--danger`, required-field indication that isn't just a red asterisk with no legend.
- **Modals/drawers:** used for quick actions (verify payment, add room, assign bed) — don't force a full page navigation for a 2-field action.
- **Empty states:** every list/table has a designed empty state (icon + one line of text + a primary action if applicable) — never a blank white box or "No data" in tiny gray text.
- **WhatsApp settings card:** clear three-state visual (Disconnected / Pairing–show QR / Connected–show phone number + Disconnect button), status pill matching the semantic colors above.
- **Notification center:** grouped by severity/type using the semantic colors (red = pending rent, amber = electricity pending, etc., matching the color system), not emoji bullets.
- **PDF bill template:** same typography and color restraint as the app — clean invoice layout, PG name/logo, itemized rent + electricity + charges, due date prominent, no clip-art.

---

## 6. Interaction & Motion

- Motion is functional, not decorative: 150–200ms ease for hover/focus/transition states, no bouncy/playful easing.
- Loading states: skeleton placeholders for cards/tables on initial load, not a generic spinner for anything longer than ~1 second.
- Toasts/snackbars for action feedback (payment verified, WhatsApp connected, complaint updated) — auto-dismiss, no emoji, short and specific ("Payment verified for Rahul, Room 204" not "Success!").
- Destructive actions (delete tenant, disconnect WhatsApp) require a confirmation step — modal with clear consequence text, not a browser `confirm()`.
- QR pairing screen: show a clear "Waiting for scan" state with a subtle pulsing border or progress indicator, then an immediate success state transition once Baileys reports connection — no dead air with no feedback.

---

## 7. Responsive & Accessibility Rules

- Breakpoints: mobile (<640px), tablet (640–1024px), desktop (>1024px). Admin dashboard is desktop-first but must remain usable on tablet (on-site checks); tenant portal is mobile-first.
- Sidebar collapses to a bottom nav or hamburger drawer below tablet width.
- Tables become stacked cards on mobile where a full table would force horizontal scroll for key info (tenant list, payment history) — horizontal scroll only for truly wide data (e.g. detailed reports).
- Minimum tap target 44x44px on mobile for all interactive elements.
- Color contrast: body text on background meets at least WCAG AA (4.5:1); status pill text on tinted background checked explicitly, since light-tint-on-light-background is an easy way to fail contrast.
- All interactive elements keyboard-navigable and focus-visible (a real focus ring, not `outline: none` with nothing replacing it).
- Form errors and status changes announced via ARIA live regions where relevant (payment verification result, complaint status update) for screen reader users.
- Never encode meaning in color alone (Section 2) — icons/text labels always accompany status color, which also covers color-blind accessibility.

---

## 8. What to Avoid (Explicit Anti-Patterns)

- Dark backgrounds anywhere, including modals, dropdowns, tooltips, or the PDF bill.
- Emoji in any UI copy, button label, toast, empty state, or icon substitute.
- Purple/blue gradient hero sections, glassmorphism, or generic "AI startup" visual tropes.
- Overloaded dashboards — if a card needs a scrollbar to show its own content, it's the wrong card size or the wrong amount of data for that card.
- Placeholder text used as the only label on a form field.
- More than one primary-colored button visible at the same time on a single screen (only one primary action per view).