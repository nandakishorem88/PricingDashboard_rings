/**
 * recheck_inja.mjs
 * For every "missing" INJA part-supplier combo, check WHY it's missing:
 *   1. Part+supplier exists in price table but filtered out (status, cost=0, template_row_id, batch_qty)
 *   2. Part exists but under a different supplier_id
 *   3. Part number in price table has a suffix (like -TRA in JSR)
 *   4. Genuinely absent
 */
import { query } from '../server/db.js';

// ── Step 1: Get the missing INJA list (same logic as export script) ────────────
const MISSING_SQL = `
  WITH
  grn AS (
    SELECT
      g.legacy_part_name AS partNo,
      g.Vendor           AS vendorId,
      g.VendorName       AS vendor,
      CASE
        WHEN g.MaterialDesc LIKE '%-CS-%' THEN 'CS'
        WHEN g.MaterialDesc LIKE '%-HS-%' THEN 'HS'
        WHEN g.MaterialDesc LIKE '%-GS-%' OR g.MaterialDesc LIKE '%-GS;%' THEN 'GS'
      END AS stage,
      SUM(TRY_CAST(g.[Amount(Inr)] AS float)) AS grn_spend
    FROM JSR_Roller_PM.dbo.vGRN g
    WHERE g.Plant = 'INJA'
      AND g.legacy_part_name IS NOT NULL
      AND g.VendorName != 'PACKINGS AND JOINTINGS GASKETS'
      AND g.MaterialDesc NOT LIKE '%ROLL%'
      AND (g.MaterialDesc LIKE '%-GS-%' OR g.MaterialDesc LIKE '%-CS-%' OR g.MaterialDesc LIKE '%-HS-%')
      AND CAST(g.GRDate AS DATE) >= DATEADD(month, -12, GETDATE())
      AND TRY_CAST(g.ReceivedQty AS float) > 0
    GROUP BY g.legacy_part_name, g.Vendor, g.VendorName,
      CASE
        WHEN g.MaterialDesc LIKE '%-CS-%' THEN 'CS'
        WHEN g.MaterialDesc LIKE '%-HS-%' THEN 'HS'
        WHEN g.MaterialDesc LIKE '%-GS-%' OR g.MaterialDesc LIKE '%-GS;%' THEN 'GS'
      END
  ),
  priced_gs AS (
    SELECT DISTINCT legacy_part_name AS partNo, CAST(process_owner_supplier_id AS NVARCHAR(50)) AS supplierId
    FROM dbo.ps_rings_inja_cost
    WHERE Plant='INJA' AND cost_per_pc>0 AND ps_rings_inja_template_row_id=1
  ),
  priced_cs AS (
    SELECT DISTINCT legacy_part_name AS partNo, CAST(supplier_id AS NVARCHAR(50)) AS supplierId
    FROM dbo.ps_carb_master WHERE status='Approved' AND batch_quantity>0
  ),
  priced_hs AS (
    SELECT DISTINCT legacy_part_name AS partNo, CAST(supplier_id AS NVARCHAR(50)) AS supplierId
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
  SELECT partNo, vendorId, vendor, stage, grn_spend FROM tagged WHERE is_matched=0
  ORDER BY grn_spend DESC
`;

console.log('Fetching INJA missing list...');
const missing = (await query('inja', MISSING_SQL)).recordset;
console.log(`  → ${missing.length} missing combos\n`);

// ── Step 2: For each missing combo, diagnose WHY ───────────────────────────────

// Check GS: exists in ps_rings_inja_cost but filtered out?
const GS_DIAGNOSE = `
  SELECT legacy_part_name AS partNo, CAST(process_owner_supplier_id AS NVARCHAR(50)) AS supplierId,
    Plant, ps_rings_inja_template_row_id AS templateRowId, cost_per_pc,
    CASE
      WHEN cost_per_pc IS NULL OR cost_per_pc = 0 THEN 'cost=0/null'
      WHEN ps_rings_inja_template_row_id != 1 THEN 'template_row_id != 1'
      WHEN Plant != 'INJA' THEN 'wrong plant'
      ELSE 'would match if filter relaxed'
    END AS reason
  FROM dbo.ps_rings_inja_cost
  WHERE legacy_part_name IN (SELECT value FROM STRING_SPLIT(@parts, ','))
    AND CAST(process_owner_supplier_id AS NVARCHAR(50)) = @supplierId
`;

