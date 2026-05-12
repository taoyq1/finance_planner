const STORAGE_KEY = "rmb-portfolio-planner-v1";
const SYNC_CONFIG_KEY = "rmb-portfolio-sync-config-v1";
const SYNC_SESSION_KEY = "rmb-portfolio-sync-session-v1";
const AUTO_SYNC_KEY = "rmb-portfolio-auto-sync-v1";
const REMEMBERED_SECRET_KEY = "rmb-portfolio-remembered-secret-v1";
const LAST_LOCAL_CHANGE_KEY = "rmb-portfolio-last-local-change-v1";
const LAST_CLOUD_SYNC_KEY = "rmb-portfolio-last-cloud-sync-v1";
const VAULT_TABLE = "portfolio_vaults";

const DEFAULT_CATEGORIES = [
  { id: "cash", name: "现金/货币基金", target: 10, min: 8, max: 12 },
  { id: "bond", name: "债基/国债类", target: 22, min: 18, max: 26 },
  { id: "dividend", name: "红利低波/高股息", target: 20, min: 16, max: 24 },
  { id: "broad", name: "宽基指数", target: 25, min: 21, max: 29 },
  { id: "gold", name: "黄金", target: 8, min: 5, max: 11 },
  { id: "growth", name: "高收益仓", target: 15, min: 10, max: 18 },
];

const TYPE_LABELS = {
  income: "收入",
  buy: "买入",
  sell: "卖出",
  rebalance: "再平衡",
  note: "备注",
};

const CHART_COLORS = {
  total: "#1667c7",
  cash: "#067647",
  bond: "#475467",
  dividend: "#b54708",
  broad: "#7a271a",
  gold: "#ca8504",
  growth: "#c11574",
};

const state = loadState();
const syncConfig = loadSyncConfig();
let syncSession = loadSyncSession();
let syncSecret = "";
let autoSyncEnabled = localStorage.getItem(AUTO_SYNC_KEY) === "true";
let lastLocalChange = localStorage.getItem(LAST_LOCAL_CHANGE_KEY) || "";
let lastCloudSync = localStorage.getItem(LAST_CLOUD_SYNC_KEY) || "";
let cloudCheckTimer = 0;
let productData = null;
let holdingScanTimer = 0;
let lastAlertKeys = new Set();

const els = {
  totalAssets: document.querySelector("#totalAssets"),
  peakAssets: document.querySelector("#peakAssets"),
  drawdown: document.querySelector("#drawdown"),
  riskBucket: document.querySelector("#riskBucket"),
  newMoney: document.querySelector("#newMoney"),
  recommendation: document.querySelector("#recommendation"),
  productCategory: document.querySelector("#productCategory"),
  refreshProductsBtn: document.querySelector("#refreshProductsBtn"),
  productMeta: document.querySelector("#productMeta"),
  productList: document.querySelector("#productList"),
  chartMode: document.querySelector("#chartMode"),
  snapshotBtn: document.querySelector("#snapshotBtn"),
  chartSummary: document.querySelector("#chartSummary"),
  performanceChart: document.querySelector("#performanceChart"),
  allocationList: document.querySelector("#allocationList"),
  holdingForm: document.querySelector("#holdingForm"),
  holdingId: document.querySelector("#holdingId"),
  holdingCategory: document.querySelector("#holdingCategory"),
  holdingName: document.querySelector("#holdingName"),
  holdingCode: document.querySelector("#holdingCode"),
  holdingAmount: document.querySelector("#holdingAmount"),
  holdingCost: document.querySelector("#holdingCost"),
  holdingNote: document.querySelector("#holdingNote"),
  holdingStopLoss: document.querySelector("#holdingStopLoss"),
  holdingTakeProfit: document.querySelector("#holdingTakeProfit"),
  clearHoldingBtn: document.querySelector("#clearHoldingBtn"),
  recordForm: document.querySelector("#recordForm"),
  recordDate: document.querySelector("#recordDate"),
  recordType: document.querySelector("#recordType"),
  recordCategory: document.querySelector("#recordCategory"),
  recordAmount: document.querySelector("#recordAmount"),
  recordNote: document.querySelector("#recordNote"),
  holdingsTable: document.querySelector("#holdingsTable"),
  recordsTable: document.querySelector("#recordsTable"),
  exportBtn: document.querySelector("#exportBtn"),
  importFile: document.querySelector("#importFile"),
  resetTargetsBtn: document.querySelector("#resetTargetsBtn"),
  clearRecordsBtn: document.querySelector("#clearRecordsBtn"),
  loadDemoBtn: document.querySelector("#loadDemoBtn"),
  scanHoldingsBtn: document.querySelector("#scanHoldingsBtn"),
  notifyBtn: document.querySelector("#notifyBtn"),
  alertMeta: document.querySelector("#alertMeta"),
  alertList: document.querySelector("#alertList"),
  toast: document.querySelector("#toast"),
  syncPanelBtn: document.querySelector("#syncPanelBtn"),
  syncPanel: document.querySelector("#syncPanel"),
  syncStatus: document.querySelector("#syncStatus"),
  configForm: document.querySelector("#configForm"),
  supabaseUrl: document.querySelector("#supabaseUrl"),
  supabaseAnonKey: document.querySelector("#supabaseAnonKey"),
  authForm: document.querySelector("#authForm"),
  syncEmail: document.querySelector("#syncEmail"),
  syncPassword: document.querySelector("#syncPassword"),
  syncSecret: document.querySelector("#syncSecret"),
  rememberDevice: document.querySelector("#rememberDevice"),
  signInBtn: document.querySelector("#signInBtn"),
  signUpBtn: document.querySelector("#signUpBtn"),
  signOutBtn: document.querySelector("#signOutBtn"),
  uploadSyncBtn: document.querySelector("#uploadSyncBtn"),
  downloadSyncBtn: document.querySelector("#downloadSyncBtn"),
  autoSyncBtn: document.querySelector("#autoSyncBtn"),
  checkSyncBtn: document.querySelector("#checkSyncBtn"),
  syncMeta: document.querySelector("#syncMeta"),
};

init();

