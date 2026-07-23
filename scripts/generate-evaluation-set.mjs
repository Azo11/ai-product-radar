import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(projectRoot, "docs", "evaluation", "datasets");

const weights = {
  growth: 0.25,
  virality: 0.2,
  margin: 0.2,
  supply: 0.15,
  logistics: 0.1,
  compliance: 0.1,
};

const products = [
  ["折叠式氛围灯", "家居收纳", 26, 36, 8.4, 5.2, 0.42],
  ["可调节抽屉分隔板", "家居收纳", 16, 26, 5.1, 5.4, 0.63],
  ["真空压缩收纳袋", "家居收纳", 18, 30, 4.8, 4.9, 0.38],
  ["旋转化妆品收纳盒", "家居收纳", 22, 34, 7.2, 5.6, 0.76],
  ["床下折叠收纳箱", "家居收纳", 24, 42, 9.3, 8.8, 1.3],
  ["免打孔浴室置物架", "家居收纳", 20, 32, 6.4, 6.2, 0.71],
  ["桌面数据线整理夹", "家居收纳", 9, 16, 1.6, 2.2, 0.08],
  ["可堆叠鞋盒", "家居收纳", 26, 45, 10.8, 11.2, 1.8],
  ["定量喷油瓶", "厨房小工具", 14, 22, 3.8, 4.6, 0.47],
  ["手压切菜器", "厨房小工具", 22, 34, 7.6, 6.1, 0.82],
  ["硅胶空气炸锅内胆", "厨房小工具", 13, 22, 3.1, 3.6, 0.28],
  ["磁吸调料收纳罐", "厨房小工具", 24, 38, 8.8, 7.4, 1.05],
  ["折叠沥水篮", "厨房小工具", 16, 28, 4.5, 5.5, 0.61],
  ["电动奶泡器", "厨房小工具", 14, 24, 4.2, 3.8, 0.22],
  ["可视化密封储粮罐", "厨房小工具", 25, 42, 9.7, 9.1, 1.6],
  ["不锈钢切片辅助器", "厨房小工具", 11, 19, 2.7, 3.2, 0.19],
  ["宠物蒸汽梳", "宠物用品", 19, 29, 6.2, 4.1, 0.31],
  ["宠物耐咬互动玩具", "宠物用品", 10, 18, 2.5, 2.7, 0.2],
  ["宠物车载安全座椅", "宠物用品", 36, 58, 14.6, 10.2, 1.7],
  ["折叠宠物饮水杯", "宠物用品", 16, 27, 4.1, 3.8, 0.29],
  ["宠物脚掌清洁杯", "宠物用品", 15, 25, 3.9, 4.2, 0.36],
  ["智能逗猫激光球", "宠物用品", 24, 39, 9.2, 4.8, 0.34],
  ["宠物慢食碗", "宠物用品", 13, 24, 3.5, 4.5, 0.48],
  ["宠物除毛滚筒", "宠物用品", 12, 20, 2.8, 3.1, 0.18],
  ["便携化妆刷套装", "美妆工具", 14, 24, 3.4, 2.6, 0.18],
  ["无热卷发带", "美妆工具", 11, 19, 2.3, 2.4, 0.12],
  ["硅胶化妆刷清洁垫", "美妆工具", 9, 16, 1.7, 2.1, 0.09],
  ["便携补光化妆镜", "美妆工具", 22, 36, 8.1, 5.4, 0.58],
  ["可替换睫毛夹", "美妆工具", 10, 18, 2.4, 2.6, 0.11],
  ["多功能美甲打磨笔", "美妆工具", 28, 45, 11.8, 4.7, 0.32],
  ["旅行分装瓶套装", "美妆工具", 12, 21, 2.9, 3.3, 0.24],
  ["头皮按摩梳", "美妆工具", 13, 22, 3.2, 3.1, 0.2],
  ["磁吸露营灯", "户外配件", 28, 48, 11.6, 6.8, 0.58],
  ["便携折叠水袋", "户外配件", 14, 25, 3.6, 4.4, 0.31],
  ["多功能露营挂钩", "户外配件", 12, 20, 2.8, 3.2, 0.22],
  ["充气旅行颈枕", "户外配件", 18, 29, 5.2, 4.8, 0.37],
  ["车载应急破窗器", "户外配件", 17, 30, 4.9, 3.6, 0.25],
  ["户外防水收纳袋", "户外配件", 19, 32, 5.6, 5.2, 0.46],
  ["便携卡式炉挡风板", "户外配件", 21, 36, 7.5, 7.8, 1.08],
  ["太阳能应急充电灯", "户外配件", 32, 52, 13.9, 7.2, 0.74]
];

