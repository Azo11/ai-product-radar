# V1 测评资产使用说明

> 证据等级：合成测评资产。当前没有真实经营数据、真实模型运行结果或运营专家标签。

## 文件清单

| 文件 | 数量 | 用途 |
| --- | ---: | --- |
| `datasets/v1-synthetic-eval.jsonl` | 40 | 完整机器可读测评集，保留结构化证据和期望输出 |
| `datasets/v1-synthetic-eval.csv` | 40 | 便于飞书多维表格、Excel 或人工检查 |
| `datasets/v1-review-template.csv` | 40 | 后续运营专家独立标注模板，评审字段当前为空 |
| `datasets/v1-bad-cases.jsonl` | 7 | 回归测试用 Bad Case 清单 |
| `simulated-evaluation-v0.md` | 1 | 测评方法、指标和证据边界 |

## 数据划分

- 校准集：C001–C028，共 28 条。用于讨论权重、阈值、提示词和风险披露规则。
- 留出集：C029–C040，共 12 条。校准期间不应查看期望结果，最终方法演示时使用。
- Bad Case：BC-001–BC-007，覆盖短期峰值、合规缺失、供应稀疏、价格带离散、数据冲突、电池运输和安全敏感。

## 核心字段

| 路径 | 说明 |
| --- | --- |
| `case_id` | 稳定案例编号 |
| `split` | `calibration` 或 `holdout` |
| `evidence_level` | 固定为 `synthetic_demo` |
| `input.dimensions` | 六维结构化分数 |
| `input.evidence` | 可供解释引用的证据编号与字段 |
| `expected.score` | 按临时权重计算的可复算总分 |
| `expected.recommendation_level` | 优先研究、建议研究或谨慎研究 |
| `expected.must_mention_risks` | 推荐中必须披露的风险 |
| `expected.must_not_claim` | 输出中禁止出现的无依据承诺 |
| `expected.confidence` | 证据完整度对应的参考置信度 |
| `expected.label_source` | 固定为产品经理合成规则，不冒充专家标签 |

## 使用流程

1. 运行 `npm run eval:generate`，可从固定生成规则重建数据文件。
2. 运行 `npm run eval:validate`，检查数量、划分、字段、分数复算和飞书 Mock 资产。
3. 在校准集上讨论权重和输出规范，记录每次版本变更。
4. 锁定规则后再运行留出集，不能根据留出集结果反向改标签。
5. 获得真实运营专家后，将 `v1-review-template.csv` 分别交给至少两名评审者独立填写。
6. 真实模型接入后，另存实际输出、模型版本、提示词版本和运行日志，再计算一致率与风险披露率。

## 当前可以证明什么

- 数据文件数量和划分符合方案。
- 六维分数与总分能够按固定权重复算。
- 每个案例都包含证据引用、风险要求和禁止承诺。
- 飞书 Mock 资产未包含真实 `document_id`，不会冒充真实写入。

## 当前不能证明什么

- 模型推荐与运营专家判断一致。
- Dify、Hermes 或模型已真实运行这 40 个案例。
- 推荐能提升销量、利润、转化率或选品效率。
- 临时权重适用于真实 TikTok Shop 经营环境。