function init() {
  els.recordDate.valueAsDate = new Date();
  els.supabaseUrl.value = syncConfig.url;
  els.supabaseAnonKey.value = syncConfig.anonKey;
  els.autoSyncBtn.textContent = autoSyncEnabled ? "关闭自动上传" : "开启自动上传";
  restoreRememberedSecret();
  renderCategoryOptions();
  bindEvents();
  render();
  renderSyncStatus();
  startCloudChecks();
  loadProductData();
  startHoldingScans();
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return {
      categories: structuredClone(DEFAULT_CATEGORIES),
      holdings: [],
      records: [],
      snapshots: [],
      peakAssets: 0,
      newMoney: "",
    };
  }

  try {
    const parsed = JSON.parse(saved);
    return {
      categories: normalizeCategories(parsed.categories),
      holdings: Array.isArray(parsed.holdings) ? parsed.holdings : [],
      records: Array.isArray(parsed.records) ? parsed.records : [],
      snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
      peakAssets: Number(parsed.peakAssets) || 0,
      newMoney: parsed.newMoney || "",
    };
  } catch {
    return {
      categories: structuredClone(DEFAULT_CATEGORIES),
      holdings: [],
      records: [],
      snapshots: [],
      peakAssets: 0,
      newMoney: "",
    };
  }
}

function loadSyncConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(SYNC_CONFIG_KEY));
    return {
      url: saved?.url || "",
      anonKey: saved?.anonKey || "",
    };
  } catch {
    return { url: "", anonKey: "" };
  }
}

function saveSyncConfig() {
  localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(syncConfig));
}

function loadSyncSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SYNC_SESSION_KEY));
    return saved?.access_token ? saved : null;
  } catch {
    return null;
  }
}

function saveSyncSession() {
  if (syncSession) {
    sessionStorage.setItem(SYNC_SESSION_KEY, JSON.stringify(syncSession));
  } else {
    sessionStorage.removeItem(SYNC_SESSION_KEY);
  }
}

