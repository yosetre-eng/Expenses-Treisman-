/* ============================================================
   1) Firebase init
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
const auth = firebase.auth();

// Firestore refs — set per-user after login
let expensesRef, incomeRef, debtsRef, recurringRef, eventsRef, configRef;
let firestoreUnsubscribers = [];

function initFirestoreRefs(uid) {
  const userDoc = db.collection("users").doc(uid);
  expensesRef = userDoc.collection("expenses");
  incomeRef   = userDoc.collection("income");
  debtsRef    = userDoc.collection("debts");
  recurringRef = userDoc.collection("recurringExpenses");
  eventsRef   = userDoc.collection("events");
  configRef   = userDoc.collection("meta").doc("config");
}

function startFirestoreListeners() {
  firestoreUnsubscribers.forEach((fn) => fn());
  firestoreUnsubscribers = [];
  firestoreUnsubscribers.push(
    expensesRef.orderBy("date", "desc").onSnapshot((s) => {
      allExpenses = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderCurrentView();
    }, (e) => console.error("expenses:", e))
  );
  firestoreUnsubscribers.push(
    incomeRef.orderBy("date", "desc").onSnapshot((s) => {
      allIncome = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderCurrentView();
    }, (e) => console.error("income:", e))
  );
  firestoreUnsubscribers.push(
    debtsRef.orderBy("date", "desc").onSnapshot((s) => {
      allDebts = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderCurrentView();
    }, (e) => console.error("debts:", e))
  );
  firestoreUnsubscribers.push(
    recurringRef.onSnapshot((s) => {
      allRecurring = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (!recurringCatchUpRan) { recurringCatchUpRan = true; runRecurringCatchUp(); }
      renderCurrentView();
    }, (e) => console.error("recurring:", e))
  );
  firestoreUnsubscribers.push(
    eventsRef.orderBy("createdAt", "desc").onSnapshot((s) => {
      allEvents = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderCurrentView();
    }, (e) => console.error("events:", e))
  );
  firestoreUnsubscribers.push(
    configRef.onSnapshot((doc) => {
      if (!doc.exists) { configRef.set(config); return; }
      const data = doc.data();
      config = {
        categories: data.categories?.length ? data.categories : DEFAULT_CATEGORIES,
        incomeCategories: data.incomeCategories?.length ? data.incomeCategories : DEFAULT_INCOME_CATEGORIES,
        budgets: data.budgets || {},
        accountBalances: data.accountBalances || {},
        savingsGoals: data.savingsGoals || [],
        maaserEnabled: data.maaserEnabled || false,
        isSelfEmployed: data.isSelfEmployed || false,
        partner1Name: data.partner1Name || "בן/בת זוג 1",
        partner2Name: data.partner2Name || "בן/בת זוג 2"
      };
      updatePartnerNamesInUI();
      populateCategorySelects();
      applyMaaserSettings();
      renderCurrentView();
    }, (e) => console.error("config:", e))
  );
}

function stopFirestoreListeners() {
  firestoreUnsubscribers.forEach((fn) => fn());
  firestoreUnsubscribers = [];
}

/* ============================================================
   2) State
   ============================================================ */
let allExpenses = [];
let allIncome = [];
let allDebts = [];
let allRecurring = [];
let allEvents = [];
let recurringCatchUpRan = false;
let currentMonth = new Date();
currentMonth.setDate(1);
currentMonth.setHours(0, 0, 0, 0);
let currentView = "dashboard";
let modalType = "expense";
let reportType = "expenses";
let reportPeriod = "month";
let recurringModalType = "expense";
let currentEventId = null;

const DEFAULT_CATEGORIES = ["אוכל", "דיור", "תחבורה", "בילויים", "בריאות", "אחר"];
const DEFAULT_INCOME_CATEGORIES = ["משכורת", "בונוס", "מתנה", "החזר כספי", "אחר"];
let ACCOUNTS = ["בן/בת זוג 1", "בן/בת זוג 2", "מזומן"];
let BALANCE_ACCOUNTS = ["בן/בת זוג 1", "בן/בת זוג 2", "מזומן", "חיסכון"];
const PALETTE = ["#2F8F86","#D6577A","#2F5FD6","#C2570E","#7C5CE0","#B8860B","#34A853","#EC4899","#0EA5E9","#F97316","#9333EA","#059669"];

let config = {
  categories: DEFAULT_CATEGORIES,
  incomeCategories: DEFAULT_INCOME_CATEGORIES,
  budgets: {},
  accountBalances: {},
  savingsGoals: [],
  maaserEnabled: false,
  isSelfEmployed: false,
  partner1Name: "בן/בת זוג 1",
  partner2Name: "בן/בת זוג 2"
};

const HEBREW_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const HEBREW_MONTHS_SHORT = ["ינו","פבר","מרץ","אפר","מאי","יונ","יול","אוג","ספט","אוק","נוב","דצמ"];

// Partner name helpers
function p1() { return config.partner1Name || "בן/בת זוג 1"; }
function p2() { return config.partner2Name || "בן/בת זוג 2"; }

function updatePartnerNamesInUI() {
  const n1 = p1(), n2 = p2();
  ACCOUNTS = [n1, n2, "מזומן"];
  BALANCE_ACCOUNTS = [n1, n2, "מזומן", "חיסכון"];

  // Avatars & brand
  const a1 = document.getElementById("avatar-p1"); if (a1) a1.textContent = n1[0];
  const a2 = document.getElementById("avatar-p2"); if (a2) a2.textContent = n2[0];
  const sub = document.getElementById("brand-sub"); if (sub) sub.textContent = `${n1} ו${n2}`;
  const fhs = document.getElementById("finances-hero-sub");
  if (fhs) fhs.textContent = `${n1} + ${n2} + מזומן + חיסכון, הכל ביחד`;

  // Stat labels
  const sl1 = document.getElementById("stat-label-p1"); if (sl1) sl1.textContent = `שילם/ה ${n1}`;
  const sl2 = document.getElementById("stat-label-p2"); if (sl2) sl2.textContent = `שילם/ה ${n2}`;

  // All partner1 radios & labels
  document.querySelectorAll('[data-partner="1"]').forEach((el) => { el.value = n1; });
  document.querySelectorAll('[data-partner-label="1"]').forEach((el) => { el.textContent = n1; });
  document.querySelectorAll('[data-partner="2"]').forEach((el) => { el.value = n2; });
  document.querySelectorAll('[data-partner-label="2"]').forEach((el) => { el.textContent = n2; });
}

/* ============================================================
   3) Auth state — drives everything
   ============================================================ */
auth.onAuthStateChanged((user) => {
  if (user) {
    document.getElementById("auth-overlay").classList.add("hidden");
    document.getElementById("app").classList.remove("app-hidden");
    initFirestoreRefs(user.uid);
    startFirestoreListeners();
    const emailEl = document.getElementById("settings-user-email");
    if (emailEl) emailEl.textContent = user.email;
  } else {
    stopFirestoreListeners();
    allExpenses = []; allIncome = []; allDebts = []; allRecurring = []; allEvents = [];
    document.getElementById("auth-overlay").classList.remove("hidden");
    document.getElementById("app").classList.add("app-hidden");
  }
});

/* ============================================================
   4) Auth UI handlers
   ============================================================ */
function showAuthError(msg) {
  const el = document.getElementById("auth-error");
  el.textContent = msg; el.classList.remove("hidden");
}
function clearAuthError() {
  document.getElementById("auth-error").classList.add("hidden");
}
function setAuthLoading(on) {
  document.getElementById("auth-loading").classList.toggle("hidden", !on);
}

// Tab switch
document.querySelectorAll("[data-auth-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.authTab;
    document.querySelectorAll("[data-auth-tab]").forEach((b) => b.classList.toggle("active", b.dataset.authTab === tab));
    document.getElementById("login-form").classList.toggle("hidden", tab !== "login");
    document.getElementById("register-form").classList.toggle("hidden", tab !== "register");
    clearAuthError();
  });
});

// Login
document.getElementById("login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  clearAuthError();
  setAuthLoading(true);
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  auth.signInWithEmailAndPassword(email, password).catch((err) => {
    setAuthLoading(false);
    showAuthError(authErrorMessage(err.code));
  });
});

