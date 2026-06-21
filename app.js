/* ============================================================
   1) הגדרות Firebase
   ============================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyCG1-bpYRaxCbicwXQe2cHuswYGd3EHChw",
  authDomain: "expenses-treisman.firebaseapp.com",
  projectId: "expenses-treisman",
  storageBucket: "expenses-treisman.firebasestorage.app",
  messagingSenderId: "177078353973",
  appId: "1:177078353973:web:9adcb16bc67b5105c3b17c"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const expensesRef = db.collection("expenses");
const incomeRef = db.collection("income");
const configRef = db.collection("meta").doc("config");

/* ============================================================
   2) State
   ============================================================ */
let allExpenses = [];
let allIncome = [];
let currentMonth = new Date();
currentMonth.setDate(1);
currentMonth.setHours(0, 0, 0, 0);
let currentView = "dashboard";
let modalType = "expense";
let reportType = "expenses";

const DEFAULT_CATEGORIES = ["אוכל", "חתונה", "דיור", "תחבורה", "בילויים", "בריאות", "אחר"];
const DEFAULT_INCOME_CATEGORIES = ["משכורת", "בונוס", "מתנה", "החזר כספי", "אחר"];
const ACCOUNTS = ["יוסף", "אגם", "מזומן"];
const BALANCE_ACCOUNTS = ["יוסף", "אגם", "מזומן", "חיסכון"];
const PALETTE = ["#2F8F86", "#D6577A", "#2F5FD6", "#C2570E", "#7C5CE0", "#B8860B", "#34A853", "#EC4899", "#0EA5E9", "#F97316", "#9333EA", "#059669"];

let config = {
  categories: DEFAULT_CATEGORIES,
  incomeCategories: DEFAULT_INCOME_CATEGORIES,
  budgets: {},
  weddingTarget: 220000,
  weddingVendorBudgets: {},
  accountBalances: { "יוסף": 0, "אגם": 0, "מזומן": 0 },
  savingsGoals: []
};

const HEBREW_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const HEBREW_MONTHS_SHORT = ["ינו","פבר","מרץ","אפר","מאי","יונ","יול","אוג","ספט","אוק","נוב","דצמ"];

/* ============================================================
   3) Firestore listeners
   ============================================================ */
expensesRef.orderBy("date", "desc").onSnapshot((snapshot) => {
  allExpenses = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  renderCurrentView();
}, (err) => console.error("Firestore error (expenses):", err));

incomeRef.orderBy("date", "desc").onSnapshot((snapshot) => {
  allIncome = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  renderCurrentView();
}, (err) => console.error("Firestore error (income):", err));

configRef.onSnapshot((doc) => {
  if (!doc.exists) {
    configRef.set(config);
    return;
  }
  const data = doc.data();
  config = {
    categories: data.categories && data.categories.length ? data.categories : DEFAULT_CATEGORIES,
    incomeCategories: data.incomeCategories && data.incomeCategories.length ? data.incomeCategories : DEFAULT_INCOME_CATEGORIES,
    budgets: data.budgets || {},
    weddingTarget: data.weddingTarget || 220000,
    weddingVendorBudgets: data.weddingVendorBudgets || {},
    accountBalances: data.accountBalances || { "יוסף": 0, "אגם": 0, "מזומן": 0 },
    savingsGoals: data.savingsGoals || []
  };
  populateCategorySelects();
  renderCurrentView();
});

/* ============================================================
   4) Navigation
   ============================================================ */
const drawerOverlay = document.getElementById("drawer-overlay");
document.getElementById("open-menu").addEventListener("click", () => drawerOverlay.classList.remove("hidden"));
document.getElementById("close-menu").addEventListener("click", () => drawerOverlay.classList.add("hidden"));
drawerOverlay.addEventListener("click", (e) => { if (e.target === drawerOverlay) drawerOverlay.classList.add("hidden"); });

document.querySelectorAll(".drawer-item").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});
document.querySelectorAll("[data-goto]").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.goto));
});

function switchView(view) {
  currentView = view;
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("hidden", el.dataset.view !== view));
  document.querySelectorAll(".drawer-item").forEach((el) => el.classList.toggle("active", el.dataset.view === view));
  drawerOverlay.classList.add("hidden");
  renderCurrentView();
}

function renderCurrentView() {
  if (currentView === "dashboard") renderDashboard();
  else if (currentView === "expenses") renderExpensesView();
  else if (currentView === "income") renderIncomeView();
  else if (currentView === "finances") renderFinancesView();
  else if (currentView === "budget") renderBudgetView();
  else if (currentView === "wedding") renderWeddingView();
  else if (currentView === "reports") renderReportsView();
  else if (currentView === "settings") renderSettingsView();
}

/* ============================================================
   5) Helpers
   ============================================================ */