function normalizeCategories(categories) {
  if (!Array.isArray(categories)) {
    return structuredClone(DEFAULT_CATEGORIES);
  }

  return DEFAULT_CATEGORIES.map((category) => {
    const saved = categories.find((item) => item.id === category.id);
    return saved ? { ...category, ...saved } : category;
  });
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function renderCategoryOptions() {
  const options = state.categories
    .map((category) => `<option value="${category.id}">${category.name}</option>`)
    .join("");
  els.holdingCategory.innerHTML = options;
  els.recordCategory.innerHTML = `<option value="">不适用</option>${options}`;
  els.productCategory.innerHTML = `<option value="all">全部仓位</option>${options}`;
  els.chartMode.innerHTML = `
    <option value="total">总资产</option>
    <option value="all">全部仓位</option>
    ${options}
  `;
}

function bindEvents() {
  els.holdingForm.addEventListener("submit", saveHolding);
  els.recordForm.addEventListener("submit", saveRecord);
  els.clearHoldingBtn.addEventListener("click", clearHoldingForm);
  els.newMoney.addEventListener("input", () => {
    state.newMoney = els.newMoney.value;
    saveState();
    renderRecommendation();
  });
  els.chartMode.addEventListener("change", renderChart);
  els.snapshotBtn.addEventListener("click", () => {
    captureSnapshot(new Date().toISOString().slice(0, 10));
    persistAndRender("今日快照已保存");
  });
  els.exportBtn.addEventListener("click", exportData);
  els.importFile.addEventListener("change", importData);
  els.resetTargetsBtn.addEventListener("click", resetTargets);
  els.clearRecordsBtn.addEventListener("click", clearRecords);
  els.loadDemoBtn.addEventListener("click", loadDemo);
  els.scanHoldingsBtn.addEventListener("click", () => scanHoldings({ notify: true, manual: true }));
  els.notifyBtn.addEventListener("click", requestNotifications);
  els.productCategory.addEventListener("change", renderProducts);
  els.refreshProductsBtn.addEventListener("click", loadProductData);
  els.syncPanelBtn.addEventListener("click", () => {
    els.syncPanel.hidden = !els.syncPanel.hidden;
  });
  els.configForm.addEventListener("submit", saveCloudConfig);
  els.signInBtn.addEventListener("click", () => authenticate("signin"));
  els.signUpBtn.addEventListener("click", () => authenticate("signup"));
  els.signOutBtn.addEventListener("click", signOut);
  els.uploadSyncBtn.addEventListener("click", uploadEncryptedState);
  els.downloadSyncBtn.addEventListener("click", downloadEncryptedState);
  els.autoSyncBtn.addEventListener("click", toggleAutoSync);
  els.checkSyncBtn.addEventListener("click", () => checkCloudUpdate(true));
}

function saveHolding(event) {
  event.preventDefault();
  const id = els.holdingId.value || createId();
  const holding = {
    id,
    categoryId: els.holdingCategory.value,
    name: els.holdingName.value.trim(),
    code: normalizeCode(els.holdingCode.value),
    amount: Number(els.holdingAmount.value) || 0,
    cost: Number(els.holdingCost.value) || 0,
    stopLossPct: Number(els.holdingStopLoss.value) || null,
    takeProfitPct: Number(els.holdingTakeProfit.value) || null,
    note: els.holdingNote.value.trim(),
  };

  if (!holding.name) {
    showToast("请填写产品名称");
    return;
  }

  const index = state.holdings.findIndex((item) => item.id === id);
  if (index >= 0) {
    state.holdings[index] = holding;
  } else {
    state.holdings.push(holding);
  }

  captureSnapshot(new Date().toISOString().slice(0, 10));
  clearHoldingForm();
  persistAndRender("持仓已保存");
}

function saveRecord(event) {
  event.preventDefault();
  const record = {
    id: createId(),
    date: els.recordDate.value,
    type: els.recordType.value,
    categoryId: els.recordCategory.value,
    amount: Number(els.recordAmount.value) || 0,
    note: els.recordNote.value.trim(),
  };

  state.records.push(record);
  captureSnapshot(record.date);
  els.recordAmount.value = "";
  els.recordNote.value = "";
  persistAndRender("历史记录已添加");
}

function editHolding(id) {
  const holding = state.holdings.find((item) => item.id === id);
  if (!holding) return;

  els.holdingId.value = holding.id;
  els.holdingCategory.value = holding.categoryId;
  els.holdingName.value = holding.name;
  els.holdingCode.value = holding.code || "";
  els.holdingAmount.value = holding.amount;
  els.holdingCost.value = holding.cost || "";
  els.holdingStopLoss.value = holding.stopLossPct || "";
  els.holdingTakeProfit.value = holding.takeProfitPct || "";
  els.holdingNote.value = holding.note;
  window.scrollTo({ top: els.holdingForm.getBoundingClientRect().top + window.scrollY - 80 });
}

function deleteHolding(id) {
  state.holdings = state.holdings.filter((item) => item.id !== id);
  captureSnapshot(new Date().toISOString().slice(0, 10));
  persistAndRender("持仓已删除");
}

function deleteRecord(id) {
  state.records = state.records.filter((item) => item.id !== id);
  persistAndRender("记录已删除");
}

function clearHoldingForm() {
  els.holdingForm.reset();
  els.holdingId.value = "";
}

function clearRecords() {
  if (!state.records.length) return;
  state.records = [];
  persistAndRender("历史记录已清空");
}

function resetTargets() {
  state.categories = structuredClone(DEFAULT_CATEGORIES);
  renderCategoryOptions();
  persistAndRender("目标比例已恢复默认");
}

function loadDemo() {
  state.holdings = [
    { id: createId(), categoryId: "cash", code: "511990", name: "华宝添益ETF", amount: 100000, cost: 99000, note: "应急资金" },
    { id: createId(), categoryId: "bond", code: "511010", name: "国债ETF", amount: 210000, cost: 212000, note: "稳定底仓" },
    { id: createId(), categoryId: "dividend", code: "510880", name: "红利ETF", amount: 180000, cost: 165000, note: "股息资产" },
    { id: createId(), categoryId: "broad", code: "510300", name: "沪深300ETF", amount: 230000, cost: 205000, note: "宽基定投" },
    { id: createId(), categoryId: "gold", code: "518880", name: "黄金ETF", amount: 90000, cost: 72000, note: "对冲资产" },
    { id: createId(), categoryId: "growth", code: "512480", name: "半导体ETF", amount: 140000, cost: 90000, takeProfitPct: 35, note: "高收益仓" },
  ];
  state.records = [
    {
      id: createId(),
      date: new Date().toISOString().slice(0, 10),
      type: "note",
      categoryId: "",
      amount: 0,
      note: "载入示例数据，可删除后录入真实持仓",
    },
  ];
  state.snapshots = [];
  captureSnapshot(new Date().toISOString().slice(0, 10));
  persistAndRender("示例数据已载入");
}

function render() {
  const snapshot = getSnapshot();
  if (snapshot.total > state.peakAssets) {
    state.peakAssets = snapshot.total;
    saveState();
  }

  els.newMoney.value = state.newMoney;
  els.totalAssets.textContent = money(snapshot.total);
  els.peakAssets.textContent = money(state.peakAssets);
  els.drawdown.textContent = `${formatPct(snapshot.drawdown)}%`;
  els.drawdown.className = snapshot.drawdown <= -12 ? "danger" : "";
  els.riskBucket.textContent = `${formatPct(snapshot.byCategory.growth?.percent || 0)}%`;

  renderRecommendation();
  renderChart();
  renderAllocations(snapshot);
  renderHoldings();
  renderRecords();
  scanHoldings({ notify: false });
}

function captureSnapshot(date) {
  const snapshot = getSnapshot();
  const amounts = Object.fromEntries(
    state.categories.map((category) => [
      category.id,
      Math.round((snapshot.byCategory[category.id]?.amount || 0) * 100) / 100,
    ]),
  );
  const entry = {
    date,
    total: Math.round(snapshot.total * 100) / 100,
    amounts,
  };
  const index = state.snapshots.findIndex((item) => item.date === date);
  if (index >= 0) {
    state.snapshots[index] = entry;
  } else {
    state.snapshots.push(entry);
  }
  state.snapshots.sort((a, b) => a.date.localeCompare(b.date));
}

function renderRecommendation() {
  const snapshot = getSnapshot();
  const newMoney = Number(els.newMoney.value) || 0;
  const advice = getAdvice(snapshot, newMoney);

  if (!snapshot.total && !newMoney) {
    els.recommendation.innerHTML = `<div class="empty">先录入持仓或本月可投资金额，系统会生成加仓建议。</div>`;
    return;
  }

  const riskWarning = getRiskWarning(snapshot);
  const adviceHtml = advice.length
    ? advice
        .map(
          (item) => `
          <div class="advice">
            <div>
              <strong>${item.name}</strong>
              <span>${item.reason}</span>
            </div>
            <div class="amount">${money(item.amount)}</div>
          </div>
        `,
        )
        .join("")
    : `<div class="empty">当前仓位没有明显低配。新增资金可暂放现金，等月底再检查。</div>`;

  els.recommendation.innerHTML = `${riskWarning}${adviceHtml}`;
}

async function loadProductData() {
  try {
    els.productMeta.textContent = "正在加载产品数据...";
    const response = await fetch(`data/products.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("未找到 data/products.json");
    }
    productData = await response.json();
    renderProducts();
    scanHoldings({ notify: false });
  } catch (error) {
    productData = null;
    els.productMeta.textContent = "产品数据未加载。部署后由 GitHub Actions 每周生成 data/products.json。";
    els.productList.innerHTML = `<div class="empty">${escapeHtml(error.message || "加载失败")}</div>`;
  }
}

function renderProducts() {
  if (!productData?.products?.length) {
    els.productMeta.textContent = "尚无产品数据。";
    els.productList.innerHTML = `<div class="empty">请先等待自动更新任务生成产品数据。</div>`;
    return;
  }

  const categoryId = els.productCategory.value;
  const products = productData.products
    .filter((item) => categoryId === "all" || item.categoryId === categoryId)
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  const updatedAt = productData.updatedAt ? new Date(productData.updatedAt).toLocaleString("zh-CN") : "未知";
  els.productMeta.textContent = `更新时间：${updatedAt} · 数据源：${productData.source || "公开基金数据"} · 评分仅用于同类比较`;

  if (!products.length) {
    els.productList.innerHTML = `<div class="empty">当前仓位还没有候选产品。</div>`;
    return;
  }

  els.productList.innerHTML = products
    .map((product) => {
      const metrics = product.metrics || {};
      return `
        <article class="product-card">
          <div class="product-title">
            <strong>${escapeHtml(product.name)}</strong>
            <span>${escapeHtml(product.code)} · ${categoryName(product.categoryId)}</span>
          </div>
          <div class="product-stat"><span>近1月</span><strong>${formatMaybePct(metrics.return1m)}</strong></div>
          <div class="product-stat"><span>近3月</span><strong>${formatMaybePct(metrics.return3m)}</strong></div>
          <div class="product-stat"><span>近1年</span><strong>${formatMaybePct(metrics.return1y)}</strong></div>
          <div class="product-stat"><span>最大回撤</span><strong>${formatMaybePct(metrics.maxDrawdown1y)}</strong></div>
          <div class="product-stat"><span>年化波动</span><strong>${formatMaybePct(metrics.volatility1y)}</strong></div>
          <div class="score-badge">${Math.round(product.score || 0)}</div>
        </article>
      `;
    })
    .join("");
}

function startHoldingScans() {
  if (holdingScanTimer) {
    window.clearInterval(holdingScanTimer);
  }
  holdingScanTimer = window.setInterval(() => {
    scanHoldings({ notify: true });
  }, 5 * 60 * 1000);
}

function scanHoldings(options = {}) {
  const alerts = buildHoldingAlerts();
  renderHoldingAlerts(alerts);
  if (options.notify) {
    notifyNewAlerts(alerts);
  }
  if (options.manual) {
    showToast(alerts.length ? `发现 ${alerts.length} 条持仓提醒` : "当前没有触发减仓/退出提醒");
  }
  return alerts;
}

function buildHoldingAlerts() {
  const snapshot = getSnapshot();
  const productMap = getProductMap();
  const alerts = [];

  state.holdings.forEach((holding) => {
    const amount = Number(holding.amount) || 0;
    const cost = Number(holding.cost) || 0;
    const profitPct = cost ? ((amount - cost) / cost) * 100 : null;
    const product = holding.code ? productMap.get(normalizeCode(holding.code)) : null;
    const metrics = product?.metrics || {};
    const stopLoss = Number(holding.stopLossPct) || defaultStopLoss(holding.categoryId);
    const takeProfit = Number(holding.takeProfitPct) || defaultTakeProfit(holding.categoryId);

    if (profitPct !== null && profitPct <= stopLoss) {
      alerts.push(makeAlert("danger", holding, "触发止损提醒", `当前收益 ${formatPct(profitPct)}%，低于 ${stopLoss}% 阈值。`, "建议暂停加仓，复盘是否减仓或退出。"));
    }

    if (profitPct !== null && profitPct >= takeProfit) {
      alerts.push(makeAlert("warning", holding, "触发止盈提醒", `当前收益 +${formatPct(profitPct)}%，高于 ${takeProfit}% 阈值。`, "建议至少卖出一部分，把仓位拉回目标比例。"));
    }

    if (holding.categoryId === "growth" && amount / (snapshot.total || 1) > 0.05) {
      alerts.push(makeAlert("warning", holding, "单一高收益产品偏重", `该产品占总资产 ${formatPct((amount / snapshot.total) * 100)}%。`, "高收益单品建议控制在总资产 3%-5%。"));
    }

    if (product?.score !== undefined && product.score < 45) {
      alerts.push(makeAlert("warning", holding, "产品评分偏低", `候选池评分 ${Math.round(product.score)}，同类相对较弱。`, "建议和同类高评分产品比较，必要时调出候选池。"));
    }

    if (Number(metrics.return1m) <= -8 || Number(metrics.return3m) <= -15) {
      alerts.push(makeAlert("danger", holding, "短期趋势恶化", `近1月 ${formatMaybePct(metrics.return1m)}，近3月 ${formatMaybePct(metrics.return3m)}。`, "建议复盘下跌原因，避免继续扩大高风险敞口。"));
    }

    if (Number(metrics.maxDrawdown1y) <= -30 && holding.categoryId === "growth") {
      alerts.push(makeAlert("warning", holding, "一年回撤过深", `产品近一年最大回撤 ${formatMaybePct(metrics.maxDrawdown1y)}。`, "高波动产品建议只保留小仓位，避免影响整体 15% 回撤目标。"));
    }
  });

  const byKey = new Map();
  alerts.forEach((alert) => byKey.set(alert.key, alert));
  return [...byKey.values()].sort((a, b) => severityRank(b.level) - severityRank(a.level));
}

function renderHoldingAlerts(alerts) {
  const time = new Date().toLocaleString("zh-CN");
  els.alertMeta.textContent = `最近扫描：${time} · ${alerts.length ? `${alerts.length} 条提醒` : "无触发项"}`;

  if (!alerts.length) {
    els.alertList.innerHTML = `<div class="empty">当前没有触发止盈、止损或减仓提醒。</div>`;
    return;
  }

  els.alertList.innerHTML = alerts
    .map(
      (alert) => `
      <article class="alert-card ${alert.level}">
        <div class="alert-title">
          <strong>${escapeHtml(alert.title)}</strong>
          <span>${escapeHtml(alert.name)}${alert.code ? ` · ${escapeHtml(alert.code)}` : ""}</span>
        </div>
        <div class="alert-detail">${escapeHtml(alert.detail)}</div>
        <div class="alert-action">${escapeHtml(alert.action)}</div>
      </article>
    `,
    )
    .join("");
}

function notifyNewAlerts(alerts) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  alerts.forEach((alert) => {
    if (lastAlertKeys.has(alert.key)) return;
    lastAlertKeys.add(alert.key);
    new Notification("资产持仓提醒", {
      body: `${alert.name}: ${alert.title}`,
      icon: "icon.svg",
    });
  });
}

function requestNotifications() {
  if (!("Notification" in window)) {
    showToast("当前浏览器不支持通知");
    return;
  }
  Notification.requestPermission().then((permission) => {
    showToast(permission === "granted" ? "通知已开启" : "通知未开启");
  });
}

function makeAlert(level, holding, title, detail, action) {
  return {
    key: `${holding.id}-${title}`,
    level,
    title,
    detail,
    action,
    name: holding.name,
    code: holding.code || "",
  };
}

function getProductMap() {
  const map = new Map();
  (productData?.products || []).forEach((product) => {
    map.set(normalizeCode(product.code), product);
  });
  return map;
}

function defaultStopLoss(categoryId) {
  if (categoryId === "cash") return -1;
  if (categoryId === "bond") return -5;
  if (categoryId === "growth") return -15;
  return -12;
}

function defaultTakeProfit(categoryId) {
  if (categoryId === "cash") return 5;
  if (categoryId === "bond") return 8;
  if (categoryId === "growth") return 35;
  if (categoryId === "gold") return 30;
  return 25;
}

function severityRank(level) {
  return { info: 1, warning: 2, danger: 3 }[level] || 0;
}

function renderChart() {
  const snapshots = [...state.snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const mode = els.chartMode.value;
  const svg = els.performanceChart;
  const width = 680;
  const height = 320;
  const padding = { top: 22, right: 24, bottom: 42, left: 72 };

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  if (snapshots.length < 2) {
    svg.innerHTML = `<text class="chart-empty" x="${width / 2}" y="${height / 2}" text-anchor="middle">至少保存两个不同日期的快照后，会显示收益波动。</text>`;
    els.chartSummary.innerHTML = `<span class="chart-pill"><strong>${snapshots.length}</strong> 条快照</span>`;
    return;
  }

  const series = buildSeries(snapshots, mode);
  const values = series.flatMap((item) => item.points.map((point) => point.value));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const yMin = Math.max(0, min - range * 0.08);
  const yMax = max + range * 0.08;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const xStep = snapshots.length === 1 ? 0 : plotWidth / (snapshots.length - 1);
  const xFor = (index) => padding.left + index * xStep;
  const yFor = (value) => padding.top + (1 - (value - yMin) / (yMax - yMin)) * plotHeight;

  const grid = Array.from({ length: 5 }, (_, index) => {
    const y = padding.top + (plotHeight / 4) * index;
    const value = yMax - ((yMax - yMin) / 4) * index;
    return `
      <line class="chart-grid" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"></line>
      <text class="chart-label" x="${padding.left - 10}" y="${y + 4}" text-anchor="end">${compactMoney(value)}</text>
    `;
  }).join("");

  const dateLabels = pickDateLabels(snapshots).map((item) => {
    const x = xFor(item.index);
    return `<text class="chart-label" x="${x}" y="${height - 14}" text-anchor="middle">${item.label}</text>`;
  }).join("");

  const lines = series
    .map((item) => {
      const path = item.points
        .map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index).toFixed(2)} ${yFor(point.value).toFixed(2)}`)
        .join(" ");
      const dots = item.points
        .map(
          (point, index) =>
            `<circle class="chart-dot" cx="${xFor(index).toFixed(2)}" cy="${yFor(point.value).toFixed(2)}" r="3.5" fill="${item.color}"><title>${point.date} ${item.name}: ${money(point.value)}</title></circle>`,
        )
        .join("");
      return `<path class="chart-line" d="${path}" stroke="${item.color}"></path>${dots}`;
    })
    .join("");

  svg.innerHTML = `
    ${grid}
    <line class="chart-axis" x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}"></line>
    <line class="chart-axis" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}"></line>
    ${dateLabels}
    ${lines}
  `;

  renderChartSummary(series, snapshots);
}

