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
| `_html` | Render cell value as raw HTML instead of escaping it |
| `_nosort` | Disable sorting for this column |
| `_nofilter` | Disable filtering for this column |
| `_sortval` | Hidden companion column that provides sort values for the matching display column |

```sql
SELECT
  id,
  name_nosort,
  amount_nofilter,
  status_nosort_nofilter,
  '<a href="/details/' || id || '">View</a>' AS action_html_nosort
FROM users;
```

Number columns automatically get a min-max range filter; text columns get a substring search filter.

### Sort value override

Use `_sortval` to display a formatted value while sorting by the raw value. The companion column is hidden — only its value is used as the sort key.

```sql
SELECT
  TO_CHAR(date, 'Mon dd, yy') AS date,
  date AS date_sortval,
  amount,
  recipient
FROM payments;
```

Here `date` displays "Feb 21, 26" but sorts correctly by the underlying date. Other use cases: currency with symbols (`"$1,234.50"` displayed, raw number for sorting), status labels sorted by priority order, or full names displayed but sorted by last name.

## Caching

Admins can enable per-query caching via the edit page. Cached queries are pre-rendered to static HTML files on a configurable interval (in seconds) and served directly without hitting the database.