function toDate(field) {
  if (!field) return new Date(0);
  if (field.toDate) return field.toDate();
  return new Date(field);
}
function sumBy(list, predicate) {
  return list.reduce((sum, e) => (predicate(e) ? sum + Number(e.amount || 0) : sum), 0);
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
function getMonthList(list, monthDate) {
  const start = new Date(monthDate);
  const end = new Date(monthDate);
  end.setMonth(end.getMonth() + 1);
  return list.filter((e) => { const d = toDate(e.date); return d >= start && d < end; });
}
function groupByCategory(list) {
  const map = {};
  list.forEach((e) => { const cat = e.category || "אחר"; map[cat] = (map[cat] || 0) + Number(e.amount || 0); });
  return map;
}
function groupByVendor(list) {
  const map = {};
  list.forEach((e) => { const v = e.vendor || "ללא ספק"; map[v] = (map[v] || 0) + Number(e.amount || 0); });
  return map;
}
function computeAccountBalance(account) {
  const opening = (config.accountBalances && config.accountBalances[account]) || 0;
  const inc = sumBy(allIncome, (i) => i.account === account);
  const exp = sumBy(allExpenses, (e) => e.paidBy === account);
  return opening + inc - exp;
}
function computeTotalBalance() {
  return ACCOUNTS.reduce((s, a) => s + computeAccountBalance(a), 0);
}
function computeTotalSaved() {
  return (config.savingsGoals || []).reduce((s, g) => s + (Number(g.saved) || 0), 0);
}

function populateCategorySelects() {
  const modalSelect = document.getElementById("category");
  if (modalSelect) {
    const prev = modalSelect.value;
    const list = modalType === "income" ? config.incomeCategories : config.categories;
    modalSelect.innerHTML = list.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    if ([...modalSelect.options].some((o) => o.value === prev)) modalSelect.value = prev;
    toggleVendorField();
  }
  const filterExpense = document.getElementById("filter-category");
  if (filterExpense) {
    const prev = filterExpense.value;
    filterExpense.innerHTML = '<option value="">כל הקטגוריות</option>' + config.categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    if ([...filterExpense.options].some((o) => o.value === prev)) filterExpense.value = prev;
  }
  const filterIncome = document.getElementById("income-filter-category");
  if (filterIncome) {
    const prev = filterIncome.value;
    filterIncome.innerHTML = '<option value="">כל הקטגוריות</option>' + config.incomeCategories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    if ([...filterIncome.options].some((o) => o.value === prev)) filterIncome.value = prev;
  }
}

function rowHtml(e, type) {
  const d = toDate(e.date);
  const dateStr = d.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
  const who = type === "income" ? e.account : e.paidBy;
  const dotClass = who === "יוסף" ? "dot-yosef" : who === "אגם" ? "dot-agam" : who === "מזומן" ? "dot-cash" : "dot-savings";
  const sourceTag = e.source === "telegram" ? " · טלגרם" : "";
  const vendorTag = e.vendor ? ` · ${escapeHtml(e.vendor)}` : "";
  const amountClass = type === "income" ? "row-amount income" : "row-amount";
  const prefix = type === "income" ? "+" : "";
  return `
    <div class="expense-row">
      <span class="row-dot ${dotClass}"></span>
      <div class="row-main">
        <div class="row-title">${escapeHtml(e.description || e.category || (type === "income" ? "הכנסה" : "הוצאה"))}</div>
        <div class="row-meta">${escapeHtml(e.category || "אחר")}${vendorTag} · ${escapeHtml(who || "")} · ${dateStr}${sourceTag}</div>
      </div>
      <span class="${amountClass}">${prefix}${Math.round(e.amount).toLocaleString()}₪</span>
      <button class="row-delete" data-id="${e.id}" data-type="${type}" aria-label="מחק">✕</button>
    </div>`;
}
function renderRows(container, list, type, opts = {}) {
  if (!container) return;
  if (list.length === 0) {
    container.innerHTML = `<p class="empty-hint">${opts.emptyText || "אין נתונים תואמים"}</p>`;
    return;
  }
  const items = opts.limit ? list.slice(0, opts.limit) : list;
  container.innerHTML = items.map((e) => rowHtml(e, type)).join("");
  container.querySelectorAll(".row-delete").forEach((btn) => {
    btn.addEventListener("click", () => {
      const isIncome = btn.dataset.type === "income";
      if (confirm(isIncome ? "למחוק את ההכנסה?" : "למחוק את ההוצאה?")) {
        (isIncome ? incomeRef : expensesRef).doc(btn.dataset.id).delete();
      }
    });
  });
}
function renderCategoryBars(container, map, opts = {}) {
  if (!container) return;
  const entries = Object.entries(map);
  if (entries.length === 0) {
    container.innerHTML = `<p class="empty-hint">${opts.emptyText || "אין נתונים עדיין"}</p>`;
    return;
  }
  const max = Math.max(...entries.map(([, v]) => v));
  container.innerHTML = entries.sort((a, b) => b[1] - a[1]).map(([cat, amount]) => {
    const budget = opts.budgets ? opts.budgets[cat] : null;
    const over = budget && amount > budget;
    const pct = (amount / max) * 100;
    const amountText = budget
      ? `${Math.round(amount).toLocaleString()}₪ / ${Math.round(budget).toLocaleString()}₪`
      : `${Math.round(amount).toLocaleString()}₪`;
    return `
      <div class="cat-row">
        <div class="cat-row-top">
          <span class="cat-name">${escapeHtml(cat)}</span>
          <span class="cat-amount">${amountText}</span>
        </div>
        <div class="cat-track"><div class="cat-fill ${over ? "over-budget" : ""}" style="width:${Math.min(pct, 100)}%"></div></div>
      </div>`;
  }).join("");
}
function renderPieChart(container, map, opts = {}) {
  if (!container) return;
  const entries = Object.entries(map).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    container.innerHTML = `<p class="empty-hint">${opts.emptyText || "אין נתונים עדיין"}</p>`;
    return;
  }
  const total = entries.reduce((s, [, v]) => s + v, 0);
  let cum = 0;
  const gradientParts = [];
  const legendParts = [];
  entries.forEach(([name, val], i) => {
    const pct = (val / total) * 100;
    const color = PALETTE[i % PALETTE.length];
    gradientParts.push(`${color} ${cum}% ${cum + pct}%`);
    legendParts.push(`
      <div class="pie-legend-row">
        <span class="pie-dot" style="background:${color}"></span>
        <span class="pie-legend-name">${escapeHtml(name)}</span>
        <span class="pie-legend-pct">${pct.toFixed(0)}%</span>
        <span class="pie-legend-amount">${Math.round(val).toLocaleString()}₪</span>
      </div>`);
    cum += pct;
  });
  container.innerHTML = `
    <div class="pie-wrap">
      <div class="pie-circle" style="background:conic-gradient(${gradientParts.join(",")})"></div>
      <div class="pie-legend">${legendParts.join("")}</div>
    </div>`;
}

