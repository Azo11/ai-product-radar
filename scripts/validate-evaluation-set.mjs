import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const datasetDir = path.join(projectRoot, "docs", "evaluation", "datasets");
const feishuDir = path.join(projectRoot, "docs", "feishu");

const weights = {
  growth: 0.25,
  virality: 0.2,
  margin: 0.2,
  supply: 0.15,
  logistics: 0.1,
  compliance: 0.1,
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function countBy(items, getter) {
  return items.reduce((counts, item) => {
    const key = getter(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function calculateScore(dimensions) {
  return Math.round(Object.entries(weights).reduce((sum, [key, weight]) => sum + dimensions[key] * weight, 0));
}

const datasetText = await readFile(path.join(datasetDir, "v1-synthetic-eval.jsonl"), "utf8");
const cases = datasetText.trim().split("\n").map((line) => JSON.parse(line));
const badCaseText = await readFile(path.join(datasetDir, "v1-bad-cases.jsonl"), "utf8");
const badCases = badCaseText.trim().split("\n").map((line) => JSON.parse(line));
const reviewRows = (await readFile(path.join(datasetDir, "v1-review-template.csv"), "utf8")).trim().split("\n");
const feishuManifest = JSON.parse(await readFile(path.join(feishuDir, "mock-feishu-assets.json"), "utf8"));

assert(cases.length === 40, `Expected 40 cases, received ${cases.length}`);
assert(new Set(cases.map((item) => item.case_id)).size === 40, "case_id values must be unique");
assert(Number((Object.values(weights).reduce((sum, value) => sum + value, 0)).toFixed(6)) === 1, "Weights must sum to 1");

const splitCounts = countBy(cases, (item) => item.split);
assert(splitCounts.calibration === 28, `Expected 28 calibration cases, received ${splitCounts.calibration ?? 0}`);
assert(splitCounts.holdout === 12, `Expected 12 holdout cases, received ${splitCounts.holdout ?? 0}`);

const categoryCounts = countBy(cases, (item) => item.product.category);
assert(Object.keys(categoryCounts).length === 5, "Expected five product categories");
for (const [category, count] of Object.entries(categoryCounts)) {
  assert(count === 8, `Expected 8 cases for ${category}, received ${count}`);
}

const validLevels = new Set(["优先研究", "建议研究", "谨慎研究"]);
let reproducibleScores = 0;
for (const item of cases) {
  assert(item.evidence_level === "synthetic_demo", `${item.case_id}: invalid evidence level`);
  assert(item.expected.label_source === "product_manager_synthetic_rule_v1", `${item.case_id}: invalid label source`);
  assert(item.expected.human_final_decision_required === true, `${item.case_id}: human decision boundary missing`);
  assert(validLevels.has(item.expected.recommendation_level), `${item.case_id}: invalid recommendation level`);
  assert(item.input.reference_price_low < item.input.reference_price_high, `${item.case_id}: invalid reference price band`);
  assert(item.input.procurement_cost >= 0 && item.input.shipping_cost >= 0, `${item.case_id}: invalid costs`);
  assert(item.input.evidence.length >= 5, `${item.case_id}: insufficient evidence records`);
  assert(item.expected.must_not_claim.length >= 5, `${item.case_id}: prohibited claims are incomplete`);
  for (const value of Object.values(item.input.dimensions)) {
    assert(Number.isFinite(value) && value >= 0 && value <= 100, `${item.case_id}: dimension score out of range`);
  }
  if (calculateScore(item.input.dimensions) === item.expected.score) reproducibleScores += 1;
}
assert(reproducibleScores === 40, `Only ${reproducibleScores}/40 scores are reproducible`);

const labelCounts = countBy(cases, (item) => item.expected.recommendation_level);
for (const level of validLevels) assert((labelCounts[level] ?? 0) > 0, `No cases found for ${level}`);

assert(badCases.length === 7, `Expected 7 bad cases, received ${badCases.length}`);
for (const badCase of badCases) {
  assert(cases.some((item) => item.case_id === badCase.source_case_id), `${badCase.bad_case_id}: source case missing`);
  assert(badCase.regression_status === "not_run", `${badCase.bad_case_id}: synthetic regression status must remain not_run`);
}

assert(reviewRows.length === 41, `Expected review CSV header plus 40 cases, received ${reviewRows.length} rows`);
assert(feishuManifest.integration_status === "not_connected", "Feishu manifest must not claim a real connection");
assert(feishuManifest.assets.length === 5, `Expected 5 Feishu assets, received ${feishuManifest.assets.length}`);
for (const asset of feishuManifest.assets) {
  assert(asset.document_id === null, `${asset.asset_id}: Mock asset must not contain a real document_id`);
  await access(path.join(feishuDir, asset.source_file));
}

console.log("Evaluation asset validation passed.");
console.log(`- Cases: ${cases.length} (${splitCounts.calibration} calibration, ${splitCounts.holdout} holdout)`);
console.log(`- Categories: ${Object.entries(categoryCounts).map(([name, count]) => `${name} ${count}`).join("; ")}`);
console.log(`- Labels: ${Object.entries(labelCounts).map(([name, count]) => `${name} ${count}`).join("; ")}`);
console.log(`- Reproducible scores: ${reproducibleScores}/${cases.length}`);
console.log(`- Bad cases: ${badCases.length}`);
console.log(`- Feishu Mock assets: ${feishuManifest.assets.length}`);