// Register
document.getElementById("register-form").addEventListener("submit", (e) => {
  e.preventDefault();
  clearAuthError();
  const p1Name = document.getElementById("reg-partner1").value.trim();
  const p2Name = document.getElementById("reg-partner2").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;
  if (!p1Name || !p2Name) { showAuthError("נא להזין שמות לשני בני הזוג"); return; }
  setAuthLoading(true);
  auth.createUserWithEmailAndPassword(email, password).then((cred) => {
    const uid = cred.user.uid;
    const userDoc = db.collection("users").doc(uid);
    const defaultCfg = {
      partner1Name: p1Name,
      partner2Name: p2Name,
      categories: DEFAULT_CATEGORIES,
      incomeCategories: DEFAULT_INCOME_CATEGORIES,
      budgets: {},
      accountBalances: { [p1Name]: 0, [p2Name]: 0, "מזומן": 0 },
      savingsGoals: [],
      maaserEnabled: false,
      isSelfEmployed: false
    };
    return userDoc.collection("meta").doc("config").set(defaultCfg);
  }).catch((err) => {
    setAuthLoading(false);
    showAuthError(authErrorMessage(err.code));
  });
});

// Forgot password
document.getElementById("forgot-password-btn").addEventListener("click", () => {
  const email = document.getElementById("login-email").value.trim();
  if (!email) { showAuthError("הזינו את האימייל כדי לאפס סיסמא"); return; }
  auth.sendPasswordResetEmail(email).then(() => {
    clearAuthError();
    document.getElementById("auth-error").textContent = "📧 נשלח מייל לאיפוס סיסמא";
    document.getElementById("auth-error").classList.remove("hidden");
  }).catch(() => showAuthError("לא הצלחנו למצוא את האימייל הזה"));
});

function authErrorMessage(code) {
  const map = {
    "auth/user-not-found": "לא נמצא משתמש עם האימייל הזה",
    "auth/wrong-password": "סיסמא שגויה",
    "auth/email-already-in-use": "האימייל הזה כבר רשום — נסו להתחבר",
    "auth/weak-password": "הסיסמא חלשה מדי — לפחות 6 תווים",
    "auth/invalid-email": "כתובת אימייל לא תקינה",
    "auth/invalid-credential": "אימייל או סיסמא שגויים"
  };
  return map[code] || "שגיאה — נסו שוב";
}

/* ============================================================
   5) Navigation
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
  else if (currentView === "reports") renderReportsView();
  else if (currentView === "events") renderEventsView();
  else if (currentView === "maaser") renderMaaserView();
  else if (currentView === "debts") renderDebtsView();
  else if (currentView === "recurring") renderRecurringView();
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
function showToast(message, duration = 3000) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
function getMonthList(list, monthDate) {
  const start = new Date(monthDate);
  const end = new Date(monthDate);
  end.setMonth(end.getMonth() + 1);
  return list.filter((e) => { const d = toDate(e.date); return d >= start && d < end; });
}
function regularExpenses() { return allExpenses.filter((e) => !e.eventId); }

function groupByCategory(list) {
  const map = {};
  list.forEach((e) => { const cat = e.category || "אחר"; map[cat] = (map[cat] || 0) + Number(e.amount || 0); });
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
function computeGrandTotal() {
  return BALANCE_ACCOUNTS.reduce((s, a) => s + computeAccountBalance(a), 0);
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
  const recurringCategory = document.getElementById("recurring-category");
  if (recurringCategory) {
    const prev = recurringCategory.value;
    const list = recurringModalType === "income" ? config.incomeCategories : config.categories;
    recurringCategory.innerHTML = list.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    if ([...recurringCategory.options].some((o) => o.value === prev)) recurringCategory.value = prev;
  }
  const eventExpCat = document.getElementById("event-expense-category");
  if (eventExpCat) {
    const prev = eventExpCat.value;
    eventExpCat.innerHTML = config.categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    if ([...eventExpCat.options].some((o) => o.value === prev)) eventExpCat.value = prev;
  }
}

function rowHtml(e, type) {
  const d = toDate(e.date);
  const dateStr = d.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
  const who = type === "income" ? e.account : e.paidBy;
  const dotClass = who === p1() ? "dot-yosef" : who === p2() ? "dot-agam" : who === "מזומן" ? "dot-cash" : "dot-savings";
  const sourceTag = e.source === "telegram" ? " · טלגרם" : e.source === "recurring" ? " · קבוע 🔁" : e.source === "bank-import" ? " · ייבוא בנק 🏦" : "";
  const amountClass = type === "income" ? "row-amount income" : "row-amount";
  const prefix = type === "income" ? "+" : "";
  return `
    <div class="expense-row">
      <span class="row-dot ${dotClass}"></span>
      <div class="row-main">
        <div class="row-title">${escapeHtml(e.description || e.category || (type === "income" ? "הכנסה" : "הוצאה"))}</div>
        <div class="row-meta">${escapeHtml(e.category || "אחר")} · ${escapeHtml(who || "")} · ${dateStr}${sourceTag}</div>
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
function changeMonth(delta) {
  currentMonth.setMonth(currentMonth.getMonth() + delta);
  updateMonthBarLabels();
  renderCurrentView();
}
function updateMonthBarLabels() {
  const label = `${HEBREW_MONTHS[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;
  ["month-label", "expenses-month-label", "income-month-label"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = label;
  });
}
document.getElementById("prev-month").addEventListener("click", () => changeMonth(-1));
document.getElementById("next-month").addEventListener("click", () => changeMonth(1));
document.getElementById("expenses-prev-month").addEventListener("click", () => changeMonth(-1));
document.getElementById("expenses-next-month").addEventListener("click", () => changeMonth(1));
document.getElementById("income-prev-month").addEventListener("click", () => changeMonth(-1));
document.getElementById("income-next-month").addEventListener("click", () => changeMonth(1));

function renderDashboard() {
  const monthExpenses = getMonthList(regularExpenses(), currentMonth);
  const monthIncome = getMonthList(allIncome, currentMonth);

  updateMonthBarLabels();
  document.getElementById("month-sub").textContent = `${monthExpenses.length} הוצאות`;

  const yosefTotal = sumBy(monthExpenses, (e) => e.paidBy === p1());
  const agamTotal = sumBy(monthExpenses, (e) => e.paidBy === p2());
  const cashTotal = sumBy(monthExpenses, (e) => e.paidBy === "מזומן");
  const savingsTotal = sumBy(monthExpenses, (e) => e.paidBy === "חיסכון");
  const totalExpenses = sumBy(monthExpenses, () => true);
  const totalIncome = sumBy(monthIncome, () => true);

  const figure = document.getElementById("hero-figure");
  const sub = document.getElementById("hero-sub");
  const badge = document.getElementById("hero-badge");
  if (monthExpenses.length === 0) {
    figure.textContent = "0 ₪"; sub.textContent = "עדיין אין הוצאות בחודש הזה"; badge.textContent = "ריק";
  } else {
    figure.textContent = `${Math.round(totalExpenses).toLocaleString()} ₪`;
    const parts = [];
    if (yosefTotal > 0) parts.push(`${p1()} ${Math.round(yosefTotal).toLocaleString()}₪`);
    if (agamTotal > 0) parts.push(`${p2()} ${Math.round(agamTotal).toLocaleString()}₪`);
    if (cashTotal > 0) parts.push(`מזומן ${Math.round(cashTotal).toLocaleString()}₪`);
    if (savingsTotal > 0) parts.push(`חיסכון ${Math.round(savingsTotal).toLocaleString()}₪`);
    sub.textContent = parts.length ? `מתוכם: ${parts.join(" · ")}` : "סך ההוצאות המשותפות החודש";
    badge.textContent = "פעיל";
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
let expensesShowAll = false;
document.getElementById("search-input").addEventListener("input", renderExpensesView);
document.getElementById("filter-category").addEventListener("change", renderExpensesView);
document.getElementById("expenses-show-all").addEventListener("click", () => {
  expensesShowAll = !expensesShowAll;
  document.getElementById("expenses-show-all").classList.toggle("active", expensesShowAll);
  renderExpensesView();
});
function renderExpensesView() {
  const term = document.getElementById("search-input").value.trim().toLowerCase();
  const cat = document.getElementById("filter-category").value;
  const base = expensesShowAll ? regularExpenses() : getMonthList(regularExpenses(), currentMonth);
  const filtered = base.filter((e) => {
    const matchesCat = !cat || e.category === cat;
    const matchesTerm = !term || (e.description || "").toLowerCase().includes(term) || (e.category || "").toLowerCase().includes(term);
    return matchesCat && matchesTerm;
  });
  document.getElementById("expenses-month-sub").textContent = expensesShowAll ? `${filtered.length} הוצאות · כל הזמנים` : `${filtered.length} הוצאות`;
  renderRows(document.getElementById("full-expense-list"), filtered, "expense");
}

/* ============================================================
   8) INCOME VIEW
   ============================================================ */