/* ============================================================
   6) DASHBOARD
   ============================================================ */
document.getElementById("prev-month").addEventListener("click", () => { currentMonth.setMonth(currentMonth.getMonth() - 1); renderDashboard(); });
document.getElementById("next-month").addEventListener("click", () => { currentMonth.setMonth(currentMonth.getMonth() + 1); renderDashboard(); });

function renderDashboard() {
  const monthExpenses = getMonthList(allExpenses, currentMonth);
  const monthIncome = getMonthList(allIncome, currentMonth);

  document.getElementById("month-label").textContent = `${HEBREW_MONTHS[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;
  document.getElementById("month-sub").textContent = `${monthExpenses.length} הוצאות`;

  const yosefTotal = sumBy(monthExpenses, (e) => e.paidBy === "יוסף");
  const agamTotal = sumBy(monthExpenses, (e) => e.paidBy === "אגם");
  const totalExpenses = sumBy(monthExpenses, () => true);
  const totalIncome = sumBy(monthIncome, () => true);
  const diff = (yosefTotal - agamTotal) / 2;

  const figure = document.getElementById("hero-figure");
  const sub = document.getElementById("hero-sub");
  const badge = document.getElementById("hero-badge");
  if (monthExpenses.length === 0) {
    figure.textContent = "0 ₪"; sub.textContent = "עדיין אין הוצאות בחודש הזה"; badge.textContent = "ריק";
  } else if (Math.abs(diff) < 1) {
    figure.textContent = "מאוזן 🎉"; sub.textContent = "שניכם שילמתם בערך אותו דבר"; badge.textContent = "פעיל";
  } else if (diff > 0) {
    figure.textContent = `${Math.round(diff).toLocaleString()} ₪`; sub.textContent = "אגם חייבת ליוסף"; badge.textContent = "פעיל";
  } else {
    figure.textContent = `${Math.round(Math.abs(diff)).toLocaleString()} ₪`; sub.textContent = "יוסף חייב לאגם"; badge.textContent = "פעיל";
  }

  document.getElementById("stat-total").textContent = `${Math.round(totalExpenses).toLocaleString()}₪`;
  document.getElementById("stat-income").textContent = `${Math.round(totalIncome).toLocaleString()}₪`;
  document.getElementById("stat-yosef").textContent = `${Math.round(yosefTotal).toLocaleString()}₪`;
  document.getElementById("stat-agam").textContent = `${Math.round(agamTotal).toLocaleString()}₪`;
  document.getElementById("stat-balance").textContent = `${Math.round(computeTotalBalance()).toLocaleString()}₪`;
  document.getElementById("stat-saved").textContent = `${Math.round(computeTotalSaved() + computeAccountBalance("חיסכון")).toLocaleString()}₪`;

  renderCategoryBars(document.getElementById("category-bars"), groupByCategory(monthExpenses), { emptyText: "אין עדיין הוצאות החודש" });
  renderRows(document.getElementById("recent-expense-list"), monthExpenses, "expense", { limit: 5, emptyText: "כשתוסיפו הוצאה היא תופיע כאן" });
}

/* ============================================================
   7) EXPENSES VIEW
   ============================================================ */
document.getElementById("search-input").addEventListener("input", renderExpensesView);
document.getElementById("filter-category").addEventListener("change", renderExpensesView);
function renderExpensesView() {
  const term = document.getElementById("search-input").value.trim().toLowerCase();
  const cat = document.getElementById("filter-category").value;
  const filtered = allExpenses.filter((e) => {
    const matchesCat = !cat || e.category === cat;
    const matchesTerm = !term || (e.description || "").toLowerCase().includes(term) || (e.category || "").toLowerCase().includes(term) || (e.vendor || "").toLowerCase().includes(term);
    return matchesCat && matchesTerm;
  });
  renderRows(document.getElementById("full-expense-list"), filtered, "expense");
}

/* ============================================================
   8) INCOME VIEW
   ============================================================ */
document.getElementById("income-search-input").addEventListener("input", renderIncomeView);
document.getElementById("income-filter-category").addEventListener("change", renderIncomeView);
function renderIncomeView() {
  const term = document.getElementById("income-search-input").value.trim().toLowerCase();
  const cat = document.getElementById("income-filter-category").value;
  const filtered = allIncome.filter((e) => {
    const matchesCat = !cat || e.category === cat;
    const matchesTerm = !term || (e.description || "").toLowerCase().includes(term) || (e.category || "").toLowerCase().includes(term);
    return matchesCat && matchesTerm;
  });
  renderRows(document.getElementById("full-income-list"), filtered, "income");
}

/* ============================================================
   9) FINANCES VIEW (balances + savings)
   ============================================================ */
function renderFinancesView() {
  const container = document.getElementById("balance-cards");
  container.innerHTML = BALANCE_ACCOUNTS.map((acc) => {
    const balance = computeAccountBalance(acc);
    const label = acc === "מזומן" ? "מזומן 💵" : acc === "חיסכון" ? "חיסכון 💰" : acc;
    return `
      <div class="balance-card">
        <span class="balance-name">${label}</span>
        <span class="balance-amount">${Math.round(balance).toLocaleString()}₪</span>
        <input type="number" data-account="${acc}" value="${Math.round(balance)}" placeholder="איפוס יתרה">
      </div>`;
  }).join("");
  document.getElementById("balance-total-amount").textContent = `${Math.round(computeTotalBalance()).toLocaleString()}₪`;

  renderSavingsList();
}

document.getElementById("save-balances").addEventListener("click", () => {
  const newBalances = { ...(config.accountBalances || {}) };
  document.querySelectorAll("#balance-cards input[data-account]").forEach((input) => {
    const acc = input.dataset.account;
    const desired = parseFloat(input.value);
    if (isNaN(desired)) return;
    const txDelta = sumBy(allIncome, (i) => i.account === acc) - sumBy(allExpenses, (e) => e.paidBy === acc);
    newBalances[acc] = desired - txDelta;
  });
  configRef.set({ accountBalances: newBalances }, { merge: true }).then(() => alert("היתרות עודכנו ✅"));
});

function renderSavingsList() {
  const container = document.getElementById("savings-list");
  const goals = config.savingsGoals || [];
  if (goals.length === 0) {
    container.innerHTML = `<p class="empty-hint">עדיין אין יעדי חיסכון</p>`;
    return;
  }
  container.innerHTML = goals.map((g) => {
    const pct = g.target > 0 ? Math.min((g.saved / g.target) * 100, 100) : 0;
    const over = g.target > 0 && g.saved > g.target;
    return `
      <div class="savings-row" data-id="${g.id}">
        <div class="savings-row-top">
          <strong>${escapeHtml(g.name)}</strong>
          <button class="row-delete savings-remove" data-id="${g.id}" aria-label="מחק">✕</button>
        </div>
        <div class="cat-track"><div class="cat-fill ${over ? "over-budget" : ""}" style="width:${pct}%"></div></div>
        <div class="savings-row-actions" style="margin-top:8px;">
          <span class="budget-actual">${Math.round(g.saved).toLocaleString()}₪ מתוך ${Math.round(g.target).toLocaleString()}₪</span>
          <input type="number" class="savings-update-input" data-id="${g.id}" placeholder="עדכון סכום" min="0">
          <button class="mini-btn savings-update-btn" data-id="${g.id}">עדכון</button>
        </div>
      </div>`;
  }).join("");

  container.querySelectorAll(".savings-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("למחוק את יעד החיסכון?")) return;
      const newGoals = (config.savingsGoals || []).filter((g) => g.id !== btn.dataset.id);
      configRef.set({ savingsGoals: newGoals }, { merge: true });
    });
  });
  container.querySelectorAll(".savings-update-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = container.querySelector(`.savings-update-input[data-id="${btn.dataset.id}"]`);
      const val = parseFloat(input.value);
      if (isNaN(val)) return;
      const newGoals = (config.savingsGoals || []).map((g) => g.id === btn.dataset.id ? { ...g, saved: val } : g);
      configRef.set({ savingsGoals: newGoals }, { merge: true }).then(() => { input.value = ""; });
    });
  });
}

document.getElementById("add-savings-btn").addEventListener("click", () => {
  const nameInput = document.getElementById("new-savings-name");
  const targetInput = document.getElementById("new-savings-target");
  const name = nameInput.value.trim();
  const target = parseFloat(targetInput.value);
  if (!name || !target || target <= 0) return;
  const newGoal = { id: "g" + Date.now(), name, target, saved: 0 };
  configRef.set({ savingsGoals: [...(config.savingsGoals || []), newGoal] }, { merge: true }).then(() => {
    nameInput.value = ""; targetInput.value = "";
  });
});

/* ============================================================
   10) BUDGET VIEW (excludes "חתונה" - it has its own dedicated view)
   ============================================================ */
function renderBudgetView() {
  const thisMonth = new Date(); thisMonth.setDate(1); thisMonth.setHours(0, 0, 0, 0);
  const spentMap = groupByCategory(getMonthList(allExpenses, thisMonth));
  const cats = config.categories.filter((c) => c !== "חתונה");
  const container = document.getElementById("budget-rows");
  container.innerHTML = cats.map((cat) => {
    const budget = config.budgets[cat] || 0;
    const spent = spentMap[cat] || 0;
    const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
    const over = budget > 0 && spent > budget;
    return `
      <div class="budget-row">
        <div class="budget-row-top"><span>${escapeHtml(cat)}</span><input type="number" min="0" step="50" data-category="${escapeHtml(cat)}" value="${budget || ""}" placeholder="ללא הגבלה"></div>
        <div class="cat-track"><div class="cat-fill ${over ? "over-budget" : ""}" style="width:${pct}%"></div></div>
        <span class="budget-actual">${Math.round(spent).toLocaleString()}₪ הוצאתם החודש</span>
      </div>`;
  }).join("");
}
document.getElementById("save-budget").addEventListener("click", () => {
  const newBudgets = { ...config.budgets };
  document.querySelectorAll("#budget-rows input").forEach((input) => {
    const val = parseFloat(input.value);
    if (val > 0) newBudgets[input.dataset.category] = val; else delete newBudgets[input.dataset.category];
  });
  configRef.set({ budgets: newBudgets }, { merge: true }).then(() => alert("התקציב נשמר ✅"));
});

/* ============================================================
   11) WEDDING VIEW
   ============================================================ */
function getWeddingExpenses() {
  return allExpenses.filter((e) => e.category === "חתונה");
}
function renderWeddingView() {
  const weddingExpenses = getWeddingExpenses();
  const target = config.weddingTarget || 0;
  const spent = sumBy(weddingExpenses, () => true);
  const pct = target > 0 ? Math.min((spent / target) * 100, 100) : 0;
  const over = target > 0 && spent > target;

  document.getElementById("wedding-spent").textContent = `${Math.round(spent).toLocaleString()} ₪`;
  document.getElementById("wedding-sub").textContent = target > 0 ? `מתוך תקציב של ${Math.round(target).toLocaleString()}₪` : "הגדירו תקציב יעד למטה";

  const fill = document.getElementById("wedding-progress");
  fill.style.width = `${pct}%`;
  fill.classList.toggle("over-budget", over);

  const remaining = target - spent;
  document.getElementById("wedding-remaining").textContent = target <= 0 ? "" :
    remaining >= 0 ? `נשארו ${Math.round(remaining).toLocaleString()}₪ מהתקציב` : `חרגתם ב-${Math.round(Math.abs(remaining)).toLocaleString()}₪ מהתקציב המתוכנן`;

  const weddingDate = new Date(2026, 10, 1);
  const daysLeft = Math.ceil((weddingDate - new Date()) / 86400000);
  document.getElementById("wedding-countdown").textContent = daysLeft > 0 ? `~${daysLeft} ימים` : "מזל טוב! 🎉";

  document.getElementById("wedding-target-input").value = target || "";

  renderPieChart(document.getElementById("wedding-pie-wrap"), groupByVendor(weddingExpenses), { emptyText: "הוסיפו הוצאת חתונה כדי לראות פילוח" });

  const vendorSpent = groupByVendor(weddingExpenses);
  const vendorNames = Array.from(new Set([...Object.keys(config.weddingVendorBudgets || {}), ...Object.keys(vendorSpent)]));
  const vendorContainer = document.getElementById("vendor-budget-rows");
  if (vendorNames.length === 0) {
    vendorContainer.innerHTML = `<p class="empty-hint">עדיין אין ספקים</p>`;
  } else {
    vendorContainer.innerHTML = vendorNames.map((v) => {
      const budget = (config.weddingVendorBudgets || {})[v] || 0;
      const actual = vendorSpent[v] || 0;
      const vpct = budget > 0 ? Math.min((actual / budget) * 100, 100) : 0;
      const vover = budget > 0 && actual > budget;
      return `
        <div class="budget-row">
          <div class="budget-row-top">
            <span>${escapeHtml(v)}</span>
            <div style="display:flex;align-items:center;gap:8px;">
              <input type="number" min="0" step="100" data-vendor="${escapeHtml(v)}" value="${budget || ""}" placeholder="תקציב">
              <button class="budget-row-remove" data-vendor-remove="${escapeHtml(v)}">✕</button>
            </div>
          </div>
          <div class="cat-track"><div class="cat-fill ${vover ? "over-budget" : ""}" style="width:${vpct}%"></div></div>
          <span class="budget-actual">${Math.round(actual).toLocaleString()}₪ הוצא בפועל</span>
        </div>`;
    }).join("");
    vendorContainer.querySelectorAll("[data-vendor-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const newBudgets = { ...(config.weddingVendorBudgets || {}) };
        delete newBudgets[btn.dataset.vendorRemove];
        configRef.set({ weddingVendorBudgets: newBudgets }, { merge: true });
      });
    });
  }

  renderRows(document.getElementById("wedding-expense-list"), weddingExpenses, "expense", { emptyText: "עדיין אין הוצאות חתונה" });
}

document.getElementById("add-vendor-btn").addEventListener("click", () => {
  const nameInput = document.getElementById("new-vendor-name");
  const budgetInput = document.getElementById("new-vendor-budget");
  const name = nameInput.value.trim();
  const budget = parseFloat(budgetInput.value) || 0;
  if (!name) return;
  configRef.set({ weddingVendorBudgets: { ...(config.weddingVendorBudgets || {}), [name]: budget } }, { merge: true }).then(() => {
    nameInput.value = ""; budgetInput.value = "";
  });
});
document.getElementById("save-vendor-budgets").addEventListener("click", () => {
  const newBudgets = { ...(config.weddingVendorBudgets || {}) };
  document.querySelectorAll("#vendor-budget-rows input[data-vendor]").forEach((input) => {
    newBudgets[input.dataset.vendor] = parseFloat(input.value) || 0;
  });
  configRef.set({ weddingVendorBudgets: newBudgets }, { merge: true }).then(() => alert("נשמר ✅"));
});
document.getElementById("save-wedding").addEventListener("click", () => {
  const val = parseFloat(document.getElementById("wedding-target-input").value) || 0;
  configRef.set({ weddingTarget: val }, { merge: true }).then(() => alert("נשמר ✅"));
});
document.getElementById("open-add-wedding").addEventListener("click", () => {
  openModal("expense");
  document.getElementById("category").value = "חתונה";
  toggleVendorField();
});

/* ============================================================
   12) REPORTS VIEW
   ============================================================ */
document.querySelectorAll("[data-report]").forEach((btn) => {
  btn.addEventListener("click", () => {
    reportType = btn.dataset.report;
    document.querySelectorAll("[data-report]").forEach((b) => b.classList.toggle("active", b.dataset.report === reportType));
    document.getElementById("pie-title").textContent = reportType === "income" ? "פילוח הכנסות (מאז ההתחלה)" : "פילוח הוצאות (מאז ההתחלה)";
    renderReportsView();
  });
});

function renderReportsView() {
  renderInsights();
  if (reportType === "income") {
    renderPieChart(document.getElementById("report-pie-wrap"), groupByCategory(allIncome), { emptyText: "אין עדיין נתוני הכנסות" });
  } else {
    renderPieChart(document.getElementById("report-pie-wrap"), groupByCategory(allExpenses), { emptyText: "אין עדיין נתוני הוצאות" });
  }

  const months = [];
  const cursor = new Date(); cursor.setDate(1); cursor.setHours(0, 0, 0, 0);
  for (let i = 5; i >= 0; i--) { const m = new Date(cursor); m.setMonth(m.getMonth() - i); months.push(m); }
  const expTotals = months.map((m) => sumBy(getMonthList(allExpenses, m), () => true));
  const incTotals = months.map((m) => sumBy(getMonthList(allIncome, m), () => true));
  const max = Math.max(...expTotals, ...incTotals, 1);

  document.getElementById("monthly-chart").innerHTML = months.map((m, i) => `
    <div class="month-bar-col">
      <div class="month-bars-pair">
        <div class="bar-income" style="height:${(incTotals[i] / max) * 100}%" title="הכנסות: ${Math.round(incTotals[i]).toLocaleString()}₪"></div>
        <div class="bar-expense" style="height:${(expTotals[i] / max) * 100}%" title="הוצאות: ${Math.round(expTotals[i]).toLocaleString()}₪"></div>
      </div>
      <span class="month-bar-label">${HEBREW_MONTHS_SHORT[m.getMonth()]}</span>
    </div>`).join("");
}

function renderInsights() {
  const thisMonth = currentMonth;
  const prevMonth = new Date(thisMonth);
  prevMonth.setMonth(prevMonth.getMonth() - 1);
  const thisExp = getMonthList(allExpenses, thisMonth);
  const prevExp = getMonthList(allExpenses, prevMonth);
  const thisTotal = sumBy(thisExp, () => true);
  const prevTotal = sumBy(prevExp, () => true);
  const delta = thisTotal - prevTotal;

  const container = document.getElementById("insights-panel");
  if (thisExp.length === 0 && prevExp.length === 0) {
    container.innerHTML = `<p class="empty-hint">אין עדיין מספיק נתונים להשוואה</p>`;
    return;
  }

  let summaryHtml = `סך ההוצאות ב${HEBREW_MONTHS[thisMonth.getMonth()]}: <strong>${Math.round(thisTotal).toLocaleString()}₪</strong>`;
  if (prevTotal > 0) {
    const pct = Math.round((delta / prevTotal) * 100);
    if (delta > 0) summaryHtml += ` — עלייה של ${Math.round(delta).toLocaleString()}₪ (${pct}%+) לעומת ${HEBREW_MONTHS[prevMonth.getMonth()]}`;
    else if (delta < 0) summaryHtml += ` — ירידה של ${Math.round(Math.abs(delta)).toLocaleString()}₪ (${Math.abs(pct)}%-) לעומת ${HEBREW_MONTHS[prevMonth.getMonth()]}`;
    else summaryHtml += ` — בדיוק כמו ${HEBREW_MONTHS[prevMonth.getMonth()]}`;
  } else if (thisTotal > 0) {
    summaryHtml += ` — אין נתוני השוואה לחודש הקודם`;
  }

  const thisByCat = groupByCategory(thisExp);
  const prevByCat = groupByCategory(prevExp);
  const allCats = new Set([...Object.keys(thisByCat), ...Object.keys(prevByCat)]);
  const increases = [...allCats]
    .map((cat) => ({ cat, diff: (thisByCat[cat] || 0) - (prevByCat[cat] || 0), thisVal: thisByCat[cat] || 0, prevVal: prevByCat[cat] || 0 }))
    .filter((d) => d.diff > 0)
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 4);

  let listHtml = "";
  if (increases.length > 0) {
    listHtml = `<div class="insight-list">` + increases.map((d) => `
      <div class="insight-row">
        <span class="insight-cat">📈 ${escapeHtml(d.cat)}</span>
        <span class="insight-detail">${Math.round(d.thisVal).toLocaleString()}₪ החודש לעומת ${Math.round(d.prevVal).toLocaleString()}₪ בחודש קודם (+${Math.round(d.diff).toLocaleString()}₪)</span>
      </div>`).join("") + `</div>`;
  } else if (thisExp.length > 0) {
    listHtml = `<p class="empty-hint">לא הוצאתם יותר באף קטגוריה לעומת החודש הקודם 🎉</p>`;
  }

  container.innerHTML = `<div class="insight-summary">${summaryHtml}</div>${listHtml}`;
}

/* ============================================================
   13) SETTINGS VIEW
   ============================================================ */
function renderSettingsView() {
  renderCategoryChips(document.getElementById("category-manage-list"), config.categories, "categories");
  renderCategoryChips(document.getElementById("income-category-manage-list"), config.incomeCategories, "incomeCategories");
}
function renderCategoryChips(container, list, field) {
  container.innerHTML = list.map((cat) => `<span class="category-chip">${escapeHtml(cat)}<button data-cat="${escapeHtml(cat)}" aria-label="הסר">✕</button></span>`).join("");
  container.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (list.length <= 1) return;
      const newList = list.filter((c) => c !== btn.dataset.cat);
      configRef.set({ [field]: newList }, { merge: true });
    });
  });
}
document.getElementById("add-category-btn").addEventListener("click", () => {
  const input = document.getElementById("new-category-input");
  const val = input.value.trim();
  if (!val || config.categories.includes(val)) return;
  configRef.set({ categories: [...config.categories, val] }, { merge: true }).then(() => { input.value = ""; });
});
document.getElementById("add-income-category-btn").addEventListener("click", () => {
  const input = document.getElementById("new-income-category-input");
  const val = input.value.trim();
  if (!val || config.incomeCategories.includes(val)) return;
  configRef.set({ incomeCategories: [...config.incomeCategories, val] }, { merge: true }).then(() => { input.value = ""; });
});
document.getElementById("export-csv-btn").addEventListener("click", exportCSV);
function csvField(val) {
  const s = String(val == null ? "" : val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function exportCSV() {
  const rows = [["סוג", "תאריך", "תיאור", "קטגוריה", "ספק", "ארנק", "סכום"]];
  allExpenses.forEach((e) => {
    rows.push(["הוצאה", toDate(e.date).toLocaleDateString("he-IL"), e.description || "", e.category || "", e.vendor || "", e.paidBy || "", Math.round(e.amount)]);
  });
  allIncome.forEach((e) => {
    rows.push(["הכנסה", toDate(e.date).toLocaleDateString("he-IL"), e.description || "", e.category || "", "", e.account || "", Math.round(e.amount)]);
  });
  const csv = rows.map((r) => r.map(csvField).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `קופה-משותפת-${new Date().toLocaleDateString("he-IL").replace(/\./g, "-")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
document.getElementById("clear-all-btn").addEventListener("click", () => {
  if (!confirm("בטוחים? כל ההוצאות וההכנסות יימחקו לצמיתות.")) return;
  if (!confirm("רגע אחרון - זו פעולה שאי אפשר לבטל. למחוק הכל?")) return;
  Promise.all([
    ...allExpenses.map((e) => expensesRef.doc(e.id).delete()),
    ...allIncome.map((e) => incomeRef.doc(e.id).delete())
  ]).then(() => alert("כל הנתונים נמחקו"));
});

/* ============================================================
   14) Modal (expense / income, shared)
   ============================================================ */
const overlay = document.getElementById("modal-overlay");
function openModal(type) {
  modalType = type || "expense";
  document.querySelectorAll("#modal-overlay [data-type]").forEach((b) => b.classList.toggle("active", b.dataset.type === modalType));
  document.getElementById("modal-title").textContent = modalType === "income" ? "הכנסה חדשה" : "הוצאה חדשה";
  document.getElementById("description-label").textContent = modalType === "income" ? "ממה ההכנסה?" : "על מה?";
  document.getElementById("account-label").textContent = modalType === "income" ? "לאיזה ארנק נכנס?" : "מי שילם?";
  document.getElementById("submit-btn").textContent = modalType === "income" ? "הוסף הכנסה" : "הוסף הוצאה";
  populateCategorySelects();
  overlay.classList.remove("hidden");
}
document.getElementById("open-add").addEventListener("click", () => openModal("expense"));
document.getElementById("close-add").addEventListener("click", () => overlay.classList.add("hidden"));
overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.classList.add("hidden"); });
document.querySelectorAll("#modal-overlay [data-type]").forEach((btn) => {
  btn.addEventListener("click", () => openModal(btn.dataset.type));
});

