import { query } from '../server/db.js';

const r1 = await query('jsr', `
  SELECT DISTINCT g.Vendor, g.VendorName, g.legacy_part_name,
    SUM(TRY_CAST(g.ReceivedQty AS float)) AS qty,
    SUM(TRY_CAST(g.[Amount(Inr)] AS float)) AS spend
  FROM JSR_Roller_PM.dbo.vGRN g
  WHERE g.Plant='IN48' AND g.legacy_part_name='672'
    AND CAST(g.GRDate AS DATE) >= DATEADD(month,-12,GETDATE())
  GROUP BY g.Vendor, g.VendorName, g.legacy_part_name
`);
console.log('=== GRN: who delivers part 672? ===');
console.log(JSON.stringify(r1.recordset, null, 2));

const r2 = await query('jsr', `
  SELECT part_no, supplier_name, status, gs_for_jsr, cs_dap_jsr, gs_cs_hs_for_jsr
  FROM dbo.vw_price_sheet WHERE part_no='672'
`);
console.log('=== vw_price_sheet: part 672 entries ===');
console.log(JSON.stringify(r2.recordset, null, 2));

const r3 = await query('jsr', `
  SELECT DISTINCT supplier_name FROM dbo.vw_price_sheet WHERE supplier_name LIKE '%SHYAM%'
`);
console.log('=== SHYAM variants in vw_price_sheet ===');
console.log(JSON.stringify(r3.recordset, null, 2));

const r4 = await query('jsr', `
  SELECT DISTINCT Vendor, VendorName FROM JSR_Roller_PM.dbo.vGRN
  WHERE Plant='IN48' AND VendorName LIKE '%SHYAM%'
`);
console.log('=== SHYAM vendors in GRN ===');
console.log(JSON.stringify(r4.recordset, null, 2));

process.exit(0);
