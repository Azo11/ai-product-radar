import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  ArrowDownUp,
  BarChart3,
  Bookmark,
  BookmarkCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Download,
  FileText,
  FolderHeart,
  GitCompareArrows,
  Info,
  LoaderCircle,
  PackageSearch,
  Play,
  RotateCcw,
  Search,
  ShieldAlert,
  TrendingUp,
  X,
} from "lucide-react";
import { categories, dimensionLabels, products, type DimensionKey, type Product } from "./data/products";
import { calculateMargin, calculateScore, getRecommendationLevel, marginToScore } from "./lib/scoring";
import "./styles.css";

type Scenario = "success" | "missing" | "hermes-error" | "feishu-error";
type RunStatus = "idle" | "running" | "completed" | "failed";

const workflow = [
  { label: "读取趋势样本", tool: "Hermes 执行层" },
  { label: "校验商品字段", tool: "规则引擎" },
  { label: "计算六维评分", tool: "规则引擎" },
  { label: "生成推荐解释", tool: "Dify / LLM" },
];

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  let line = "";
  for (const character of text) {
    const candidate = line + character;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = character;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function createReportPdf(items: Product[]) {
  const { jsPDF } = await import("jspdf");
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = 1754;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");

  context.fillStyle = "#f8f9fb";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#142033";
  context.font = '700 52px "PingFang SC", "Microsoft YaHei", sans-serif';
  context.fillText("AI 选品对比报告", 88, 120);
  context.font = '24px "PingFang SC", "Microsoft YaHei", sans-serif';
  context.fillStyle = "#536176";
  context.fillText(`生成日期：${new Date().toLocaleDateString("zh-CN")}`, 88, 170);
  context.fillText("报告基于演示数据，结论用于辅助运营人员进一步研究。", 88, 212);

  const ranked = items.slice().sort((a, b) => calculateScore(b) - calculateScore(a));
  context.fillStyle = "#145ec7";
  context.fillRect(88, 260, 1064, 108);
  context.fillStyle = "#ffffff";
  context.font = '700 30px "PingFang SC", "Microsoft YaHei", sans-serif';
  context.fillText(`建议优先研究：${ranked[0]?.name ?? "-"}`, 120, 326);

  let y = 440;
  ranked.forEach((product, index) => {
    context.fillStyle = "#e1e6ee";
    context.fillRect(88, y - 26, 1064, 2);
    context.fillStyle = "#145ec7";
    context.font = '700 28px "PingFang SC", "Microsoft YaHei", sans-serif';
    context.fillText(`${String(index + 1).padStart(2, "0")}  ${product.name}`, 88, y + 18);
    context.fillStyle = "#142033";
    context.font = '700 26px "PingFang SC", "Microsoft YaHei", sans-serif';
    context.fillText(`${calculateScore(product)} 分`, 1030, y + 18);
    context.fillStyle = "#536176";
    context.font = '23px "PingFang SC", "Microsoft YaHei", sans-serif';
    context.fillText(`采购成本 ${formatMoney(product.cost)} · 竞品参考价 ${formatMoney(product.referencePriceLow)}-${formatMoney(product.referencePriceHigh)}`, 88, y + 66);
    const lines = wrapCanvasText(context, product.recommendation, 1020).slice(0, 3);
    lines.forEach((line, lineIndex) => context.fillText(line, 88, y + 112 + lineIndex * 38));
    y += 270;
  });

  context.fillStyle = "#536176";
  context.font = '22px "PingFang SC", "Microsoft YaHei", sans-serif';
  context.fillText("AI 选品雷达 v1.0.0 · AI 提供参考意见，最终决策由运营人员作出", 88, 1660);

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, 297);
  return pdf.output("blob");
}

function ScoreRing({ score, size = "normal" }: { score: number; size?: "normal" | "small" }) {
  return (
    <span className={`score-ring score-ring--${size}`} aria-label={`潜力评分 ${score} 分`}>
      <strong>{score}</strong>
      <small>/100</small>
    </span>
  );
}

function StatusBadge({ tone, children }: { tone: "accent" | "positive" | "warning" | "neutral"; children: React.ReactNode }) {
  return <span className={`status status--${tone}`}>{children}</span>;
}

