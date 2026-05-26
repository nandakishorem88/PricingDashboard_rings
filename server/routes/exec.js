// Ring bearing sourcing analytics.
//
// /api/exec/summary        — hero KPIs, leakage, top-5 actions, scenarios, parts, anomalies
// /api/exec/price-winner   — full GS/CS/HS price matrix (jsr + inja)
// /api/exec/optimizer-board — kanban allocation state for Optimizer page
// /api/exec/investigate    — deep drill-down for one part
//
// Price sources:
//   JSR (IN48): JSR_Rings.dbo.vw_price_sheet  (matched by supplier_name = GRN.VendorName)
//               Stage GS → gs_for_jsr  |  CS → cs_dap_jsr  |  HS → gs_cs_hs_for_jsr
//   INJA:       GS → timken_price_model.dbo.ps_rings_inja_cost      (process_owner_supplier_id)
//               CS → timken_price_model.dbo.ps_carb_master           (supplier_id)
//               HS → timken_price_model.dbo.ps_part_hard_cost_master (supplier_id)
//               All INJA stages matched by supplier_id = GRN.Vendor (SAP vendor code — exact match)
//
// Stage: GRN.MaterialDesc LIKE '%-CS-%' → CS  |  '%-HS-%' → HS  |  '%-GS-%' / '%-GS;%' → GS
// Volume: JSR_Roller_PM.dbo.GRN  (Plant='IN48' or 'INJA', last 12 months)
// Part ID: GRN.legacy_part_name (matches vw_price_sheet.part_no and ps_*.legacy_part_name)

import { Router } from 'express';
import { query } from '../db.js';

const r = Router();
const safe = (p, fb) => p.then(x => x).catch(e => { console.warn('[exec] sub-query failed:', e.message); return { recordset: fb }; });

// ── Stage CASE expression (from GRN.MaterialDesc) ─────────────────────────────

const GRN_STAGE = `CASE
      WHEN g.MaterialDesc LIKE '%-CS-%' THEN 'CS'
      WHEN g.MaterialDesc LIKE '%-HS-%' THEN 'HS'
      WHEN g.MaterialDesc LIKE '%-GS-%' OR g.MaterialDesc LIKE '%-GS;%' THEN 'GS'
      ELSE NULL
    END`;

// ── GRN aggregation CTEs (shared by both plants) ──────────────────────────────
// Returns two CTEs: grnMonth and grnAgg — to be placed after WITH keyword.

function grnCTEs(plantCode) {
  return `
  grnMonth AS (
    SELECT g.legacy_part_name AS partNo,
      g.Vendor      AS vendorId,   -- SAP vendor code = supplier_master.supplier_id
      g.VendorName  AS vendor,     -- display name
      ${GRN_STAGE} AS stage,
      DATEFROMPARTS(YEAR(TRY_CAST(g.GRDate AS date)), MONTH(TRY_CAST(g.GRDate AS date)), 1) AS mo,
      SUM(TRY_CAST(g.ReceivedQty AS float)) AS qty
    FROM JSR_Roller_PM.dbo.GRN g
    WHERE g.Plant = '${plantCode}'
      AND g.legacy_part_name IS NOT NULL
      AND g.GRDate >= FORMAT(DATEADD(month, -12, GETDATE()), 'yyyy-MM-dd')
      AND TRY_CAST(g.ReceivedQty AS float) > 0
    GROUP BY g.legacy_part_name, g.Vendor, g.VendorName,
      ${GRN_STAGE},
      DATEFROMPARTS(YEAR(TRY_CAST(g.GRDate AS date)), MONTH(TRY_CAST(g.GRDate AS date)), 1)
  ),
  grnAgg AS (
    SELECT partNo, vendorId, vendor, stage, SUM(qty) AS totalQty, MAX(qty) AS peakMonthQty
    FROM grnMonth WHERE stage IS NOT NULL
    GROUP BY partNo, vendorId, vendor, stage
  )`;
}

// ── Data loaders ──────────────────────────────────────────────────────────────
// Each returns flat rows: { partNo, supplierName, stage, totalQty, peakMonthQty, pricePerPc }
// SQL JOIN ensures price > 0 and GRN volume exists — no JS fuzzy-matching needed.