function buildSeries(snapshots, mode) {
  if (mode === "all") {
    return state.categories.map((category) => ({
      id: category.id,
      name: category.name,
      color: CHART_COLORS[category.id],
      points: snapshots.map((snapshot) => ({
        date: snapshot.date,
        value: Number(snapshot.amounts?.[category.id]) || 0,
      })),
    }));
  }

  if (mode === "total") {
    return [
      {
        id: "total",
        name: "总资产",
        color: CHART_COLORS.total,
        points: snapshots.map((snapshot) => ({
          date: snapshot.date,
          value: Number(snapshot.total) || 0,
        })),
      },
    ];
  }

  const category = state.categories.find((item) => item.id === mode);
  return [
    {
      id: category.id,
      name: category.name,
      color: CHART_COLORS[category.id],
      points: snapshots.map((snapshot) => ({
        date: snapshot.date,
        value: Number(snapshot.amounts?.[category.id]) || 0,
      })),
    },
  ];
}

function renderChartSummary(series, snapshots) {
  const mainItems = series.map((item) => {
    const first = item.points[0]?.value || 0;
    const last = item.points.at(-1)?.value || 0;
    const change = first ? ((last - first) / first) * 100 : 0;
    return `<span class="chart-pill"><strong style="color: ${item.color}">${item.name}</strong> ${money(last)} · ${change >= 0 ? "+" : ""}${formatPct(change)}%</span>`;
  });
  els.chartSummary.innerHTML = [
    `<span class="chart-pill"><strong>${snapshots.length}</strong> 条快照</span>`,
    `<span class="chart-pill">${snapshots[0].date} 至 ${snapshots.at(-1).date}</span>`,
    ...mainItems,
  ].join("");
}

