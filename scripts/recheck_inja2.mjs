import { query } from '../server/db.js';

// ── Issue 1: OMNI HS parts with cost=0 in ps_part_hard_cost_master ────────────
const r1 = await query('inja', `
  SELECT h.legacy_part_name, CAST(h.supplier_id AS NVARCHAR(50)) AS supplierId,
         h.status, h.hard_cost_per_pc, h.effective_from
  FROM dbo.ps_part_hard_cost_master h
  WHERE h.legacy_part_name IN ('6NP758445','M249749','NP912766')
  ORDER BY h.legacy_part_name, h.effective_from DESC
`);
console.log('=== OMNI HS parts with cost=0/null (in table but filtered) ===');
console.log(JSON.stringify(r1.recordset, null, 2));

// ── Issue 2: LM545810 CS suffix mismatch — what exactly is in GRN vs price table ──
const r2 = await query('inja', `
  SELECT c.legacy_part_name AS ps_part, CAST(c.supplier_id AS NVARCHAR(50)) AS supplierId,
         c.status, c.batch_quantity
  FROM dbo.ps_carb_master c
  WHERE c.legacy_part_name LIKE '%LM545810%'
`);
console.log('\n=== ps_carb_master entries for LM545810* ===');
console.log(JSON.stringify(r2.recordset, null, 2));

const r3 = await query('inja', `
  SELECT DISTINCT g.legacy_part_name, g.Vendor, g.VendorName,
    SUM(TRY_CAST(g.[Amount(Inr)] AS float)) AS spend
  FROM JSR_Roller_PM.dbo.vGRN g
  WHERE g.Plant='INJA' AND g.legacy_part_name LIKE '%LM545810%'
    AND CAST(g.GRDate AS DATE) >= DATEADD(month,-12,GETDATE())
  GROUP BY g.legacy_part_name, g.Vendor, g.VendorName
`);
console.log('\n=== GRN entries for LM545810* ===');
console.log(JSON.stringify(r3.recordset, null, 2));

process.exit(0);
