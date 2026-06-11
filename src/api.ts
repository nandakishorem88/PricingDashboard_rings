export type SupplierTier = {
  tier: 'L1' | 'L2' | 'L3' | string;
  name: string;
  price: number;
  actualQty: number;
  actualSharePct: number;
  annualCapacity: number;
  peakMonthQty: number;
};

export type PartRow = {
  partNo: string;
  rmGrade: string;
  totalQty: number;
  suppliers: SupplierTier[];
  l1Share: number;
  l1OptimalShare: number;
  leakage: number;
  spreadPct: number;
};

export type TopAction = {
  partNo: string;
  rmGrade: string;
  stage?: 'GS' | 'HS' | 'CS' | string;
  fromSupplier: string;
  toSupplier: string;
  moveQty: number;
  saving: number;
  totalQty: number;
};

export type Anomaly = {
  rule: 'spread' | 'outlier' | 'revision' | string;
  partNo: string;
  rmGrade: string;
  headline: string;
  detail: string;
  severity: 'high' | 'medium' | string;
  sortKey?: number;
};

export type PlantKey = 'jsr' | 'inja';

export type Summary = {
  asOf: string;
  plant: PlantKey;
  plantLabel: string;
  hero: {
    partsInScope: number;
    totalQty: number;
    l1ShareToday: number;
    l1OptimalShare: number;
    currentCost: number;
    optimalCost: number;
    leakage: number;
    max100PctSaving: number;
    totalPriced?: number;
    activeSourced?: number;
  };
  topActions: TopAction[];
  scenarios: Array<{ pct: number; saving: number }>;
  parts: PartRow[];
  anomalies: Anomaly[];
};