function pickDateLabels(snapshots) {
  const lastIndex = snapshots.length - 1;
  const indexes = new Set([0, lastIndex, Math.round(lastIndex / 2)]);
  if (snapshots.length > 5) {
    indexes.add(Math.round(lastIndex / 4));
    indexes.add(Math.round((lastIndex * 3) / 4));
  }
  return [...indexes]
    .sort((a, b) => a - b)
    .map((index) => ({ index, label: snapshots[index].date.slice(5) }));
}

function renderAllocations(snapshot) {
  els.allocationList.innerHTML = state.categories
    .map((category) => {
      const current = snapshot.byCategory[category.id] || { amount: 0, percent: 0 };
      const status = getStatus(current.percent, category);
      const barWidth = Math.min(current.percent, 100);
      return `
        <div class="allocation-row">
          <div class="allocation-name">
            <strong>${category.name}</strong>
            <span>${money(current.amount)} · 当前 ${formatPct(current.percent)}%</span>
            <span class="status ${status.level}">${status.text}</span>
          </div>
          <div>
            <div class="bar">
              <span class="${status.level}" style="width: ${barWidth}%"></span>
            </div>
            <div class="allocation-stats">目标 ${category.target}% · 区间 ${category.min}%-${category.max}%</div>
          </div>
          <div class="target-controls" data-category="${category.id}">
            <label>目标<input data-field="target" type="number" min="0" max="100" step="1" value="${category.target}" /></label>
            <label>下限<input data-field="min" type="number" min="0" max="100" step="1" value="${category.min}" /></label>
            <label>上限<input data-field="max" type="number" min="0" max="100" step="1" value="${category.max}" /></label>
          </div>
        </div>
      `;
    })
    .join("");

  document.querySelectorAll(".target-controls input").forEach((input) => {
    input.addEventListener("change", updateTarget);
  });
}