async function loadJsr() {
  const sql = `
    WITH ${grnCTEs('IN48')},
    prices AS (
      SELECT part_no AS partNo, supplier_name,
        ISNULL(gs_for_jsr,       0) AS gs_price,
        ISNULL(cs_dap_jsr,       0) AS cs_price,
        ISNULL(gs_cs_hs_for_jsr, 0) AS hs_price,
        ROW_NUMBER() OVER (PARTITION BY part_no, supplier_name ORDER BY computed_at DESC) AS rn
      FROM dbo.vw_price_sheet
      WHERE status IN ('APPROVED', 'DRAFT')
    )
    SELECT sub.partNo, sub.supplierName, sub.stage,
           sub.totalQty, sub.peakMonthQty, sub.pricePerPc
    FROM (
      SELECT g.partNo, g.vendor AS supplierName, g.stage,
             g.totalQty, g.peakMonthQty,
             CASE g.stage
               WHEN 'GS' THEN p.gs_price
               WHEN 'CS' THEN p.cs_price
               WHEN 'HS' THEN p.hs_price
               ELSE 0
             END AS pricePerPc
      FROM grnAgg g
      JOIN prices p ON p.partNo = g.partNo AND p.supplier_name = g.vendor AND p.rn = 1
    ) sub
    WHERE sub.pricePerPc > 0
  `;
  const result = await query('jsr', sql);
  return result.recordset;
}

async function loadInja() {
  // Three price sources, one per stage — all matched by supplier_id (GRN.Vendor = SAP vendor code):
  //   GS → ps_rings_inja_cost        (Forging Cost,     process_owner_supplier_id, template_row_id=1)
  //   CS → ps_carb_master            (Carburizing Cost, supplier_id, formula: furnace_rate×hours/batch + extras)
  //   HS → ps_part_hard_cost_master  (Hardening Cost,   supplier_id, hard_cost_per_pc)
  // Display name taken from GRN.VendorName (g.vendor) — no supplier_master JOIN needed.
  const sql = `
    WITH ${grnCTEs('INJA')},

    -- GS: Forging cost — keyed by process_owner_supplier_id
    gsPrices AS (
      SELECT c.legacy_part_name AS partNo,
             c.process_owner_supplier_id AS supplierId,
             c.cost_per_pc,
             ROW_NUMBER() OVER (
               PARTITION BY c.legacy_part_name, c.process_owner_supplier_id
               ORDER BY c.effective_from DESC
             ) AS rn
      FROM dbo.ps_rings_inja_cost c
      WHERE c.Plant = 'INJA' AND c.cost_per_pc > 0
        AND c.ps_rings_inja_template_row_id = 1
    ),

    -- CS: Carburizing cost — keyed by supplier_id (furnace formula)
    csPrices AS (
      SELECT c.legacy_part_name AS partNo,
             c.supplier_id AS supplierId,
             ROUND(
               c.furnance_hour_rate * c.cycle_time_in_hours / c.batch_quantity
               + ISNULL(c.wire_mesh_cost_per_pc,    0)
               + ISNULL(c.seperator_cost_per_pc,     0)
               + ISNULL(c.glass_wool_cost_per_pc,    0)
               + ISNULL(c.tempering_cost_per_pc,     0)
               + ISNULL(c.screw_cost_per_pc,         0)
               + ISNULL(c.shot_blasting_cost_per_pc, 0),
             2) AS cost_per_pc,
             ROW_NUMBER() OVER (
               PARTITION BY c.legacy_part_name, c.supplier_id
               ORDER BY c.effective_from DESC
             ) AS rn
      FROM dbo.ps_carb_master c
      WHERE c.status = 'Approved' AND c.batch_quantity > 0
    ),

    -- HS: Hardening cost — keyed by supplier_id (direct per-pc rate)
    hsPrices AS (
      SELECT h.legacy_part_name AS partNo,
             h.supplier_id AS supplierId,
             h.hard_cost_per_pc AS cost_per_pc,
             ROW_NUMBER() OVER (
               PARTITION BY h.legacy_part_name, h.supplier_id
               ORDER BY h.effective_from DESC
             ) AS rn
      FROM dbo.ps_part_hard_cost_master h
      WHERE h.status = 'Approved' AND h.hard_cost_per_pc > 0
    )

    -- GS rows: exact match on supplierId = vendorId (SAP vendor code)
    SELECT g.partNo, g.vendor AS supplierName, g.stage,
           g.totalQty, g.peakMonthQty, p.cost_per_pc AS pricePerPc
    FROM grnAgg g
    JOIN gsPrices p ON p.partNo = g.partNo AND p.supplierId = g.vendorId AND p.rn = 1
    WHERE g.stage = 'GS' AND p.cost_per_pc > 0

    UNION ALL

    -- CS rows: exact match on supplierId = vendorId
    SELECT g.partNo, g.vendor AS supplierName, g.stage,
           g.totalQty, g.peakMonthQty, p.cost_per_pc AS pricePerPc
    FROM grnAgg g
    JOIN csPrices p ON p.partNo = g.partNo AND p.supplierId = g.vendorId AND p.rn = 1
    WHERE g.stage = 'CS' AND p.cost_per_pc > 0

    UNION ALL

    -- HS rows: exact match on supplierId = vendorId
    SELECT g.partNo, g.vendor AS supplierName, g.stage,
           g.totalQty, g.peakMonthQty, p.cost_per_pc AS pricePerPc
    FROM grnAgg g
    JOIN hsPrices p ON p.partNo = g.partNo AND p.supplierId = g.vendorId AND p.rn = 1
    WHERE g.stage = 'HS' AND p.cost_per_pc > 0
  `;
  const result = await query('inja', sql);
  return result.recordset;
}

