/* ============================================================
   1) הגדרות Firebase - תחליפו את האובייקט הזה בקונפיג שתקבלו
      מקונסולת Firebase (Project settings -> Your apps -> Web app)
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
const configRef = db.collection("meta").doc("config");

/* ============================================================
   2) State
   ============================================================ */
let allExpenses = [];
let currentMonth = new Date();
currentMonth.setDate(1);
currentMonth.setHours(0, 0, 0, 0);
let currentView = "dashboard";

const DEFAULT_CATEGORIES = ["אוכל", "חתונה", "דיור", "תחבורה", "בילויים", "בריאות", "אחר"];
let config = { categories: DEFAULT_CATEGORIES, budgets: {}, weddingTarget: 0 };

const HEBREW_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const HEBREW_MONTHS_SHORT = ["ינו","פבר","מרץ","אפר","מאי","יונ","יול","אוג","ספט","אוק","נוב","דצמ"];

/* ============================================================
   3) Firestore listeners (real-time, גם מהבוט וגם מהאתר)
   ============================================================ */
expensesRef.orderBy("date", "desc").onSnapshot((snapshot) => {
  allExpenses = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  renderCurrentView();
}, (err) => {
  console.error("Firestore error:", err);
  document.getElementById("hero-sub").textContent = "שגיאה בחיבור למסד הנתונים - בדקו את הקונפיג";
});

configRef.onSnapshot((doc) => {
  if (!doc.exists) {
    configRef.set(config);
    return;
  }
  const data = doc.data();
  config = {
    categories: data.categories && data.categories.length ? data.categories : DEFAULT_CATEGORIES,
    budgets: data.budgets || {},
    weddingTarget: data.weddingTarget || 0
  };
  populateCategorySelects();
  renderCurrentView();
});

/* ============================================================
   4) Navigation - drawer + view switching
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
  document.querySelectorAll(".view").forEach((el) => {
    el.classList.toggle("hidden", el.dataset.view !== view);
  });
  document.querySelectorAll(".drawer-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.view === view);
  });
  drawerOverlay.classList.add("hidden");
  renderCurrentView();
}

function renderCurrentView() {
  if (currentView === "dashboard") renderDashboard();
  else if (currentView === "expenses") renderExpensesView();
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
function getMonthExpenses(monthDate) {
  const start = new Date(monthDate);
  const end = new Date(monthDate);
  end.setMonth(end.getMonth() + 1);
  return allExpenses.filter((e) => { const d = toDate(e.date); return d >= start && d < end; });
}
function groupByCategory(list) {
  const map = {};
  list.forEach((e) => {
    const cat = e.category || "אחר";
    map[cat] = (map[cat] || 0) + Number(e.amount || 0);
  });
  return map;
}
function populateCategorySelects() {
  const targets = [
    { el: document.getElementById("category"), includeAll: false },
    { el: document.getElementById("filter-category"), includeAll: true }
  ];
  targets.forEach(({ el, includeAll }) => {
    if (!el) return;
    const prev = el.value;
    el.innerHTML = (includeAll ? '<option value="">כל הקטגוריות</option>' : "") +
      config.categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    if ([...el.options].some((o) => o.value === prev)) el.value = prev;
  });
}

function rowHtml(e) {
  const d = toDate(e.date);
  const dateStr = d.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
  const dotClass = e.paidBy === "יוסף" ? "dot-yosef" : "dot-agam";
  const sourceTag = e.source === "telegram" ? " · טלגרם" : "";
  return `
    <div class="expense-row">
      <span class="row-dot ${dotClass}"></span>
      <div class="row-main">
        <div class="row-title">${escapeHtml(e.description || e.category || "הוצאה")}</div>
        <div class="row-meta">${escapeHtml(e.category || "אחר")} · ${escapeHtml(e.paidBy || "")} · ${dateStr}${sourceTag}</div>
      </div>
      <span class="row-amount">${Math.round(e.amount).toLocaleString()}₪</span>
      <button class="row-delete" data-id="${e.id}" aria-label="מחק">✕</button>
    </div>`;
}
function renderExpenseRows(container, list, opts = {}) {
  if (!container) return;
  if (list.length === 0) {
    container.innerHTML = `<p class="empty-hint">${opts.emptyText || "אין הוצאות תואמות"}</p>`;
    return;
  }
  const items = opts.limit ? list.slice(0, opts.limit) : list;
  container.innerHTML = items.map(rowHtml).join("");
  container.querySelectorAll(".row-delete").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (confirm("למחוק את ההוצאה?")) expensesRef.doc(btn.dataset.id).delete();
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
        <div class="cat-track">
          <div class="cat-fill ${over ? "over-budget" : ""}" style="width:${Math.min(pct, 100)}%"></div>
        </div>
      </div>`;
  }).join("");
}

/* ============================================================
   6) DASHBOARD
   ============================================================ */