const scenarioDefinitions = [
  { id: "normal", risk: [], missing: [], confidence: "high" },
  { id: "short_spike", risk: ["短期热度峰值，持续性待验证"], missing: [], confidence: "medium" },
  { id: "missing_compliance", risk: ["合规信息缺失"], missing: ["compliance_document"], confidence: "low" },
  { id: "sparse_supply", risk: ["供应商样本过少"], missing: ["fulfillment_history"], confidence: "low" },
  { id: "wide_price_band", risk: ["竞品价格带离散"], missing: [], confidence: "medium" },
  { id: "conflicting_data", risk: ["趋势与成交信号冲突"], missing: ["signal_consistency"], confidence: "low" },
  { id: "battery_transport", risk: ["电池运输要求待核验"], missing: ["battery_transport_document"], confidence: "medium" },
  { id: "safety_sensitive", risk: ["结构或使用安全需验证"], missing: ["safety_test_report"], confidence: "medium" }
];

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function marginToScore(margin) {
  return clamp((margin - 15) * 2.35);
}

function calculateScore(dimensions) {
  return Math.round(Object.entries(weights).reduce((sum, [key, weight]) => sum + dimensions[key] * weight, 0));
}

function recommendationLevel(score) {
  if (score >= 82) return "优先研究";
  if (score >= 72) return "建议研究";
  return "谨慎研究";
}

const cases = products.map((product, index) => {
  const [name, category, priceLow, originalPriceHigh, procurementCost, shippingCost, weightKg] = product;
  const scenario = scenarioDefinitions[index % scenarioDefinitions.length];
  const priceHigh = scenario.id === "wide_price_band" ? originalPriceHigh * 1.45 : originalPriceHigh;
  const referencePrice = (priceLow + priceHigh) / 2;
  const referenceMargin = ((referencePrice - procurementCost - shippingCost) / referencePrice) * 100;
  const trend30dPct = 8 + ((index * 11) % 57);
  const trendDurationDays = scenario.id === "short_spike" ? 3 : 14 + ((index * 5) % 31);
  const supplierCount = scenario.id === "sparse_supply" ? 2 : 7 + ((index * 9) % 35);
  const growth = clamp(48 + trend30dPct * 0.72 - (scenario.id === "short_spike" ? 18 : 0) - (scenario.id === "conflicting_data" ? 12 : 0));
  const virality = clamp(58 + ((index * 13) % 39) - (scenario.id === "conflicting_data" ? 8 : 0));
  const supply = clamp(55 + supplierCount * 1.15 - (scenario.id === "sparse_supply" ? 18 : 0));
  const logistics = clamp(96 - weightKg * 25 - (scenario.id === "battery_transport" ? 24 : 0));
  const compliance = clamp(90 - (scenario.id === "missing_compliance" ? 38 : 0) - (scenario.id === "safety_sensitive" ? 26 : 0) - (scenario.id === "battery_transport" ? 18 : 0));
  const dimensions = {
    growth,
    virality,
    margin: marginToScore(referenceMargin),
    supply,
    logistics,
    compliance,
  };
  const expectedScore = calculateScore(dimensions);
  const evidence = [
    { id: "E1", field: "trend_30d_pct", value: trend30dPct, source_type: "synthetic_trend_sample" },
    { id: "E2", field: "trend_duration_days", value: trendDurationDays, source_type: "synthetic_trend_sample" },
    { id: "E3", field: "supplier_count", value: supplierCount, source_type: "synthetic_supply_sample" },
    { id: "E4", field: "reference_price_band", value: [priceLow, Number(priceHigh.toFixed(2))], source_type: "synthetic_competitor_sample" },
    { id: "E5", field: "costs", value: { procurement: procurementCost, shipping: shippingCost }, source_type: "synthetic_supply_sample" },
  ];

  return {
    case_id: `C${String(index + 1).padStart(3, "0")}`,
    split: index < 28 ? "calibration" : "holdout",
    evidence_level: "synthetic_demo",
    product: { name, category },
    scenario: scenario.id,
    input: {
      trend_30d_pct: trend30dPct,
      trend_duration_days: trendDurationDays,
      virality_score: virality,
      reference_price_low: priceLow,
      reference_price_high: Number(priceHigh.toFixed(2)),
      procurement_cost: procurementCost,
      shipping_cost: shippingCost,
      weight_kg: weightKg,
      supplier_count: supplierCount,
      missing_fields: scenario.missing,
      dimensions,
      evidence,
    },
    expected: {
      score: expectedScore,
      recommendation_level: recommendationLevel(expectedScore),
      confidence: scenario.confidence,
      must_mention_risks: scenario.risk,
      must_reference_evidence: ["E1", "E3", "E4", "E5"],
      must_not_claim: ["保证热销", "真实销量增长", "已通过合规审核", "供应稳定已验证", "确定毛利率"],
      human_final_decision_required: true,
      label_source: "product_manager_synthetic_rule_v1",
    },
  };
});