let incomeShowAll = false;
document.getElementById("income-search-input").addEventListener("input", renderIncomeView);
document.getElementById("income-filter-category").addEventListener("change", renderIncomeView);
document.getElementById("income-show-all").addEventListener("click", () => {
  incomeShowAll = !incomeShowAll;
  document.getElementById("income-show-all").classList.toggle("active", incomeShowAll);
  renderIncomeView();
});
function renderIncomeView() {
  const term = document.getElementById("income-search-input").value.trim().toLowerCase();
  const cat = document.getElementById("income-filter-category").value;
  const base = incomeShowAll ? allIncome : getMonthList(allIncome, currentMonth);
  const filtered = base.filter((e) => {
    const matchesCat = !cat || e.category === cat;
    const matchesTerm = !term || (e.description || "").toLowerCase().includes(term) || (e.category || "").toLowerCase().includes(term);
    return matchesCat && matchesTerm;
  });
  document.getElementById("income-month-sub").textContent = incomeShowAll ? `${filtered.length} הכנסות · כל הזמנים` : `${filtered.length} הכנסות`;
  renderRows(document.getElementById("full-income-list"), filtered, "income");
}

/* ============================================================
   9) FINANCES VIEW (balances + savings)
   ============================================================ */
function renderFinancesView() {
  document.getElementById("grand-total-figure").textContent = `${Math.round(computeGrandTotal()).toLocaleString()} ₪`;
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
   10) BUDGET VIEW
   ============================================================ */
function renderBudgetView() {
  const thisMonth = new Date(); thisMonth.setDate(1); thisMonth.setHours(0, 0, 0, 0);
  const spentMap = groupByCategory(getMonthList(regularExpenses(), thisMonth));
  const cats = config.categories;
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
   12) RECURRING (EXPENSE + INCOME, auto-generated on a schedule)
   ============================================================ */
function addPeriod(date, frequency) {
  const d = new Date(date);
  if (frequency === "weekly") d.setDate(d.getDate() + 7);
  else if (frequency === "yearly") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}
function runRecurringCatchUp() {
  const now = new Date();
  allRecurring.forEach((r) => {
    if (!r.active) return;
    const type = r.type || "expense";
    let last = r.lastGenerated ? toDate(r.lastGenerated) : (r.createdAt ? toDate(r.createdAt) : now);
    let next = addPeriod(last, r.frequency);
    let count = 0;
    const batch = db.batch();
    let generated = false;
    while (next <= now && count < 24) {
      const targetRef = type === "income" ? incomeRef.doc() : expensesRef.doc();
      const entry = type === "income"
        ? { amount: r.amount, description: r.name, category: r.category, account: r.account, source: "recurring", date: firebase.firestore.Timestamp.fromDate(next) }
        : { amount: r.amount, description: r.name, category: r.category, paidBy: r.account, source: "recurring", date: firebase.firestore.Timestamp.fromDate(next) };
      batch.set(targetRef, entry);
      last = next;
      next = addPeriod(next, r.frequency);
      count++;
      generated = true;
    }
    if (generated) {
      batch.update(recurringRef.doc(r.id), { lastGenerated: firebase.firestore.Timestamp.fromDate(last) });
      batch.commit().catch((err) => console.error("Recurring catch-up error:", err));
    }
  });
}
function recurringRowHtml(r) {
  const type = r.type || "expense";
  const freqLabel = r.frequency === "weekly" ? "שבועי" : r.frequency === "yearly" ? "שנתי" : "חודשי";
  const typeLabel = type === "income" ? "הכנסה" : "הוצאה";
  const last = r.lastGenerated ? toDate(r.lastGenerated) : (r.createdAt ? toDate(r.createdAt) : new Date());
  const next = addPeriod(last, r.frequency);
  const nextStr = next.toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" });
  const amountClass = type === "income" ? "recurring-amount income" : "recurring-amount";
  const prefix = type === "income" ? "+" : "";
  return `
    <div class="recurring-row ${r.active ? "" : "recurring-paused"}">
      <div class="recurring-row-top">
        <div><strong>${escapeHtml(r.name)}</strong><span class="recurring-badge recurring-badge-${type}">${typeLabel} · ${freqLabel}</span></div>
        <span class="${amountClass}">${prefix}${Math.round(r.amount).toLocaleString()}₪</span>
      </div>
      <div class="recurring-meta">${escapeHtml(r.category)} · ${escapeHtml(r.account)} · ${type === "income" ? "הזיכוי הבא" : "החיוב הבא"}: ${r.active ? nextStr : "מושהה"}</div>
      <div class="recurring-actions">
        <button class="mini-btn recurring-toggle" data-id="${r.id}" data-active="${r.active}">${r.active ? "השהיה" : "הפעלה"}</button>
        <button class="row-delete recurring-delete" data-id="${r.id}" aria-label="מחק">✕ מחיקה</button>
      </div>
    </div>`;
}
function renderRecurringView() {
  const container = document.getElementById("recurring-list");
  if (allRecurring.length === 0) {
    container.innerHTML = `<p class="empty-hint">עדיין אין תנועות קבועות</p>`;
    return;
  }
  container.innerHTML = allRecurring.map(recurringRowHtml).join("");
  container.querySelectorAll(".recurring-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const isActive = btn.dataset.active === "true";
      recurringRef.doc(btn.dataset.id).update({ active: !isActive });
    });
  });
  container.querySelectorAll(".recurring-delete").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (confirm("למחוק את התנועה הקבועה? תנועות שכבר נוצרו מהעבר לא יימחקו.")) recurringRef.doc(btn.dataset.id).delete();
    });
  });
}

function setRecurringModalType(type) {
  recurringModalType = type || "expense";
  document.querySelectorAll("#recurring-modal-overlay [data-rtype]").forEach((b) => b.classList.toggle("active", b.dataset.rtype === recurringModalType));
  document.getElementById("recurring-modal-title").textContent = recurringModalType === "income" ? "הכנסה קבועה חדשה" : "הוצאה קבועה חדשה";
  document.getElementById("recurring-name-label").textContent = recurringModalType === "income" ? "שם ההכנסה" : "שם ההוצאה";
  document.getElementById("recurring-account-label").textContent = recurringModalType === "income" ? "לאיזה ארנק נכנס?" : "ממי זה יוצא?";
  document.getElementById("recurring-submit-btn").textContent = recurringModalType === "income" ? "הוספה + זיכוי ראשון עכשיו" : "הוספה + חיוב ראשון עכשיו";
  populateCategorySelects();
}
const recurringModalOverlay = document.getElementById("recurring-modal-overlay");
document.getElementById("open-add-recurring").addEventListener("click", () => {
  setRecurringModalType("expense");
  recurringModalOverlay.classList.remove("hidden");
});
document.getElementById("close-recurring-modal").addEventListener("click", () => recurringModalOverlay.classList.add("hidden"));
recurringModalOverlay.addEventListener("click", (e) => { if (e.target === recurringModalOverlay) recurringModalOverlay.classList.add("hidden"); });
document.querySelectorAll("#recurring-modal-overlay [data-rtype]").forEach((btn) => {
  btn.addEventListener("click", () => setRecurringModalType(btn.dataset.rtype));
});
document.getElementById("recurring-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("recurring-name").value.trim();
  const amount = parseFloat(document.getElementById("recurring-amount").value);
  const category = document.getElementById("recurring-category").value;
  const frequency = document.getElementById("recurring-frequency").value;
  const account = document.querySelector('input[name="recurringAccount"]:checked').value;
  if (!name || !amount || amount <= 0) return;
  const now = firebase.firestore.Timestamp.now();
  recurringRef.add({ name, amount, category, frequency, account, type: recurringModalType, active: true, createdAt: now, lastGenerated: now }).then(() => {
    if (recurringModalType === "income") {
      incomeRef.add({ amount, description: name, category, account, source: "recurring", date: now });
    } else {
      expensesRef.add({ amount, description: name, category, paidBy: account, source: "recurring", date: now });
    }
    document.getElementById("recurring-form").reset();
    document.querySelector('input[name="recurringAccount"][data-partner="1"]').checked = true;
    recurringModalOverlay.classList.add("hidden");
  });
});

/* ============================================================
   13) DEBTS VIEW (we owe people / people owe us)
   ============================================================ */
