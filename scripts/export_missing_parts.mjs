/**
 * export_missing_parts.mjs
 * Finds every part-supplier-stage in GRN (INJA + JSR, last 12 months)
 * with NO matching rate in the price tables, and exports to Excel.
 *
 * INJA price tables: ps_rings_inja_cost (GS) | ps_carb_master (CS) | ps_part_hard_cost_master (HS)
 *   → matched by supplier_id = GRN.Vendor
 * JSR  price table:  vw_price_sheet
 *   → matched by supplier_name = GRN.VendorName
 *
 * Usage:  node scripts/export_missing_parts.mjs
 * Output: exports/Missing_Parts_<date>.xlsx
 */

import { query } from '../server/db.js';
import xlsx from 'xlsx';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── INJA query ───────────────────────────────────────────────────────────────

const INJA_SQL = `
  WITH
  grn AS (
    SELECT
      g.legacy_part_name  AS partNo,
      g.Vendor            AS vendorId,
      g.VendorName        AS vendor,
      CASE
        WHEN g.MaterialDesc LIKE '%-CS-%' THEN 'CS'
        WHEN g.MaterialDesc LIKE '%-HS-%' THEN 'HS'
        WHEN g.MaterialDesc LIKE '%-GS-%' OR g.MaterialDesc LIKE '%-GS;%' THEN 'GS'
      END AS stage,
      SUM(TRY_CAST(g.[Amount(Inr)] AS float)) AS grn_spend,
      SUM(TRY_CAST(g.ReceivedQty  AS float))  AS grn_qty,
      MAX(TRY_CAST(g.ReceivedQty  AS float))  AS peak_month_qty,
      MIN(CAST(g.GRDate AS DATE))             AS first_grn,
      MAX(CAST(g.GRDate AS DATE))             AS last_grn,
      COUNT(DISTINCT DATEFROMPARTS(
        YEAR(TRY_CAST(g.GRDate AS DATE)),
        MONTH(TRY_CAST(g.GRDate AS DATE)), 1)) AS active_months
    FROM JSR_Roller_PM.dbo.vGRN g
    WHERE g.Plant = 'INJA'
      AND g.legacy_part_name IS NOT NULL
      AND g.VendorName != 'PACKINGS AND JOINTINGS GASKETS'
      AND g.MaterialDesc NOT LIKE '%ROLL%'
      AND (g.MaterialDesc LIKE '%-GS-%' OR g.MaterialDesc LIKE '%-CS-%' OR g.MaterialDesc LIKE '%-HS-%')
      AND CAST(g.GRDate AS DATE) >= DATEADD(month, -12, GETDATE())
      AND TRY_CAST(g.ReceivedQty AS float) > 0
    GROUP BY
      g.legacy_part_name, g.Vendor, g.VendorName,
      CASE
        WHEN g.MaterialDesc LIKE '%-CS-%' THEN 'CS'
        WHEN g.MaterialDesc LIKE '%-HS-%' THEN 'HS'
        WHEN g.MaterialDesc LIKE '%-GS-%' OR g.MaterialDesc LIKE '%-GS;%' THEN 'GS'
      END
  ),
  priced_gs AS (
    SELECT DISTINCT legacy_part_name AS partNo,
           CAST(process_owner_supplier_id AS NVARCHAR(50)) AS supplierId
    FROM dbo.ps_rings_inja_cost
    WHERE Plant='INJA' AND cost_per_pc>0 AND ps_rings_inja_template_row_id=1
  ),
  priced_cs AS (
    SELECT DISTINCT legacy_part_name AS partNo,
           CAST(supplier_id AS NVARCHAR(50)) AS supplierId
    FROM dbo.ps_carb_master WHERE status='Approved' AND batch_quantity>0
  ),
  priced_hs AS (
    SELECT DISTINCT legacy_part_name AS partNo,
           CAST(supplier_id AS NVARCHAR(50)) AS supplierId
    FROM dbo.ps_part_hard_cost_master WHERE status='Approved' AND hard_cost_per_pc>0
  ),
  tagged AS (
    SELECT g.*,
      CASE
        WHEN g.stage='GS' AND pg.partNo IS NOT NULL THEN 1
        WHEN g.stage='CS' AND pc.partNo IS NOT NULL THEN 1
        WHEN g.stage='HS' AND ph.partNo IS NOT NULL THEN 1
        ELSE 0
      END AS is_matched
    FROM grn g
    LEFT JOIN priced_gs pg ON pg.partNo=g.partNo AND pg.supplierId=g.vendorId AND g.stage='GS'
    LEFT JOIN priced_cs pc ON pc.partNo=g.partNo AND pc.supplierId=g.vendorId AND g.stage='CS'
    LEFT JOIN priced_hs ph ON ph.partNo=g.partNo AND ph.supplierId=g.vendorId AND g.stage='HS'
  )
  SELECT
    vendor            AS [Supplier Name],
    vendorId          AS [Vendor ID (SAP)],
    stage             AS [Stage],
    partNo            AS [Part No],
    ROUND(grn_spend, 2)        AS [GRN Spend (INR)],
    CAST(grn_qty AS INT)       AS [GRN Qty (pc)],
    CAST(peak_month_qty AS INT) AS [Peak Month Qty],
    CAST(active_months AS INT)  AS [Active Months],
    CONVERT(varchar(10), first_grn, 23) AS [First GRN],
    CONVERT(varchar(10), last_grn,  23) AS [Last GRN],
    CASE stage
      WHEN 'GS' THEN 'ps_rings_inja_cost (process_owner_supplier_id)'
      WHEN 'CS' THEN 'ps_carb_master (supplier_id)'
      WHEN 'HS' THEN 'ps_part_hard_cost_master (supplier_id)'
    END AS [Add Rate To Table]
  FROM tagged
  WHERE is_matched = 0
  ORDER BY vendor, stage, grn_spend DESC
`;

