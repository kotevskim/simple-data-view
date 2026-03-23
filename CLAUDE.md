# Simple Data View

A lightweight Node.js tool that serves SQL queries as server-rendered HTML pages with filterable tables.

## Architecture

- **Runtime**: Node.js with Express
- **Database**: PostgreSQL via `pg` (read-only connection)
- **Sessions**: `express-session` with in-memory store (single-user tool, no need for Redis)
- **Templates**: Plain HTML files in `resources/` with placeholder replacement (no template engine)
- **Frontend**: Vanilla HTML/CSS/JS, no frameworks or build tools

## Project Layout

```
simple-data-view/
  config.json           # DB connection + user/admin credentials (DO NOT commit)
  cache-config.json     # Per-query cache settings { "queryName": { "enabled": true, "interval": 300 } }
  queries/              # One .sql file per query
  cache/                # Auto-generated cached HTML files (gitignored)
  resources/            # HTML templates (login, home, table, editor)
  server.js             # Entry point
  package.json
```

## Key Conventions

- All SQL queries are **read-only**. Before executing any query, check for modifying keywords (INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE) and reject if found. The DB user itself should also have read-only permissions.
- Config files are JSON. `config.json` holds static config (DB, credentials). `cache-config.json` holds cache settings and is writable by the admin UI.
- Column behavior is controlled via SQL alias suffixes: `_html` (raw HTML), `_nosort` (disable sorting), `_nofilter` (disable filtering), `_sortval` (hidden companion column providing sort values for the matching display column). Suffixes are combinable in any order and stripped from the display name. Parsing lives in `parseColumnName()` in `server.js`.
- Number columns use min-max range filters; text columns use substring search. Columns are sortable by clicking the header (ascending → descending → original order).
- HTML pages are server-rendered. No client-side routing. Table filtering and sorting are the only client-side JS.
- Sessions track two roles: `"user"` and `"admin"`. Role is stored in the session after login.
- Cache files are plain `.html` files in `cache/`. Served via `res.sendFile()` when available.
- Keep dependencies minimal: `express`, `pg`, `express-session`, `cookie-parser` (if needed). Nothing else unless strictly necessary.
- No TypeScript, no ESLint, no build step. Keep it simple.

## Security Notes

- Always use a read-only DB user in `config.json`
- The keyword check before query execution is a safety net, not the primary defense
- Admin can edit/create/delete queries — this is intentional, admin is trusted
- `config.json` contains credentials — add to `.gitignore`
