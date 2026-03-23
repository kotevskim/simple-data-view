# Simple Data View

A lightweight Node.js tool that reads SQL files from a folder, executes them against a PostgreSQL database, and serves the results as server-rendered HTML pages with filterable tables. Queries can be managed through a built-in admin interface.

## Quick Start

1. **Install dependencies**
   ```
   npm install
   ```

2. **Configure `config.json`**
   ```json
   {
     "db": {
       "host": "localhost",
       "port": 5432,
       "database": "mydb",
       "user": "readonly_user",
       "password": "secret"
     },
     "admin": { "user": "admin", "password": "admin_pass" },
     "user": { "user": "viewer", "password": "viewer_pass" }
   }
   ```
   Use a **read-only** database user.

3. **Add SQL queries** to the `queries/` folder (one `.sql` file per query), or use the admin interface after starting the server

4. **Start the server**
   ```
   npm start
   ```
   Runs on `http://localhost:3000` (override with `PORT` env var).

## Usage

- **User role** — view queries and filter results
- **Admin role** — create, edit, and delete queries; manage caching

Each query appears on the home page as a clickable link. Clicking it executes the SQL and renders the results as a filterable HTML table. Admins can create, edit, and delete queries directly from the web interface.

## Column Suffixes

Column aliases can include suffixes to control table behavior. Suffixes are stripped from the displayed column name and can be combined in any order.

| Suffix | Effect |
|---|---|
| `_display` | When paired with a matching column, acts as a hidden companion whose value replaces cell content (raw HTML). The original column is used for sorting/filtering. When standalone (no matching column), renders directly as a raw HTML column. |
| `_nosort` | Disable sorting for this column |
| `_nofilter` | Disable filtering for this column |

```sql
SELECT
  id,
  name_nosort,
  amount_nofilter,
  status_nosort_nofilter
FROM users;
```

Number columns automatically get a min-max range filter; text columns get a substring search filter.

### Display override

Use `_display` to show a formatted or HTML-enriched value while keeping the raw column for sorting and filtering. The companion column is hidden — only its value is rendered.

```sql
SELECT
  date,
  TO_CHAR(date, 'Mon dd, yy') AS date_display,
  amount,
  '$' || TO_CHAR(amount, 'FM999,999.00') AS amount_display,
  recipient
FROM payments;
```

Here `date` sorts by the raw date value but displays "Feb 21, 26". The `amount` column filters and sorts numerically but displays "$1,234.50". Other use cases: status labels sorted by priority order, or full names displayed but sorted by last name.

A standalone `_display` column (no matching primary) renders directly as raw HTML:

```sql
SELECT
  id,
  '<a href="/details/' || id || '">View</a>' AS action_display_nosort_nofilter
FROM users;
```

### Full example

```sql
SELECT
  id AS id_nofilter,
  TO_CHAR(date, 'YYYY-MM-DD') AS date,
  TO_CHAR(date, 'Mon dd, yyyy') AS date_display,
  amount * -1 AS amount,
  recipient_display AS recipient,
  '<a href="https://www.mozilla.org/en-US/">The Mozilla homepage</a>' AS link_display_nosort_nofilter
FROM payments ORDER BY date DESC;
```

## Caching

Admins can enable per-query caching via the edit page. Cached queries are pre-rendered to static HTML files on a configurable interval (in seconds) and served directly without hitting the database.
