// Private mssql pools — one per database. NEVER call sql.connect(config):
// mssql ships a global singleton pool that silently ignores later configs.

import sql from 'mssql';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');
try {
  const envText = readFileSync(envPath, 'utf8');
  for (const line of envText.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('='); if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
} catch {}

const base = {
  server:   process.env.DB_SERVER,
  port:     parseInt(process.env.DB_PORT || '1433', 10),
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options:  { encrypt: false, trustServerCertificate: true, requestTimeout: 30000, connectionTimeout: 15000 },
  pool:     { max: 8, min: 1, idleTimeoutMillis: 30000 },
};

const DBS = {
  jsr:  process.env.JSR_DB  || 'JSR_Rings',
  inja: process.env.INJA_DB || 'timken_price_model',
};

const pools = { jsr: null, inja: null };

async function open(name) {
  const cfg = { ...base, database: DBS[name] };
  const p = new sql.ConnectionPool(cfg);
  await p.connect();
  const v = await p.request().query('SELECT DB_NAME() AS db');
  const actual = v.recordset[0].db;
  if (actual.toLowerCase() !== cfg.database.toLowerCase()) throw new Error(`[exec/${name}] landed on '${actual}', expected '${cfg.database}'`);
  console.log(`[exec/${name}] connected → ${cfg.server}:${cfg.port}/${actual}`);
  return p;
}

export async function getPool(name = 'jsr') {
  if (!pools[name]) pools[name] = await open(name);
  return pools[name];
}

export async function query(name, text) {
  const p = await getPool(name);
  return p.request().query(text);
}

export { sql, DBS };