function renderHoldings() {
  if (!state.holdings.length) {
    els.holdingsTable.innerHTML = `<tr><td colspan="8" class="empty">还没有持仓。先在上方录入一条。</td></tr>`;
    return;
  }

  els.holdingsTable.innerHTML = state.holdings
    .map(
      (holding) => `
      <tr>
        <td><span class="tag">${categoryName(holding.categoryId)}</span></td>
        <td>${escapeHtml(holding.code || "-")}</td>
        <td>${escapeHtml(holding.name)}</td>
        <td>${holding.cost ? money(holding.cost) : "-"}</td>
        <td>${money(holding.amount)}</td>
        <td>${formatHoldingProfit(holding)}</td>
        <td>${escapeHtml(holding.note || "")}</td>
        <td>
          <div class="row-actions">
            <button type="button" data-edit-holding="${holding.id}">编辑</button>
            <button type="button" data-delete-holding="${holding.id}">删除</button>
          </div>
        </td>
      </tr>
    `,
    )
    .join("");

  document.querySelectorAll("[data-edit-holding]").forEach((button) => {
    button.addEventListener("click", () => editHolding(button.dataset.editHolding));
  });
  document.querySelectorAll("[data-delete-holding]").forEach((button) => {
    button.addEventListener("click", () => deleteHolding(button.dataset.deleteHolding));
  });
}

function renderRecords() {
  if (!state.records.length) {
    els.recordsTable.innerHTML = `<tr><td colspan="6" class="empty">还没有历史记录。</td></tr>`;
    return;
  }

  els.recordsTable.innerHTML = [...state.records]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(
      (record) => `
      <tr>
        <td>${record.date}</td>
        <td>${TYPE_LABELS[record.type] || record.type}</td>
        <td>${record.categoryId ? `<span class="tag">${categoryName(record.categoryId)}</span>` : "-"}</td>
        <td>${money(record.amount)}</td>
        <td>${escapeHtml(record.note || "")}</td>
        <td><button type="button" data-delete-record="${record.id}">删除</button></td>
      </tr>
    `,
    )
    .join("");

  document.querySelectorAll("[data-delete-record]").forEach((button) => {
    button.addEventListener("click", () => deleteRecord(button.dataset.deleteRecord));
  });
}

function updateTarget(event) {
  const wrapper = event.target.closest(".target-controls");
  const category = state.categories.find((item) => item.id === wrapper.dataset.category);
  if (!category) return;

  const field = event.target.dataset.field;
  category[field] = Number(event.target.value) || 0;
  saveState();
  render();
}

function getSnapshot() {
  const total = state.holdings.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const byCategory = Object.fromEntries(
    state.categories.map((category) => [category.id, { amount: 0, percent: 0 }]),
  );

  state.holdings.forEach((holding) => {
    if (!byCategory[holding.categoryId]) return;
    byCategory[holding.categoryId].amount += Number(holding.amount || 0);
  });

  Object.values(byCategory).forEach((item) => {
    item.percent = total ? (item.amount / total) * 100 : 0;
  });

  const peak = Math.max(state.peakAssets, total);
  const drawdown = peak ? ((total - peak) / peak) * 100 : 0;
  return { total, byCategory, drawdown };
}

function getAdvice(snapshot, newMoney) {
  const projectedTotal = snapshot.total + newMoney;
  if (!projectedTotal) return [];

  const candidates = state.categories
    .map((category) => {
      const current = snapshot.byCategory[category.id] || { amount: 0, percent: 0 };
      const targetAmount = projectedTotal * (category.target / 100);
      const deficit = Math.max(targetAmount - current.amount, 0);
      return {
        ...category,
        currentAmount: current.amount,
        currentPercent: current.percent,
        deficit,
      };
    })
    .filter((item) => item.deficit > 0.01 && item.currentPercent < item.max)
    .sort((a, b) => b.deficit - a.deficit);

  if (!newMoney) {
    return candidates.slice(0, 3).map((item) => ({
      name: item.name,
      amount: item.deficit,
      reason: `当前 ${formatPct(item.currentPercent)}%，目标 ${item.target}%。优先补到目标约需 ${money(item.deficit)}。`,
    }));
  }

  const totalDeficit = candidates.reduce((sum, item) => sum + item.deficit, 0);
  if (!totalDeficit) return [];

  return candidates.slice(0, 4).map((item) => ({
    name: item.name,
    amount: Math.min(newMoney * (item.deficit / totalDeficit), item.deficit),
    reason: `当前 ${formatPct(item.currentPercent)}%，低于目标 ${item.target}%。`,
  }));
}

function getRiskWarning(snapshot) {
  const messages = [];
  const growthPct = snapshot.byCategory.growth?.percent || 0;

  if (growthPct > 18) {
    messages.push("高收益仓已超过 18% 上限，建议优先卖回 15% 附近。");
  }
  if ((snapshot.byCategory.cash?.percent || 0) < 8 && snapshot.total > 0) {
    messages.push("现金仓低于 8%，新增资金优先补现金，不建议继续增加高收益仓。");
  }
  if (snapshot.drawdown <= -12) {
    messages.push("总资产回撤已超过 12%，只做再平衡，不主动加风险。");
  } else if (snapshot.drawdown <= -8) {
    messages.push("总资产回撤已超过 8%，暂停增加高收益仓。");
  }

  if (!messages.length) return "";
  return messages
    .map((message) => `<div class="advice"><div><strong>风险提示</strong><span>${message}</span></div></div>`)
    .join("");
}