function debtRowHtml(d) {
  const dateStr = toDate(d.date).toLocaleDateString("he-IL", { day: "numeric", month: "short" });
  const dirLabel = d.direction === "owe" ? "אנחנו חייבים" : "חייבים לנו";
  const dotClass = d.direction === "owe" ? "dot-debt-owe" : "dot-debt-owed";
  const amountClass = d.direction === "owed" ? "row-amount income" : "row-amount";
  const settleBtn = !d.settled ? `<button class="row-settle" data-id="${d.id}" aria-label="סגירת חוב">✓</button>` : `<button class="row-reopen" data-id="${d.id}">פתיחה מחדש</button>`;
  return `
    <div class="expense-row">
      <span class="row-dot ${dotClass}"></span>
      <div class="row-main">
        <div class="row-title">${escapeHtml(d.name)}</div>
        <div class="row-meta">${dirLabel}${d.note ? ` · ${escapeHtml(d.note)}` : ""} · ${dateStr}</div>
      </div>
      <span class="${amountClass}">${Math.round(d.amount).toLocaleString()}₪</span>
      ${settleBtn}
      <button class="row-delete" data-id="${d.id}" aria-label="מחק">✕</button>
    </div>`;
}
function renderDebtList(container, list, opts = {}) {
  if (list.length === 0) {
    container.innerHTML = `<p class="empty-hint">${opts.emptyText || "אין נתונים"}</p>`;
    return;
  }
  container.innerHTML = list.map(debtRowHtml).join("");
  container.querySelectorAll(".row-delete").forEach((btn) => {
    btn.addEventListener("click", () => { if (confirm("למחוק את החוב?")) debtsRef.doc(btn.dataset.id).delete(); });
  });
  container.querySelectorAll(".row-settle").forEach((btn) => {
    btn.addEventListener("click", () => debtsRef.doc(btn.dataset.id).update({ settled: true }));
  });
  container.querySelectorAll(".row-reopen").forEach((btn) => {
    btn.addEventListener("click", () => debtsRef.doc(btn.dataset.id).update({ settled: false }));
  });
}
function renderDebtsView() {
  const open = allDebts.filter((d) => !d.settled);
  const settled = allDebts.filter((d) => d.settled);
  const weOwe = sumBy(open, (d) => d.direction === "owe");
  const owedToUs = sumBy(open, (d) => d.direction === "owed");
  const net = owedToUs - weOwe;

  const figure = document.getElementById("debts-net-figure");
  const sub = document.getElementById("debts-net-sub");
  const badge = document.getElementById("debts-badge");
  if (open.length === 0) {
    figure.textContent = "0 ₪"; sub.textContent = "אין חובות פתוחים"; badge.textContent = "ריק";
  } else if (Math.abs(net) < 1) {
    figure.textContent = "מאוזן 🎉"; sub.textContent = "מה שאנחנו חייבים שווה למה שחייבים לנו"; badge.textContent = "פעיל";
  } else if (net > 0) {
    figure.textContent = `${Math.round(net).toLocaleString()} ₪`; sub.textContent = "בסך הכל חייבים לנו יותר ממה שאנחנו חייבים"; badge.textContent = "פעיל";
  } else {
    figure.textContent = `${Math.round(Math.abs(net)).toLocaleString()} ₪`; sub.textContent = "בסך הכל אנחנו חייבים יותר ממה שחייבים לנו"; badge.textContent = "פעיל";
  }

  document.getElementById("stat-we-owe").textContent = `${Math.round(weOwe).toLocaleString()}₪`;
  document.getElementById("stat-owed-to-us").textContent = `${Math.round(owedToUs).toLocaleString()}₪`;

  const personMap = {};
  open.forEach((d) => { personMap[d.name] = (personMap[d.name] || 0) + (d.direction === "owed" ? d.amount : -d.amount); });
  const personContainer = document.getElementById("debts-by-person");
  const personEntries = Object.entries(personMap).filter(([, v]) => Math.abs(v) > 0.5);
  if (personEntries.length === 0) {
    personContainer.innerHTML = `<p class="empty-hint">אין חובות פתוחים</p>`;
  } else {
    personContainer.innerHTML = personEntries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([name, v]) => {
      const positive = v > 0;
      const text = positive ? `חייב/ת לנו ${Math.round(v).toLocaleString()}₪` : `אנחנו חייבים ${Math.round(Math.abs(v)).toLocaleString()}₪`;
      return `
        <div class="person-row">
          <span class="person-name">${escapeHtml(name)}</span>
          <span class="person-amount ${positive ? "positive" : "negative"}">${text}</span>
        </div>`;
    }).join("");
  }

  renderDebtList(document.getElementById("debts-open-list"), open, { emptyText: "אין חובות פתוחים כרגע" });
  renderDebtList(document.getElementById("debts-settled-list"), settled.slice(0, 20), { emptyText: "עדיין אין היסטוריה" });
}

const debtModalOverlay = document.getElementById("debt-modal-overlay");
document.getElementById("open-add-debt").addEventListener("click", () => debtModalOverlay.classList.remove("hidden"));
document.getElementById("close-debt-modal").addEventListener("click", () => debtModalOverlay.classList.add("hidden"));
debtModalOverlay.addEventListener("click", (e) => { if (e.target === debtModalOverlay) debtModalOverlay.classList.add("hidden"); });
document.getElementById("debt-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("debt-name").value.trim();
  const amount = parseFloat(document.getElementById("debt-amount").value);
  const direction = document.querySelector('input[name="debtDirection"]:checked').value;
  const note = document.getElementById("debt-note").value.trim();
  if (!name || !amount || amount <= 0) return;
  debtsRef.add({ name, amount, direction, note, settled: false, date: firebase.firestore.Timestamp.now() }).then(() => {
    document.getElementById("debt-form").reset();
    document.querySelector('input[name="debtDirection"][value="owe"]').checked = true;
    debtModalOverlay.classList.add("hidden");
  });
});

/* ============================================================
   13) REPORTS VIEW
   ============================================================ */
document.querySelectorAll("[data-report]").forEach((btn) => {
  btn.addEventListener("click", () => {
    reportType = btn.dataset.report;
    document.querySelectorAll("[data-report]").forEach((b) => b.classList.toggle("active", b.dataset.report === reportType));
    renderReportsView();
  });
});
document.querySelectorAll("[data-period]").forEach((btn) => {
  btn.addEventListener("click", () => {
    reportPeriod = btn.dataset.period;
    document.querySelectorAll("[data-period]").forEach((b) => b.classList.toggle("active", b.dataset.period === reportPeriod));
    renderReportsView();
  });
});

function getReportDateRange() {
  const now = new Date();
  if (reportPeriod === "month") {
    const start = new Date(currentMonth); start.setDate(1); start.setHours(0,0,0,0);
    const end = new Date(start); end.setMonth(end.getMonth()+1);
    return { start, end, label: `${HEBREW_MONTHS[currentMonth.getMonth()]} ${currentMonth.getFullYear()}` };
  }
  if (reportPeriod === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), q * 3, 1);
    const end = new Date(now.getFullYear(), q * 3 + 3, 1);
    return { start, end, label: `רבעון ${q+1} / ${now.getFullYear()}` };
  }
  if (reportPeriod === "year") {
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear()+1, 0, 1);
    return { start, end, label: `שנת ${now.getFullYear()}` };
  }
  return { start: null, end: null, label: "כל הזמנים" };
}

function filterByRange(list, { start, end }) {
  if (!start) return list;
  return list.filter((e) => { const d = toDate(e.date); return d >= start && d < end; });
}