const badCases = scenarioDefinitions.slice(1).map((scenario, index) => {
  const source = cases.find((item) => item.scenario === scenario.id);
  return {
    bad_case_id: `BC-${String(index + 1).padStart(3, "0")}`,
    source_case_id: source.case_id,
    scenario: scenario.id,
    failure_to_detect: scenario.risk[0],
    expected_behavior: [
      "保留可追溯的结构化输入",
      "在推荐中披露风险或不确定性",
      "不使用禁止性承诺",
      "将最终判断交给运营人员"
    ],
    regression_status: "not_run",
  };
});

function csvEscape(value) {
  const text = Array.isArray(value) || (value && typeof value === "object") ? JSON.stringify(value) : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

const flatHeaders = [
  "case_id", "split", "category", "product_name", "scenario", "trend_30d_pct", "trend_duration_days",
  "virality_score", "reference_price_low", "reference_price_high", "procurement_cost", "shipping_cost",
  "weight_kg", "supplier_count", "missing_fields", "growth_score", "margin_score", "supply_score",
  "logistics_score", "compliance_score", "expected_score", "expected_level", "expected_confidence",
  "must_mention_risks", "label_source"
];

const flatRows = cases.map((item) => {
  const dimensions = item.input.dimensions;
  return [
    item.case_id, item.split, item.product.category, item.product.name, item.scenario, item.input.trend_30d_pct,
    item.input.trend_duration_days, item.input.virality_score, item.input.reference_price_low,
    item.input.reference_price_high, item.input.procurement_cost, item.input.shipping_cost, item.input.weight_kg,
    item.input.supplier_count, item.input.missing_fields, dimensions.growth, dimensions.margin, dimensions.supply,
    dimensions.logistics, dimensions.compliance, item.expected.score, item.expected.recommendation_level,
    item.expected.confidence, item.expected.must_mention_risks, item.expected.label_source
  ];
});

const reviewHeaders = [
  "case_id", "split", "product_name", "reviewer_id", "reviewer_experience_years", "research_priority",
  "rationale", "risk_disclosure_complete", "evidence_supported", "needs_follow_up", "review_notes"
];
const reviewRows = cases.map((item) => [item.case_id, item.split, item.product.name, "", "", "", "", "", "", "", ""]);

await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "v1-synthetic-eval.jsonl"), `${cases.map((item) => JSON.stringify(item)).join("\n")}\n`);
await writeFile(path.join(outputDir, "v1-synthetic-eval.csv"), `${flatHeaders.map(csvEscape).join(",")}\n${flatRows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`);
await writeFile(path.join(outputDir, "v1-review-template.csv"), `${reviewHeaders.map(csvEscape).join(",")}\n${reviewRows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`);
await writeFile(path.join(outputDir, "v1-bad-cases.jsonl"), `${badCases.map((item) => JSON.stringify(item)).join("\n")}\n`);

console.log(`Generated ${cases.length} evaluation cases (${cases.filter((item) => item.split === "calibration").length} calibration, ${cases.filter((item) => item.split === "holdout").length} holdout).`);
console.log(`Generated ${badCases.length} bad cases.`);