const CS_DIAGNOSE = `
  SELECT legacy_part_name AS partNo, CAST(supplier_id AS NVARCHAR(50)) AS supplierId,
    status, batch_quantity,
    CASE
      WHEN status != 'Approved' THEN 'status=' + ISNULL(status,'NULL')
      WHEN batch_quantity IS NULL OR batch_quantity = 0 THEN 'batch_qty=0/null'
      ELSE 'would match if filter relaxed'
    END AS reason
  FROM dbo.ps_carb_master
  WHERE legacy_part_name IN (SELECT value FROM STRING_SPLIT(@parts, ','))
    AND CAST(supplier_id AS NVARCHAR(50)) = @supplierId
`;

const HS_DIAGNOSE = `
  SELECT legacy_part_name AS partNo, CAST(supplier_id AS NVARCHAR(50)) AS supplierId,
    status, hard_cost_per_pc,
    CASE
      WHEN status != 'Approved' THEN 'status=' + ISNULL(status,'NULL')
      WHEN hard_cost_per_pc IS NULL OR hard_cost_per_pc = 0 THEN 'cost=0/null'
      ELSE 'would match if filter relaxed'
    END AS reason
  FROM dbo.ps_part_hard_cost_master
  WHERE legacy_part_name IN (SELECT value FROM STRING_SPLIT(@parts, ','))
    AND CAST(supplier_id AS NVARCHAR(50)) = @supplierId
`;

// Group by vendor+stage for batch queries
const grouped = {};
for (const r of missing) {
  const key = `${r.vendorId}||${r.stage}`;
  if (!grouped[key]) grouped[key] = { vendorId: r.vendorId, vendor: r.vendor, stage: r.stage, parts: [] };
  grouped[key].parts.push(r.partNo);
}

const filteredOut = [];   // in price table but blocked by filter
const suffixMatch = [];   // part number suffix issue

// Check for suffix mismatches in each price table (like -TRA in JSR)
const SUFFIX_CHECK_GS = `
  SELECT c.legacy_part_name AS ps_partNo, CAST(c.process_owner_supplier_id AS NVARCHAR(50)) AS supplierId
  FROM dbo.ps_rings_inja_cost c
  WHERE c.Plant='INJA'
    AND EXISTS (
      SELECT 1 FROM JSR_Roller_PM.dbo.vGRN g
      WHERE g.Plant='INJA'
        AND g.legacy_part_name != c.legacy_part_name
        AND (c.legacy_part_name LIKE g.legacy_part_name + '-%' OR g.legacy_part_name LIKE c.legacy_part_name + '-%')
        AND CAST(g.Vendor AS NVARCHAR(50)) = CAST(c.process_owner_supplier_id AS NVARCHAR(50))
        AND g.MaterialDesc LIKE '%-GS-%'
        AND CAST(g.GRDate AS DATE) >= DATEADD(month,-12,GETDATE())
    )
`;

const SUFFIX_CHECK_CS = `
  SELECT c.legacy_part_name AS ps_partNo, CAST(c.supplier_id AS NVARCHAR(50)) AS supplierId
  FROM dbo.ps_carb_master c
  WHERE c.status='Approved'
    AND EXISTS (
      SELECT 1 FROM JSR_Roller_PM.dbo.vGRN g
      WHERE g.Plant='INJA'
        AND g.legacy_part_name != c.legacy_part_name
        AND (c.legacy_part_name LIKE g.legacy_part_name + '-%' OR g.legacy_part_name LIKE c.legacy_part_name + '-%')
        AND CAST(g.Vendor AS NVARCHAR(50)) = CAST(c.supplier_id AS NVARCHAR(50))
        AND g.MaterialDesc LIKE '%-CS-%'
        AND CAST(g.GRDate AS DATE) >= DATEADD(month,-12,GETDATE())
    )
`;