// ── Part counts ───────────────────────────────────────────────────────────────

async function loadPartCounts(plant, loadedRows) {
  const activeSourced = new Set(loadedRows.map(r => r.partNo)).size;
  let totalPriced = 0;
  try {
    if (plant === 'jsr') {
      const cnt = await query('jsr', `
        SELECT COUNT(DISTINCT part_no) AS n FROM dbo.vw_price_sheet
        WHERE status IN ('APPROVED','DRAFT')
          AND (ISNULL(gs_for_jsr,0) > 0 OR ISNULL(cs_dap_jsr,0) > 0 OR ISNULL(gs_cs_hs_for_jsr,0) > 0)
      `);
      totalPriced = cnt.recordset[0]?.n || 0;
    } else {
      const cnt = await query('inja', `
        SELECT COUNT(DISTINCT legacy_part_name) AS n FROM (
          SELECT legacy_part_name FROM dbo.ps_rings_inja_cost
          WHERE Plant = 'INJA' AND cost_per_pc > 0 AND ps_rings_inja_template_row_id = 1
          UNION
          SELECT legacy_part_name FROM dbo.ps_carb_master
          WHERE status = 'Approved' AND batch_quantity > 0
          UNION
          SELECT legacy_part_name FROM dbo.ps_part_hard_cost_master
          WHERE status = 'Approved' AND hard_cost_per_pc > 0
        ) t
      `);
      totalPriced = cnt.recordset[0]?.n || 0;
    }
  } catch (e) {
    console.warn(`[exec/counts] ${plant}:`, e.message);
  }
  return { totalPriced, activeSourced };
}

// ── Shared analytics helper ───────────────────────────────────────────────────
// Groups flat rows into { [partNo]: { partNo, supplierMin: { 'sup::stage': { ... } } } }

function buildByPart(rows) {
  const byPart = {};
  for (const row of rows) {
    const k     = String(row.partNo);
    const name  = String(row.supplierName || '(unknown)');
    const stage = String(row.stage || 'GS').toUpperCase();
    const price = Number(row.pricePerPc) || 0;
    const qty   = Number(row.totalQty)   || 0;
    const peak  = Number(row.peakMonthQty) || 0;
    if (price <= 0) continue;
    if (!byPart[k]) byPart[k] = { partNo: k, supplierMin: {} };
    const key2 = `${name}::${stage}`;
    const prev = byPart[k].supplierMin[key2];
    if (!prev || price < prev.price) {
      byPart[k].supplierMin[key2] = { name, price, stage, totalQty: qty, peakMonthQty: peak };
    }
  }
  return byPart;
}

// ── /summary ──────────────────────────────────────────────────────────────────