document.getElementById("prev-month").addEventListener("click", () => {
  currentMonth.setMonth(currentMonth.getMonth() - 1);
  renderDashboard();
});
document.getElementById("next-month").addEventListener("click", () => {
  currentMonth.setMonth(currentMonth.getMonth() + 1);
  renderDashboard();
});

function renderDashboard() {
  const monthExpenses = getMonthExpenses(currentMonth);

  document.getElementById("month-label").textContent =
    `${HEBREW_MONTHS[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;
  document.getElementById("month-sub").textContent = `${monthExpenses.length} הוצאות`;

  const yosefTotal = sumBy(monthExpenses, (e) => e.paidBy === "יוסף");
  const total = sumBy(monthExpenses, () => true);
  const agamTotal = total - yosefTotal;
  const diff = (yosefTotal - agamTotal) / 2;

  const figure = document.getElementById("hero-figure");
  const sub = document.getElementById("hero-sub");
  const badge = document.getElementById("hero-badge");
  if (total === 0) {
    figure.textContent = "0 ₪";
    sub.textContent = "עדיין אין הוצאות בחודש הזה";
    badge.textContent = "ריק";
  } else if (Math.abs(diff) < 1) {
    figure.textContent = "מאוזן 🎉";
    sub.textContent = "שניכם שילמתם בערך אותו דבר";
    badge.textContent = "פעיל";
  } else if (diff > 0) {
    figure.textContent = `${Math.round(diff).toLocaleString()} ₪`;
    sub.textContent = "אגם חייבת ליוסף";
    badge.textContent = "פעיל";
  } else {
    figure.textContent = `${Math.round(Math.abs(diff)).toLocaleString()} ₪`;
    sub.textContent = "יוסף חייב לאגם";
    badge.textContent = "פעיל";
  }

  document.getElementById("stat-total").textContent = `${Math.round(total).toLocaleString()}₪`;
  document.getElementById("stat-count").textContent = monthExpenses.length;
  document.getElementById("stat-yosef").textContent = `${Math.round(yosefTotal).toLocaleString()}₪`;
  document.getElementById("stat-agam").textContent = `${Math.round(agamTotal).toLocaleString()}₪`;

  renderCategoryBars(document.getElementById("category-bars"), groupByCategory(monthExpenses), { emptyText: "אין עדיין הוצאות החודש" });
  renderExpenseRows(document.getElementById("recent-expense-list"), monthExpenses, { limit: 5, emptyText: "כשתוסיפו הוצאה היא תופיע כאן" });
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
    const matchesTerm = !term ||
      (e.description || "").toLowerCase().includes(term) ||
      (e.category || "").toLowerCase().includes(term);
    return matchesCat && matchesTerm;
  });
  renderExpenseRows(document.getElementById("full-expense-list"), filtered);
}

/* ============================================================
   8) BUDGET VIEW
   ============================================================ */
function renderBudgetView() {
  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);
  const spentMap = groupByCategory(getMonthExpenses(thisMonth));

  const container = document.getElementById("budget-rows");
  container.innerHTML = config.categories.map((cat) => {
    const budget = config.budgets[cat] || 0;
    const spent = spentMap[cat] || 0;
    const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
    const over = budget > 0 && spent > budget;
    return `
      <div class="budget-row">
        <div class="budget-row-top">
          <span>${escapeHtml(cat)}</span>
          <input type="number" min="0" step="50" data-category="${escapeHtml(cat)}" value="${budget || ""}" placeholder="ללא הגבלה">
        </div>
        <div class="cat-track">
          <div class="cat-fill ${over ? "over-budget" : ""}" style="width:${pct}%"></div>
        </div>
        <span class="budget-actual">${Math.round(spent).toLocaleString()}₪ הוצאתם החודש</span>
      </div>`;
  }).join("");
}

document.getElementById("save-budget").addEventListener("click", () => {
  const newBudgets = {};
  document.querySelectorAll("#budget-rows input").forEach((input) => {
    const val = parseFloat(input.value);
    if (val > 0) newBudgets[input.dataset.category] = val;
  });
  configRef.set({ budgets: newBudgets }, { merge: true }).then(() => {
    alert("התקציב נשמר ✅");
  });
});

/* ============================================================
   9) WEDDING VIEW
   ============================================================ */
function renderWeddingView() {
  const target = config.weddingTarget || 0;
  const spent = sumBy(allExpenses, (e) => e.category === "חתונה");
  const pct = target > 0 ? Math.min((spent / target) * 100, 100) : 0;
  const over = target > 0 && spent > target;

  document.getElementById("wedding-spent").textContent = `${Math.round(spent).toLocaleString()} ₪`;
  document.getElementById("wedding-sub").textContent = target > 0
    ? `מתוך תקציב של ${Math.round(target).toLocaleString()}₪`
    : "הגדירו תקציב יעד למטה";

  const fill = document.getElementById("wedding-progress");
  fill.style.width = `${pct}%`;
  fill.classList.toggle("over-budget", over);

  const remaining = target - spent;
  document.getElementById("wedding-remaining").textContent = target <= 0
    ? ""
    : remaining >= 0
      ? `נשארו ${Math.round(remaining).toLocaleString()}₪ מהתקציב`
      : `חרגתם ב-${Math.round(Math.abs(remaining)).toLocaleString()}₪ מהתקציב המתוכנן`;

  const weddingDate = new Date(2026, 10, 1); // אומדן - נובמבר 2026
  const daysLeft = Math.ceil((weddingDate - new Date()) / 86400000);
  document.getElementById("wedding-countdown").textContent = daysLeft > 0 ? `~${daysLeft} ימים` : "מזל טוב! 🎉";

  document.getElementById("wedding-target-input").value = target || "";
}

document.getElementById("save-wedding").addEventListener("click", () => {
  const val = parseFloat(document.getElementById("wedding-target-input").value) || 0;
  configRef.set({ weddingTarget: val }, { merge: true }).then(() => {
    alert("נשמר ✅");
  });
});

/* ============================================================
   10) REPORTS VIEW
   ============================================================ */
function renderReportsView() {
  const months = [];
  const cursor = new Date();
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  for (let i = 5; i >= 0; i--) {
    const m = new Date(cursor);
    m.setMonth(m.getMonth() - i);
    months.push(m);
  }
  const totals = months.map((m) => sumBy(getMonthExpenses(m), () => true));
  const max = Math.max(...totals, 1);

  document.getElementById("monthly-chart").innerHTML = months.map((m, i) => `
    <div class="month-bar-col">
      <span class="month-bar-amount">${totals[i] > 0 ? Math.round(totals[i]).toLocaleString() : ""}</span>
      <div class="month-bar-fill" style="height:${(totals[i] / max) * 100}%"></div>
      <span class="month-bar-label">${HEBREW_MONTHS_SHORT[m.getMonth()]}</span>
    </div>`).join("");

  renderCategoryBars(document.getElementById("alltime-categories"), groupByCategory(allExpenses), { emptyText: "אין עדיין נתונים" });
}

/* ============================================================
   11) SETTINGS VIEW
   ============================================================ */
function renderSettingsView() {
  const container = document.getElementById("category-manage-list");
  container.innerHTML = config.categories.map((cat) => `
    <span class="category-chip">
      ${escapeHtml(cat)}
      <button data-cat="${escapeHtml(cat)}" aria-label="הסר">✕</button>
    </span>`).join("");

  container.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (config.categories.length <= 1) return;
      const newList = config.categories.filter((c) => c !== btn.dataset.cat);
      configRef.set({ categories: newList }, { merge: true });
    });
  });
}

document.getElementById("add-category-btn").addEventListener("click", () => {
  const input = document.getElementById("new-category-input");
  const val = input.value.trim();
  if (!val || config.categories.includes(val)) return;
  configRef.set({ categories: [...config.categories, val] }, { merge: true }).then(() => {
    input.value = "";
  });
});

document.getElementById("clear-all-btn").addEventListener("click", () => {
  if (!confirm("בטוחים? כל ההוצאות יימחקו לצמיתות.")) return;
  if (!confirm("רגע אחרון - זו פעולה שאי אפשר לבטל. למחוק הכל?")) return;
  Promise.all(allExpenses.map((e) => expensesRef.doc(e.id).delete())).then(() => {
    alert("כל ההוצאות נמחקו");
  });
});

/* ============================================================
   12) Modal + add-expense form
   ============================================================ */
const overlay = document.getElementById("modal-overlay");
document.getElementById("open-add").addEventListener("click", () => {
  populateCategorySelects();
  overlay.classList.remove("hidden");
});
document.getElementById("close-add").addEventListener("click", () => overlay.classList.add("hidden"));
overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.classList.add("hidden"); });

document.getElementById("expense-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const amount = parseFloat(document.getElementById("amount").value);
  const description = document.getElementById("description").value.trim();
  const category = document.getElementById("category").value;
  const paidBy = document.querySelector('input[name="paidBy"]:checked').value;
  if (!amount || amount <= 0) return;

  expensesRef.add({
    amount, description, category, paidBy,
    source: "web",
    date: firebase.firestore.Timestamp.now()
  }).then(() => {
    e.target.reset();
    document.querySelector('input[name="paidBy"][value="יוסף"]').checked = true;
    overlay.classList.add("hidden");
  });
});

/* ============================================================
   13) Init
   ============================================================ */
populateCategorySelects();
renderCurrentView();
