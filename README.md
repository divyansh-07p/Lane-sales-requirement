# Instructor Availability Dashboard

A read-only sales/team dashboard that shows instructor availability against the **Google Calendar** look-and-feel, built with React 19, TypeScript and Vite.

## Features
- Live instructor roster with free-slot grid (green) vs busy/unavailable slots
- Date tabs with per-day free-slot counts and a month selector with chevron navigation
- Slot-level popovers (free / booked / paused / payment-hold / unavailable with learner, course and area details)
- Per-instructor expandable mini calendar over the whole window
- Compare mode, instructor search and sorting (Most free / Least free / A → Z)
- Everything configurable via the `app_settings` row (`key = 'booking_flow'`) in Supabase

## Development
```bash
npm install
npm run dev      # http://localhost:5173
npm run lint
npm run build    # outputs to dist/
```

## Configuration (Supabase `booking_flow` row)
| Field | Default | Purpose |
|---|---|---|
| `booking_days_ahead` | `14` | Booking engine cutoff (days) |
| `view_days_ahead` | `400` (fallback) | Dashboard window (days); controls month navigation |
| `excluded_schedule_statuses` | `["cancelled","rejected"]` | Statuses ignored when computing free slots |

Set `view_days_ahead` in the `booking_flow` JSON to control how many months the dashboard shows:

```sql
update app_settings
set value = value || '{"view_days_ahead":400}'::jsonb
where key = 'booking_flow';
```

## Demo
`mock.html` is a fully standalone, self-contained demo with mock data — open it directly in any browser (no server needed) or send the file to stakeholders.