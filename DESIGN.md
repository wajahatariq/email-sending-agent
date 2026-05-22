# Design

## Theme

Light, warm. Scene: an operator at a desk in daytime office light, scanning campaign status and prospect replies on a wide monitor. This is daytime business operations, not a 2am monitoring console, so the surface is paper-warm light, never dark. Calm, dense, trustworthy. The theme is brand-neutral by design: the tool is white-label, so no brand hue is baked in.

## Color

Strategy: **Restrained**. Tinted warm neutrals carry the surface; saturated color appears only as status. Primary actions are ink, not a hue, so "primary action" never competes with "success status".

All values OKLCH. Neutrals tinted warm (hue ~75-80).

### Neutrals
- `--bg`: `oklch(0.985 0.004 80)` — content surface, warm off-white
- `--panel`: `oklch(0.965 0.006 80)` — sidebar / toolbars, one step deeper
- `--raised`: `oklch(1 0 0 / 0)` falls back to `--bg`; cards use border, not fill
- `--border`: `oklch(0.905 0.006 78)`
- `--border-strong`: `oklch(0.84 0.008 78)`
- `--ink`: `oklch(0.24 0.012 75)` — primary text, warm near-black
- `--ink-muted`: `oklch(0.55 0.012 75)` — secondary text, labels
- `--ink-faint`: `oklch(0.68 0.01 75)` — placeholder, disabled

### Primary action
- `--primary`: `oklch(0.27 0.014 75)` — ink button fill
- `--primary-hover`: `oklch(0.34 0.014 75)`
- `--primary-fg`: `oklch(0.985 0.004 80)`

### Status (paired always with a text label, never color-only)
- success / active / sent — `oklch(0.52 0.12 150)`, tint bg `oklch(0.95 0.04 150)`
- warning / paused / pending — `oklch(0.62 0.13 65)`, tint bg `oklch(0.95 0.05 75)`
- danger / failed / bounce — `oklch(0.54 0.18 27)`, tint bg `oklch(0.95 0.04 27)`
- info / replied — `oklch(0.52 0.11 245)`, tint bg `oklch(0.95 0.035 245)`
- neutral / draft / done — `--ink-muted`, tint bg `--panel`

### Focus
- `--focus`: `oklch(0.52 0.11 245)` — 2px ring, 2px offset, on every interactive element

## Typography

One family: `Inter`, then the system stack (`-apple-system, "Segoe UI", system-ui, sans-serif`). No display/body pairing. Fixed rem scale, ratio ~1.2.

- `--text-xs` 0.75rem — table meta, badges
- `--text-sm` 0.8125rem — body, controls, table cells
- `--text-base` 0.9375rem — default
- `--text-lg` 1.125rem — section headings
- `--text-xl` 1.375rem — page titles
- Weights: 400 body, 500 controls/labels, 600 headings/emphasis. Numerals: `font-variant-numeric: tabular-nums` on all counts and table figures.

## Layout

App shell: fixed left sidebar (`--panel`, ~224px) with the brand mark and vertical nav; scrollable content area on `--bg`. Content max-width ~1100px, generous page padding. Every page opens with a consistent header block: title + one-line context + primary action aligned right.

- Radius: `--radius` 6px (controls, badges), `--radius-lg` 10px (cards, panels). Professional, not bubbly.
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48. Vary it for rhythm; avoid uniform padding.
- Tables: full-width, row separators only (no vertical rules, no zebra), generous row height (~44px), sticky header, hover row tint.
- Cards used sparingly, single level, border not shadow. Never nested.

## Elevation

Mostly flat. Borders define structure. One soft shadow token for genuinely floating elements only: `--shadow: 0 1px 2px oklch(0.24 0.012 75 / 0.06), 0 4px 12px oklch(0.24 0.012 75 / 0.05)`. Sidebar and cards do not float.

## Components

Vocabulary (defined in `src/app/globals.css`), every interactive one with default/hover/focus/active/disabled:
- `.btn` (+ `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.btn-sm`) — ink primary, ghost secondary
- `.badge` (+ status modifiers `.badge-success` etc.) — small, uppercase-tracking label
- `.card` — bordered panel, `--radius-lg`
- `.field` / `.input` / `.select` / `.textarea` / `.label` — one form-control vocabulary
- `.table` — operational data table
- `.page-header`, `.page-title`, `.page-sub` — the repeated page-open block
- `.app-shell`, `.sidebar`, `.nav-link` (+ `.is-active`) — the shell
- `.empty` — teaching empty states

## Motion

150-200ms, ease-out. Transitions on color/background/border/opacity/transform only, never layout properties. Motion conveys state (hover, focus, press, pending) and nothing else. No page-load choreography. Honor `prefers-reduced-motion: reduce` by dropping all non-essential transitions.