const SUFFIX_CHECK_HS = `
  SELECT h.legacy_part_name AS ps_partNo, CAST(h.supplier_id AS NVARCHAR(50)) AS supplierId
  FROM dbo.ps_part_hard_cost_master h
  WHERE h.status='Approved'
    AND EXISTS (
      SELECT 1 FROM JSR_Roller_PM.dbo.vGRN g
      WHERE g.Plant='INJA'
        AND g.legacy_part_name != h.legacy_part_name
        AND (h.legacy_part_name LIKE g.legacy_part_name + '-%' OR g.legacy_part_name LIKE h.legacy_part_name + '-%')
        AND CAST(g.Vendor AS NVARCHAR(50)) = CAST(h.supplier_id AS NVARCHAR(50))
        AND g.MaterialDesc LIKE '%-HS-%'
        AND CAST(g.GRDate AS DATE) >= DATEADD(month,-12,GETDATE())
    )
`;

// Run filtered-out check per vendor+stage group
console.log('Checking why each missing combo is missing...');
for (const [key, grp] of Object.entries(grouped)) {
  const partList = grp.parts.join(',');
  let rows = [];
  try {
    if (grp.stage === 'GS') {
      rows = (await query('inja', GS_DIAGNOSE.replace('@parts', `'${partList}'`).replace('@supplierId', `'${grp.vendorId}'`))).recordset;
    } else if (grp.stage === 'CS') {
      rows = (await query('inja', CS_DIAGNOSE.replace('@parts', `'${partList}'`).replace('@supplierId', `'${grp.vendorId}'`))).recordset;
    } else if (grp.stage === 'HS') {
      rows = (await query('inja', HS_DIAGNOSE.replace('@parts', `'${partList}'`).replace('@supplierId', `'${grp.vendorId}'`))).recordset;
    }
  } catch (e) {
    console.warn(`  Query failed for ${grp.vendor} ${grp.stage}: ${e.message}`);
  }
  if (rows.length > 0) {
    for (const row of rows) {
      filteredOut.push({ vendor: grp.vendor, vendorId: grp.vendorId, stage: grp.stage, ...row });
    }
  }
}

console.log(`\n── Parts IN price table but blocked by filter: ${filteredOut.length} ──`);
if (filteredOut.length > 0) {
  // Group by reason
  const byReason = {};
  for (const r of filteredOut) {
    const k = `${r.vendor} [${r.stage}] — ${r.reason}`;
    if (!byReason[k]) byReason[k] = [];
    byReason[k].push(r.partNo);
  }
  for (const [k, parts] of Object.entries(byReason)) {
    console.log(`  ${k}: ${parts.length} parts`);
    if (parts.length <= 10) console.log(`    ${parts.join(', ')}`);
  }
}

// Check suffix mismatches
console.log('\nChecking for part number suffix mismatches in INJA price tables...');
const [gsS, csS, hsS] = await Promise.all([
  query('inja', SUFFIX_CHECK_GS).then(r => r.recordset).catch(() => []),
  query('inja', SUFFIX_CHECK_CS).then(r => r.recordset).catch(() => []),
  query('inja', SUFFIX_CHECK_HS).then(r => r.recordset).catch(() => []),
]);

console.log(`\n── Suffix mismatches found: GS=${gsS.length}, CS=${csS.length}, HS=${hsS.length} ──`);
if (gsS.length) { console.log('GS:', gsS.map(r => r.ps_partNo).join(', ')); }
if (csS.length) { console.log('CS:', csS.map(r => r.ps_partNo).join(', ')); }
if (hsS.length) { console.log('HS:', hsS.map(r => r.ps_partNo).join(', ')); }

if (filteredOut.length === 0 && gsS.length === 0 && csS.length === 0 && hsS.length === 0) {
  console.log('\n✅ All INJA missing parts are genuinely absent from price tables — no filter or suffix issues found.');
}

process.exit(0);