function App() {
  const [category, setCategory] = useState("全部类目");
  const [taskCategory, setTaskCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [maxCost, setMaxCost] = useState("");
  const [maxWeight, setMaxWeight] = useState("");
  const [scenario, setScenario] = useState<Scenario>("success");
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [activeStep, setActiveStep] = useState(-1);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"score" | "growth" | "margin">("score");
  const [saved, setSaved] = useState<string[]>(() => JSON.parse(localStorage.getItem("radar:saved") || "[]"));
  const [savedOnly, setSavedOnly] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [priceDraft, setPriceDraft] = useState(0);
  const [costDraft, setCostDraft] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [pdfState, setPdfState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [pdfUrl, setPdfUrl] = useState("");
  const [publishState, setPublishState] = useState<"idle" | "loading" | "saved" | "failed">("idle");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const detailDialog = useRef<HTMLDialogElement>(null);
  const reportDialog = useRef<HTMLDialogElement>(null);
  const paletteDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => localStorage.setItem("radar:saved", JSON.stringify(saved)), [saved]);

  useEffect(() => {
    if (!selected) return;
    setPriceDraft(selected.salePrice);
    setCostDraft(selected.cost);
    detailDialog.current?.showModal();
  }, [selected]);

  useEffect(() => {
    if (reportOpen) reportDialog.current?.showModal();
  }, [reportOpen]);

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        paletteDialog.current?.showModal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    return products
      .filter((product) => category === "全部类目" || product.category.includes(category) || product.name.includes(category))
      .filter((product) => !savedOnly || saved.includes(product.id))
      .filter((product) => !query || product.name.includes(query) || product.category.includes(query))
      .filter((product) => !maxCost || product.cost <= Number(maxCost))
      .filter((product) => !maxWeight || product.weight <= Number(maxWeight))
      .sort((a, b) => {
        if (sort === "growth") return b.trendValue - a.trendValue;
        if (sort === "margin") return calculateMargin(b.salePrice, b.cost, b.shipping) - calculateMargin(a.salePrice, a.cost, a.shipping);
        return calculateScore(b) - calculateScore(a);
      });
  }, [category, maxCost, maxWeight, query, saved, savedOnly, sort]);

  const comparedProducts = products.filter((product) => compare.includes(product.id));

  function runAnalysis(event: React.FormEvent) {
    event.preventDefault();
    const requestedCategory = taskCategory === "__custom__" ? customCategory.trim() : taskCategory;
    if (!requestedCategory) return;
    setRunStatus("running");
    setActiveStep(0);
    setCategory(requestedCategory);
    setSavedOnly(false);
    let step = 0;
    const timer = window.setInterval(() => {
      step += 1;
      if (scenario === "hermes-error" && step === 1) {
        window.clearInterval(timer);
        setRunStatus("failed");
        return;
      }
      if (step >= workflow.length) {
        window.clearInterval(timer);
        setRunStatus("completed");
        setActiveStep(workflow.length);
        document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      setActiveStep(step);
    }, 520);
  }

  function toggleSaved(id: string) {
    setSaved((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleCompare(id: string) {
    setCompare((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 4) return current;
      return [...current, id];
    });
  }

  function publishReport() {
    setPublishState("loading");
    window.setTimeout(() => setPublishState(scenario === "feishu-error" ? "failed" : "saved"), 720);
  }

  function openSavedProducts() {
    setSavedOnly(true);
    setCategory("全部类目");
    setQuery("");
    document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openReport() {
    setReportOpen(true);
    setPdfState("loading");
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl("");
    void createReportPdf(comparedProducts).then((blob) => {
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      setPdfState("ready");
      const link = document.createElement("a");
      link.href = url;
      link.download = `AI选品报告-${new Date().toISOString().slice(0, 10)}.pdf`;
      link.click();
    }).catch(() => setPdfState("failed"));
  }

  function closeDetail() {
    detailDialog.current?.close();
    setSelected(null);
  }

  function closeReport() {
    reportDialog.current?.close();
    setReportOpen(false);
    setPublishState("idle");
  }

  const paletteItems = [
    { label: "创建选品任务", hint: "开始新的类目分析", action: () => document.getElementById("task-form")?.scrollIntoView() },
    { label: "查看候选商品", hint: `${results.length} 个符合当前条件`, action: () => document.getElementById("results")?.scrollIntoView() },
    { label: "查看我的收藏", hint: `${saved.length} 个已收藏商品`, action: openSavedProducts },
    { label: "打开商品对比", hint: `${compare.length} 个商品已选择`, action: () => document.getElementById("compare")?.scrollIntoView() },
  ].filter((item) => item.label.includes(paletteQuery) || item.hint.includes(paletteQuery));

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="AI 选品雷达首页">
          <span className="brand__mark"><PackageSearch size={20} /></span>
          <span>AI 选品雷达</span>
        </a>
        <button className="search-trigger" onClick={() => { setPaletteOpen(true); paletteDialog.current?.showModal(); }}>
          <Search size={17} />
          <span>搜索任务或商品</span>
          <kbd>⌘ K</kbd>
        </button>
        <div className="topbar__meta">
          <StatusBadge tone="neutral">TikTok Shop · 美国站</StatusBadge>
          <button className="saved-trigger" onClick={openSavedProducts}><FolderHeart size={17} /><span>收藏</span><b>{saved.length}</b></button>
        </div>
      </header>

      <main id="top">
        <section className="intro-band">
          <h1>AI 选品助手，帮你从市场趋势中发现值得研究的潜力商品。</h1>
          <p>聚合趋势、竞品与供应链信息，生成六维分析和风险建议，支持筛选、收藏、对比与报告输出。</p>
        </section>

        <section className="workspace" aria-label="选品任务工作台">
          <form className="task-form" id="task-form" onSubmit={runAnalysis}>
            <div className="section-heading">
              <div>
                <h2>创建选品任务</h2>
                <p>类目必选，其余条件用于收窄候选范围。</p>
              </div>
              <StatusBadge tone="accent">v1.0.0</StatusBadge>
            </div>

            <label className="field">
              <span>目标类目 <b>必选</b></span>
              <select value={taskCategory} onChange={(event) => setTaskCategory(event.target.value)} required aria-required="true">
                <option value="">选择类目</option>
                {categories.slice(1).map((item) => <option key={item}>{item}</option>)}
                <option value="__custom__">自定义类目</option>
              </select>
              <small>类目由运营人员定义，Hermes 按该关键词采集并归类数据。</small>
            </label>

            {taskCategory === "__custom__" && <label className="field"><span>自定义类目 <b>必选</b></span><input value={customCategory} onChange={(event) => setCustomCategory(event.target.value)} placeholder="例如：宠物清洁工具" required /><small>输入商品用途或行业常用类目名称。</small></label>}

            <div className="field-pair">
              <label className="field">
                <span>最高采购成本</span>
                <div className="input-prefix"><span>$</span><input type="number" min="0" step="0.1" value={maxCost} onChange={(event) => setMaxCost(event.target.value)} placeholder="不限" /></div>
                <small>按可接受的单件采购成本筛选。</small>
              </label>
              <label className="field">
                <span>最大商品重量</span>
                <div className="input-suffix"><input type="number" min="0" step="0.1" value={maxWeight} onChange={(event) => setMaxWeight(event.target.value)} placeholder="不限" /><span>kg</span></div>
                <small>留空则不限制物流重量。</small>
              </label>
            </div>

            <label className="field">
              <span>运行场景</span>
              <select value={scenario} onChange={(event) => setScenario(event.target.value as Scenario)}>
                <option value="success">正常流程</option>
                <option value="missing">字段缺失降级</option>
                <option value="hermes-error">Hermes 读取失败</option>
                <option value="feishu-error">飞书保存失败</option>
              </select>
              <small>用于演示未来真实系统中的 Bad Case。</small>
            </label>

            <button className="button button--primary" type="submit" disabled={!taskCategory || (taskCategory === "__custom__" && !customCategory.trim()) || runStatus === "running"} data-state={runStatus === "running" ? "loading" : undefined}>
              {runStatus === "running" ? <><LoaderCircle className="spin" size={18} />分析中</> : <><Play size={18} />开始分析</>}
            </button>
          </form>

          <section className="run-panel" aria-live="polite">
            <div className="section-heading">
              <div>
                <h2>执行轨迹</h2>
              </div>
              <StatusBadge tone={runStatus === "failed" ? "warning" : runStatus === "completed" ? "positive" : "neutral"}>
                {runStatus === "idle" && "等待任务"}
                {runStatus === "running" && "运行中"}
                {runStatus === "completed" && "已完成"}
                {runStatus === "failed" && "已中断"}
              </StatusBadge>
            </div>

            <ol className="workflow-list">
              {workflow.map((step, index) => {
                const done = activeStep > index;
                const active = activeStep === index && runStatus === "running";
                const failed = runStatus === "failed" && index === 0;
                return (
                  <li key={step.label} className={done ? "is-done" : active ? "is-active" : failed ? "is-failed" : ""}>
                    <span className="workflow-list__icon">
                      {done ? <Check size={16} /> : failed ? <X size={16} /> : active ? <LoaderCircle className="spin" size={16} /> : <Clock3 size={16} />}
                    </span>
                    <span><strong>{step.label}</strong><small>{step.tool}</small></span>
                    <span className="workflow-list__state">{done ? "完成" : active ? "执行中" : failed ? "读取失败" : "等待"}</span>
                  </li>
                );
              })}
            </ol>

            {scenario === "missing" && runStatus === "completed" && (
              <div className="inline-alert inline-alert--warning"><AlertTriangle size={18} /><span><strong>有限结果</strong> 2 个商品缺少完整合规字段，相关评分已降低置信度。</span></div>
            )}
            {runStatus === "failed" && (
              <div className="inline-alert inline-alert--error"><ShieldAlert size={18} /><span><strong>趋势样本读取失败。</strong> Hermes 未返回数据，请重试任务。</span><button className="text-button" onClick={() => setRunStatus("idle")}>重置</button></div>
            )}
          </section>
        </section>

        <section className="results" id="results">
          <div className="results__top">
            <div>
              <h2>{savedOnly ? "我的收藏" : "候选商品"}</h2>
              <p>{savedOnly ? `已收藏 ${saved.length} 个商品，取消收藏后会从列表移除。` : `${results.length} 个商品符合当前条件。竞品信息仅作参考，不单独计分。`}</p>
              {savedOnly && <button className="text-button results-back" onClick={() => setSavedOnly(false)}><PackageSearch size={17} />查看全部商品</button>}
            </div>
            <div className="results__tools">
              <label className="compact-search"><Search size={17} /><span className="sr-only">搜索候选商品</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索商品" /></label>
              <label className="compact-select"><ArrowDownUp size={17} /><span className="sr-only">排序方式</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="score">潜力评分</option><option value="growth">增长速度</option><option value="margin">参考利润空间</option></select></label>
            </div>
          </div>

          {results.length ? (
            <div className="product-grid">
              {results.map((product) => {
                const score = calculateScore(product);
                const isSaved = saved.includes(product.id);
                const isCompared = compare.includes(product.id);
                return (
                  <article className="product-card" key={product.id}>
                    <button className="product-card__media" onClick={() => setSelected(product)} aria-label={`查看 ${product.name} 详情`}>
                      <img src={product.image} alt={`${product.name}示意图，合成案例素材`} width="900" height="900" loading="lazy" />
                      <span>模拟素材</span>
                    </button>
                    <div className="product-card__body">
                      <div className="product-card__title">
                        <div><small>{product.category}</small><h3>{product.name}</h3></div>
                        <ScoreRing score={score} size="small" />
                      </div>
                      <div className="product-card__metrics">
                        <span><TrendingUp size={16} />+{product.trendValue}%</span>
                        <span><CircleDollarSign size={16} />采购 {formatMoney(product.cost)}</span>
                        <span><PackageSearch size={16} />{product.weight} kg</span>
                      </div>
                      <p>{product.recommendation}</p>
                      <div className="risk-row">{product.risks.slice(0, 2).map((risk) => <StatusBadge key={risk} tone="warning">{risk}</StatusBadge>)}</div>
                    </div>
                    <div className="product-card__actions">
                      <button className="button button--quiet" onClick={() => toggleSaved(product.id)} aria-pressed={isSaved}>{isSaved ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}{isSaved ? "已收藏" : "收藏"}</button>
                      <button className="button button--quiet" onClick={() => toggleCompare(product.id)} aria-pressed={isCompared} disabled={!isCompared && compare.length >= 4}><GitCompareArrows size={17} />{isCompared ? "已选择" : "对比"}</button>
                      <button className="icon-button" onClick={() => setSelected(product)} aria-label={`打开 ${product.name} 详情`}><ChevronRight size={19} /></button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state"><PackageSearch size={28} /><h3>{savedOnly ? "还没有收藏商品" : "当前条件下没有候选商品"}</h3><p>{savedOnly ? "在候选商品中点击收藏，即可在这里集中查看。" : "提高采购成本上限、取消重量限制或更换类目后重新查看。"}</p><button className="button button--secondary" onClick={() => { setSavedOnly(false); setMaxCost(""); setMaxWeight(""); }}>{savedOnly ? "查看全部商品" : "放宽条件"}</button></div>
          )}
        </section>

        <section className="compare-section" id="compare">
          <div className="section-heading">
            <div><h2>商品对比</h2><p>选择 2–4 个商品，横向检查机会与风险。</p></div>
            <StatusBadge tone="neutral">{compare.length}/4</StatusBadge>
          </div>
          {comparedProducts.length >= 2 ? (
            <div className="compare-table-wrap">
              <table className="compare-table">
                <thead><tr><th>判断项</th>{comparedProducts.map((product) => <th key={product.id}>{product.name}</th>)}</tr></thead>
                <tbody>
                  <tr><th>潜力评分</th>{comparedProducts.map((product) => <td key={product.id}><strong>{calculateScore(product)}</strong> · {getRecommendationLevel(calculateScore(product))}</td>)}</tr>
                  <tr><th>参考利润率</th>{comparedProducts.map((product) => <td key={product.id}>{calculateMargin(product.salePrice, product.cost, product.shipping).toFixed(1)}%</td>)}</tr>
                  <tr><th>需求增长</th>{comparedProducts.map((product) => <td key={product.id}>{product.dimensions.growth}/100</td>)}</tr>
                  <tr><th>传播潜力</th>{comparedProducts.map((product) => <td key={product.id}>{product.dimensions.virality}/100</td>)}</tr>
                  <tr><th>主要风险</th>{comparedProducts.map((product) => <td key={product.id}>{product.risks[0]}</td>)}</tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="compare-empty"><GitCompareArrows size={24} /><span>再选择 {Math.max(0, 2 - compare.length)} 个商品即可开始对比。</span></div>
          )}
          <div className="compare-actions">
            <button className="button button--secondary" onClick={() => setCompare([])} disabled={!compare.length}><RotateCcw size={17} />清空选择</button>
            <button className="button button--primary" onClick={openReport} disabled={comparedProducts.length < 2}><FileText size={17} />生成报告</button>
          </div>
        </section>
      </main>

      <footer className="footer"><span>AI 选品雷达 · v1.0.0</span><span>AI 提供参考意见，最终决策由运营人员作出</span></footer>

      <dialog className="dialog detail-dialog" ref={detailDialog} onClose={() => setSelected(null)}>
        {selected && (
          <div>
            <div className="dialog__header">
              <div><StatusBadge tone="warning">模拟数据</StatusBadge><h2>{selected.name}</h2><p>{selected.category} · TikTok Shop 美国站</p></div>
              <button className="icon-button" onClick={closeDetail} aria-label="关闭商品详情"><X /></button>
            </div>
            <div className="detail-hero">
              <img src={selected.image} alt={`${selected.name}示意图`} width="900" height="900" />
              <div>
                <ScoreRing score={calculateScore(selected, priceDraft, costDraft)} />
                <StatusBadge tone="accent">{getRecommendationLevel(calculateScore(selected, priceDraft, costDraft))}</StatusBadge>
                <p>{selected.recommendation}</p>
              </div>
            </div>
            <section className="detail-section"><h3>六维评分</h3><div className="dimension-list">{(Object.keys(dimensionLabels) as DimensionKey[]).map((key) => { const value = key === "margin" ? marginToScore(calculateMargin(priceDraft, costDraft, selected.shipping)) : selected.dimensions[key]; return <div key={key}><span>{dimensionLabels[key]}</span><div className="meter"><i style={{ "--value": `${value}%` } as React.CSSProperties} /></div><strong>{value}</strong></div>; })}</div></section>
            <section className="detail-section"><h3>利润空间试算</h3><div className="field-pair"><label className="field"><span>竞品参考价</span><div className="input-prefix"><span>$</span><input type="number" value={priceDraft} onChange={(event) => setPriceDraft(Number(event.target.value))} /></div><small>默认取竞品价格带中位值，可调整情景。</small></label><label className="field"><span>采购成本</span><div className="input-prefix"><span>$</span><input type="number" value={costDraft} onChange={(event) => setCostDraft(Number(event.target.value))} /></div><small>来自供应商报价样本。</small></label></div><p className="calculation-note">参考利润率 {calculateMargin(priceDraft, costDraft, selected.shipping).toFixed(1)}% · 竞品价格带 {formatMoney(selected.referencePriceLow)}–{formatMoney(selected.referencePriceHigh)} · 物流成本 {formatMoney(selected.shipping)}。未计平台佣金、营销及退货成本，不等于最终定价。</p></section>
            <section className="detail-section detail-grid"><div><h3>趋势与传播</h3><p><strong>{selected.trend}</strong> · {selected.contentSignal}</p></div><div><h3>供应链</h3><p>{selected.supplyNote}</p></div><div><h3>竞品参考</h3><p>{selected.competitorReference}</p></div><div><h3>风险意见</h3><ul>{selected.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul></div></section>
            <div className="dialog__actions"><button className="button button--secondary" onClick={() => toggleSaved(selected.id)}>{saved.includes(selected.id) ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}{saved.includes(selected.id) ? "已加入候选池" : "加入候选池"}</button><button className="button button--primary" onClick={closeDetail}>完成查看</button></div>
          </div>
        )}
      </dialog>

      <dialog className="dialog report-dialog" ref={reportDialog} onClose={() => setReportOpen(false)}>
        <div className="dialog__header"><div><StatusBadge tone="warning">模拟报告</StatusBadge><h2>选品对比报告</h2><p>{comparedProducts.map((product) => product.name).join("、")}</p></div><button className="icon-button" onClick={closeReport} aria-label="关闭报告"><X /></button></div>
        <div className="report-summary"><BarChart3 size={24} /><div><strong>建议优先研究 {comparedProducts.slice().sort((a, b) => calculateScore(b) - calculateScore(a))[0]?.name}</strong><p>该结论来自合成数据与预设 AI 文案，仅用于演示产品流程。</p></div></div>
        <div className="report-products">{comparedProducts.map((product, index) => <div key={product.id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{product.name}</strong><p>{product.recommendation}</p></div><ScoreRing score={calculateScore(product)} size="small" /></div>)}</div>
        {publishState === "failed" && <div className="inline-alert inline-alert--error"><ShieldAlert size={18} /><span><strong>Mock 飞书保存失败。</strong> 报告仍保留在浏览器中，可以重新尝试。</span></div>}
        {publishState === "saved" && <div className="inline-alert inline-alert--positive"><CheckCircle2 size={18} /><span><strong>已完成 Mock 保存。</strong> 真实生产版将由服务端写入飞书并回读验证。</span></div>}
        {pdfState === "failed" && <div className="inline-alert inline-alert--error"><ShieldAlert size={18} /><span><strong>PDF 生成失败。</strong> 请关闭报告后重新生成。</span></div>}
        <div className="dialog__actions"><button className="button button--secondary" onClick={closeReport}>返回对比</button>{pdfState === "ready" && pdfUrl ? <a className="button button--secondary" href={pdfUrl} download={`AI选品报告-${new Date().toISOString().slice(0, 10)}.pdf`}><Download size={17} />下载 PDF</a> : <button className="button button--secondary" disabled><LoaderCircle className={pdfState === "loading" ? "spin" : ""} size={17} />生成 PDF</button>}<button className="button button--primary" onClick={publishReport} disabled={publishState === "loading" || publishState === "saved"}>{publishState === "loading" ? <><LoaderCircle className="spin" size={17} />保存中</> : publishState === "saved" ? <><Check size={17} />已保存</> : <><FileText size={17} />保存到飞书 · Mock</>}</button></div>
      </dialog>

      <dialog className="dialog command-dialog" ref={paletteDialog} onClose={() => setPaletteOpen(false)}>
        <div className="command-search"><Search size={19} /><input autoFocus value={paletteQuery} onChange={(event) => setPaletteQuery(event.target.value)} placeholder="搜索任务或商品" /><kbd>esc</kbd></div>
        <div className="command-results">{paletteItems.map((item) => <button key={item.label} onClick={() => { item.action(); paletteDialog.current?.close(); setPaletteOpen(false); }}><span><strong>{item.label}</strong><small>{item.hint}</small></span><ChevronRight size={18} /></button>)}</div>
        {!paletteItems.length && <div className="command-empty"><Info size={18} />没有匹配的命令</div>}
      </dialog>

      {paletteOpen && <span className="sr-only" aria-live="polite">命令面板已打开</span>}
    </div>
  );
}

type AppRoot = ReturnType<typeof createRoot>;
const rootStore = globalThis as typeof globalThis & { __aiRadarRoot?: AppRoot };
const appRoot = rootStore.__aiRadarRoot ?? createRoot(document.getElementById("root")!);
rootStore.__aiRadarRoot = appRoot;
appRoot.render(<React.StrictMode><App /></React.StrictMode>);