export async function fetchSummary(plant: PlantKey = 'jsr'): Promise<Summary> {
  const r = await fetch(`/api/exec/summary?plant=${plant}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

// ── Price winner ───────────────────────────────────────────────────────────
export type Stage = 'gs' | 'cs' | 'hs';

export type PriceCell = {
  rates: { gs: number | null; cs: number | null; hs: number | null };
  pricePerPc?: number;
  qty: number | null;
  peakMonthQty?: number;
  deliveredStage?: 'GS' | 'HS' | 'CS';
};

export type PriceWinnerPart = {
  partNo: string;
  rmGrade: string;
  heatTreatment?: string;
  rmForm: 'WIRE' | 'BAR' | string;
  totalQty: number | null;
  prices: Record<string, PriceCell>;
};

export type PriceWinnerPlant = {
  plant: string;
  hasVolume: boolean;
  suppliers: string[];
  supplierNames?: Record<string, string>;
  parts: PriceWinnerPart[];
};

export type PriceWinnerResponse = {
  jsr: PriceWinnerPlant;
  inja: PriceWinnerPlant;
};

export async function fetchPriceWinner(): Promise<PriceWinnerResponse> {
  const r = await fetch('/api/exec/price-winner');
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

// ── Sourcing Optimizer ─────────────────────────────────────────────────────
export type OptimizerSupplierComparison = {
  supplier: string;
  currentQty: number;
  currentSpend: number;
  vpQty: number;
  vpDeltaPct: number;
  msQty: number;
  msDeltaPct: number;
};
export type OptimizerShift = {
  partNo: string;
  stage: 'GS' | 'HS' | 'CS' | string;
  fromSupplier: string;
  fromRate: number;
  toSupplier: string;
  toRate: number;
  moveQty: number;
  savings: number;
};
export type OptimizerResponse = {
  plant: string;
  tolerance: number;
  partsCount: number;
  scenarios: {
    statusQuo:        { totalCost: number };
    volumePreserving: { totalCost: number; savings: number; savingsPct: number; overflow: number };
    maxSavings:       { totalCost: number; savings: number; savingsPct: number };
  };
  sensitivity: Array<{ tolerance: number; totalCost: number; savings: number; savingsPct: number }>;
  supplierComparison: OptimizerSupplierComparison[];
  recommendedShifts: OptimizerShift[];
};

export async function fetchOptimizer(plant: PlantKey, tolerance: number): Promise<OptimizerResponse> {
  const r = await fetch(`/api/exec/optimizer?plant=${plant}&tolerance=${tolerance}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

// ── Optimizer board (interactive Kanban) ───────────────────────────────────
export type BoardSupplier = {
  name: string;
  baselineQty: number;
  totalCapacity: number;
  baselineSpend: number;  // actual GRN invoice spend (RM + conversion)
};
export type BoardPart = {
  partNo: string;
  rmGrade: string;
  rmForm: string;
  stageQty: number;
  rates: Record<string, number>;
  statusQuoAlloc: Record<string, number>;
  actualAmountBySup: Record<string, number>;  // actual GRN invoice spend per supplier
  recommendedAlloc: Record<string, number>;
  maxSavingsAlloc: Record<string, number>;
};
export type BoardStage = {
  suppliers: BoardSupplier[];
  parts: BoardPart[];
};
export type BoardResponse = {
  plant: string;
  tolerance: number;
  statusQuoSpend: number;
  stages: Partial<Record<'GS' | 'HS', BoardStage>>;
};

export async function fetchBoard(plant: PlantKey, tolerance: number = 20): Promise<BoardResponse> {
  const r = await fetch(`/api/exec/optimizer-board?plant=${plant}&tolerance=${tolerance}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

// ── Investigate (anomaly drill-down) ────────────────────────────────────────
export type InvestigateQuote = {
  id: number | string;
  supplierName: string;
  supplierLocation?: string;
  quarter?: string;
  rmSource?: string;
  stage: 'GS' | 'HS' | 'CS' | string;
  pricePerPc: number;
  rmCostPerKg?: number;
  rmCostPerPc?: number;
  gsPrice?: number;
  csPrice?: number;
  hsPrice?: number;
  gsConv?: number;
  csConv?: number;
  hsConv?: number;
  gsTotal?: number;
  csTotal?: number;
  hsTotal?: number;
  overhead?: number;
  margin?: number;
  transport?: number;
  insurance?: number;
  finishWtKg?: number;
};

export type InvestigateGrn = {
  vendor: string;
  totalQty: number;
  peakMonthQty: number;
  monthsActive: number;
};

export type InvestigateRevision = {
  oldPrice: number;
  newPrice: number;
  at: string;
  supplier?: string | null;
  quarter?: string | null;
  label?: string | null;
};

export type InvestigateResponse = {
  plant: string;
  plantCode: string;
  partNo: string;
  sapId: string | null;
  heatTreatment?: string;
  rmGrade?: string;
  finishWtKg?: number;
  odMm?: number;
  idMm?: number;
  widthMm?: number;
  quotes: InvestigateQuote[];
  grnByVendor: InvestigateGrn[];
  revisions: InvestigateRevision[];
};

export async function fetchInvestigation(plant: PlantKey, partNo: string): Promise<InvestigateResponse> {
  const r = await fetch(`/api/exec/investigate?plant=${plant}&part=${encodeURIComponent(partNo)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

// ── GRN Benchmark ──────────────────────────────────────────────────────────────
export type BenchmarkSupplier = {
  vendorId: string;
  vendor: string;
  totalQty: number;
  totalAmount: number;
  effectiveRate: number;
  isLowest: boolean;
  savingsPotential: number;
};

export type BenchmarkPart = {
  partNo: string;
  stage: string;
  supplierCount: number;
  minRate: number;
  maxRate: number;
  spreadPct: number;
  partTotalQty: number;
  partTotalAmount: number;
  totalSavingsPotential: number;
  suppliers: BenchmarkSupplier[];
};

export type BenchmarkResponse = {
  plant: string;
  generatedAt: string;
  summary: {
    partsWithAlternatives: number;
    totalSavingsPotential: number;
    suppliersCompared: number;
    avgSpreadPct: number;
  };
  parts: BenchmarkPart[];
};

export async function fetchGrnBenchmark(plant: PlantKey): Promise<BenchmarkResponse> {
  const r = await fetch(`/api/exec/grn-benchmark?plant=${plant}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}