function renderReportsView() {
  const range = getReportDateRange();
  const regExp = regularExpenses();
  const periodExp = filterByRange(regExp, range);
  const periodInc = filterByRange(allIncome, range);
  const totalExp = sumBy(periodExp, () => true);
  const totalInc = sumBy(periodInc, () => true);
  const net = totalInc - totalExp;

  // Net balance hero card
  const card = document.getElementById("reports-net-card");
  const isPositive = net >= 0;
  card.className = `reports-net-card ${isPositive ? "net-positive" : "net-negative"}`;
  document.getElementById("reports-net-period").textContent = range.label;
  document.getElementById("reports-net-figure").textContent = `${net >= 0 ? "+" : ""}${Math.round(net).toLocaleString()} ₪`;
  document.getElementById("reports-net-sub").textContent =
    `הכנסות ${Math.round(totalInc).toLocaleString()}₪  |  הוצאות ${Math.round(totalExp).toLocaleString()}₪`;

  // Pie chart
  const pieData = reportType === "income" ? groupByCategory(periodInc) : groupByCategory(periodExp);
  const pieEmpty = reportType === "income" ? "אין הכנסות בתקופה זו" : "אין הוצאות בתקופה זו";
  const pieTitle = (reportType === "income" ? "פילוח הכנסות" : "פילוח הוצאות") + ` — ${range.label}`;
  document.getElementById("pie-title").textContent = pieTitle;
  renderPieChart(document.getElementById("report-pie-wrap"), pieData, { emptyText: pieEmpty });

  // Category breakdown table
  const breakdownData = reportType === "income" ? groupByCategory(periodInc) : groupByCategory(periodExp);
  const breakdownTitle = (reportType === "income" ? "הכנסות" : "הוצאות") + ` לפי קטגוריה — ${range.label}`;
  document.getElementById("cat-breakdown-title").textContent = breakdownTitle;
  const sorted = Object.entries(breakdownData).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [,v]) => s + v, 0);
  const bdEl = document.getElementById("cat-breakdown-list");
  if (sorted.length === 0) {
    bdEl.innerHTML = `<p class="empty-hint">אין נתונים לתקופה זו</p>`;
  } else {
    bdEl.innerHTML = sorted.map(([cat, amt]) => {
      const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
      return `<div class="cat-row-detail">
        <div class="cat-row-top"><span class="cat-row-name">${escapeHtml(cat)}</span><span class="cat-row-amt">${Math.round(amt).toLocaleString()}₪</span></div>
        <div class="cat-track"><div class="cat-fill" style="width:${pct}%"></div></div>
        <span class="cat-row-pct">${pct}%</span>
      </div>`;
    }).join("");
  }

  renderInsights();

  // 6-month bar chart
  const months = [];
  const cursor = new Date(); cursor.setDate(1); cursor.setHours(0,0,0,0);
  for (let i = 5; i >= 0; i--) { const m = new Date(cursor); m.setMonth(m.getMonth() - i); months.push(m); }
  const expTotals = months.map((m) => sumBy(getMonthList(regExp, m), () => true));
  const incTotals = months.map((m) => sumBy(getMonthList(allIncome, m), () => true));
  const max = Math.max(...expTotals, ...incTotals, 1);
  document.getElementById("monthly-chart").innerHTML = months.map((m, i) => `
    <div class="month-bar-col">
      <div class="month-bars-pair">
        <div class="bar-income" style="height:${(incTotals[i]/max)*100}%" title="הכנסות: ${Math.round(incTotals[i]).toLocaleString()}₪"></div>
        <div class="bar-expense" style="height:${(expTotals[i]/max)*100}%" title="הוצאות: ${Math.round(expTotals[i]).toLocaleString()}₪"></div>
      </div>
      <span class="month-bar-label">${HEBREW_MONTHS_SHORT[m.getMonth()]}</span>
    </div>`).join("");
}

function renderInsights() {
  const regExp = regularExpenses();
  const thisMonth = currentMonth;
  const prevMonth = new Date(thisMonth); prevMonth.setMonth(prevMonth.getMonth() - 1);
  const thisExp = getMonthList(regExp, thisMonth);
  const prevExp = getMonthList(regExp, prevMonth);
  const thisTotal = sumBy(thisExp, () => true);
  const prevTotal = sumBy(prevExp, () => true);
  const delta = thisTotal - prevTotal;
  const container = document.getElementById("insights-panel");
  if (thisExp.length === 0 && prevExp.length === 0) {
    container.innerHTML = `<p class="empty-hint">אין עדיין מספיק נתונים להשוואה</p>`; return;
  }
  let summaryHtml = `סך ההוצאות ב${HEBREW_MONTHS[thisMonth.getMonth()]}: <strong>${Math.round(thisTotal).toLocaleString()}₪</strong>`;
  if (prevTotal > 0) {
    const pct = Math.round((delta / prevTotal) * 100);
    if (delta > 0) summaryHtml += ` — עלייה של ${Math.round(delta).toLocaleString()}₪ (${pct}%+) לעומת ${HEBREW_MONTHS[prevMonth.getMonth()]}`;
    else if (delta < 0) summaryHtml += ` — ירידה של ${Math.round(Math.abs(delta)).toLocaleString()}₪ (${Math.abs(pct)}%-) לעומת ${HEBREW_MONTHS[prevMonth.getMonth()]}`;
    else summaryHtml += ` — בדיוק כמו ${HEBREW_MONTHS[prevMonth.getMonth()]}`;
  } else if (thisTotal > 0) { summaryHtml += ` — אין נתוני השוואה לחודש הקודם`; }
  const thisByCat = groupByCategory(thisExp); const prevByCat = groupByCategory(prevExp);
  const allCats = new Set([...Object.keys(thisByCat), ...Object.keys(prevByCat)]);
  const increases = [...allCats].map((cat) => ({ cat, diff: (thisByCat[cat]||0)-(prevByCat[cat]||0), thisVal: thisByCat[cat]||0, prevVal: prevByCat[cat]||0 })).filter((d) => d.diff > 0).sort((a,b) => b.diff-a.diff).slice(0,4);
  let listHtml = "";
  if (increases.length > 0) {
    listHtml = `<div class="insight-list">` + increases.map((d) => `<div class="insight-row"><span class="insight-cat">📈 ${escapeHtml(d.cat)}</span><span class="insight-detail">${Math.round(d.thisVal).toLocaleString()}₪ לעומת ${Math.round(d.prevVal).toLocaleString()}₪ (+${Math.round(d.diff).toLocaleString()}₪)</span></div>`).join("") + `</div>`;
  } else if (thisExp.length > 0) {
    listHtml = `<p class="empty-hint">לא הוצאתם יותר באף קטגוריה לעומת החודש הקודם 🎉</p>`;
  }
  container.innerHTML = `<div class="insight-summary">${summaryHtml}</div>${listHtml}`;
}

/* ============================================================
   13.7) EVENTS VIEW
   ============================================================ */
function renderEventsView() {
  const active = allEvents.filter((e) => e.active !== false);
  const closed = allEvents.filter((e) => e.active === false);

  function eventCardHtml(ev) {
    const evExp = allExpenses.filter((e) => e.eventId === ev.id);
    const spent = sumBy(evExp, () => true);
    const budget = ev.budget || 0;
    const remaining = budget - spent;
    const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
    const over = spent > budget && budget > 0;
    const icon = ev.icon || "🎯";
    return `
      <div class="event-card">
        <div class="event-card-top">
          <span class="event-icon">${escapeHtml(icon)}</span>
          <div class="event-info">
            <div class="event-name">${escapeHtml(ev.name)}</div>
            <div class="event-meta">תקציב: ${Math.round(budget).toLocaleString()}₪  ·  הוצאו: ${Math.round(spent).toLocaleString()}₪</div>
          </div>
          <span class="event-remaining ${over ? "over" : remaining < 0.2*budget ? "low" : ""}">${over ? "חריגה!" : `נשאר ${Math.round(remaining).toLocaleString()}₪`}</span>
        </div>
        <div class="cat-track event-track">
          <div class="cat-fill ${over ? "over-budget" : ""}" style="width:${pct}%"></div>
        </div>
        <div class="event-card-actions">
          <button class="mini-btn event-add-exp-btn" data-id="${ev.id}" data-name="${escapeHtml(ev.name)}">+ הוצאה</button>
          <button class="link-btn event-view-exp-btn" data-id="${ev.id}">הוצאות (${evExp.length})</button>
          ${ev.active !== false
            ? `<button class="link-btn event-close-btn" data-id="${ev.id}">סגור אירוע</button>`
            : `<button class="link-btn event-reopen-btn" data-id="${ev.id}">פתח מחדש</button>`}
          <button class="row-delete event-delete-btn" data-id="${ev.id}">מחק</button>
        </div>
        <div class="event-exp-list hidden" id="event-exp-list-${ev.id}">
          ${evExp.length === 0 ? `<p class="empty-hint">עדיין אין הוצאות לאירוע הזה</p>` :
            evExp.map((e) => `
              <div class="expense-row">
                <span class="row-dot dot-yosef"></span>
                <div class="row-main">
                  <div class="row-title">${escapeHtml(e.description || e.category || "הוצאה")}</div>
                  <div class="row-meta">${escapeHtml(e.category || "אחר")} · ${escapeHtml(e.paidBy || "")} · ${toDate(e.date).toLocaleDateString("he-IL")}</div>
                </div>
                <span class="row-amount">${Math.round(e.amount).toLocaleString()}₪</span>
                <button class="row-delete" data-eid="${e.id}" aria-label="מחק">✕</button>
              </div>`).join("")}
        </div>
      </div>`;
  }

  const activeEl = document.getElementById("events-list");
  activeEl.innerHTML = active.length === 0 ? `<p class="empty-hint">עדיין אין אירועים פעילים</p>` : active.map(eventCardHtml).join("");

  const closedEl = document.getElementById("events-closed-list");
  closedEl.innerHTML = closed.length === 0 ? `<p class="empty-hint">עדיין אין אירועים שהסתיימו</p>` : closed.map(eventCardHtml).join("");

  document.querySelectorAll(".event-add-exp-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentEventId = btn.dataset.id;
      document.getElementById("event-expense-title").textContent = `הוצאה לאירוע: ${btn.dataset.name}`;
      populateCategorySelects();
      document.getElementById("event-expense-modal-overlay").classList.remove("hidden");
    });
  });
  document.querySelectorAll(".event-view-exp-btn").forEach((btn) => {
    const listEl = document.getElementById(`event-exp-list-${btn.dataset.id}`);
    btn.addEventListener("click", () => listEl.classList.toggle("hidden"));
  });
  document.querySelectorAll(".event-close-btn").forEach((btn) => {
    btn.addEventListener("click", () => eventsRef.doc(btn.dataset.id).update({ active: false }));
  });
  document.querySelectorAll(".event-reopen-btn").forEach((btn) => {
    btn.addEventListener("click", () => eventsRef.doc(btn.dataset.id).update({ active: true }));
  });
  document.querySelectorAll(".event-delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("למחוק את האירוע? ההוצאות שלו ימחקו גם הן.")) return;
      const evExp = allExpenses.filter((e) => e.eventId === btn.dataset.id);
      const batch = db.batch();
      evExp.forEach((e) => batch.delete(expensesRef.doc(e.id)));
      batch.delete(eventsRef.doc(btn.dataset.id));
      batch.commit();
    });
  });
  document.querySelectorAll("[data-eid]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("למחוק הוצאה זו מהאירוע?")) return;
      expensesRef.doc(btn.dataset.eid).delete();
    });
  });
}