// ─── JSR query ────────────────────────────────────────────────────────────────

const JSR_SQL = `
  WITH
  grn AS (
    SELECT
      g.legacy_part_name AS partNo,
      g.VendorName       AS vendor,
      CASE
        WHEN g.MaterialDesc LIKE '%-CS-%' THEN 'CS'
        WHEN g.MaterialDesc LIKE '%-HS-%' THEN 'HS'
        WHEN g.MaterialDesc LIKE '%-GS-%' OR g.MaterialDesc LIKE '%-GS;%' THEN 'GS'
      END AS stage,
      SUM(TRY_CAST(g.[Amount(Inr)] AS float)) AS grn_spend,
      SUM(TRY_CAST(g.ReceivedQty  AS float))  AS grn_qty,
      MAX(TRY_CAST(g.ReceivedQty  AS float))  AS peak_month_qty,
      MIN(CAST(g.GRDate AS DATE))             AS first_grn,
      MAX(CAST(g.GRDate AS DATE))             AS last_grn,
      COUNT(DISTINCT DATEFROMPARTS(
        YEAR(TRY_CAST(g.GRDate AS DATE)),
        MONTH(TRY_CAST(g.GRDate AS DATE)), 1)) AS active_months
    FROM JSR_Roller_PM.dbo.vGRN g
    WHERE g.Plant = 'IN48'
      AND g.legacy_part_name IS NOT NULL
      AND g.MaterialDesc NOT LIKE '%ROLL%'
      AND (g.MaterialDesc LIKE '%-GS-%' OR g.MaterialDesc LIKE '%-CS-%' OR g.MaterialDesc LIKE '%-HS-%')
      AND CAST(g.GRDate AS DATE) >= DATEADD(month, -12, GETDATE())
      AND TRY_CAST(g.ReceivedQty AS float) > 0
    GROUP BY
      g.legacy_part_name, g.VendorName,
      CASE
        WHEN g.MaterialDesc LIKE '%-CS-%' THEN 'CS'
        WHEN g.MaterialDesc LIKE '%-HS-%' THEN 'HS'
        WHEN g.MaterialDesc LIKE '%-GS-%' OR g.MaterialDesc LIKE '%-GS;%' THEN 'GS'
      END
  ),
  priced AS (
    -- Normalize part_no: strip trailing -TRA suffix so HM133436H-TRA matches GRN's HM133436H
    SELECT DISTINCT
      CASE WHEN part_no LIKE '%-TRA' THEN LEFT(part_no, LEN(part_no)-4) ELSE part_no END AS partNo,
      supplier_name
    FROM dbo.vw_price_sheet
    WHERE status IN ('APPROVED','DRAFT')
      AND (ISNULL(gs_for_jsr,0)>0 OR ISNULL(cs_dap_jsr,0)>0 OR ISNULL(gs_cs_hs_for_jsr,0)>0)
  ),
  tagged AS (
    SELECT g.*,
      CASE WHEN p.partNo IS NOT NULL THEN 1 ELSE 0 END AS is_matched
    FROM grn g
    LEFT JOIN priced p ON p.partNo=g.partNo AND p.supplier_name=g.vendor
  )
  SELECT
    vendor            AS [Supplier Name],
    stage             AS [Stage],
    partNo            AS [Part No],
    ROUND(grn_spend, 2)         AS [GRN Spend (INR)],
    CAST(grn_qty AS INT)        AS [GRN Qty (pc)],
    CAST(peak_month_qty AS INT) AS [Peak Month Qty],
    CAST(active_months AS INT)  AS [Active Months],
    CONVERT(varchar(10), first_grn, 23) AS [First GRN],
    CONVERT(varchar(10), last_grn,  23) AS [Last GRN],
    'vw_price_sheet (supplier_name match)' AS [Add Rate To Table]
  FROM tagged
  WHERE is_matched = 0
  ORDER BY vendor, stage, grn_spend DESC
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSummaryRows(rows, plant) {
  const bySupStage = {};
  for (const row of rows) {
    const key = `${row['Supplier Name']}||${row['Stage']}`;
    if (!bySupStage[key]) bySupStage[key] = { sup: row['Supplier Name'], stage: row['Stage'], parts: 0, spend: 0, qty: 0 };
    bySupStage[key].parts++;
    bySupStage[key].spend += row['GRN Spend (INR)'];
    bySupStage[key].qty   += row['GRN Qty (pc)'];
  }
  const summaryRows = Object.values(bySupStage)
    .sort((a, b) => b.spend - a.spend)
    .map(r => ({
      'Plant':                    plant,
      'Supplier Name':            r.sup,
      'Stage':                    r.stage,
      'Missing Parts (count)':    r.parts,
      'Unmatched GRN Spend (INR)': Math.round(r.spend),
      'Unmatched GRN Spend (Cr)': +(r.spend / 1e7).toFixed(2),
      'Total GRN Qty (pc)':       Math.round(r.qty),
    }));

  // Grand total row
  const totSpend = summaryRows.reduce((a, r) => a + r['Unmatched GRN Spend (INR)'], 0);
  summaryRows.push({
    'Plant': plant + ' TOTAL', 'Supplier Name': '', 'Stage': '',
    'Missing Parts (count)':    summaryRows.reduce((a, r) => a + r['Missing Parts (count)'], 0),
    'Unmatched GRN Spend (INR)': Math.round(totSpend),
    'Unmatched GRN Spend (Cr)': +(totSpend / 1e7).toFixed(2),
    'Total GRN Qty (pc)':       summaryRows.reduce((a, r) => a + r['Total GRN Qty (pc)'], 0),
  });
  return summaryRows;
}

function makeSheet(rows, colWidths) {
  const ws = xlsx.utils.json_to_sheet(rows);
  ws['!cols'] = colWidths.map(w => ({ wch: w }));
  return ws;
}

function addSupplierSheets(wb, rows, prefix) {
  const bySupplier = {};
  for (const row of rows) {
    const sup = row['Supplier Name'];
    if (!bySupplier[sup]) bySupplier[sup] = [];
    bySupplier[sup].push(row);
  }
  for (const [sup, supRows] of Object.entries(bySupplier)) {
    const sheetName = `${prefix} ${sup}`.substring(0, 31);
    const ws = makeSheet(supRows, [35, 16, 8, 16, 18, 14, 16, 14, 12, 12, 44]);
    xlsx.utils.book_append_sheet(wb, ws, sheetName);
  }
  return Object.keys(bySupplier).length;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('Querying INJA missing parts...');
const injaResult = await query('inja', INJA_SQL);
const injaRows   = injaResult.recordset;
console.log(`  → ${injaRows.length} missing combinations (INJA)`);

console.log('Querying JSR missing parts...');
const jsrResult  = await query('jsr', JSR_SQL);
const jsrRows    = jsrResult.recordset;
console.log(`  → ${jsrRows.length} missing combinations (JSR)`);

// Build workbook
const wb = xlsx.utils.book_new();

// ── Sheet 1: Combined summary ─────────────────────────────────────────────────
const injaSummary = buildSummaryRows(injaRows, 'INJA (Chennai)');
const jsrSummary  = buildSummaryRows(jsrRows,  'JSR (Jamshedpur)');
const allSummary  = [...injaSummary, ...jsrSummary];

const wsSummary = makeSheet(allSummary, [20, 36, 8, 22, 26, 24, 20]);
xlsx.utils.book_append_sheet(wb, wsSummary, 'Summary');

// ── Sheet 2: All INJA missing ─────────────────────────────────────────────────
const wsInja = makeSheet(injaRows, [35, 16, 8, 16, 18, 14, 16, 14, 12, 12, 44]);
xlsx.utils.book_append_sheet(wb, wsInja, 'INJA - All Missing');

// ── Sheet 3: All JSR missing ──────────────────────────────────────────────────
const wsJsr = makeSheet(jsrRows, [35, 8, 16, 18, 14, 16, 14, 12, 12, 40]);
xlsx.utils.book_append_sheet(wb, wsJsr, 'JSR - All Missing');

// ── Per-supplier sheets ───────────────────────────────────────────────────────
const injaSups = addSupplierSheets(wb, injaRows, 'I');   // I = INJA prefix
const jsrSups  = addSupplierSheets(wb, jsrRows,  'J');   // J = JSR prefix

// ── Write ─────────────────────────────────────────────────────────────────────
const outDir  = path.join(__dirname, '..', 'exports');
mkdirSync(outDir, { recursive: true });

const now     = new Date();
const dateStr = now.toISOString().slice(0, 10);
const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-');
const outPath = path.join(outDir, `Missing_Parts_${dateStr}_${timeStr}.xlsx`);
xlsx.writeFile(wb, outPath);

console.log(`\n✅  Saved: ${outPath}`);
console.log(`   Sheets: Summary | INJA - All Missing (${injaRows.length} rows) | JSR - All Missing (${jsrRows.length} rows)`);
console.log(`           + ${injaSups} INJA supplier sheets  +  ${jsrSups} JSR supplier sheets`);

// Console summary
console.log('\n──── INJA ────────────────────────────────────────────────');
for (const r of injaSummary) {
  if (!r['Supplier Name']) {
    console.log('─'.repeat(55));
    console.log(`TOTAL: ${r['Missing Parts (count)']} parts | ₹${r['Unmatched GRN Spend (Cr)']} Cr`);
  } else {
    console.log(`  ${r['Supplier Name']} [${r['Stage']}]: ${r['Missing Parts (count)']} parts | ₹${r['Unmatched GRN Spend (Cr)']} Cr`);
  }
}
console.log('\n──── JSR ─────────────────────────────────────────────────');
for (const r of jsrSummary) {
  if (!r['Supplier Name']) {
    console.log('─'.repeat(55));
    console.log(`TOTAL: ${r['Missing Parts (count)']} parts | ₹${r['Unmatched GRN Spend (Cr)']} Cr`);
  } else {
    console.log(`  ${r['Supplier Name']} [${r['Stage']}]: ${r['Missing Parts (count)']} parts | ₹${r['Unmatched GRN Spend (Cr)']} Cr`);
  }
}

process.exit(0);
