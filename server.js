const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// --- Load config ---
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const QUERIES_DIR = path.join(__dirname, 'queries');
const CACHE_DIR = path.join(__dirname, 'cache');
const RESOURCES_DIR = path.join(__dirname, 'resources');
const CACHE_CONFIG_PATH = path.join(__dirname, 'cache-config.json');

// Ensure directories exist
if (!fs.existsSync(QUERIES_DIR)) fs.mkdirSync(QUERIES_DIR);
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);

// --- Database pool ---
const pool = new Pool(config.db);

// --- Load templates ---
function loadTemplate(name) {
  return fs.readFileSync(path.join(RESOURCES_DIR, name), 'utf8');
}

// --- Cache config helpers ---
function loadCacheConfig() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveCacheConfig(cfg) {
  fs.writeFileSync(CACHE_CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// --- SQL safety check ---
const FORBIDDEN_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b/i;

function isSqlReadOnly(sql) {
  // Strip comments and string literals before checking
  const stripped = sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/'[^']*'/g, '');
  return !FORBIDDEN_KEYWORDS.test(stripped);
}

// --- Column name parsing ---
const KNOWN_SUFFIXES = ['_display', '_nosort', '_nofilter'];

function parseColumnName(name) {
  let displayName = name;
  const flags = { display: false, sortable: true, filterable: true };
  let found = true;
  while (found) {
    found = false;
    for (const suffix of KNOWN_SUFFIXES) {
      if (displayName.endsWith(suffix)) {
        displayName = displayName.slice(0, -suffix.length);
        if (suffix === '_display') flags.display = true;
        if (suffix === '_nosort') flags.sortable = false;
        if (suffix === '_nofilter') flags.filterable = false;
        found = true;
      }
    }
  }
  return { displayName, ...flags };
}

// --- Render table HTML ---
function renderTableHtml(queryName, columns, rows) {
  const template = loadTemplate('table.html');

  const NUMERIC_OIDS = new Set([20, 21, 23, 700, 701, 1700]);
  const allParsed = columns.map(c => ({
    ...parseColumnName(c.name),
    rawName: c.name,
    isNumeric: NUMERIC_OIDS.has(c.dataTypeID)
  }));

  // Link display companion columns to their primary columns
  const displayMap = {}; // displayName -> rawName of display column
  const primaryNames = new Set(allParsed.filter(c => !c.display).map(c => c.displayName));
  for (const col of allParsed) {
    if (col.display) displayMap[col.displayName] = col.rawName;
  }

  // Filter: remove paired display columns, keep standalone display columns as raw HTML
  const parsed = allParsed.filter(col => {
    if (!col.display) return true;
    if (primaryNames.has(col.displayName)) return false; // paired — hide it
    col.standaloneHtml = true; // standalone — keep and render as raw HTML
    return true;
  });
  for (const col of parsed) {
    if (!col.display && displayMap[col.displayName]) col.displayRawName = displayMap[col.displayName];
  }

  const headers = parsed.map((col, i) => {
    const sortAttr = col.sortable ? `data-sortable="true" data-col="${i}" data-type="${col.isNumeric ? 'number' : 'text'}"` : '';
    return `<th ${sortAttr}>${escapeHtml(col.displayName)}</th>`;
  }).join('');

  const filterInputs = parsed.map((col, i) => {
    if (!col.filterable) return '<th></th>';
    if (col.isNumeric) {
      return `<th><div class="range-inputs"><input type="number" placeholder="min" data-col="${i}" data-range="min" step="any"> <input type="number" placeholder="max" data-col="${i}" data-range="max" step="any"></div></th>`;
    }
    return `<th><input type="text" placeholder="Filter ${escapeHtml(col.displayName)}" data-col="${i}"></th>`;
  }).join('');

  const tableRows = rows.map(row => {
    const cells = parsed.map(col => {
      const rawVal = String(row[col.rawName] ?? '');
      if (col.standaloneHtml) {
        return `<td>${rawVal}</td>`;
      }
      if (col.displayRawName) {
        const displayVal = String(row[col.displayRawName] ?? '');
        return `<td data-sort-value="${escapeHtml(rawVal)}">${displayVal}</td>`;
      }
      return `<td>${escapeHtml(rawVal)}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('\n');

  return template
    .replace(/\{\{QUERY_NAME\}\}/g, escapeHtml(queryName))
    .replace('{{TABLE_HEADERS}}', headers)
    .replace('{{FILTER_INPUTS}}', filterInputs)
    .replace('{{TABLE_ROWS}}', tableRows)
    .replace(/\{\{ROW_COUNT\}\}/g, String(rows.length));
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Express app ---
const app = express();
app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: 'simple-data-view-secret-' + Date.now(),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

// --- Auth middleware ---
function requireAuth(req, res, next) {
  if (req.session && req.session.role) return next();
  res.redirect('/login');
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') return next();
  res.status(403).send('Forbidden: admin access required');
}

// --- Error page helper ---
function errorPage(title, message) {
  return `<!DOCTYPE html><html><head><title>Error</title>
    <style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f5f5f5;}
    .box{background:#fff;padding:2rem;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);text-align:center;max-width:500px;}
    h1{color:#dc2626;font-size:1.3rem;margin-bottom:1rem;}a{color:#2563eb;}</style></head>
    <body><div class="box"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><br><a href="/">Back to Home</a></div></body></html>`;
}

// --- Routes ---

// Login page
app.get('/login', (req, res) => {
  const template = loadTemplate('login.html');
  res.send(template.replace('{{ERROR}}', ''));
});

// Login submit
app.post('/login', (req, res) => {
  const { user, password } = req.body;
  if (user === config.admin.user && password === config.admin.password) {
    req.session.role = 'admin';
    return res.redirect('/');
  }
  if (user === config.user.user && password === config.user.password) {
    req.session.role = 'user';
    return res.redirect('/');
  }
  const template = loadTemplate('login.html');
  res.send(template.replace('{{ERROR}}', '<p class="error">Invalid credentials</p>'));
});

// Logout
app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// Home page
app.get('/', requireAuth, (req, res) => {
  const template = loadTemplate('home.html');
  const cacheConfig = loadCacheConfig();

  let files = [];
  try {
    files = fs.readdirSync(QUERIES_DIR)
      .filter(f => f.endsWith('.sql'))
      .map(f => f.replace('.sql', ''))
      .sort();
  } catch { /* empty */ }

  const isAdmin = req.session.role === 'admin';

  let listHtml;
  if (files.length === 0) {
    listHtml = '<div class="empty">No queries yet.</div>';
  } else {
    const items = files.map(name => {
      const cached = cacheConfig[name] && cacheConfig[name].enabled;
      let cacheBadge = cached ? '<span class="cache-badge">cached</span>' : '';
      let actions = '';
      if (isAdmin) {
        actions = `<div class="query-actions">
          <a href="/admin/edit/${encodeURIComponent(name)}" title="Edit">&#9998;</a>
          ${cached ? `<form method="POST" action="/admin/refresh-cache/${encodeURIComponent(name)}" style="display:inline;margin:0;"><button type="submit" class="refresh-btn" title="Refresh cache">&#8635;</button></form>` : ''}
          <form method="POST" action="/admin/delete/${encodeURIComponent(name)}" style="display:inline;margin:0;" onsubmit="return confirm('Delete query ${name}?')"><button type="submit" class="delete-btn" title="Delete">&#10005;</button></form>
        </div>`;
      }
      return `<li class="query-item"><div><a href="/api/query/${encodeURIComponent(name)}">${escapeHtml(name)}</a>${cacheBadge}</div>${actions}</li>`;
    }).join('');
    listHtml = `<ul class="query-list">${items}</ul>`;
  }

  let adminButtons = '';
  if (isAdmin) {
    adminButtons = `
      <a href="/admin/new" class="btn-primary">+ New Query</a>
      <form method="POST" action="/admin/clear-cache" style="margin:0;"><button type="submit" class="btn-danger" onclick="return confirm('Clear all cache files?')">Clear Cache</button></form>`;
  }

  res.send(template
    .replace('{{QUERY_LIST}}', listHtml)
    .replace('{{ADMIN_BUTTONS}}', adminButtons));
});

// Execute query and return HTML table
app.get('/api/query/:queryName', requireAuth, async (req, res) => {
  const queryName = req.params.queryName;
  const sqlPath = path.join(QUERIES_DIR, queryName + '.sql');

  if (!fs.existsSync(sqlPath)) {
    return res.status(404).send(errorPage('Not Found', `Query "${queryName}" does not exist.`));
  }

  // Check cache
  const cacheConfig = loadCacheConfig();
  if (cacheConfig[queryName] && cacheConfig[queryName].enabled) {
    const cachePath = path.join(CACHE_DIR, queryName + '.html');
    if (fs.existsSync(cachePath)) {
      return res.sendFile(cachePath);
    }
  }

  // Read and execute SQL
  const sql = fs.readFileSync(sqlPath, 'utf8');
  if (!isSqlReadOnly(sql)) {
    return res.status(400).send(errorPage('Rejected', 'This query contains modifying statements and cannot be executed.'));
  }

  try {
    const result = await pool.query(sql);
    const html = renderTableHtml(queryName, result.fields, result.rows);
    res.send(html);
  } catch (err) {
    res.status(500).send(errorPage('Query Error', err.message));
  }
});

// --- Admin routes ---

// Edit query page
app.get('/admin/edit/:queryName', requireAuth, requireAdmin, (req, res) => {
  const queryName = req.params.queryName;
  const sqlPath = path.join(QUERIES_DIR, queryName + '.sql');

  if (!fs.existsSync(sqlPath)) {
    return res.status(404).send(errorPage('Not Found', `Query "${queryName}" does not exist.`));
  }

  const sql = fs.readFileSync(sqlPath, 'utf8');
  const cacheConfig = loadCacheConfig();
  const cacheEntry = cacheConfig[queryName] || {};

  const template = loadTemplate('editor.html');
  res.send(template
    .replace(/\{\{QUERY_NAME\}\}/g, escapeHtml(queryName))
    .replace('{{SQL_CONTENT}}', escapeHtml(sql))
    .replace('{{CACHE_ENABLED}}', cacheEntry.enabled ? 'checked' : '')
    .replace('{{CACHE_INTERVAL}}', String(cacheEntry.interval || 300)));
});

// Save edited query
app.post('/admin/edit/:queryName', requireAuth, requireAdmin, (req, res) => {
  const queryName = req.params.queryName;
  const sqlPath = path.join(QUERIES_DIR, queryName + '.sql');
  const { sql, cache_enabled, cache_interval } = req.body;

  fs.writeFileSync(sqlPath, sql);

  // Update cache config
  const cacheConfig = loadCacheConfig();
  if (cache_enabled) {
    cacheConfig[queryName] = {
      enabled: true,
      interval: parseInt(cache_interval, 10) || 300
    };
  } else {
    delete cacheConfig[queryName];
  }
  saveCacheConfig(cacheConfig);

  // Delete cache file so it gets regenerated
  const cachePath = path.join(CACHE_DIR, queryName + '.html');
  if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);

  // Restart cache intervals
  setupCacheIntervals();

  res.redirect('/');
});

// New query page
app.get('/admin/new', requireAuth, requireAdmin, (req, res) => {
  res.send(loadTemplate('new-query.html'));
});

// Create new query
app.post('/admin/new', requireAuth, requireAdmin, (req, res) => {
  const { name, sql } = req.body;
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeName) {
    return res.status(400).send(errorPage('Invalid Name', 'Query name must contain only letters, numbers, hyphens, and underscores.'));
  }

  const sqlPath = path.join(QUERIES_DIR, safeName + '.sql');
  if (fs.existsSync(sqlPath)) {
    return res.status(409).send(errorPage('Already Exists', `A query named "${safeName}" already exists.`));
  }

  fs.writeFileSync(sqlPath, sql);
  res.redirect('/');
});

// Delete query
app.post('/admin/delete/:queryName', requireAuth, requireAdmin, (req, res) => {
  const queryName = req.params.queryName;
  const sqlPath = path.join(QUERIES_DIR, queryName + '.sql');

  if (fs.existsSync(sqlPath)) fs.unlinkSync(sqlPath);

  // Remove cache file
  const cachePath = path.join(CACHE_DIR, queryName + '.html');
  if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);

  // Remove from cache config
  const cacheConfig = loadCacheConfig();
  if (cacheConfig[queryName]) {
    delete cacheConfig[queryName];
    saveCacheConfig(cacheConfig);
  }

  // Restart cache intervals
  setupCacheIntervals();

  res.redirect('/');
});

// Clear all cache
app.post('/admin/clear-cache', requireAuth, requireAdmin, (req, res) => {
  try {
    const files = fs.readdirSync(CACHE_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(CACHE_DIR, file));
    }
  } catch { /* empty */ }
  res.redirect('/');
});

// Refresh single cache
app.post('/admin/refresh-cache/:queryName', requireAuth, requireAdmin, (req, res) => {
  const queryName = req.params.queryName;
  const cachePath = path.join(CACHE_DIR, queryName + '.html');
  if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
  res.redirect('/');
});

// --- Caching system ---
let cacheTimers = [];

async function refreshQueryCache(queryName) {
  const sqlPath = path.join(QUERIES_DIR, queryName + '.sql');
  if (!fs.existsSync(sqlPath)) return;

  const sql = fs.readFileSync(sqlPath, 'utf8');
  if (!isSqlReadOnly(sql)) return;

  try {
    const result = await pool.query(sql);
    const html = renderTableHtml(queryName, result.fields, result.rows);
    fs.writeFileSync(path.join(CACHE_DIR, queryName + '.html'), html);
    console.log(`[cache] Refreshed: ${queryName}`);
  } catch (err) {
    console.error(`[cache] Error refreshing ${queryName}:`, err.message);
  }
}

function setupCacheIntervals() {
  // Clear existing timers
  for (const timer of cacheTimers) clearInterval(timer);
  cacheTimers = [];

  const cacheConfig = loadCacheConfig();
  for (const [queryName, settings] of Object.entries(cacheConfig)) {
    if (!settings.enabled) continue;
    const intervalMs = (settings.interval || 300) * 1000;

    // Refresh immediately
    refreshQueryCache(queryName);

    // Set up recurring refresh
    const timer = setInterval(() => refreshQueryCache(queryName), intervalMs);
    cacheTimers.push(timer);
  }
}

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Simple Data View running on http://localhost:${PORT}`);
  setupCacheIntervals();
});