// New event form
const eventModalOverlay = document.getElementById("event-modal-overlay");
document.getElementById("open-add-event").addEventListener("click", () => {
  document.getElementById("event-form").reset();
  eventModalOverlay.classList.remove("hidden");
});
document.getElementById("close-event-modal").addEventListener("click", () => eventModalOverlay.classList.add("hidden"));
eventModalOverlay.addEventListener("click", (e) => { if (e.target === eventModalOverlay) eventModalOverlay.classList.add("hidden"); });
document.getElementById("event-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("event-name").value.trim();
  const budget = parseFloat(document.getElementById("event-budget").value);
  const icon = document.getElementById("event-icon").value.trim() || "🎯";
  if (!name || !budget || budget <= 0) return;
  eventsRef.add({ name, budget, icon, active: true, createdAt: firebase.firestore.Timestamp.now() }).then(() => {
    eventModalOverlay.classList.add("hidden");
    showToast(`האירוע "${name}" נוצר 🎯`);
  });
});

// Add expense to event
const eventExpenseModalOverlay = document.getElementById("event-expense-modal-overlay");
document.getElementById("close-event-expense-modal").addEventListener("click", () => {
  eventExpenseModalOverlay.classList.add("hidden");
  currentEventId = null;
});
eventExpenseModalOverlay.addEventListener("click", (e) => {
  if (e.target === eventExpenseModalOverlay) { eventExpenseModalOverlay.classList.add("hidden"); currentEventId = null; }
});
document.getElementById("event-expense-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!currentEventId) return;
  const amount = parseFloat(document.getElementById("event-expense-amount").value);
  const description = document.getElementById("event-expense-desc").value.trim();
  const category = document.getElementById("event-expense-category").value;
  const paidBy = document.querySelector('input[name="eventExpenseAccount"]:checked').value;
  if (!amount || amount <= 0) return;
  expensesRef.add({
    amount, description, category, paidBy,
    eventId: currentEventId, source: "event",
    date: firebase.firestore.Timestamp.now()
  }).then(() => {
    document.getElementById("event-expense-form").reset();
    document.querySelector('input[name="eventExpenseAccount"][data-partner="1"]').checked = true;
    eventExpenseModalOverlay.classList.add("hidden");
    currentEventId = null;
    showToast("הוצאה נוספה לאירוע ✅");
  });
});

/* ============================================================
   13) SETTINGS VIEW
   ============================================================ */