function getStatus(percent, category) {
  if (percent < category.min) return { level: "low", text: "低于下限" };
  if (percent > category.max) return { level: "high", text: "超过上限" };
  return { level: "ok", text: "区间内" };
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `portfolio-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      state.categories = normalizeCategories(imported.categories);
      state.holdings = Array.isArray(imported.holdings) ? imported.holdings : [];
      state.records = Array.isArray(imported.records) ? imported.records : [];
      state.snapshots = Array.isArray(imported.snapshots) ? imported.snapshots : [];
      state.peakAssets = Number(imported.peakAssets) || 0;
      state.newMoney = imported.newMoney || "";
      renderCategoryOptions();
      persistAndRender("数据已导入");
    } catch {
      showToast("导入失败，请选择有效的 JSON 文件");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

function persistAndRender(message) {
  markLocalChange();
  saveState();
  render();
  showToast(message);
  queueAutoSync();
}

function saveCloudConfig(event) {
  event.preventDefault();
  syncConfig.url = els.supabaseUrl.value.trim().replace(/\/$/, "");
  syncConfig.anonKey = els.supabaseAnonKey.value.trim();
  saveSyncConfig();
  renderSyncStatus();
  showToast("云同步配置已保存");
}

async function authenticate(mode) {
  try {
    ensureCloudConfig();
    const email = els.syncEmail.value.trim();
    const password = els.syncPassword.value;
    syncSecret = els.syncSecret.value;

    if (!email || !password || !syncSecret) {
      showToast("请填写邮箱、登录密码和同步加密密码");
      return;
    }

    const path = mode === "signup" ? "/auth/v1/signup" : "/auth/v1/token?grant_type=password";
    const result = await supabaseFetch(path, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    if (!result.access_token && mode === "signup") {
      showToast("注册成功，请检查邮箱确认后再登录");
      return;
    }

    syncSession = result;
    saveSyncSession();
    rememberSecretIfRequested();
    renderSyncStatus();
    showToast("已登录云同步");
    await checkCloudUpdate(true, { autoDownload: true });
    startCloudChecks();
  } catch (error) {
    showToast(error.message || "登录失败");
  }
}

function signOut() {
  syncSession = null;
  syncSecret = "";
  els.syncPassword.value = "";
  if (!els.rememberDevice.checked) {
    els.syncSecret.value = "";
  }
  stopCloudChecks();
  saveSyncSession();
  renderSyncStatus();
  showToast("已退出云同步");
}

async function uploadEncryptedState() {
  try {
    ensureSyncReady();
    const cloud = await getCloudVault();
    const cloudTime = cloud?.client_updated_at || cloud?.updated_at || "";
    if (cloudTime && lastCloudSync && cloudTime > lastCloudSync && cloudTime > lastLocalChange) {
      showToast("云端数据较新，请先下载解密再上传");
      renderSyncStatus("云端较新");
      return;
    }

    const payload = await encryptText(JSON.stringify(getPortableState()), syncSecret);
    const uploadedAt = new Date().toISOString();
    await supabaseFetch(`/rest/v1/${VAULT_TABLE}?on_conflict=user_id`, {
      method: "POST",
      auth: true,
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        user_id: syncSession.user.id,
        encrypted_payload: payload,
        client_updated_at: uploadedAt,
      }),
    });
    lastCloudSync = uploadedAt;
    localStorage.setItem(LAST_CLOUD_SYNC_KEY, lastCloudSync);
    renderSyncStatus("刚刚上传");
    showToast("已加密上传");
  } catch (error) {
    showToast(error.message || "上传失败");
  }
}

async function downloadEncryptedState() {
  try {
    ensureSyncReady();
    const vault = await getCloudVault();
    if (!vault?.encrypted_payload) {
      showToast("云端还没有备份");
      return;
    }

    const decrypted = await decryptText(vault.encrypted_payload, syncSecret);
    const imported = JSON.parse(decrypted);
    applyPortableState(imported);
    saveState();
    lastCloudSync = vault.client_updated_at || vault.updated_at || new Date().toISOString();
    lastLocalChange = lastCloudSync;
    localStorage.setItem(LAST_CLOUD_SYNC_KEY, lastCloudSync);
    localStorage.setItem(LAST_LOCAL_CHANGE_KEY, lastLocalChange);
    render();
    renderSyncStatus(vault.client_updated_at || vault.updated_at || "已下载");
    showToast("已下载并解密");
  } catch (error) {
    showToast(error.message || "下载失败，请检查同步加密密码");
  }
}

async function checkCloudUpdate(showResult = false, options = {}) {
  try {
    if (!syncSession?.access_token || !syncConfig.url || !syncConfig.anonKey) return;
    const vault = await getCloudVault();
    const cloudTime = vault?.client_updated_at || vault?.updated_at || "";
    if (!cloudTime) {
      if (showResult) showToast("云端还没有备份");
      return;
    }

    if (!lastCloudSync || cloudTime > lastCloudSync) {
      if (options.autoDownload && getEffectiveSecret()) {
        await downloadEncryptedState();
        return;
      }
      renderSyncStatus("云端有更新，请下载解密");
      if (showResult) showToast("云端有更新，请下载解密");
      return;
    }

    renderSyncStatus("已是最新");
    if (showResult) showToast("当前已是最新");
  } catch (error) {
    if (showResult) showToast(error.message || "检查云端更新失败");
  }
}

async function getCloudVault() {
  const rows = await supabaseFetch(`/rest/v1/${VAULT_TABLE}?user_id=eq.${syncSession.user.id}&select=*`, {
    method: "GET",
    auth: true,
  });
  return Array.isArray(rows) ? rows[0] : null;
}

function toggleAutoSync() {
  autoSyncEnabled = !autoSyncEnabled;
  localStorage.setItem(AUTO_SYNC_KEY, String(autoSyncEnabled));
  els.autoSyncBtn.textContent = autoSyncEnabled ? "关闭自动上传" : "开启自动上传";
  renderSyncStatus();
  startCloudChecks();
  showToast(autoSyncEnabled ? "已开启自动上传" : "已关闭自动上传");
}

let autoSyncTimer = 0;
function queueAutoSync() {
  if (!autoSyncEnabled || !syncSession || !syncSecret) return;
  window.clearTimeout(autoSyncTimer);
  autoSyncTimer = window.setTimeout(() => {
    uploadEncryptedState();
  }, 1200);
}

function getPortableState() {
  return {
    version: 1,
    categories: state.categories,
    holdings: state.holdings,
    records: state.records,
    snapshots: state.snapshots,
    peakAssets: state.peakAssets,
    newMoney: state.newMoney,
    exportedAt: new Date().toISOString(),
  };
}

function markLocalChange() {
  lastLocalChange = new Date().toISOString();
  localStorage.setItem(LAST_LOCAL_CHANGE_KEY, lastLocalChange);
}

function applyPortableState(imported) {
  state.categories = normalizeCategories(imported.categories);
  state.holdings = Array.isArray(imported.holdings) ? imported.holdings : [];
  state.records = Array.isArray(imported.records) ? imported.records : [];
  state.snapshots = Array.isArray(imported.snapshots) ? imported.snapshots : [];
  state.peakAssets = Number(imported.peakAssets) || 0;
  state.newMoney = imported.newMoney || "";
  renderCategoryOptions();
}

function ensureCloudConfig() {
  if (!syncConfig.url || !syncConfig.anonKey) {
    throw new Error("请先填写并保存 Supabase 配置");
  }
}

function ensureSyncReady() {
  ensureCloudConfig();
  if (!globalThis.crypto?.subtle) {
    throw new Error("当前页面不支持安全加密，请使用 HTTPS 地址或 localhost");
  }
  if (!syncSession?.access_token || !syncSession?.user?.id) {
    throw new Error("请先登录云同步");
  }
  syncSecret = getEffectiveSecret();
  if (!syncSecret) {
    throw new Error("请输入同步加密密码");
  }
  rememberSecretIfRequested();
}

function getEffectiveSecret() {
  return els.syncSecret.value || syncSecret;
}

function rememberSecretIfRequested() {
  syncSecret = getEffectiveSecret();
  if (els.rememberDevice.checked && syncSecret) {
    localStorage.setItem(REMEMBERED_SECRET_KEY, syncSecret);
  } else if (!els.rememberDevice.checked) {
    localStorage.removeItem(REMEMBERED_SECRET_KEY);
  }
}

function restoreRememberedSecret() {
  const remembered = localStorage.getItem(REMEMBERED_SECRET_KEY);
  if (!remembered) return;
  syncSecret = remembered;
  els.syncSecret.value = remembered;
  els.rememberDevice.checked = true;
}

function startCloudChecks() {
  stopCloudChecks();
  if (!syncSession?.access_token) return;
  cloudCheckTimer = window.setInterval(() => {
    checkCloudUpdate(false);
  }, 60000);
  checkCloudUpdate(false, { autoDownload: Boolean(getEffectiveSecret()) });
}

function stopCloudChecks() {
  if (cloudCheckTimer) {
    window.clearInterval(cloudCheckTimer);
    cloudCheckTimer = 0;
  }
}

async function supabaseFetch(path, options = {}) {
  const headers = {
    apikey: syncConfig.anonKey,
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (options.auth) {
    headers.Authorization = `Bearer ${syncSession.access_token}`;
  }

  const response = await fetch(`${syncConfig.url}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.msg || data?.message || `请求失败：${response.status}`);
  }
  return data;
}