r.get('/summary', async (req, res) => {
  const plant      = (String(req.query.plant || 'jsr').toLowerCase() === 'inja') ? 'inja' : 'jsr';
  const plantLabel = plant === 'inja' ? 'Chennai' : 'JSR';

  try {
    const rows       = await (plant === 'jsr' ? loadJsr() : loadInja());
    const partCounts = await loadPartCounts(plant, rows);
    const byPart     = buildByPart(rows);

    const parts = Object.values(byPart).map(p => {
      const suppliers = Object.values(p.supplierMin).map(({ name, price, stage, totalQty, peakMonthQty }) => {
        const annualCapacity = peakMonthQty > 0 ? peakMonthQty * 1.25 * 12 : 0;
        return { name, price, stage, actualQty: totalQty, peakMonthQty, annualCapacity };
      });

      const stageGroups = {};
      for (const s of suppliers) {
        (stageGroups[s.stage] = stageGroups[s.stage] || []).push(s);
      }

      const totalQty = suppliers.reduce((a, b) => a + b.actualQty, 0);
      let currentCost = 0, optimalCost = 0;
      let l1ActualQtyAcrossStages = 0, l1OptimalQtyAcrossStages = 0;
      let capacityOverflow = 0;
      const allocation = [];

      for (const [, stageSups] of Object.entries(stageGroups)) {
        const ranked      = [...stageSups].sort((a, b) => a.price - b.price);
        const stageDemand = stageSups.reduce((a, b) => a + b.actualQty, 0);
        currentCost      += stageSups.reduce((a, b) => a + b.actualQty * b.price, 0);

        const stageL1 = ranked[0];
        if (stageL1) l1ActualQtyAcrossStages += stageL1.actualQty;

        let remaining = stageDemand;
        const stageAlloc = [];
        for (const s of ranked) {
          if (remaining <= 0) { stageAlloc.push({ ...s, allocated: 0 }); continue; }
          const cap  = s.annualCapacity > 0 ? s.annualCapacity : Infinity;
          const take = Math.min(remaining, cap);
          stageAlloc.push({ ...s, allocated: take });
          optimalCost += take * s.price;
          remaining   -= take;
        }
        if (remaining > 0 && stageAlloc.length > 0) {
          const last = stageAlloc[stageAlloc.length - 1];
          last.allocated  += remaining;
          optimalCost     += remaining * last.price;
          capacityOverflow += remaining;
        }
        if (stageAlloc[0]) l1OptimalQtyAcrossStages += stageAlloc[0].allocated;
        allocation.push(...stageAlloc);
      }

      const leakage = Math.max(0, currentCost - optimalCost);

      // Deduplicate by supplier name across stages: min price, sum qty, max capacity
      const dedupMap = {};
      for (const s of suppliers) {
        if (!dedupMap[s.name]) {
          dedupMap[s.name] = { ...s };
        } else {
          dedupMap[s.name].price          = Math.min(dedupMap[s.name].price, s.price);
          dedupMap[s.name].actualQty     += s.actualQty;
          dedupMap[s.name].peakMonthQty   = Math.max(dedupMap[s.name].peakMonthQty, s.peakMonthQty);
          dedupMap[s.name].annualCapacity = Math.max(dedupMap[s.name].annualCapacity, s.annualCapacity);
        }
      }
      const rankedAll = Object.values(dedupMap)
        .sort((a, b) => a.price - b.price)
        .map((s, i) => ({
          ...s,
          rank: i + 1,
          tier: `L${i + 1}`,
          actualSharePct: totalQty > 0 ? (s.actualQty / totalQty) * 100 : 0,
        }));
      const globalL1 = rankedAll[0];

      const l1Share        = totalQty > 0 ? (l1ActualQtyAcrossStages  / totalQty) * 100 : 0;
      const l1OptimalShare = totalQty > 0 ? (l1OptimalQtyAcrossStages / totalQty) * 100 : 0;

      let max100PctSaving = 0;
      for (const [, stageSups] of Object.entries(stageGroups)) {
        const stageDemand = stageSups.reduce((a, b) => a + b.actualQty, 0);
        if (stageDemand <= 0) continue;
        const stageL1     = [...stageSups].sort((a, b) => a.price - b.price)[0];
        const stageCurrent = stageSups.reduce((a, b) => a + b.actualQty * b.price, 0);
        max100PctSaving   += Math.max(0, stageCurrent - stageDemand * (stageL1?.price || 0));
      }

      const prices    = rankedAll.map(s => s.price);
      const minPrice  = prices.length ? Math.min(...prices) : 0;
      const maxPrice  = prices.length ? Math.max(...prices) : 0;
      const spreadPct = minPrice > 0 ? ((maxPrice - minPrice) / minPrice) * 100 : 0;

      return {
        partNo: p.partNo, sapId: null, rmGrade: null,
        totalQty: Math.round(totalQty),
        suppliers: rankedAll, allocation, stageGroups,
        capacityOverflow: Math.round(capacityOverflow),
        currentCost: Math.round(currentCost), optimalCost: Math.round(optimalCost),
        leakage: Math.round(leakage),
        l1Share, l1OptimalShare,
        max100PctSaving: Math.round(max100PctSaving),
        minPrice, maxPrice, spreadPct,
        L1: globalL1?.name || null, L1Price: globalL1?.price || null,
      };
    });

    const partsWithVolume = parts.filter(p => p.totalQty > 0);

    let totalL1ActualQty = 0, totalL1OptimalQty = 0;
    for (const p of partsWithVolume) {
      for (const stageSups of Object.values(p.stageGroups || {})) {
        const ranked  = [...stageSups].sort((a, b) => a.price - b.price);
        const stageL1 = ranked[0]; if (!stageL1) continue;
        totalL1ActualQty  += stageL1.actualQty;
        const stageDemand  = stageSups.reduce((a, b) => a + b.actualQty, 0);
        const cap          = stageL1.annualCapacity > 0 ? stageL1.annualCapacity : Infinity;
        totalL1OptimalQty += Math.min(stageDemand, cap);
      }
    }

    const totalQtyAll      = partsWithVolume.reduce((a, b) => a + b.totalQty,      0);
    const totalCurrentCost = partsWithVolume.reduce((a, b) => a + b.currentCost,   0);
    const totalOptimalCost = partsWithVolume.reduce((a, b) => a + b.optimalCost,   0);
    const totalLeakage     = Math.max(0, totalCurrentCost - totalOptimalCost);
    const l1ShareCompany        = totalQtyAll > 0 ? (totalL1ActualQty  / totalQtyAll) * 100 : 0;
    const l1OptimalShareCompany = totalQtyAll > 0 ? (totalL1OptimalQty / totalQtyAll) * 100 : 0;

    const stageActions = [];
    for (const p of partsWithVolume) {
      for (const [stage, stageSups] of Object.entries(p.stageGroups || {})) {
        if (stageSups.length < 2) continue;
        const ranked      = [...stageSups].sort((a, b) => a.price - b.price);
        const L1          = ranked[0];
        const stageDemand  = stageSups.reduce((a, b) => a + b.actualQty,          0);
        const stageCurrent = stageSups.reduce((a, b) => a + b.actualQty * b.price, 0);
        const stageSaving  = Math.max(0, stageCurrent - stageDemand * L1.price);
        if (stageSaving <= 0) continue;
        const dearer  = ranked.slice(1).filter(s => s.actualQty > 0).sort((a, b) => b.price - a.price);
        const from    = dearer[0] || ranked[ranked.length - 1];
        const moveQty = Math.max(0, stageDemand - L1.actualQty);
        stageActions.push({
          partNo: p.partNo, rmGrade: null, stage,
          fromSupplier: from?.name || '(other)', toSupplier: L1.name,
          moveQty: Math.round(moveQty), saving: Math.round(stageSaving),
          totalQty: Math.round(stageDemand),
        });
      }
    }
    stageActions.sort((a, b) => b.saving - a.saving);
    const topActions = stageActions.slice(0, 5);

    const scenarioPcts = [25, 50, 75, 100];
    const scenarios = scenarioPcts.map(pct => {
      const saving = partsWithVolume.reduce((acc, p) => {
        for (const [, stageSups] of Object.entries(p.stageGroups || {})) {
          const ranked      = [...stageSups].sort((a, b) => a.price - b.price);
          const L1          = ranked[0]; if (!L1) continue;
          const stageDemand  = stageSups.reduce((a, b) => a + b.actualQty,          0);
          const stageCurrent = stageSups.reduce((a, b) => a + b.actualQty * b.price, 0);
          acc += Math.max(0, stageCurrent - stageDemand * L1.price) * (pct / 100);
        }
        return acc;
      }, 0);
      return { pct, saving: Math.round(saving) };
    });

    const anomalies = partsWithVolume
      .filter(p => p.spreadPct > 30)
      .map(p => ({
        partNo: p.partNo, rmGrade: null,
        spreadPct: Math.round(p.spreadPct),
        minPrice: p.minPrice, maxPrice: p.maxPrice,
        totalQty: p.totalQty,
      }))
      .sort((a, b) => b.spreadPct - a.spreadPct)
      .slice(0, 10);

    res.json({
      asOf: new Date().toISOString(),
      plant, plantLabel,
      hero: {
        partsInScope:    partsWithVolume.length,
        totalQty:        Math.round(totalQtyAll),
        l1ShareToday:    l1ShareCompany,
        l1OptimalShare:  l1OptimalShareCompany,
        currentCost:     Math.round(totalCurrentCost),
        optimalCost:     Math.round(totalOptimalCost),
        leakage:         Math.round(totalLeakage),
        max100PctSaving: Math.round(partsWithVolume.reduce((a, b) => a + b.max100PctSaving, 0)),
        totalPriced:     partCounts.totalPriced,
        activeSourced:   partCounts.activeSourced,
      },
      topActions,
      scenarios,
      parts: partsWithVolume.sort((a, b) => b.leakage - a.leakage).slice(0, 200),
      anomalies,
    });
  } catch (e) {
    console.error('[exec/summary]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── /price-winner ─────────────────────────────────────────────────────────────

r.get('/price-winner', async (_req, res) => {
  try {
    const [jsrRows, injaRows] = await Promise.all([loadJsr(), loadInja()]);

    function buildPriceWinner(rows, plantLabel) {
      const partMap = {};
      for (const row of rows) {
        const k     = String(row.partNo);
        const sup   = String(row.supplierName || '(unknown)');
        const stage = String(row.stage || 'GS').toUpperCase();
        const price = Number(row.pricePerPc)   || 0;
        const qty   = Number(row.totalQty)     || 0;
        const peak  = Number(row.peakMonthQty) || 0;
        if (price <= 0) continue;
        if (!partMap[k]) partMap[k] = { partNo: k, stagesBySup: {}, qtyBySup: {} };
        if (!partMap[k].stagesBySup[sup]) partMap[k].stagesBySup[sup] = {};
        const cur = partMap[k].stagesBySup[sup][stage];
        partMap[k].stagesBySup[sup][stage] = cur ? Math.min(cur, price) : price;
        if (!partMap[k].qtyBySup[sup]) partMap[k].qtyBySup[sup] = { qty: 0, peakMonthQty: 0 };
        partMap[k].qtyBySup[sup].qty          += qty;
        partMap[k].qtyBySup[sup].peakMonthQty  = Math.max(partMap[k].qtyBySup[sup].peakMonthQty, peak);
      }

      const supplierSet = new Set();
      const parts = Object.values(partMap).map(p => {
        const prices = {};
        let totalQty = 0;
        for (const [sup, stagePrices] of Object.entries(p.stagesBySup)) {
          supplierSet.add(sup);
          const m = p.qtyBySup[sup] || { qty: 0, peakMonthQty: 0 };
          totalQty += m.qty;
          const deliveredStage = stagePrices.HS ? 'HS' : stagePrices.CS ? 'CS' : 'GS';
          prices[sup] = {
            rates: { gs: stagePrices.GS || null, cs: stagePrices.CS || null, hs: stagePrices.HS || null },
            pricePerPc:    stagePrices[deliveredStage] || 0,
            qty:           Math.round(m.qty),
            peakMonthQty:  Math.round(m.peakMonthQty),
            deliveredStage,
          };
        }
        return {
          partNo: p.partNo, rmGrade: '', heatTreatment: '', rmForm: 'BAR',
          totalQty: Math.round(totalQty), prices,
        };
      }).filter(p => p.totalQty > 0).sort((a, b) => b.totalQty - a.totalQty);

      return { plant: plantLabel, hasVolume: parts.length > 0, suppliers: [...supplierSet].sort(), parts };
    }

    res.json({
      jsr:  buildPriceWinner(jsrRows,  'JSR'),
      inja: buildPriceWinner(injaRows, 'Chennai'),
    });
  } catch (e) {
    console.error('[exec/price-winner]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── /optimizer-board ──────────────────────────────────────────────────────────

const STAGE_KEYS = ['GS', 'CS', 'HS'];

r.get('/optimizer-board', async (req, res) => {
  const plant      = (String(req.query.plant || 'jsr').toLowerCase() === 'inja') ? 'inja' : 'jsr';
  const plantLabel = plant === 'inja' ? 'Chennai' : 'JSR';
  const tolerance  = Number(req.query.tolerance) || 20;

  try {
    const rows   = await (plant === 'jsr' ? loadJsr() : loadInja());
    const byPart = buildByPart(rows);

    const stageSuppliers = { GS: new Map(), CS: new Map(), HS: new Map() };
    const stageParts     = { GS: [], CS: [], HS: [] };

    for (const p of Object.values(byPart)) {
      const stageData = { GS: {}, CS: {}, HS: {} };

      for (const { name, stage, price, totalQty, peakMonthQty } of Object.values(p.supplierMin)) {
        if (!STAGE_KEYS.includes(stage)) continue;
        stageData[stage][name] = { price, qty: Math.round(totalQty), peakMonthQty: Math.round(peakMonthQty) };
        const existing = stageSuppliers[stage].get(name) || { name, baselineQty: 0, totalCapacity: 0 };
        existing.baselineQty   += Math.round(totalQty);
        existing.totalCapacity += Math.round(peakMonthQty > 0 ? peakMonthQty * 1.25 * 12 : 0);
        stageSuppliers[stage].set(name, existing);
      }

      for (const stage of STAGE_KEYS) {
        const rates = stageData[stage];
        if (Object.keys(rates).length === 0) continue;
        const stageQty = Object.values(rates).reduce((a, b) => a + b.qty, 0);

        // statusQuoAlloc — actual GRN qty per supplier
        const statusQuoAlloc = Object.fromEntries(
          Object.entries(rates).map(([s, v]) => [s, v.qty])
        );

        // maxSavingsAlloc — everything to the cheapest supplier
        const ranked = Object.entries(rates).sort((a, b) => a[1].price - b[1].price);
        const maxSavingsAlloc = Object.fromEntries(ranked.map(([s], i) => [s, i === 0 ? stageQty : 0]));

        // recommendedAlloc — greedy fill cheapest first, respecting annual capacity
        const recommendedAlloc = {};
        let remaining = stageQty;
        for (const [s, v] of ranked) {
          if (remaining <= 0) { recommendedAlloc[s] = 0; continue; }
          const cap  = v.peakMonthQty > 0 ? Math.round(v.peakMonthQty * 1.25 * 12) : Infinity;
          const take = Math.min(remaining, cap);
          recommendedAlloc[s] = take;
          remaining -= take;
        }
        // overflow — give remainder to last supplier
        if (remaining > 0 && ranked.length > 0) {
          const lastSup = ranked[ranked.length - 1][0];
          recommendedAlloc[lastSup] = (recommendedAlloc[lastSup] || 0) + remaining;
        }

        stageParts[stage].push({
          partNo: p.partNo, rmGrade: '', rmForm: 'BAR', stageQty,
          rates:            Object.fromEntries(Object.entries(rates).map(([s, v]) => [s, v.price])),
          statusQuoAlloc,
          recommendedAlloc,
          maxSavingsAlloc,
        });
      }
    }

    // Status-quo spend = actual qty × actual price for every (part, supplier, stage) row
    const sqSpend = rows.reduce((acc, row) => acc + (Number(row.totalQty) || 0) * (Number(row.pricePerPc) || 0), 0);

    const stages = {};
    for (const stage of STAGE_KEYS) {
      stages[stage] = {
        suppliers: [...stageSuppliers[stage].values()],
        parts:     stageParts[stage].sort((a, b) => b.stageQty - a.stageQty),
      };
    }

    res.json({ plant: plantLabel, tolerance, statusQuoSpend: Math.round(sqSpend), stages });
  } catch (e) {
    console.error('[exec/optimizer-board]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── /investigate ──────────────────────────────────────────────────────────────

r.get('/investigate', async (req, res) => {
  const plant      = (String(req.query.plant || 'jsr').toLowerCase() === 'inja') ? 'inja' : 'jsr';
  const plantCode  = plant === 'inja' ? 'INJA' : 'IN48';
  const plantLabel = plant === 'inja' ? 'INJA' : 'JSR';
  const partNo     = String(req.query.part || '').trim();
  if (!partNo) return res.status(400).json({ error: 'Missing ?part=' });

  const safePartNo = partNo.replace(/'/g, "''");

  try {
    // GRN breakdown — always via jsr pool (cross-DB access to JSR_Roller_PM confirmed)
    const grnP = safe(query('jsr', `
      WITH monthly AS (
        SELECT VendorName AS vendor,
               DATEFROMPARTS(YEAR(TRY_CAST(GRDate AS date)), MONTH(TRY_CAST(GRDate AS date)), 1) AS mo,
               SUM(TRY_CAST(ReceivedQty AS float)) AS qty
        FROM JSR_Roller_PM.dbo.GRN
        WHERE Plant = '${plantCode}' AND legacy_part_name = '${safePartNo}'
          AND GRDate >= FORMAT(DATEADD(month,-12,GETDATE()), 'yyyy-MM-dd')
          AND TRY_CAST(ReceivedQty AS float) > 0
        GROUP BY VendorName,
                 DATEFROMPARTS(YEAR(TRY_CAST(GRDate AS date)), MONTH(TRY_CAST(GRDate AS date)), 1)
      )
      SELECT vendor, SUM(qty) AS totalQty, MAX(qty) AS peakMonthQty,
             COUNT(DISTINCT mo) AS monthsActive
      FROM monthly GROUP BY vendor ORDER BY totalQty DESC
    `), []);

    // Price lookup — differs by plant
    const priceP = plant === 'jsr'
      ? safe(query('jsr', `
          SELECT supplier_name,
                 gs_for_jsr, cs_dap_jsr, gs_cs_hs_for_jsr, hs_jw_only,
                 status, CONVERT(varchar(10), computed_at, 120) AS computed_at
          FROM dbo.vw_price_sheet
          WHERE part_no = '${safePartNo}'
            AND status IN ('APPROVED','DRAFT')
          ORDER BY supplier_name, computed_at DESC
        `), [])
      : safe(query('inja', `
          SELECT s.supplier_name, c.cost_per_pc,
                 CONVERT(varchar(10), c.effective_from, 120) AS effective_from
          FROM dbo.ps_rings_inja_cost c
          JOIN dbo.supplier_master s ON s.supplier_id = c.process_owner_supplier_id
          WHERE c.legacy_part_name = '${safePartNo}'
            AND c.Plant = 'INJA' AND c.cost_per_pc > 0
            AND c.ps_rings_inja_template_row_id = 1
          ORDER BY s.supplier_name, c.effective_from DESC
        `), []);

    const [grnRows, priceRows] = await Promise.all([grnP, priceP]);

    if (!priceRows.recordset.length && !grnRows.recordset.length) {
      return res.status(404).json({ error: `Part ${partNo} not found` });
    }

    // Build quotes array
    const quotes = [];
    const nullFields = {
      supplierCode: null, supplierLocation: null, validityStart: null, validityEnd: null,
      rmSource: null, netPrice: null, per: null,
      rmCostPerKg: null, rmCostPerPc: null,
      gsConv: null, csConv: null, hsConv: null,
      gsTotal: null, csTotal: null, hsTotal: null,
      gsPrice: null, csPrice: null, hsPrice: null,
      overhead: null, margin: null, transport: null, insurance: null,
    };

    if (plant === 'jsr') {
      const seen = new Set();
      for (const row of priceRows.recordset) {
        if (seen.has(row.supplier_name)) continue;
        seen.add(row.supplier_name);
        for (const [stage, col] of [['GS', row.gs_for_jsr], ['CS', row.cs_dap_jsr], ['HS', row.gs_cs_hs_for_jsr]]) {
          if (!col || Number(col) <= 0) continue;
          quotes.push({
            id: `${row.supplier_name}_${stage}`,
            supplierName: row.supplier_name,
            quarter: row.computed_at || null,
            stage,
            pricePerPc: Number(col),
            ...nullFields,
          });
        }
      }
    } else {
      const seen = new Set();
      for (const row of priceRows.recordset) {
        if (seen.has(row.supplier_name)) continue;
        seen.add(row.supplier_name);
        quotes.push({
          id: row.supplier_name,
          supplierName: row.supplier_name,
          quarter: row.effective_from || null,
          stage: 'ALL',
          pricePerPc: Number(row.cost_per_pc) || 0,
          ...nullFields,
        });
      }
    }

    if (!quotes.length) {
      return res.status(404).json({ error: `No price data for part ${partNo} in ${plantCode}` });
    }

    res.json({
      plant: plantLabel, plantCode, partNo,
      sapId: null, sapDesc: null,
      heatTreatment: null, manufacturingRoute: null,
      rmForm: 'BAR', rmGrade: null,
      odMm: null, idMm: null, widthMm: null, barDia: null,
      quotes,
      grnByVendor: grnRows.recordset.map(g => ({
        vendor:        g.vendor,
        totalQty:      Math.round(Number(g.totalQty)      || 0),
        peakMonthQty:  Math.round(Number(g.peakMonthQty)  || 0),
        monthsActive:  Number(g.monthsActive) || 0,
      })),
      revisions: [],
    });
  } catch (e) {
    console.error('[exec/investigate]', e);
    res.status(500).json({ error: e.message });
  }
});

export default r;