function toggleVendorField() {
  const vendorField = document.getElementById("vendor-field");
  const isWedding = modalType === "expense" && document.getElementById("category").value === "חתונה";
  vendorField.classList.toggle("hidden", !isWedding);
}
document.getElementById("category").addEventListener("change", toggleVendorField);

document.getElementById("expense-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const amount = parseFloat(document.getElementById("amount").value);
  const description = document.getElementById("description").value.trim();
  const category = document.getElementById("category").value;
  const account = document.querySelector('input[name="payAccount"]:checked').value;
  if (!amount || amount <= 0) return;

  if (modalType === "income") {
    incomeRef.add({ amount, description, category, account, source: "web", date: firebase.firestore.Timestamp.now() }).then(resetAndClose);
  } else {
    const vendor = category === "חתונה" ? document.getElementById("vendor").value.trim() : "";
    expensesRef.add({ amount, description, category, paidBy: account, vendor, source: "web", date: firebase.firestore.Timestamp.now() }).then(resetAndClose);
  }
});
function resetAndClose() {
  document.getElementById("expense-form").reset();
  document.querySelector('input[name="payAccount"][value="יוסף"]').checked = true;
  overlay.classList.add("hidden");
}

/* ============================================================
   15) Init
   ============================================================ */
populateCategorySelects();
renderCurrentView();