async function encryptText(plainText, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const encoded = new TextEncoder().encode(plainText);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return {
    algorithm: "AES-GCM",
    kdf: "PBKDF2-SHA-256",
    iterations: 250000,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(cipher)),
  };
}

async function decryptText(payload, passphrase) {
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const key = await deriveKey(passphrase, salt);
  const cipher = base64ToBytes(payload.ciphertext);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

async function deriveKey(passphrase, salt) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function renderSyncStatus(extra = "") {
  if (syncSession?.access_token) {
    els.syncStatus.textContent = "已登录";
    els.syncStatus.className = "status ok";
  } else if (syncConfig.url && syncConfig.anonKey) {
    els.syncStatus.textContent = "已配置";
    els.syncStatus.className = "status watch";
  } else {
    els.syncStatus.textContent = "未连接";
    els.syncStatus.className = "status watch";
  }

  const email = syncSession?.user?.email || "未登录";
  const auto = autoSyncEnabled ? "自动上传已开启" : "自动上传未开启";
  const remembered = els.rememberDevice.checked ? "本设备已记住密钥" : "本设备未记住密钥";
  els.syncMeta.textContent = `${email} · ${auto} · ${remembered}${extra ? ` · ${extra}` : ""}`;
}

function categoryName(id) {
  return state.categories.find((category) => category.id === id)?.name || "未分类";
}

function normalizeCode(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, 6);
}

function formatHoldingProfit(holding) {
  const amount = Number(holding.amount) || 0;
  const cost = Number(holding.cost) || 0;
  if (!cost) return "-";
  const profit = amount - cost;
  const pct = (profit / cost) * 100;
  const className = profit >= 0 ? "success" : "danger";
  return `<span class="status ${className}">${profit >= 0 ? "+" : ""}${money(profit)} · ${profit >= 0 ? "+" : ""}${formatPct(pct)}%</span>`;
}

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function money(value) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function compactMoney(value) {
  const numeric = Number(value) || 0;
  if (numeric >= 100000000) return `${(numeric / 100000000).toFixed(1)}亿`;
  if (numeric >= 10000) return `${(numeric / 10000).toFixed(1)}万`;
  return `${Math.round(numeric)}`;
}

function formatMaybePct(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  const numeric = Number(value);
  return `${numeric > 0 ? "+" : ""}${numeric.toFixed(2)}%`;
}

function formatPct(value) {
  return (Number(value) || 0).toFixed(2);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2200);
}