function renderSettingsView() {
  renderCategoryChips(document.getElementById("category-manage-list"), config.categories, "categories");
  renderCategoryChips(document.getElementById("income-category-manage-list"), config.incomeCategories, "incomeCategories");
  document.getElementById("toggle-maaser").checked = config.maaserEnabled;
  document.getElementById("toggle-self-employed").checked = config.isSelfEmployed;
  const user = auth.currentUser;
  const emailEl = document.getElementById("settings-user-email");
  if (emailEl && user) emailEl.textContent = `מחוברים בתור: ${user.email} | ${p1()} ו${p2()}`;
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
  const rows = [["סוג", "תאריך", "תיאור", "קטגוריה", "ארנק", "סכום"]];
  allExpenses.forEach((e) => {
    rows.push(["הוצאה", toDate(e.date).toLocaleDateString("he-IL"), e.description || "", e.category || "", e.paidBy || "", Math.round(e.amount)]);
  });
  allIncome.forEach((e) => {
    rows.push(["הכנסה", toDate(e.date).toLocaleDateString("he-IL"), e.description || "", e.category || "", e.account || "", Math.round(e.amount)]);
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
document.getElementById("logout-btn").addEventListener("click", () => {
  if (!confirm("לצאת מהחשבון?")) return;
  auth.signOut();
});
document.getElementById("clear-all-btn").addEventListener("click", () => {
  if (!confirm("בטוחים? כל ההוצאות וההכנסות יימחקו לצמיתות.")) return;
  if (!confirm("רגע אחרון - זו פעולה שאי אפשר לבטל. למחוק הכל?")) return;
  Promise.all([
    ...allExpenses.map((e) => expensesRef.doc(e.id).delete()),
    ...allIncome.map((e) => incomeRef.doc(e.id).delete())
  ]).then(() => alert("כל הנתונים נמחקו"));
});

/* ============================================================
   13.5) BANK CSV IMPORT
   ============================================================ */
let importRows = [];

function decodeCSVBuffer(buffer) {
  const utf8Text = new TextDecoder("utf-8").decode(buffer);
  const looksBroken = utf8Text.includes("\uFFFD") || !/[\u0590-\u05FF]/.test(utf8Text);
  if (!looksBroken) return utf8Text;
  try {
    return new TextDecoder("windows-1255").decode(buffer);
  } catch (e) {
    return utf8Text;
  }
}

function parseCSVLine(line) {
  const cells = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      cells.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.replace(/[\u200e\u200f]/g, "").trim());
}

function parseIsraeliDate(str) {
  const parts = (str || "").split(".");
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  return new Date(year, month - 1, day);
}

function parseAmount(str) {
  const cleaned = (str || "").replace(/[\u200e\u200f]/g, "").replace(/[^\d.\-]/g, "");
  return parseFloat(cleaned);
}

const CATEGORY_KEYWORDS = {
  "אוכל": ["סופר", "שופרסל", "רמי לוי", "ויקטורי", "מעדני", "מאפי", "לחם", "פיצה", "wolt", "וולט", "קפה", "מסעד", "ארומה", "פסטה", "בורגר", "סושי", "שווארמה", "קצפת", "חלת", "ריבאר", "ממתק", "סטקי", "שפע", "מזון", "קייטרינג", "תן ביס", "זיג זג", "סדש"],
  "בריאות": ["כללית", "מכבי", "לאומית", "מאוחדת", "בית חולים", "רוקח", "מרקחת", "דראגסטור", "מד\"א", "מגן דוד אדום", "קופת חולים", "סמייל", "ד\"ר", "שיניים", "קליניק"],
  "תחבורה": ["דלק", "פז ", "פז/", "סונול", "דור אלון", "yellow", "טעינת חשמ", "tesla", "charging", "חניון", "רכב", "אגרה", "כביש 6", "מונית", "gett", "טסלה"],
  "דיור": ["ארנונה", "עיריי", "עירית", "חשמל", "חברת חשמל", "מים", "תאגיד מים", " גז ", "ועד בית", "שכירות", "משכנתא", "בזק", "פרטנר", "סלקום", "הוט ", "אינטרנט"],
  "בילויים": ["קולנוע", "סינמה", "תיאטרון", "הופע", "נטפליקס", "ספוטיפיי", "סטימצקי", "מלון", "נופש", "לוטו", "טוטו", "פיס", "הימור", "winner", "פרחים", "לרקוד"]
};
function guessCategory(desc) {
  const lower = (desc || "").toLowerCase();
  for (const cat in CATEGORY_KEYWORDS) {
    if (CATEGORY_KEYWORDS[cat].some((w) => lower.includes(w.toLowerCase()))) return cat;
  }
  return "אחר";
}

function isTransferLike(desc, type) {
  if (type !== "expense") return false;
  return /העברה|ני"ע|ניע|חיוב אשראי חודשי|קניית|קנית|הפקדה/.test(desc || "");
}

function isDuplicateRow(row) {
  const list = row.type === "income" ? allIncome : allExpenses;
  return list.some((e) => {
    const d = toDate(e.date);
    return d.getFullYear() === row.date.getFullYear() && d.getMonth() === row.date.getMonth() && d.getDate() === row.date.getDate() &&
      Math.abs(Number(e.amount || 0) - row.amount) < 0.01 &&
      (e.description || "").trim() === row.description.trim();
  });
}

function parseBankCSV(text) {
  text = text.replace(/^\uFEFF/, "");
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headerCells = parseCSVLine(lines[0]);
  const dateIdx = headerCells.findIndex((h) => h.includes("תאריך"));
  const descIdx = headerCells.findIndex((h) => h.includes("תיאור"));
  const amountIdx = headerCells.findIndex((h) => h.includes("סכום"));
  if (dateIdx === -1 || descIdx === -1 || amountIdx === -1) return [];
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    if (cells.length <= Math.max(dateIdx, descIdx, amountIdx)) continue;
    const date = parseIsraeliDate(cells[dateIdx]);
    const desc = cells[descIdx] || "";
    const amountRaw = parseAmount(cells[amountIdx]);
    if (!date || isNaN(amountRaw) || amountRaw === 0) continue;
    const type = amountRaw < 0 ? "expense" : "income";
    rows.push({
      id: "r" + i, date, description: desc.trim(),
      amount: Math.abs(amountRaw), type,
      category: guessCategory(desc), checked: true,
      isTransferLike: false, isDuplicate: false
    });
  }
  return rows;
}

function importRowHtml(row) {
  const dateStr = row.date.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
  const amountClass = row.type === "income" ? "row-amount income" : "row-amount";
  const prefix = row.type === "income" ? "+" : "";
  const baseList = row.type === "income" ? config.incomeCategories : config.categories;
  const catList = baseList.includes(row.category) ? baseList : [row.category, ...baseList];
  const catOptions = catList.map((c) => `<option value="${escapeHtml(c)}" ${c === row.category ? "selected" : ""}>${escapeHtml(c)}</option>`).join("");
  let badge = "";
  if (row.isDuplicate) badge = `<span class="import-badge import-badge-dup">כבר קיים</span>`;
  else if (row.isTransferLike) badge = `<span class="import-badge import-badge-transfer">נראה כמו העברה</span>`;
  return `
    <div class="import-row">
      <input type="checkbox" class="import-checkbox" data-id="${row.id}" ${row.checked ? "checked" : ""}>
      <div class="import-row-main">
        <div class="import-row-top">
          <span class="import-row-desc">${escapeHtml(row.description)}</span>
          <span class="${amountClass}">${prefix}${Math.round(row.amount).toLocaleString()}₪</span>
        </div>
        <div class="import-row-meta">${dateStr}${badge}</div>
        <select class="import-category-select" data-id="${row.id}">${catOptions}</select>
      </div>
    </div>`;
}

function renderImportModal() {
  const expCount = importRows.filter((r) => r.type === "expense").length;
  const incCount = importRows.filter((r) => r.type === "income").length;
  document.getElementById("import-summary").textContent =
    `נמצאו ${importRows.length} תנועות: ${expCount} הוצאות, ${incCount} הכנסות. תנועות שנראות כמו העברה פנימית או שכבר קיימות לא מסומנות כברירת מחדל - אפשר לבדוק ולשנות.`;
  const container = document.getElementById("import-rows-list");
  container.innerHTML = importRows.map(importRowHtml).join("");
  container.querySelectorAll(".import-checkbox").forEach((cb) => {
    cb.addEventListener("change", () => {
      const row = importRows.find((r) => r.id === cb.dataset.id);
      if (row) row.checked = cb.checked;
    });
  });
  container.querySelectorAll(".import-category-select").forEach((sel) => {
    sel.addEventListener("change", () => {
      const row = importRows.find((r) => r.id === sel.dataset.id);
      if (row) row.category = sel.value;
    });
  });
}

const importModalOverlay = document.getElementById("import-modal-overlay");
document.getElementById("open-bank-import").addEventListener("click", () => {
  document.getElementById("bank-csv-input").click();
});
document.getElementById("bank-csv-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const text = decodeCSVBuffer(ev.target.result);
    importRows = parseBankCSV(text);
    if (importRows.length === 0) {
      alert("לא הצלחתי לזהות תנועות בקובץ. ודאו שזה קובץ CSV עם עמודות תאריך, תיאור וסכום.");
      return;
    }
    importRows.forEach((row) => {
      row.isDuplicate = isDuplicateRow(row);
      row.isTransferLike = isTransferLike(row.description, row.type);
      if (row.isDuplicate || row.isTransferLike) row.checked = false;
    });
    renderImportModal();
    importModalOverlay.classList.remove("hidden");
  };
  reader.readAsArrayBuffer(file);
});
document.getElementById("close-import-modal").addEventListener("click", () => importModalOverlay.classList.add("hidden"));
importModalOverlay.addEventListener("click", (e) => { if (e.target === importModalOverlay) importModalOverlay.classList.add("hidden"); });
document.getElementById("import-select-all").addEventListener("click", () => { importRows.forEach((r) => (r.checked = true)); renderImportModal(); });
document.getElementById("import-deselect-all").addEventListener("click", () => { importRows.forEach((r) => (r.checked = false)); renderImportModal(); });

