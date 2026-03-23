# Simple Data View

A lightweight Node.js tool that serves SQL queries as server-rendered HTML pages with filterable tables. Drop `.sql` files in a folder, point it at a PostgreSQL database, and get instant web views of your data.

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

3. **Add SQL queries** to the `queries/` folder (one `.sql` file per query)

4. **Start the server**
   ```
   npm start
   ```
   Runs on `http://localhost:3000` (override with `PORT` env var).

## Usage

- **User role** — view queries and filter results
- **Admin role** — create, edit, and delete queries; manage caching

Each `.sql` file in `queries/` appears on the home page as a clickable link. Clicking it executes the query and renders the results as a filterable HTML table.

## Raw HTML in Columns

All cell values are HTML-escaped by default. To render raw HTML (e.g., links), alias the column with a `_html` suffix:

```sql
SELECT
  id,
  name,
  '<a href="https://example.com/' || id || '">View</a>' AS action_html
FROM users;
```

Only columns ending in `_html` render as raw HTML.

## Caching

Admins can enable per-query caching via the edit page. Cached queries are pre-rendered to static HTML files on a configurable interval (in seconds) and served directly without hitting the database.