document.getElementById("confirm-import-btn").addEventListener("click", () => {
  const account = document.querySelector('input[name="importAccount"]:checked').value;
  const selected = importRows.filter((r) => r.checked);
  if (selected.length === 0) { alert("לא נבחרו תנועות לייבוא"); return; }
  const btn = document.getElementById("confirm-import-btn");
  btn.disabled = true;
  btn.textContent = "מייבא...";
  const chunkSize = 400;
  const chunks = [];
  for (let i = 0; i < selected.length; i += chunkSize) chunks.push(selected.slice(i, i + chunkSize));
  const commits = chunks.map((chunk) => {
    const batch = db.batch();
    chunk.forEach((row) => {
      const ts = firebase.firestore.Timestamp.fromDate(row.date);
      if (row.type === "income") {
        batch.set(incomeRef.doc(), { amount: row.amount, description: row.description, category: row.category, account, source: "bank-import", date: ts });
      } else {
        batch.set(expensesRef.doc(), { amount: row.amount, description: row.description, category: row.category, paidBy: account, source: "bank-import", date: ts });
      }
    });
    return batch.commit();
  });
  Promise.all(commits).then(() => {
    alert(`יובאו ${selected.length} תנועות בהצלחה ✅`);
    importModalOverlay.classList.add("hidden");
    importRows = [];
  }).catch((err) => {
    console.error("Bank import error:", err);
    alert("משהו השתבש בייבוא, נסו שוב");
  }).finally(() => {
    btn.disabled = false;
    btn.textContent = "ייבוא תנועות נבחרות";
  });
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

document.getElementById("expense-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const amount = parseFloat(document.getElementById("amount").value);
  const description = document.getElementById("description").value.trim();
  const category = document.getElementById("category").value;
  const account = document.querySelector('input[name="payAccount"]:checked').value;
  if (!amount || amount <= 0) return;

  const balanceBefore = computeAccountBalance(account);

  if (modalType === "income") {
    incomeRef.add({ amount, description, category, account, source: "web", date: firebase.firestore.Timestamp.now() }).then(() => {
      if (account === "מזומן") showToast("מס הכנסה בדרך 😅💵");
      resetAndClose();
      triggerBalanceFlash(account, balanceBefore, balanceBefore + amount, "income");
    });
  } else {
    expensesRef.add({ amount, description, category, paidBy: account, source: "web", date: firebase.firestore.Timestamp.now() }).then(() => {
      if (account === "מזומן") showToast("מס הכנסה בדרך 😅💵");
      else if (account === p2()) showToast(`הופההה ${p2()} שילמה מי היה מאמין 😂`);
      else if (account === p1()) showToast(`סוף סוף ${p1()} משלם 😎`);
      resetAndClose();
      triggerBalanceFlash(account, balanceBefore, balanceBefore - amount, "expense");
    });
  }
});

function triggerBalanceFlash(account, oldBal, newBal, type) {
  const icons = { [p1()]: "👤", [p2()]: "👩", "מזומן": "💵", "חיסכון": "💰" };
  const flashEl = document.getElementById("balance-flash");
  const amountEl = document.getElementById("balance-flash-amount");
  const deltaEl = document.getElementById("balance-flash-delta");
  document.getElementById("balance-flash-icon").textContent = icons[account] || "💳";
  document.getElementById("balance-flash-label").textContent = account;
  const diff = newBal - oldBal;
  deltaEl.textContent = (diff >= 0 ? "+" : "") + Math.round(diff).toLocaleString() + "₪";
  deltaEl.className = "balance-flash-delta " + (type === "income" ? "delta-up" : "delta-down");
  flashEl.classList.remove("hidden", "flash-out");

  let startTime = null;
  const duration = 1400;
  function animate(ts) {
    if (!startTime) startTime = ts;
    const p = Math.min((ts - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    const current = oldBal + (newBal - oldBal) * ease;
    amountEl.textContent = Math.round(current).toLocaleString() + " ₪";
    if (p < 1) requestAnimationFrame(animate);
    else amountEl.textContent = Math.round(newBal).toLocaleString() + " ₪";
  }
  requestAnimationFrame(animate);

  clearTimeout(window._flashTimer);
  window._flashTimer = setTimeout(() => {
    flashEl.classList.add("flash-out");
    setTimeout(() => flashEl.classList.add("hidden"), 400);
  }, 2600);
}

function resetAndClose() {
  document.getElementById("expense-form").reset();
  document.querySelector('input[name="payAccount"][data-partner="1"]').checked = true;
  overlay.classList.add("hidden");
}

/* ============================================================
   13.8) MAASER VIEW
   ============================================================ */
function computeMaaserData() {
  const maaserAccounts = [p1(), p2(), "מזומן"];
  const totalIncome = sumBy(allIncome, (i) => maaserAccounts.includes(i.account));
  const owed = totalIncome * 0.1;
  const paid = sumBy(allExpenses, (e) => e.category === "מעשרות");
  const remaining = Math.max(0, owed - paid);
  return { totalIncome, owed, paid, remaining };
}

function renderMaaserView() {
  const { totalIncome, owed, paid, remaining } = computeMaaserData();
  const card = document.getElementById("maaser-hero");
  card.className = "maaser-hero " + (remaining > 0 ? "maaser-owes" : "maaser-clear");
  document.getElementById("maaser-owed-fig").textContent = `${Math.round(owed).toLocaleString()} ₪`;
  document.getElementById("maaser-hero-sub").textContent =
    remaining > 0 ? `נשאר לשלם ${Math.round(remaining).toLocaleString()}₪` : `✅ המעשרות שולמו במלואם!`;
  document.getElementById("maaser-total-income").textContent = `${Math.round(totalIncome).toLocaleString()}₪`;
  document.getElementById("maaser-owed-stat").textContent = `${Math.round(owed).toLocaleString()}₪`;
  document.getElementById("maaser-paid-total").textContent = `${Math.round(paid).toLocaleString()}₪`;
  document.getElementById("maaser-remaining").textContent = `${Math.round(remaining).toLocaleString()}₪`;
  document.getElementById("maaser-calc-explanation").textContent =
    `חישוב: 10% × ${Math.round(totalIncome).toLocaleString()}₪ הכנסות = ${Math.round(owed).toLocaleString()}₪ חובת מעשרות. שולמו ${Math.round(paid).toLocaleString()}₪ → נותר ${Math.round(remaining).toLocaleString()}₪.`;

  const maaserPayments = allExpenses.filter((e) => e.category === "מעשרות").sort((a,b) => toDate(b.date)-toDate(a.date));
  const listEl = document.getElementById("maaser-payments-list");
  if (maaserPayments.length === 0) {
    listEl.innerHTML = `<p class="empty-hint">עדיין לא שולמו מעשרות</p>`;
  } else {
    listEl.innerHTML = maaserPayments.map((e) => {
      const dateStr = toDate(e.date).toLocaleDateString("he-IL", { day:"numeric", month:"short", year:"numeric" });
      return `<div class="expense-row">
        <span class="row-dot" style="background:var(--yosef)"></span>
        <div class="row-main">
          <div class="row-title">${escapeHtml(e.description || "תשלום מעשרות")}</div>
          <div class="row-meta">מעשרות · ${escapeHtml(e.paidBy||"")} · ${dateStr}</div>
        </div>
        <span class="row-amount">${Math.round(e.amount).toLocaleString()}₪</span>
        <button class="row-delete" data-eid="${e.id}">✕</button>
      </div>`;
    }).join("");
    listEl.querySelectorAll(".row-delete").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (confirm("למחוק תשלום מעשרות זה?")) expensesRef.doc(btn.dataset.eid).delete();
      });
    });
  }
}

const maaserModalOverlay = document.getElementById("maaser-modal-overlay");
document.getElementById("open-add-maaser").addEventListener("click", () => {
  document.getElementById("maaser-form").reset();
  document.querySelector('input[name="maaserAccount"][data-partner="1"]').checked = true;
  const { remaining } = computeMaaserData();
  if (remaining > 0) document.getElementById("maaser-amount").value = Math.round(remaining);
  maaserModalOverlay.classList.remove("hidden");
});
document.getElementById("close-maaser-modal").addEventListener("click", () => maaserModalOverlay.classList.add("hidden"));
maaserModalOverlay.addEventListener("click", (e) => { if (e.target === maaserModalOverlay) maaserModalOverlay.classList.add("hidden"); });
document.getElementById("maaser-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const amount = parseFloat(document.getElementById("maaser-amount").value);
  const org = document.getElementById("maaser-org").value.trim();
  const account = document.querySelector('input[name="maaserAccount"]:checked').value;
  if (!amount || amount <= 0) return;
  const balBefore = computeAccountBalance(account);
  expensesRef.add({
    amount, description: org || "מעשרות לצדקה",
    category: "מעשרות", paidBy: account,
    source: "maaser", date: firebase.firestore.Timestamp.now()
  }).then(() => {
    maaserModalOverlay.classList.add("hidden");
    showToast("🤲 תשלום מעשרות נרשם — מצוה!");
    triggerBalanceFlash(account, balBefore, balBefore - amount, "expense");
  });
});

/* ============================================================
   13.9) SETTINGS TOGGLES (maaser + self-employed)
   ============================================================ */
function applyMaaserSettings() {
  const { maaserEnabled, isSelfEmployed } = config;

  // Show/hide maaser drawer item
  const maaserDrawerItem = document.getElementById("maaser-drawer-item");
  if (maaserDrawerItem) maaserDrawerItem.classList.toggle("hidden", !maaserEnabled);

  // Sync toggle UI
  const maaserToggle = document.getElementById("toggle-maaser");
  if (maaserToggle && maaserToggle.checked !== maaserEnabled) maaserToggle.checked = maaserEnabled;
  const seToggle = document.getElementById("toggle-self-employed");
  if (seToggle && seToggle.checked !== isSelfEmployed) seToggle.checked = isSelfEmployed;

  // Manage "מעשרות" category
  const hasMaaserCat = config.categories.includes("מעשרות");
  if (maaserEnabled && !hasMaaserCat) {
    configRef.set({ categories: [...config.categories, "מעשרות"] }, { merge: true });
  } else if (!maaserEnabled && hasMaaserCat) {
    configRef.set({ categories: config.categories.filter((c) => c !== "מעשרות") }, { merge: true });
  }

  // Manage "עסק" category (self-employed only, independent of maaser)
  const hasBusinessCat = config.categories.includes("עסק");
  if (isSelfEmployed && !hasBusinessCat) {
    configRef.set({ categories: [...config.categories, "עסק"] }, { merge: true });
  } else if (!isSelfEmployed && hasBusinessCat) {
    configRef.set({ categories: config.categories.filter((c) => c !== "עסק") }, { merge: true });
  }
}

document.getElementById("toggle-maaser").addEventListener("change", (e) => {
  configRef.set({ maaserEnabled: e.target.checked }, { merge: true });
});
document.getElementById("toggle-self-employed").addEventListener("change", (e) => {
  configRef.set({ isSelfEmployed: e.target.checked }, { merge: true });
});

/* ============================================================
   15) Init
   ============================================================ */
// Startup is driven by auth.onAuthStateChanged above.
// Hide app until auth confirmed.
document.getElementById("app").classList.add("app-hidden");
