// script.js
const app = document.getElementById("app");
let currentUser = null;
let dailyStore = {}; // store chargé depuis la DB


/* ===============================
   ✅ BUY — CATÉGORIES (stockées en DB via dailyStore)
   - Stock global: dailyStore.__buy.categories[]
   - Trace jour: dailyStore[iso].buyCatTouched (pour cercle vert)
=============================== */

function getBuyStore() {
  if (!dailyStore.__buy) dailyStore.__buy = {};
  if (!Array.isArray(dailyStore.__buy.categories)) dailyStore.__buy.categories = [];
  return dailyStore.__buy;
}

function ensureBuyDayMark(isoDate) {
  const d = getDailyData(isoDate);
  if (d.buyCatTouched == null) d.buyCatTouched = false;
  return d;
}

// code tri “croissant” : 1 < 2 < 10, sinon alpha
function codeCompare(a, b) {
  const A = String(a ?? "").trim();
  const B = String(b ?? "").trim();
  const na = Number(A);
  const nb = Number(B);
  const aNum = Number.isFinite(na) && A !== "";
  const bNum = Number.isFinite(nb) && B !== "";
  if (aNum && bNum) return na - nb;
  return A.localeCompare(B, "fr", { numeric: true, sensitivity: "base" });
}

function normSearch(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}


/* =========================================================
   ✅ STYLE GLOBAL : griser tous les boutons non cliquables
========================================================= */
(function ensureDisabledButtonStyles() {
  if (document.getElementById("disabledButtonsStyle")) return;
  const style = document.createElement("style");
  style.id = "disabledButtonsStyle";
  style.textContent = `
    button:disabled,
    .pseudo-disabled {
      opacity: 0.45 !important;
      filter: grayscale(100%) !important;
      cursor: not-allowed !important;
    }

    button:disabled:hover,
    .pseudo-disabled:hover {
      transform: none !important;
      box-shadow: none !important;
    }

    button:disabled:active,
    .pseudo-disabled:active {
      transform: none !important;
    }
  `;
  document.head.appendChild(style);
})();

// Etat du mois affiché par page (0 = mois actuel, -1 = mois précédent, etc.)
const monthOffsetByPage = {
  daily: 0,
  weekly: 0,
  buy: 0,
};

// --------- ACCUEIL ---------
function renderHome() {
  app.innerHTML = `
    <div class="page">
      <div class="home-wrap" style="flex-direction:column; gap:18px;">
        <div class="home-row">
          <button id="daily" class="big-btn">Compte quotidien</button>
          <button id="weekly" class="big-btn">Compte hebdomadaire</button>
          <button id="buy" class="big-btn">Compte d’achat</button>
        </div>

        ${
          currentUser
            ? `<button id="logoutBtn" class="btn btn-blue lift" style="min-width:240px;">Déconnexion</button>`
            : ``
        }
      </div>
    </div>
  `;

  document.getElementById("daily").addEventListener("click", () => navigateTo("#daily"));
  document.getElementById("weekly").addEventListener("click", () => navigateTo("#weekly"));
  document.getElementById("buy").addEventListener("click", () => navigateTo("#buy"));

  const lo = document.getElementById("logoutBtn");
  if (lo) {
    lo.addEventListener("click", async () => {
      lo.disabled = true;
      try {
        await apiLogout();
      } catch (e) {}
      currentUser = null;
      dailyStore = {};
      history.pushState({}, "", "#");
      renderLogin();
    });
  }
}
// --------- OUTILS DATE ---------
function addMonths(date, n) {
  const d = new Date(date);
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return d;
}

function formatMonthYear(date) {
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(date);
}

function formatFullDate(date) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

// Lundi = 0 ... Dimanche = 6
function mondayIndex(jsDay) {
  return (jsDay + 6) % 7;
}

function sameDate(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isAfterDay(a, b) {
  const aa = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bb = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return aa > bb;
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromISODate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDaysIso(isoDate, deltaDays) {
  const d = fromISODate(isoDate);
  d.setDate(d.getDate() + deltaDays);
  return toISODate(d);
}

function isFutureIso(isoDate) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d = fromISODate(isoDate);
  return isAfterDay(d, today);
}

function dayHeaderHTML(titleText, { withPrevNext = true } = {}) {
  if (!withPrevNext) return `<div class="date-title">${titleText}</div>`;

  return `
    <div class="day-header">
      <button id="prevDay" class="nav-arrow">←</button>
      <div class="date-title">${titleText}</div>
      <button id="nextDay" class="nav-arrow">→</button>
    </div>
  `;
}

function bindPrevNextDayButtons(currentIso, { baseHashPrefix }) {
  const prev = document.getElementById("prevDay");
  const next = document.getElementById("nextDay");

  const prevIso = addDaysIso(currentIso, -1);
  const nextIso = addDaysIso(currentIso, +1);

  if (prev) {
    prev.addEventListener("click", () => navigateTo(`${baseHashPrefix}${prevIso}`));
  }

  if (next) {
    // ✅ on évite d’aller dans le futur (comme ton calendrier)
    if (isFutureIso(nextIso)) {
      next.disabled = true;
      next.classList.add("pseudo-disabled");
    } else {
      next.addEventListener("click", () => navigateTo(`${baseHashPrefix}${nextIso}`));
    }
  }
}


/**
 * ✅ Conversion robuste : accepte
 * - "100"
 * - "12,5" / "12.5"
 * - "1 000,50"
 */
function toNumberLoose(value) {
  if (typeof value !== "string") return null;

  const cleaned = value.trim().replace(/\s+/g, "").replace(",", ".");
  if (cleaned === "" || cleaned === "." || cleaned === "-") return null;

  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

// ✅ Ajoute espaces milliers + virgule FR à partir d'une chaîne "numérique"
function formatNumberTextFR(raw) {
  const n = toNumberLoose(String(raw ?? ""));
  if (n === null) return "0";
  // formatTotal met déjà les espaces milliers (si tu as appliqué ma modif),
  // puis on passe en virgule.
  return formatCommaNumber(n);
}

// ✅ Affiche une opération avec espaces autour des signes + format milliers sur chaque nombre
// Ex: "1000+20-3,5" -> "1 000 + 20 - 3,5"
function formatOperationDisplay(raw) {
  let s = String(raw || "").trim();
  if (!s) return "0";

  // Normaliser : pas d'espaces, virgule->point
  s = s.replace(/\s+/g, "").replace(",", ".");

  // Tokenize: nombres / opérateurs
  const tokens = [];
  let i = 0;

  while (i < s.length) {
    const ch = s[i];

    if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "^" || ch === "(" || ch === ")") {
      tokens.push(ch);
      i++;
      continue;
    }

    // nombre (avec décimales)
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      tokens.push(s.slice(i, j));
      i = j;
      continue;
    }

    // caractère inattendu : on le garde brut
    tokens.push(ch);
    i++;
  }

  // Formatage : chaque "nombre" -> milliers + virgule
  const out = tokens.map((t) => {
    if (/^\d+(\.\d+)?$/.test(t)) return formatCommaNumber(parseFloat(t));
    if (t === "*") return "×";
    if (t === "/") return "÷";
    return t;
  });

  // Espaces autour des opérateurs (et parenthèses propres)
  // "1 000+20" -> "1 000 + 20"
  return out
    .join(" ")
    .replace(/\s*\(\s*/g, "(")
    .replace(/\s*\)\s*/g, ")")
    .replace(/\s+([+\-×÷^])\s+/g, " $1 ")
    .replace(/\s{2,}/g, " ")
    .trim();
}


// ✅ Affichage "fr" pour une saisie texte
// ex: "1300000,5" -> "1 300 000,5"
function formatInputNumberDisplay(raw) {
  const s = String(raw || "").trim();
  if (!s) return "0";

  // garde virgule, retire espaces existants
  const cleaned = s.replace(/\s+/g, "").replace(/\./g, ",");

  const neg = cleaned.startsWith("-") ? "-" : "";
  const body = neg ? cleaned.slice(1) : cleaned;

  const parts = body.split(",");
  const intPart = parts[0] || "0";
  const decPart = parts.length > 1 ? parts.slice(1).join("") : null;

  const intSpaced = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  return neg + (decPart != null && decPart !== "" ? `${intSpaced},${decPart}` : intSpaced);
}


// --------- API ---------
async function apiGetMe() {
  const r = await fetch("/api/auth/me", { credentials: "include" });
  if (!r.ok) return null;
  const j = await r.json();
  return j.user || null;
}

async function apiLogin(username, password) {
  const r = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Login failed");
  return j.user;
}

async function apiLogout() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}

async function apiLoadData() {
  const r = await fetch("/api/data", { credentials: "include" });
  if (!r.ok) throw new Error("Not authenticated");
  const j = await r.json();
  return j.dailyStore || {};
}

async function apiSaveData(store) {
  const r = await fetch("/api/data", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dailyStore: store }),
  });

  const txt = await r.text();
  let j = {};
  try { j = txt ? JSON.parse(txt) : {}; } catch {}

  if (!r.ok) {
    throw new Error((j && j.error) ? j.error : `Save failed (HTTP ${r.status})`);
  }
  return true;
}

// ✅ Persistance immédiate (Valider/Terminer/Modifier)
async function persistNow() {
  if (!currentUser) throw new Error("No currentUser");
  await apiSaveData(dailyStore);
}

// ✅ version "silencieuse" (pas de spam d'alert)
async function safePersistNow() {
  try { await persistNow(); } catch (e) { console.error(e); }
}
// ✅ Grille: cases vides avant le 1er / après le dernier
function buildCalendarCells(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();

  const firstOfMonth = new Date(year, month, 1);
  const startOffset = mondayIndex(firstOfMonth.getDay());
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push({ type: "empty" });
  for (let day = 1; day <= daysInMonth; day++)
    cells.push({ type: "day", date: new Date(year, month, day) });
  while (cells.length < 42) cells.push({ type: "empty" });

  return cells;
}

// ===============================
// ✅ DÉBUT — renderCalendarPage(pageName)
// ===============================
function renderCalendarPage(pageName) {
  const offset = monthOffsetByPage[pageName] ?? 0;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const currentMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const shownMonthDate = addMonths(currentMonthDate, offset);

  const showRight = offset < 0;

  const dows = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const cells = buildCalendarCells(shownMonthDate);

  const colorsEnabled = pageName === "daily"; // ✅ vert/bleu uniquement daily

  app.innerHTML = `
    <div class="page ${pageName === "buy" ? "buy-calendar" : ""}">
      <button id="back" class="back-btn">← Retour</button>

      <div class="calendar-header">
        <div class="month-nav">
          <button id="prevMonth" class="nav-arrow">←</button>
          <div class="month-title">${formatMonthYear(shownMonthDate)}</div>
          ${showRight ? `<button id="nextMonth" class="nav-arrow">→</button>` : ""}
        </div>
      </div>

      <div class="calendar-grid">
        ${dows.map((d) => `<div class="dow">${d}</div>`).join("")}

        ${cells
          .map((c) => {
            if (c.type === "empty") return `<div class="day-empty"></div>`;

            const isToday = offset === 0 && sameDate(c.date, today);
            const isFutureDay = offset === 0 && isAfterDay(c.date, today);

            const iso = toISODate(c.date);
            const n = c.date.getDate();

            const saved = colorsEnabled ? !!(dailyStore?.[iso]?.daySaved) : false;
            const migrated = colorsEnabled ? !!(dailyStore?.[iso]?.dayMigrated) : false;

            // priorité : vert > bleu
            const clsSaved = saved ? "saved" : "";
            const clsMigrated = !saved && migrated ? "migrated" : "";

            return `
              <button
                class="day-box ${pageName === "buy" ? "buy-day" : ""} ${isToday ? "today" : ""} ${clsSaved} ${clsMigrated} ${isFutureDay ? "disabled" : ""}"
                data-date="${iso}"
                ${isFutureDay ? "disabled" : ""}
                >${
    pageName === "buy"
  ? `
    <div class="day-num">${n}</div>
    <div class="buy-juste-row" aria-hidden="true">
      <span class="buy-juste-circle ${dailyStore?.[iso]?.buyCatTouched ? "buy-green" : ""}"></span>
      <span class="buy-juste-circle"></span>
    </div>
  `
  : `${n}`

  }</button>

            `;
          })
          .join("")}
      </div>
    </div>
  `;

  document.getElementById("back").addEventListener("click", () => smartBack());


  document.getElementById("prevMonth").addEventListener("click", () => {
    monthOffsetByPage[pageName] -= 1;
    render();
  });

  if (showRight) {
    document.getElementById("nextMonth").addEventListener("click", () => {
      monthOffsetByPage[pageName] = Math.min(0, monthOffsetByPage[pageName] + 1);
      render();
    });
  }

  app.querySelectorAll(".day-box[data-date]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const iso = btn.getAttribute("data-date");

      // ✅ daily : menu 2 boutons
      if (pageName === "daily") {
        navigateTo(`#daily/${iso}/menu`);
        return;
      }

      // autres pages : direct (provisoire)
      navigateTo(`#${pageName}/${iso}`);
    });
  });
}
// ===============================
// ✅ FIN — renderCalendarPage(pageName)
// ===============================


// ===============================
// ✅ DÉBUT — getDailyData(isoDate)
// ===============================
function getDailyData(isoDate) {
  if (!dailyStore[isoDate]) {
    dailyStore[isoDate] = {
      liquidite: "",
      liquiditeFinalized: false,

      capital: "",
      capitalFinalized: false,

      // ✅ Apport (comme prélèvements)
      apport: { items: [], editing: false, finalized: false, draft: "", editIndex: null, editDraft: "", editBackup: null },


      caisseDepart: "",
      caisseDepartFinalized: false,

      nouvelleCaisse: "",
      nouvelleCaisseFinalized: false,


      // ✅ Dépenses (comme prélèvements)
      depenses: { items: [], editing: false, finalized: false, draft: "", editIndex: null, editDraft: "", editBackup: null },

      recette: "",
      recetteFinalized: false,

      prt: "",
      prtFinalized: false,

      // ✅ bénéfice réel (ancien conservé)
      beneficeReel: "",
      beneficeReelFinalized: false,
      beneficeReelError: false,

      // compat ancien
      nouvelleCaisseReelle: "",
      nouvelleCaisseReelleFinalized: false,

      // ✅ Nouvelle caisse réelle (pile)
      nouvelleCaisseReelleStack: {
        items: [],
        draft: "",
        finalized: false,
        editIndex: null,
        editDraft: "",
        editError: false,
        draftError: false,
      },

      // compat ancien
      nouveauCapital: "",
      nouveauCapitalFinalized: false,

      // ✅ Nouveau capital (pile)
      nouveauCapitalStack: {
        items: [],
        draft: "",
        draftAutoFilled: false,
        finalized: false,
        editIndex: null,
        editDraft: "",
        editError: false,
        draftError: false,
      },

      nouvelleLiquidite: "",
      nouvelleLiquiditeFinalized: false,

      // ✅ Prélèvement sur capital
      prelevement: { items: [], editing: false, finalized: false, draft: "", editIndex: null, editDraft: "", editBackup: null },

      // ✅ Prélèvement sur caisse
      prelevementCaisse: { items: [], editing: false, finalized: false, draft: "", editIndex: null, editDraft: "", editBackup: null },

      buyCatTouched: false,

      // ✅ état "enregistrer"
      daySaved: false,

      // ✅ état "migré" (bleu calendrier)
      dayMigrated: false,
    };
  }

  const d = dailyStore[isoDate];

  // migrations
  if (d.beneficeReelFinalized == null) d.beneficeReelFinalized = false;
  if (d.beneficeReelError == null) d.beneficeReelError = false;

  if (d.recetteFinalized == null) d.recetteFinalized = false;
  if (d.nouvelleLiquiditeFinalized == null) d.nouvelleLiquiditeFinalized = false;

  if (d.liquiditeFinalized == null) d.liquiditeFinalized = false;
  if (d.capitalFinalized == null) d.capitalFinalized = false;

  if (d.caisseDepartFinalized == null) d.caisseDepartFinalized = false;
  if (d.caisseDepart == null) d.caisseDepart = "";

  if (d.nouvelleCaisseFinalized == null) d.nouvelleCaisseFinalized = false;
  if (d.nouvelleCaisse == null) d.nouvelleCaisse = "";


  if (d.prtFinalized == null) d.prtFinalized = false;

  if (d.daySaved == null) d.daySaved = false;
  if (d.dayMigrated == null) d.dayMigrated = false;

  // migration piles
  if (!d.nouveauCapitalStack) {
    d.nouveauCapitalStack = {
      items: [],
      draft: "",
      finalized: false,
      editIndex: null,
      editDraft: "",
      editError: false,
      draftError: false,
    };
  }
  if (d.nouveauCapitalFinalized && d.nouveauCapital && d.nouveauCapitalStack.items.length === 0) {
    const raw = d.nouveauCapital;
    const res = evalOperation(raw);
    if (res !== null) {
      d.nouveauCapitalStack.items = [{ raw, result: res }];
      d.nouveauCapitalStack.finalized = true;
      d.nouveauCapitalStack.draft = "";
    }
  }

  if (!d.prelevementCaisse) {
    d.prelevementCaisse = { items: [], editing: false, finalized: false, draft: "" };
  }
  if (!d.prelevement) {
    d.prelevement = { items: [], editing: false, finalized: false, draft: "" };
  }
  
  if (!d.apport) {
  d.apport = { items: [], editing: false, finalized: false, draft: "" };
  }


  // ✅ migration dépenses
  if (!d.depenses) {
    d.depenses = { items: [], editing: false, finalized: false, draft: "" };
  }

  if (!d.nouvelleCaisseReelleStack) {
    d.nouvelleCaisseReelleStack = {
      items: [],
      draft: "",
      finalized: false,
      editIndex: null,
      editDraft: "",
      editError: false,
      draftError: false,
    };
  }
  if (d.nouvelleCaisseReelleFinalized && d.nouvelleCaisseReelle && d.nouvelleCaisseReelleStack.items.length === 0) {
    const raw = d.nouvelleCaisseReelle;
    const res = evalOperation(raw);
    if (res !== null) {
      d.nouvelleCaisseReelleStack.items = [{ raw, result: res }];
      d.nouvelleCaisseReelleStack.finalized = true;
      d.nouvelleCaisseReelleStack.draft = "";
    }
  }

  return d;
}
// ===============================
// ✅ FIN — getDailyData(isoDate)
// ===============================


function computePrelevementTotal(items) {
  let sum = 0;
  for (const it of items) {
    const n = toNumberLoose(it);
    if (n !== null) sum += n;
  }
  return sum;
}

function formatTotal(n) {
  if (!Number.isFinite(n)) return "0";

  // 1) format de base (garde le "." ici)
  let s = n.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");

  // 2) ajoute espaces milliers sur la partie entière
  const sign = s.startsWith("-") ? "-" : "";
  if (sign) s = s.slice(1);

  const [intPart, decPart] = s.split(".");
  const intSpaced = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  return sign + (decPart != null ? `${intSpaced}.${decPart}` : intSpaced);
}


// ===============================
// ✅ DÉBUT — Helpers migration
// ===============================
function formatCommaNumber(n) {
  // formatTotal renvoie avec ".", on convertit en ","
  return formatTotal(n).replace(".", ",");
}

function nextBusinessIso(isoDate) {
  const d = fromISODate(isoDate);
  // Samedi (6) -> Lundi (+2), sinon +1
  const delta = d.getDay() === 6 ? 2 : 1;
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
// ===============================
// ✅ FIN — Helpers migration
// ===============================


function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeAttr(s) {
  return escapeHtml(s).replaceAll("\n", " ");
}

function shake(el) {
  if (!el) return;
  el.classList.remove("shake");
  void el.offsetWidth;
  el.classList.add("shake");
}

/* =========================================================
   ✅ CLAVIER CALCULATRICE (mobile) pour inputs opérations
   - portrait: essentiels (0-9, +, -, ×, ÷, ., , , backspace, cancel, OK)
   - paysage: ajoute ( ), ^, π, x²
========================================================= */
function isMobileNarrow() {
  return window.matchMedia("(max-width: 520px)").matches;
}
function isLandscape() {
  return window.matchMedia("(orientation: landscape)").matches;
}

function ensureCalcPadStyles() {
  if (document.getElementById("calcPadStyle")) return;
  const st = document.createElement("style");
  st.id = "calcPadStyle";
  st.textContent = `
    .calcpad {
      position: fixed;
      left: 0; right: 0; bottom: 0;
      background: rgba(10,10,10,0.98);
      border-top: 1px solid rgba(255,255,255,0.12);
      padding: 10px;
      z-index: 9999;
    }
    .calcpad .row {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 8px;
      margin-bottom: 8px;
    }
    .calcpad button {
      border: none;
      border-radius: 12px;
      padding: 14px 10px;
      font-weight: 900;
      font-size: 16px;
      color: #fff;
      background: rgba(255,255,255,0.10);
    }
    .calcpad button:active { transform: scale(0.98); }
    .calcpad .op { background: rgba(30,94,255,0.45); }
    .calcpad .danger { background: rgba(230,0,0,0.55); }
    .calcpad .ok { background: rgba(25,163,74,0.55); }
    .calcpad .wide { grid-column: span 2; }
    @media (max-width: 520px){
      .calcpad button{ padding: 12px 8px; font-size: 15px; border-radius: 10px; }
    }
  `;
  document.head.appendChild(st);
}

function ensureOpOverlayStyles() {
  if (document.getElementById("opOverlayStyle")) return;
  const st = document.createElement("style");
  st.id = "opOverlayStyle";
  st.textContent = `
    .op-overlay {
      position: fixed;
      inset: 0;
      z-index: 30000;
      background: #000;
      color: #fff; /* ✅ AJOUT : rend le titre visible */
      display: flex;
      flex-direction: column;
    }
    .op-overlay .top {
      padding: 14px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.12);
      display: flex;
      gap: 10px;
      align-items: stretch;
      flex-direction: column;
    }
    .op-overlay .top input {
      flex: 1;
      min-width: 0;
      font-size: 18px;
    }
    .op-overlay .pad-wrap {
      margin-top: auto;
      padding: 10px;
      border-top: 1px solid rgba(255,255,255,0.12);
      background: rgba(10,10,10,0.98);
    }
    /* ✅ Réutilise le style .calcpad dans l'overlay, mais sans "fixed" */
    .op-overlay .calcpad {
      position: static;
      left: auto; right: auto; bottom: auto;
      border-top: 0;
      padding-bottom: calc(10px + env(safe-area-inset-bottom));
    }
    .op-overlay .calcpad button {
      font-size: 16px;
    }
        /* =========================
       ✅ 3.3 — Search + suggestions (overlay)
    ========================= */

    .op-search-wrap{
      position: relative;
      margin-top: 10px;
    }

    .op-search{
      width: 100%;
      padding-left: 44px; /* place pour la loupe */
      font-size: 16px;
      color: #fff;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.12);
    }

    .op-search-icon{
      position:absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      width: 18px;
      height: 18px;
      opacity: .9;
      pointer-events: none;
      color: rgba(255,255,255,0.85);
      display:flex;
      align-items:center;
      justify-content:center;
    }
    .op-search-icon svg{ width:18px; height:18px; }

    .op-suggest{
      position: absolute;
      left: 0;
      right: 0;
      top: calc(100% + 8px);
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(18,18,18,0.98);
      z-index: 30001;
    }

    .op-suggest-item{
      padding: 12px 12px;
      font-weight: 900;
      cursor: pointer;
      color: #fff;
      border-top: 1px solid rgba(255,255,255,0.08);
    }
    .op-suggest-item:first-child{ border-top: 0; }

    .op-suggest-item:hover{
      background: rgba(255,255,255,0.06);
    }

    .op-suggest-strong{ color: #fff; font-weight: 900; }
    .op-suggest-muted{ color: rgba(255,255,255,0.70); font-weight: 900; }

    .op-search-result{
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid rgba(255,255,255,0.12);
    }

    .op-search-title{
      font-weight: 900;
      opacity: .9;
      margin-bottom: 8px;
    }

  `;
  document.head.appendChild(st);
}



function openOpOverlay({ inputEl, title, hint = "", initialValue, placeholder, searchItems, onCancel, onOk }) {

  if (!inputEl) return;

  ensureOpOverlayStyles();
  ensureCalcPadStyles();

  const overlayTitle = hint ? `${title} (${hint})` : title;

  const old = document.getElementById("opOverlay");
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.id = "opOverlay";
  overlay.className = "op-overlay";

  overlay.innerHTML = `
    <div class="top">
      ${overlayTitle ? `<div style="font-weight:900; opacity:.9; margin-bottom:8px;">${escapeHtml(overlayTitle)}</div>` : ``}


      <input id="opOverlayInput" class="input"
        inputmode="none"
        autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
        placeholder="${escapeAttr(placeholder)}" />

      <!-- ✅ AJOUT : barre de recherche -->
      <div class="op-search-wrap">
        <span class="op-search-icon" aria-hidden="true">
          <!-- loupe simplifiée -->
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="7"></circle>
            <path d="M20 20l-3.5-3.5"></path>
          </svg>
        </span>

        <input id="opSearch" class="input op-search"
          inputmode="text"
          autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
          placeholder="Rechercher (ex: capital, caisse départ...)" />

        <div id="opSuggest" class="op-suggest" style="display:none;"></div>
      </div>

      <div id="opSearchResult" class="op-search-result" style="display:none;"></div>
    </div>

    <div class="pad-wrap calcpad" id="opOverlayPad"></div>
  `;

  document.body.appendChild(overlay);

  const topInput = document.getElementById("opOverlayInput");
  const padWrap = document.getElementById("opOverlayPad");

  const searchInput = document.getElementById("opSearch");
  const suggestBox = document.getElementById("opSuggest");
  const resultBox = document.getElementById("opSearchResult");

  topInput.value = initialValue || "";
  topInput.focus();

  // ✅ empêche saisie clavier (garde caret)
  topInput.addEventListener("beforeinput", (e) => e.preventDefault());
  topInput.addEventListener("keydown", (e) => e.preventDefault());
  topInput.style.caretColor = "#fff";

  // sync overlay -> input réel
  topInput.addEventListener("input", () => {
    inputEl.value = topInput.value;
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
  });

  function close() {
    overlay.remove();
    try { inputEl.blur(); } catch {}
  }

  // -----------------------
  // ✅ RECHERCHE : suggestions type Google
  // -----------------------
  function norm(s){
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  const items = Array.isArray(searchItems) ? searchItems : [];

  function renderSuggestions(q){
    const nq = norm(q);
    if (!nq) {
      suggestBox.style.display = "none";
      suggestBox.innerHTML = "";
      return;
    }

    const filtered = items
      .filter(it => norm(it.key).startsWith(nq) || norm(it.label).startsWith(nq))
      .slice(0, 7);

    if (!filtered.length) {
      suggestBox.style.display = "none";
      suggestBox.innerHTML = "";
      return;
    }

    suggestBox.innerHTML = filtered.map(it => {
      const label = it.label || it.key;
      // petit “gras” sur la partie tapée
      const base = label;
      const idx = norm(base).indexOf(nq);
      let html = escapeHtml(base);
      if (idx === 0) {
        const a = base.slice(0, q.length);
        const b = base.slice(q.length);
        html = `<span class="op-suggest-strong">${escapeHtml(a)}</span><span class="op-suggest-muted">${escapeHtml(b)}</span>`;
      }
      return `<div class="op-suggest-item" data-sel="${escapeAttr(it.key)}">${html}</div>`;
    }).join("");

    suggestBox.style.display = "";
  }

  function showResult(item){
    if (!item) return;

    resultBox.style.display = "";
    resultBox.innerHTML = `
      <div class="op-search-title">${escapeHtml(item.label || item.key)}</div>
      <div class="card card-white lift">${escapeHtml(item.valueText ?? "(...)")}</div>
    `;
  }

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderSuggestions(searchInput.value);
    });

    suggestBox.addEventListener("click", (e) => {
      const el = e.target.closest(".op-suggest-item");
      if (!el) return;
      const key = el.getAttribute("data-sel") || "";
      const found = items.find(it => String(it.key) === String(key));
      suggestBox.style.display = "none";
      showResult(found);
    });

    // fermer suggestions si clic ailleurs dans top
    document.addEventListener("pointerdown", (e) => {
      if (!suggestBox) return;
      if (suggestBox.contains(e.target)) return;
      if (searchInput && searchInput.contains(e.target)) return;
      suggestBox.style.display = "none";
    }, { capture: true });
  }

  // Construire la calculette DANS l’overlay
  buildCalcPadInto(padWrap, topInput, {
    onOk: () => {
      close();
      onOk();
    },
    onCancel: () => {
      close();
      onCancel();
    },
  });
}



function buildCalcPadInto(containerEl, inputEl, { onOk, onCancel } = {}) {
  if (!containerEl || !inputEl) return;

  containerEl.innerHTML = ""; // reset

  const portrait = !isLandscape();

  const rowsPortrait = [
  ["7","8","9","+","-"],
  ["4","5","6","×","÷"],
  ["1","2","3",".",","],
  ["0","(",")","⌫","CANCEL"],
  ["␣"],     // ✅ touche espace AU-DESSUS de OK
  ["OK"]
];


  const rowsLandscape = [
  ["7","8","9","+","-"],
  ["4","5","6","×","÷"],
  ["1","2","3",".",","],
  ["0","(",")","^","x²"],
  ["π","⌫","CANCEL"],  // ✅ OK retiré de cette ligne
  ["␣"],              // ✅ espace
  ["OK"]              // ✅ OK dessous
];


  const rows = portrait ? rowsPortrait : rowsLandscape;

  function insertAtCursor(text) {
    const start = inputEl.selectionStart ?? inputEl.value.length;
    const end = inputEl.selectionEnd ?? inputEl.value.length;
    const v = inputEl.value;
    inputEl.value = v.slice(0, start) + text + v.slice(end);
    const pos = start + text.length;
    inputEl.focus({ preventScroll: true });
    inputEl.setSelectionRange(pos, pos);
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function backspace() {
    const start = inputEl.selectionStart ?? inputEl.value.length;
    const end = inputEl.selectionEnd ?? inputEl.value.length;

    if (start !== end) { insertAtCursor(""); return; }
    if (start <= 0) return;

    const v = inputEl.value;
    inputEl.value = v.slice(0, start - 1) + v.slice(end);
    const pos = start - 1;

    inputEl.focus({ preventScroll: true });
    inputEl.setSelectionRange(pos, pos);
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
  }

  rows.forEach((arr) => {
    const row = document.createElement("div");
    row.className = "row";
    if (arr.length === 1) row.style.gridTemplateColumns = "repeat(1, 1fr)";
    containerEl.appendChild(row);

    arr.forEach((key) => {
      const b = document.createElement("button");
      if (["+","-","×","÷","^","(",")","x²","π"].includes(key)) b.classList.add("op");
      if (key === "CANCEL") b.classList.add("danger");
      if (key === "OK") b.classList.add("ok");
      if (key === "OK" && arr.length === 1) b.classList.add("wide");

      b.textContent = key;
      b.type = "button";

      b.addEventListener("click", () => {
        if (key === "⌫") return backspace();
        if (key === "CANCEL") {
  if (typeof onCancel === "function") onCancel();
  return;
}
if (key === "OK") {
  if (typeof onOk === "function") onOk();
  return;
}
      
        if (key === "␣") return insertAtCursor(" ");  
        if (key === "×") return insertAtCursor("*");
        if (key === "÷") return insertAtCursor("/");
        if (key === "π") return insertAtCursor("3.1415926535");
        if (key === "x²") return insertAtCursor("^2");

        insertAtCursor(key);
      });

      row.appendChild(b);
    });
  });
}



function attachCalcKeyboard(inputEl, { onEnter } = {}) {
  if (!inputEl) return;

  // ✅ Sur téléphone/tablette : on force la calculatrice et on coupe le clavier natif
  const isTouch = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);

    // ✅ handler viewport pour garder l’input visible
  let vvHandler = null;


    // ✅ PC / non-touch : PAS de calculette overlay (sinon ça masque)
  if (!isTouch) {
    // On garde seulement "Enter" => onEnter
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (typeof onEnter === "function") onEnter();
      }
    });
    return;
  }


  ensureCalcPadStyles();

  function closePad() {
    const pad = document.getElementById("calcpad");
    if (pad) pad.remove();
    document.body.style.paddingBottom = "";
    document.removeEventListener("pointerdown", outsideClose, true);
   // ✅ IMPORTANT : stop listeners viewport
    const vv = window.visualViewport;
      if (vv && vvHandler) {
      vv.removeEventListener("resize", vvHandler);
      vv.removeEventListener("scroll", vvHandler);
      vvHandler = null;
  }
}


  function outsideClose(e){
    const pad = document.getElementById("calcpad");
    if (!pad) return;
    if (e.target === inputEl) return;
    if (pad.contains(e.target)) return;
    closePad();
  }

  function ensureInputVisible(padEl){
    requestAnimationFrame(() => {
      const padH = padEl?.offsetHeight || 0;
      if (padH) document.body.style.paddingBottom = (padH + 16) + "px";

      // viewport fiable (iOS/Android)
      const vv = window.visualViewport;
      const viewportH = vv?.height || window.innerHeight;
      const viewportTop = vv?.offsetTop || 0;

      // 1) tentative centrée
      try { inputEl.scrollIntoView({ block: "center", behavior: "auto" }); } catch {}


      // 2) correction fine : si le bas de l’input est sous la zone visible (au-dessus du pad)
      requestAnimationFrame(() => {
        const rect = inputEl.getBoundingClientRect();

        // zone visible utile = du haut viewport -> (bas viewport - pad)
        const safeBottom = viewportTop + viewportH - padH - 12;

        if (rect.bottom > safeBottom) {
          const delta = rect.bottom - safeBottom;
          window.scrollBy({ top: delta, left: 0, behavior: "auto" });

        }
      });
    });
  }



  function insertAtCursor(text) {
    const start = inputEl.selectionStart ?? inputEl.value.length;
    const end = inputEl.selectionEnd ?? inputEl.value.length;
    const v = inputEl.value;
    inputEl.value = v.slice(0, start) + text + v.slice(end);
    const pos = start + text.length;

    // ✅ garde le focus + curseur
    inputEl.focus({ preventScroll: true });
    inputEl.setSelectionRange(pos, pos);

    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function backspace() {
    const start = inputEl.selectionStart ?? inputEl.value.length;
    const end = inputEl.selectionEnd ?? inputEl.value.length;

    if (start !== end) {
      // supprime la sélection
      insertAtCursor("");
      return;
    }
    if (start <= 0) return;

    const v = inputEl.value;
    inputEl.value = v.slice(0, start - 1) + v.slice(end);
    const pos = start - 1;

    inputEl.focus({ preventScroll: true });
    inputEl.setSelectionRange(pos, pos);
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function buildPad() {
    // ✅ Si déjà affiché, on ne le détruit pas : calculatrice "permanente"
    let pad = document.getElementById("calcpad");
    if (pad) {
      ensureInputVisible(pad);
      return;
    }

    pad = document.createElement("div");
    pad.className = "calcpad";
    pad.id = "calcpad";

    // ✅ empêcher la perte de focus quand on clique sur le pad
    pad.addEventListener("pointerdown", (e) => {
      e.preventDefault();
    });

    // ✅ Layout (portrait + paysage)
    const portrait = !isLandscape();

    const rowsPortrait = [
      ["7","8","9","+","-"],
      ["4","5","6","×","÷"],
      ["1","2","3",".",","],
      ["0","(",")","⌫","CANCEL"],
      ["OK"]
    ];

    const rowsLandscape = [
      ["7","8","9","+","-"],
      ["4","5","6","×","÷"],
      ["1","2","3",".",","],
      ["0","(",")","^","x²"],
      ["π","⌫","CANCEL","OK"]
    ];

    const rows = portrait ? rowsPortrait : rowsLandscape;

    rows.forEach((arr) => {
      const row = document.createElement("div");
      row.className = "row";
      if (arr.length === 1) row.style.gridTemplateColumns = "repeat(1, 1fr)";
      pad.appendChild(row);

      arr.forEach((key) => {
        const b = document.createElement("button");

        if (["+","-","×","÷","^","(",")","x²","π"].includes(key)) b.classList.add("op");
        if (key === "CANCEL") b.classList.add("danger");
        if (key === "OK") b.classList.add("ok");
        if (key === "OK" && arr.length === 1) b.classList.add("wide");

        b.textContent = key;
        b.type = "button";

        b.addEventListener("click", () => {
          // ✅ ne jamais faire fermer le pad pendant la saisie
          if (key === "⌫") return backspace();

          if (key === "CANCEL") {
            inputEl.value = "";
            inputEl.dispatchEvent(new Event("input", { bubbles: true }));

            // ✅ option : on garde le pad ouvert, mais on force l’input visible
            inputEl.focus({ preventScroll: true });
            ensureInputVisible(document.getElementById("calcpad"));

            return;
          }


          if (key === "OK") {
            closePad();

            // ✅ libère le focus sinon retaper sur le même input ne relance rien
            inputEl.blur();

            if (typeof onEnter === "function") onEnter();
            return;
          }


          if (key === "×") return insertAtCursor("*");
          if (key === "÷") return insertAtCursor("/");
          if (key === "π") return insertAtCursor("3.1415926535");
          if (key === "x²") return insertAtCursor("^2");

          insertAtCursor(key);
        });

        row.appendChild(b);
      });
    });

    
   document.body.appendChild(pad);

// ✅ 1) scroll immédiat
ensureInputVisible(pad);

// ✅ 2) rescroll après reflow (mobile)
setTimeout(() => ensureInputVisible(pad), 80);
setTimeout(() => ensureInputVisible(pad), 180);

// ✅ 3) suivre les changements de viewport (mobile surtout)
const vv = window.visualViewport;
if (vv) {
  vvHandler = () => ensureInputVisible(pad);
  vv.addEventListener("resize", vvHandler, { passive: true });
  vv.addEventListener("scroll", vvHandler, { passive: true });
}



// ✅ fermer si on tape en dehors
document.addEventListener("pointerdown", outsideClose, true);

  }

    // ✅ Mobile : on évite le clavier natif SANS readonly (sinon caret disparaît)
inputEl.removeAttribute("readonly");
inputEl.setAttribute("inputmode", "none");




  // ✅ ouvrir pad au focus (sans readonly -> caret visible)
inputEl.addEventListener("focus", () => {
  buildPad();

  // ✅ force affichage du caret sur iOS
  requestAnimationFrame(() => {
    try {
      const pos = inputEl.value.length;
      inputEl.setSelectionRange(pos, pos);
    } catch {}
  });
});


    // ✅ IMPORTANT : on NE bloque PAS le pointerdown, sinon impossible de placer le caret au doigt
  inputEl.addEventListener("pointerdown", () => {
  setTimeout(() => {
    buildPad();
    inputEl.focus({ preventScroll: true });
    const pad = document.getElementById("calcpad");
    if (pad) ensureInputVisible(pad);
  }, 0);
});




  // ✅ si orientation change, on reconstruit le pad (sans perdre l’input)
  window.addEventListener("orientationchange", () => {
    const pad = document.getElementById("calcpad");
    if (!pad) return;

    pad.remove();
    buildPad();
  });
}



/* -------------------------
   ✅ RÈGLES "OPÉRATIONS"
   - Support: + - * / (x, ×, ÷), parenthèses, virgule, puissances ^
   - Évaluation sans eval()
------------------------- */
function normalizeOp(s) {
  return String(s || "")
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .replace(/[x×]/g, "*")
    .replace(/[÷]/g, "/");
}

function charsAllowedForOpInput(value) {
  // autorise chiffres, espaces, , . + - * / x × ÷ ( ) ^
  return /^[0-9\s.,+\-*/x×÷()^]*$/.test(value);
}

function isOperationPosed(raw) {
  const s = normalizeOp(raw);
  if (!s) return false;

  // doit contenir au moins un opérateur binaire ou une puissance
  if (!/[+\-*/^]/.test(s.replace(/^[+\-]/, ""))) return false;

  // caractères stricts
  if (!/^[0-9+\-*/.^()]*$/.test(s)) return false;

  // essai d'évaluation "safe"
  return evalOperation(raw) !== null;
}

function evalOperation(raw) {
  const s = normalizeOp(raw);
  if (!s) return null;

  // Tokenizer : nombres / opérateurs / parenthèses
  const tokens = [];
  let i = 0;

  function isDigit(ch) { return /[0-9]/.test(ch); }

  while (i < s.length) {
    const ch = s[i];

    // nombres
    if (isDigit(ch) || ch === ".") {
      let start = i;
      i++;
      while (i < s.length && (isDigit(s[i]) || s[i] === ".")) i++;
      const part = s.slice(start, i);
      const n = parseFloat(part);
      if (!Number.isFinite(n)) return null;
      tokens.push({ type: "num", value: n });
      continue;
    }

    // pi (option : "pi" via bouton -> on injecte le nombre direct, donc pas besoin)
    // opérateurs / parenthèses
    if ("+-*/^()".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }

    return null; // caractère invalide
  }

  // Shunting-yard -> RPN
  const output = [];
  const stack = [];

  function prec(op) {
    if (op === "^") return 4;
    if (op === "*" || op === "/") return 3;
    if (op === "+" || op === "-") return 2;
    return 0;
  }
  function rightAssoc(op) {
    return op === "^";
  }

  // gérer unary +/- : on transforme "-3" en "0 - 3" quand nécessaire
  const normalized = [];
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.type === "op" && (t.value === "+" || t.value === "-")) {
      const prev = normalized[normalized.length - 1];
      const isUnary = !prev || (prev.type === "op" && prev.value !== ")") || (prev.type === "op" && prev.value === "(");
      if (isUnary) {
        // injecte 0 puis opérateur
        normalized.push({ type: "num", value: 0 });
        normalized.push(t);
        continue;
      }
    }
    normalized.push(t);
  }

  for (const t of normalized) {
    if (t.type === "num") {
      output.push(t);
      continue;
    }

    const op = t.value;

    if (op === "(") {
      stack.push(op);
      continue;
    }
    if (op === ")") {
      while (stack.length && stack[stack.length - 1] !== "(") {
        output.push({ type: "op", value: stack.pop() });
      }
      if (!stack.length || stack[stack.length - 1] !== "(") return null;
      stack.pop(); // remove "("
      continue;
    }

    // opérateur binaire
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top === "(") break;

      const pTop = prec(top);
      const pCur = prec(op);

      if (pTop > pCur || (pTop === pCur && !rightAssoc(op))) {
        output.push({ type: "op", value: stack.pop() });
        continue;
      }
      break;
    }
    stack.push(op);
  }

  while (stack.length) {
    const top = stack.pop();
    if (top === "(" || top === ")") return null;
    output.push({ type: "op", value: top });
  }

  // Évaluation RPN
  const st = [];
  for (const t of output) {
    if (t.type === "num") {
      st.push(t.value);
      continue;
    }
    const op = t.value;
    if (st.length < 2) return null;
    const b = st.pop();
    const a = st.pop();

    let r;
    if (op === "+") r = a + b;
    else if (op === "-") r = a - b;
    else if (op === "*") r = a * b;
    else if (op === "/") {
      if (b === 0) return null;
      r = a / b;
    }
    else if (op === "^") r = Math.pow(a, b);
    else return null;

    if (!Number.isFinite(r)) return null;
    st.push(r);
  }

  if (st.length !== 1) return null;
  return st[0];
}



// ✅ Bénéfice réel total (mensuel jusqu’au jour)
function computeMonthlyBeneficeTotal(cutoffIsoDate) {
  const cutoff = fromISODate(cutoffIsoDate);
  const y = cutoff.getFullYear();
  const m = cutoff.getMonth();
  const cutoffTime = new Date(y, m, cutoff.getDate()).getTime();

  let sum = 0;
  for (const iso of Object.keys(dailyStore)) {
    const d = fromISODate(iso);
    if (d.getFullYear() !== y || d.getMonth() !== m) continue;

    const t = new Date(y, m, d.getDate()).getTime();
    if (t > cutoffTime) continue;

    const dayData = dailyStore[iso];
    if (!dayData || !dayData.beneficeReelFinalized) continue;

    const val = evalOperation(dayData.beneficeReel);
    if (val !== null) sum += val;
  }
  return sum;
}

/* -------------------------
   ✅ Totaux (hebdo / annuel)
------------------------- */
function startOfWeekMonday(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const idx = mondayIndex(d.getDay());
  d.setDate(d.getDate() - idx);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeekSunday(date) {
  const s = startOfWeekMonday(date);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}

// Dépenses totales (hebdo)
function computeWeeklyDepensesTotal(cutoffIsoDate) {
  const cutoff = fromISODate(cutoffIsoDate);
  const start = startOfWeekMonday(cutoff);
  const end = endOfWeekSunday(cutoff);

  let sum = 0;
  for (const iso of Object.keys(dailyStore)) {
    const d = fromISODate(iso);
    const t = d.getTime();
    if (t < start.getTime() || t > end.getTime()) continue;
    if (t > cutoff.getTime()) continue;

    const dayData = dailyStore[iso];
    const dep = dayData?.depenses;
    if (!dep || !dep.finalized) continue;

    sum += computePrelevementTotal(dep.items || []);
  }
  return sum;
}

// Apport total (hebdo)
function computeWeeklyApportTotal(cutoffIsoDate) {
  const cutoff = fromISODate(cutoffIsoDate);
  const start = startOfWeekMonday(cutoff);
  const end = endOfWeekSunday(cutoff);

  let sum = 0;
  for (const iso of Object.keys(dailyStore)) {
    const d = fromISODate(iso);
    const t = d.getTime();
    if (t < start.getTime() || t > end.getTime()) continue;
    if (t > cutoff.getTime()) continue;

    const dayData = dailyStore[iso];
    const ap = dayData?.apport;
    if (!ap || !ap.finalized) continue;

    sum += computePrelevementTotal(ap.items || []);
  }
  return sum;
}




// Recette hebdo
function computeWeeklyRecetteTotal(cutoffIsoDate) {
  const cutoff = fromISODate(cutoffIsoDate);
  const start = startOfWeekMonday(cutoff);
  const end = endOfWeekSunday(cutoff);

  let sum = 0;
  for (const iso of Object.keys(dailyStore)) {
    const d = fromISODate(iso);
    const t = d.getTime();
    if (t < start.getTime() || t > end.getTime()) continue;
    if (t > cutoff.getTime()) continue;

    const dayData = dailyStore[iso];
    if (!dayData?.recetteFinalized) continue;

    const val = evalOperation(dayData.recette);
    if (val !== null) sum += val;
  }
  return sum;
}

// Recette totale (annuelle)
function computeYearlyRecetteTotal(cutoffIsoDate) {
  const cutoff = fromISODate(cutoffIsoDate);
  const y = cutoff.getFullYear();

  const start = new Date(y, 0, 1);
  start.setHours(0, 0, 0, 0);

  let sum = 0;
  for (const iso of Object.keys(dailyStore)) {
    const d = fromISODate(iso);
    if (d.getFullYear() !== y) continue;

    const t = d.getTime();
    if (t < start.getTime() || t > cutoff.getTime()) continue;

    const dayData = dailyStore[iso];
    if (!dayData?.recetteFinalized) continue;

    const val = evalOperation(dayData.recette);
    if (val !== null) sum += val;
  }
  return sum;
}

// ===============================
// ✅ DÉBUT — renderPrelevementSectionHTML(...)
// ===============================
function renderPrelevementSectionHTML(p, prefix, label, rowClass, daySaved) {
  const total = computePrelevementTotal(p.items);
  const showInitialButtons = !p.editing && !p.finalized && p.items.length === 0;

  const draft = (p.editIndex === null ? (p.draft || "") : (p.editDraft || "")).trim();
  const draftHasText = draft.length > 0;
  const activeRaw = (p.editIndex === null ? (p.draft || "") : (p.editDraft || ""));
  const draftIsValid = !draftHasText ? false : toNumberLoose(activeRaw) !== null;


  const finishPseudoDisabled = draftHasText; // tant qu'il y a quelque chose, terminer est grisé
  const hideModifyStyle = daySaved ? 'style="display:none;"' : "";

  // ✅ Après Enregistrer : prélevement sur capital = colonne verticale
  const forceColumn = false; // ✅ capital = même rendu que caisse
  const itemsContainerStyle = forceColumn
    ? `style="display:flex; flex-direction:column; gap:10px; align-items:stretch;"`
    : ``;

  return `
    <div class="${rowClass}">
      <div class="label">${label} :</div>

      <div class="prelev-wrap">
        ${
          showInitialButtons
            ? `
              <div class="inline-actions">
                <button id="${prefix}Add" class="btn btn-blue lift">Ajouter</button>
                <button id="${prefix}FinishDirect" class="btn btn-green lift">Terminer</button>
              </div>
            `
            : `
              <div class="prelev-items" id="${prefix}Items" ${itemsContainerStyle}>
               ${p.items
                .map(
                  (val, idx) => `
                   <div
                    class="card card-white lift"
                    data-prelev-edit="${prefix}:${idx}"
                    ${forceColumn ? `style="width:100%; cursor:${p.editIndex === null ? "pointer" : "default"};"` : `style="cursor:${p.editIndex === null ? "pointer" : "default"};"`}
                  >
                    ${escapeHtml(formatNumberTextFR(val))}
                    ${
                     (!p.finalized && (p.editIndex === null))
                      ? `<button class="close-x" data-prelev-del="${prefix}:${idx}" title="Supprimer">×</button>`
                      : ``
                    }
                  </div>
                `
              )
              .join("")}


                ${
                  p.finalized
                    ? `
                      <div class="total-row">
                        <div class="card card-white lift">Total : ${formatCommaNumber(total)}</div>
                        <button id="${prefix}Modify" class="btn btn-blue lift" ${hideModifyStyle}>Modifier</button>
                      </div>
                    `
                    : ``
                }
              </div>

              ${
                !p.finalized
                  ? `
                    <div class="inline-actions">
                      <input class="input" id="${prefix}Input" inputmode="decimal" placeholder="(entre une valeur)"
                        value="${escapeAttr(p.editIndex === null ? p.draft : p.editDraft)}" style="flex:1; min-width: 220px;" />
                      <button id="${prefix}Validate" class="btn btn-blue lift"
                        ${draftIsValid ? "" : "disabled"}>Valider</button>
                      <button id="${prefix}Finish" class="btn btn-green lift ${
                       finishPseudoDisabled ? "pseudo-disabled" : ""
                      }">${p.editIndex === null ? "Terminer" : "Annuler"}</button>

                    </div>
                  `
                  : ``
              }
            `
        }
      </div>
    </div>
  `;
}
// ===============================
// ✅ FIN — renderPrelevementSectionHTML(...)
// ===============================


function bindPrelevementHandlers(p, prefix, isoDate, onDirty) {
  const addBtn = document.getElementById(`${prefix}Add`);
  if (addBtn) {
    addBtn.addEventListener("click", async () => {
      p.editing = true;
      p.finalized = false;
      if (typeof onDirty === "function") onDirty();
      await safePersistNow();
      renderDailyDayPage(isoDate);
    });
  }

  const finishDirectBtn = document.getElementById(`${prefix}FinishDirect`);
  if (finishDirectBtn) {
    finishDirectBtn.addEventListener("click", async () => {
      p.finalized = true;
      p.editing = false;
      p.draft = "";
      if (typeof onDirty === "function") onDirty();
      await safePersistNow();
      renderDailyDayPage(isoDate);
    });
  }

  const input = document.getElementById(`${prefix}Input`);
  const validateBtn = document.getElementById(`${prefix}Validate`);
  const finishBtn = document.getElementById(`${prefix}Finish`);

  function getActiveDraftRaw() {
  return (p.editIndex === null) ? (p.draft || "") : (p.editDraft || "");
  }
  function setActiveDraftRaw(v) {
  if (p.editIndex === null) p.draft = v;
  else p.editDraft = v;
  }


  function syncButtonsFromDraft() {
   if (!validateBtn && !finishBtn) return;

   const raw = getActiveDraftRaw();
   const draft = raw.trim();
   const hasText = draft.length > 0;
   const ok = hasText ? toNumberLoose(raw) !== null : false;

   if (validateBtn) validateBtn.disabled = !ok;

   if (finishBtn) {
    if (hasText) finishBtn.classList.add("pseudo-disabled");
    else finishBtn.classList.remove("pseudo-disabled");
   }
  }


  if (input) {
   let lastValid = getActiveDraftRaw();


    input.addEventListener("input", () => {
      const value = input.value;

      const charsOk = /^[0-9\s.,]*$/.test(value);
      const numericOk = value.trim() === "" || toNumberLoose(value) !== null;

      if (charsOk && numericOk) {
        lastValid = value;
        setActiveDraftRaw(value);
        if (typeof onDirty === "function") onDirty();
        syncButtonsFromDraft();
        return;
      }

      input.value = lastValid;
      shake(input);
      syncButtonsFromDraft();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (validateBtn && !validateBtn.disabled) validateBtn.click();
      }
    });

    syncButtonsFromDraft();
  }

  if (validateBtn) {
    validateBtn.addEventListener("click", async () => {
      doPrelevValidate(p, prefix, isoDate, onDirty);
      await safePersistNow();
    });
  }

  if (finishBtn) {
   finishBtn.addEventListener("click", async (e) => {

    // ✅ MODE ÉDITION : Finish = "Annuler"
    if (p.editIndex !== null) {
      if (p.editBackup) {
        p.items = (p.editBackup.items || []).slice();
        p.draft = p.editBackup.draft || "";
        p.editing = !!p.editBackup.editing;
        p.finalized = !!p.editBackup.finalized;
      }

      p.editIndex = null;
      p.editDraft = "";
      p.editBackup = null;

      if (typeof onDirty === "function") onDirty();
      await safePersistNow();
      renderDailyDayPage(isoDate);
      return;
    }

    // ✅ MODE NORMAL : Finish = "Terminer"
    const draftHasText = getActiveDraftRaw().trim().length > 0;

    if (draftHasText) {
      if (input) shake(input);
      shake(finishBtn);
      e.preventDefault();
      return;
    }

    p.finalized = true;
    p.editing = false;
    p.draft = "";
    p.editIndex = null;
    p.editDraft = "";
    p.editBackup = null;

    if (typeof onDirty === "function") onDirty();
    await safePersistNow();
    renderDailyDayPage(isoDate);
  });
}


  const modifyBtn = document.getElementById(`${prefix}Modify`);
  if (modifyBtn) {
    modifyBtn.addEventListener("click", async () => {
      p.finalized = false;
      p.editing = true;
      if (typeof onDirty === "function") onDirty();
      await safePersistNow();
      renderDailyDayPage(isoDate);
    });
  }

  app.querySelectorAll("[data-prelev-del]").forEach((xbtn) => {
    const payload = xbtn.getAttribute("data-prelev-del") || "";
    const [pfx, idxStr] = payload.split(":");
    if (pfx !== prefix) return;

    xbtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
        if (p.editIndex !== null) return; // ✅ pas de suppression pendant édition


      const idx = Number(idxStr);
      if (!Number.isFinite(idx)) return;

      p.items.splice(idx, 1);

      p.editing = true;
      p.finalized = false;
      if (p.items.length === 0) p.draft = "";

      if (typeof onDirty === "function") onDirty();
      await safePersistNow();
      renderDailyDayPage(isoDate);
    });
  });
  
  // ✅ Clic sur une case blanche -> édition de cette valeur (sans déplacer)
  app.querySelectorAll("[data-prelev-edit]").forEach((card) => {
   const payload = card.getAttribute("data-prelev-edit") || "";
   const [pfx, idxStr] = payload.split(":");
   if (pfx !== prefix) return;

   card.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const idx = Number(idxStr);
    if (!Number.isFinite(idx)) return;

    // ✅ si déjà en édition : on bloque les autres
    if (p.editIndex !== null) return;

    // ✅ snapshot pour Annuler
    p.editBackup = {
     items: (p.items || []).slice(),
     draft: p.draft || "",
     editing: !!p.editing,
     finalized: !!p.finalized
   };


    p.editIndex = idx;
    p.editDraft = String(p.items[idx] ?? "");
    p.draft = ""; // on vide le draft normal

    if (input) {
      input.value = p.editDraft;
      input.focus();
    }

    if (typeof onDirty === "function") onDirty();
    await safePersistNow();
    renderDailyDayPage(isoDate);
  });
});

}

// ===============================
// ✅ DÉBUT — renderDailyDayPage(isoDate)
// ===============================
function renderDailyDayPage(isoDate) {
  const date = fromISODate(isoDate);
  const data = getDailyData(isoDate);

  const pApport = data.apport;
  const pCap = data.prelevement;
  const pCaisse = data.prelevementCaisse;
  const pDep = data.depenses; // ✅ Dépenses = pile comme prélèvements

  const depensesWeekTotal = computeWeeklyDepensesTotal(isoDate);
  const apportWeekTotal = computeWeeklyApportTotal(isoDate);
  const recetteWeekTotal = computeWeeklyRecetteTotal(isoDate);
  const recetteYearTotal = computeYearlyRecetteTotal(isoDate);

  const placeholders = {
    liquidite: "(...)",
    capital: "(...)",
    caisseDepart: "(...)",
    nouvelleCaisse: "(...)",
    recette: "(ex: 10+2-1,5)",
    beneficeReel: "(ex: 50-12,5)",
    nouvelleLiquidite: "(ex: 80+5)",
    prt: "(...)",
  };

  function markDirty() {
    data.daySaved = false;
    // on ne force pas dayMigrated à false : le texte dit bleu "à moins que" Enregistrer
  }

  const rowClass = `row ${data.daySaved ? "row-saved" : ""}`;
  const hideModifyStyle = data.daySaved ? 'style="display:none;"' : "";

  const nouvelleCaisseHTML = `
    <!-- NOUVELLE CAISSE (numérique simple comme liquidités/capital) -->
    <div class="${rowClass}">
      <div class="label">Nouvelle caisse :</div>
      ${
        data.nouvelleCaisseFinalized
          ? `
            <div class="total-row">
              <div class="card card-white lift">${escapeHtml(formatInputNumberDisplay(data.nouvelleCaisse || "0"))}</div>
              <button id="nouvelleCaisseModify" class="btn btn-blue lift" ${hideModifyStyle}>Modifier</button>
            </div>
          `
          : `
            <div class="inline-actions">
              <input class="input" id="nouvelleCaisse" placeholder="${placeholders.nouvelleCaisse}"
                value="${escapeAttr(data.nouvelleCaisse)}" style="flex:1; min-width: 220px;" />
              <button id="nouvelleCaisseValidate" class="btn btn-green lift"
                style="${(data.nouvelleCaisse || "").trim() ? "" : "display:none;"}">Valider</button>
            </div>
          `
      }
    </div>
  `;


  function opValidateButtonHTML(btnId, value, extraClass = "") {
    const hasText = (value || "").trim().length > 0;
    const ok = isOperationPosed(value);
    return `
      <button
        id="${btnId}"
        class="btn btn-green lift ${extraClass}"
        style="${hasText ? "" : "display:none;"}"
        ${ok ? "" : "disabled"}
      >Valider</button>
    `;
  }

  const recetteValBtn = opValidateButtonHTML("recetteValidate", data.recette);
  const nlValBtn = opValidateButtonHTML("nlValidate", data.nouvelleLiquidite);

  const recetteRes = evalOperation(data.recette);
  const nlRes = evalOperation(data.nouvelleLiquidite);

  const monthTotal = computeMonthlyBeneficeTotal(isoDate);

  const benefHasText = (data.beneficeReel || "").trim().length > 0;
  const benefOk = isOperationPosed(data.beneficeReel);

  // -------------------------
  // ✅ NOUVEAU CAPITAL (pile) — (inchangé chez toi)
  // -------------------------
  const nc = data.nouveauCapitalStack;
  const showNcFinish = nc.items.length > 0;

  const ncDraftHasText = (nc.draft || "").trim().length > 0;
  const ncEditHasText = nc.editIndex !== null && (nc.editDraft || "").trim().length > 0;
  const canFinishNc = nc.items.length > 0 && !ncDraftHasText && !ncEditHasText;

  const ncItemsHTML_editing = `
    <div style="display:flex; flex-direction:column; gap:10px;">
      ${nc.items
        .map((it, idx) => {
          const isEditingThis = nc.editIndex === idx;
          if (isEditingThis) {
            const val = nc.editDraft ?? it.raw ?? "";
            const hasText = val.trim().length > 0;
            const ok = isOperationPosed(val);

            return `
              <div class="inline-actions" style="align-items:flex-start;">
                <input class="input ${nc.editError ? "error" : ""}" id="ncEditInput"
                  inputmode="decimal"
                  placeholder="(ex: 200-10)"
                  value="${escapeAttr(val)}"
                  style="flex:1; min-width: 220px;" />
                <button id="ncEditValidate" class="btn lift btn-blue"
                  style="${hasText ? "" : "display:none;"}"
                  ${ok ? "" : "disabled"}>Valider</button>
              </div>
            `;
          }

          return `
            <div class="total-row" style="align-items:flex-start;">
              <div class="card card-white lift" style="flex:1; min-width: 220px;">
                ${escapeHtml(it.raw)} = ${formatTotal(it.result ?? 0)}
                <button class="close-x" data-nc-del="${idx}" title="Supprimer">×</button>
              </div>
              <button class="btn btn-blue lift" data-nc-mod="${idx}" ${hideModifyStyle}>Modifier</button>
            </div>
          `;
        })
        .join("")}
    </div>
  `;

  const ncDraftVal = nc.draft || "";
  const ncDraftHasText2 = ncDraftVal.trim().length > 0;
  const ncDraftOk = isOperationPosed(ncDraftVal);

  const showNcIgnore = !!(nc.draftAutoFilled && (nc.draft || "").trim().length > 0);

const ncInputHTML = `
  <div class="inline-actions" style="align-items:flex-start;">
    <input class="input ${nc.draftError ? "error" : ""}" id="ncDraft"
      inputmode="decimal"
      placeholder="(ex: 200-10)"
      value="${escapeAttr(ncDraftVal)}"
      style="flex:1; min-width: 220px;" />

    <button id="ncValidate" class="btn lift btn-blue"
      style="${ncDraftHasText2 ? "" : "display:none;"}"
      ${ncDraftOk ? "" : "disabled"}>Valider</button>

    ${
      showNcIgnore
        ? `<button id="ncIgnore" class="btn btn-ignore lift" type="button">Ignorer</button>`
        : ``
    }
  </div>

  ${
    showNcFinish
      ? `
        <div style="display:flex; justify-content:center; margin-top:10px;">
          <button id="ncFinish" class="btn btn-green lift ${canFinishNc ? "" : "pseudo-disabled"}">Terminer</button>
        </div>
      `
      : ``
  }
`;




  const ncFinalList = `
    <div style="display:flex; flex-direction:column; gap:10px; width:100%;">
      ${nc.items
        .map(
          (it) => `
            <div class="card card-white lift" style="width:100%;">
              ${escapeHtml(it.raw)} = ${formatTotal(it.result ?? 0)}
            </div>
          `
        )
        .join("")}

      <div style="display:flex; justify-content:center; margin-top:2px;">
        <button id="ncModifyAll" class="btn btn-blue lift" ${hideModifyStyle}>Modifier</button>
      </div>
    </div>
  `;

  const ncSectionHTML = nc.finalized
  ? `
    <div class="${rowClass}">
      <div class="label">Nouveau capital :</div>

      ${
        data.daySaved
          ? `
            <!-- ✅ 1ère donnée alignée horizontalement avec l’intitulé -->
            <div class="total-row" style="width:100%;">
              <div class="card card-white lift" style="flex:1; min-width:220px;">
                ${
                  nc.items[0]
                    ? `${escapeHtml(formatOperationDisplay(nc.items[0].raw || "0"))} = ${formatCommaNumber(nc.items[0].result ?? 0)}`
                    : `0`
                }
              </div>
            </div>

            <!-- ✅ les autres données alignées verticalement sous la 1ère case -->
            ${
              nc.items.length > 1
                ? `
                  <div class="stack-after-first">
                    ${nc.items
                      .slice(1)
                      .map(
                        (it) => `
                          <div class="card card-white lift" style="width:100%;">
                            ${escapeHtml(formatOperationDisplay(it.raw || "0"))} = ${formatCommaNumber(it.result ?? 0)}
                          </div>
                        `
                      )
                      .join("")}
                  </div>
                `
                : ``
            }

            <div style="display:flex; justify-content:center; margin-top:6px;">
              <button id="ncModifyAll" class="btn btn-blue lift" ${hideModifyStyle}>Modifier</button>
            </div>
          `
          : `
            <!-- Hors mode Enregistrer : tu gardes ton rendu liste complet -->
            <div style="display:flex; flex-direction:column; gap:10px; width:100%;">
              ${nc.items
                .map(
                  (it) => `
                    <div class="card card-white lift" style="width:100%;">
                      ${escapeHtml(formatOperationDisplay(it.raw || "0"))} = ${formatCommaNumber(it.result ?? 0)}
                    </div>
                  `
                )
                .join("")}

              <div style="display:flex; justify-content:center; margin-top:2px;">
                <button id="ncModifyAll" class="btn btn-blue lift" ${hideModifyStyle}>Modifier</button>
              </div>
            </div>
          `
      }
    </div>
  `
  : `
    <div class="${rowClass}">
      <div class="label">Nouveau capital :</div>
      ${ncItemsHTML_editing}
      <div style="margin-top:10px;">
        ${ncInputHTML}
      </div>
    </div>
  `;



  // -------------------------
  // ✅ NOUVELLE CAISSE RÉELLE (pile) — (inchangé chez toi)
  // -------------------------
  const ncr = data.nouvelleCaisseReelleStack;

  const showNcrFinish = ncr.items.length > 0;

  const ncrDraftHasText = (ncr.draft || "").trim().length > 0;
  const ncrEditHasText = ncr.editIndex !== null && (ncr.editDraft || "").trim().length > 0;
  const canFinishNcr = ncr.items.length > 0 && !ncrDraftHasText && !ncrEditHasText;

  const ncrItemsHTML_editing = `
    <div style="display:flex; flex-direction:column; gap:10px;">
      ${ncr.items
        .map((it, idx) => {
          const isEditingThis = ncr.editIndex === idx;
          if (isEditingThis) {
            const val = ncr.editDraft ?? it.raw ?? "";
            const hasText = val.trim().length > 0;
            const ok = isOperationPosed(val);

            return `
              <div class="inline-actions" style="align-items:flex-start;">
                <input class="input ${ncr.editError ? "error" : ""}" id="ncrEditInput"
                  inputmode="decimal"
                  placeholder="(ex: 100+20)"
                  value="${escapeAttr(val)}"
                  style="flex:1; min-width: 220px;" />
                <button id="ncrEditValidate" class="btn lift btn-blue"
                  style="${hasText ? "" : "display:none;"}"
                  ${ok ? "" : "disabled"}>Valider</button>
              </div>
            `;
          }

          return `
            <div class="total-row" style="align-items:flex-start;">
              <div class="card card-white lift" style="flex:1; min-width: 220px;">
                ${escapeHtml(it.raw)} = ${formatTotal(it.result ?? 0)}
                <button class="close-x" data-ncr-del="${idx}" title="Supprimer">×</button>
              </div>
              <button class="btn btn-blue lift" data-ncr-mod="${idx}" ${hideModifyStyle}>Modifier</button>
            </div>
          `;
        })
        .join("")}
    </div>
  `;

  const ncrDraftVal = ncr.draft || "";
  const ncrDraftHasText2 = ncrDraftVal.trim().length > 0;
  const ncrDraftOk = isOperationPosed(ncrDraftVal);

  const ncrInputHTML = `
    <div class="inline-actions" style="align-items:flex-start;">
      <input class="input ${ncr.draftError ? "error" : ""}" id="ncrDraft"
        inputmode="decimal"
        placeholder="(ex: 100+20)"
        value="${escapeAttr(ncrDraftVal)}"
        style="flex:1; min-width: 220px;" />
      <button id="ncrValidate" class="btn lift btn-blue"
        style="${ncrDraftHasText2 ? "" : "display:none;"}"
        ${ncrDraftOk ? "" : "disabled"}>Valider</button>
    </div>

    ${
      showNcrFinish
        ? `
          <div style="display:flex; justify-content:center; margin-top:10px;">
            <button id="ncrFinish" class="btn btn-green lift ${canFinishNcr ? "" : "pseudo-disabled"}">Terminer</button>
          </div>
        `
        : ``
    }
  `;

  const ncrFinalList = `
    <div style="display:flex; flex-direction:column; gap:10px; width:100%;">
      ${ncr.items
        .map(
          (it) => `
            <div class="card card-white lift" style="width:100%;">
              ${escapeHtml(it.raw)} = ${formatTotal(it.result ?? 0)}
            </div>
          `
        )
        .join("")}

      <div style="display:flex; justify-content:center; margin-top:2px;">
        <button id="ncrModifyAll" class="btn btn-blue lift" ${hideModifyStyle}>Modifier</button>
      </div>
    </div>
  `;

  const ncrSectionHTML = ncr.finalized
    ? `
      <div class="${rowClass}">
        <div class="label">Nouvelle caisse réelle :</div>

        ${
          data.daySaved
            ? `
              <div class="total-row" style="width:100%;">
                <div class="card card-white lift" style="flex:1; min-width:220px;">
                  ${
                    ncr.items[0]
                      ? `${escapeHtml(ncr.items[0].raw)} = ${formatTotal(ncr.items[0].result ?? 0)}`
                      : `0`
                  }
                </div>
              </div>
              ${
                ncr.items.length > 1
                  ? `<div style="margin-top:10px;">${ncrFinalList}</div>`
                  : `<div style="display:flex; justify-content:center; margin-top:2px;">
                       <button id="ncrModifyAll" class="btn btn-blue lift" ${hideModifyStyle}>Modifier</button>
                     </div>`
              }
            `
            : ncrFinalList
        }
      </div>
    `
    : `
      <div class="${rowClass}">
        <div class="label">Nouvelle caisse réelle :</div>
        ${ncrItemsHTML_editing}
        <div style="margin-top:10px;">
          ${ncrInputHTML}
        </div>
      </div>
    `;

  // -------------------------
  // ✅ Conditions bouton "Enregistrer"
  // -------------------------
  function computeSaveEligible() {
    const requiredFinalized =
      data.liquiditeFinalized &&
      data.capitalFinalized &&
      data.caisseDepartFinalized &&
      data.recetteFinalized &&
      data.prtFinalized &&
      data.beneficeReelFinalized &&
      data.nouvelleLiquiditeFinalized;

    const requiredRecorded =
     pApport.finalized &&
     pCap.finalized &&
     pCaisse.finalized &&
     pDep.finalized &&
     nc.finalized &&
     data.nouvelleCaisseReelleFinalized; // ✅ champ simple


    return !!(requiredFinalized && requiredRecorded);
  }

  let saveEligible = computeSaveEligible();
  if (data.daySaved && !saveEligible) data.daySaved = false;
  saveEligible = computeSaveEligible();

  // ✅ Migrate possible ? (au moins un bloc validé/terminé)
  function computeMigrateEligible() {
  // ✅ NOUVELLE RÈGLE : seuls NCR + NL + NC comptent
  return !!(
    data.nouvelleCaisseReelleFinalized ||
    data.nouvelleLiquiditeFinalized ||
    (nc && nc.finalized && (nc.items?.length || 0) > 0)
  );
}

  const migrateEligible = computeMigrateEligible();

  // ✅ caisse départ après prélèvement (affiché seulement après Enregistrer, si total ≠ 0)
  const caisseDepartNum = toNumberLoose(data.caisseDepart || "0") ?? 0;
  const prelevCaisseTotal = computePrelevementTotal((pCaisse && pCaisse.items) ? pCaisse.items : []);
  
  const showCaisseDepartAfterPrelev =
  !!pCaisse?.finalized &&
  Math.abs(prelevCaisseTotal) > 0.0000001;


  const caisseDepartAfter = caisseDepartNum - prelevCaisseTotal;

    // ✅ capital après prélèvement (affiché si prélèvement sur capital terminé et total ≠ 0)
  
    const capitalNum = toNumberLoose(data.capital || "0") ?? 0;

// ✅ Total apport
const apportTotal = computePrelevementTotal((pApport && pApport.items) ? pApport.items : []);
const showCapitalAfterApport =
  !!pApport?.finalized &&
  Math.abs(apportTotal) > 0.0000001;

// ✅ Capital après apport = capital + apportTotal
const capitalAfterApport = capitalNum + apportTotal;

// ✅ Total prélèvement sur capital
const prelevCapTotal = computePrelevementTotal((pCap && pCap.items) ? pCap.items : []);
const showCapitalAfterPrelev =
  !!pCap?.finalized &&
  Math.abs(prelevCapTotal) > 0.0000001;

// ✅ RÈGLE CORRIGÉE :
// - si apport = 0 => base = capital (inchangé)
// - si apport ≠ 0 => base = capital après apport
const baseCapitalForPrelev = showCapitalAfterApport ? capitalAfterApport : capitalNum;

// ✅ Capital après prélèvement
const capitalAfter = baseCapitalForPrelev - prelevCapTotal;

function buildOverlaySearchItems() {
  const capBase = capitalNum;
  const cdBase = caisseDepartNum;

  const apTotal = (pApport?.finalized) ? apportTotal : 0;
  const prCap = (pCap?.finalized) ? prelevCapTotal : 0;

  const capitalShown = (Math.abs(apTotal) < 1e-9 && Math.abs(prCap) < 1e-9)
    ? capBase
    : capitalAfter;

  const prC = (pCaisse?.finalized) ? prelevCaisseTotal : 0;
  const caisseShown = (Math.abs(prC) < 1e-9) ? cdBase : caisseDepartAfter;

  function valOrDots(isOk, valueNumber) {
    return isOk ? formatCommaNumber(valueNumber ?? 0) : "(...)";
  }
  function opOrDots(isOk, opResult) {
    return isOk ? formatCommaNumber(opResult ?? 0) : "(...)";
  }

  // ✅ Dernier résultat "Nouveau capital" (pile NC)
  function lastNcResult(stack) {
    if (!stack || !Array.isArray(stack.items) || stack.items.length === 0) return null;
    const last = stack.items[stack.items.length - 1];
    return Number.isFinite(last?.result) ? last.result : null;
  }
  const ncLast = lastNcResult(nc);

  const items = [
    {
      key: "capital",
      label: "Capital",
      valueText: valOrDots(!!data.capitalFinalized, capitalShown),
    },
    {
      key: "nouveau capital",
      label: "Nouveau capital",
      valueText: (ncLast !== null) ? formatCommaNumber(ncLast) : "(...)",
    },
    {
      key: "caisse depart",
      label: "Caisse départ",
      valueText: valOrDots(!!data.caisseDepartFinalized, caisseShown),
    },
    {
      key: "nouvelle liquidite",
      label: "Nouvelle liquidité",
      valueText: opOrDots(!!data.nouvelleLiquiditeFinalized, nlRes),
    },
    {
      key: "recette",
      label: "Recette",
      valueText: opOrDots(!!data.recetteFinalized, recetteRes),
    },
    {
      key: "prix de revient total",
      label: "Prix de revient total",
      valueText: valOrDots(!!data.prtFinalized, (toNumberLoose(data.prt || "0") ?? 0)),
    },
    {
      key: "nouvelle caisse",
      label: "Nouvelle caisse",
      valueText: valOrDots(!!data.nouvelleCaisseFinalized, (toNumberLoose(data.nouvelleCaisse || "0") ?? 0)),
    },
  ];

  return items;
}






  // -------------------------
  // ✅ RENDU
  // -------------------------
  app.innerHTML = `
    <div class="page">
      <div class="topbar">
        <div class="slot left">
          <button id="homeBtn" class="icon-btn" title="Accueil" aria-label="Accueil">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 10.5L12 3l9 7.5" />
              <path d="M5 10v10h14V10" />
            </svg>
          </button>
        </div>

        <div class="slot center">
          <button id="back" class="back-btn">← Retour</button>
        </div>

        <div class="slot right">
          <button id="calBtn" class="icon-btn" title="Calendrier" aria-label="Calendrier">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M7 3v3M17 3v3" />
              <path d="M3.5 8h17" />
              <path d="M5 6h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
            </svg>
          </button>
       </div>
      </div>




      <div class="day-page">
        ${dayHeaderHTML(formatFullDate(date), { withPrevNext: true })}

        <div class="form-col">

          <!-- LIQUIDITÉS -->
          <div class="${rowClass}">
            <div class="label">Liquidités :</div>
            ${
              data.liquiditeFinalized
                ? `
                  <div class="total-row">
                    <div class="card card-white lift">${escapeHtml(formatInputNumberDisplay(data.liquidite || "0"))}</div>
                    <button id="liquiditeModify" class="btn btn-blue lift" ${hideModifyStyle}>Modifier</button>
                  </div>
                `
                : `
                  <div class="inline-actions">
                    <input class="input" id="liquidite" placeholder="${placeholders.liquidite}"
                      value="${escapeAttr(data.liquidite)}" style="flex:1; min-width: 220px;" />
                    <button id="liquiditeValidate" class="btn btn-green lift"
                      style="${(data.liquidite || "").trim() ? "" : "display:none;"}">Valider</button>
                  </div>
                `
            }
          </div>

          <!-- CAPITAL -->
          <div class="${rowClass}">
            <div class="label">Capital :</div>
            ${
              data.capitalFinalized
                ? `
                  <div class="total-row">
                    <div class="card card-white lift">${escapeHtml(formatInputNumberDisplay(data.capital || "0"))}</div>
                    <button id="capitalModify" class="btn btn-blue lift" ${hideModifyStyle}>Modifier</button>
                  </div>
                `
                : `
                  <div class="inline-actions">
                    <input class="input" id="capital" placeholder="${placeholders.capital}"
                      value="${escapeAttr(data.capital)}" style="flex:1; min-width: 220px;" />
                    <button id="capitalValidate" class="btn btn-green lift"
                      style="${(data.capital || "").trim() ? "" : "display:none;"}">Valider</button>
                  </div>
                `
            }
          </div>

          <!-- ✅ APPORT -->
          ${renderPrelevementSectionHTML(pApport, "apport", "Apport", rowClass, data.daySaved)}
          ${
  showCapitalAfterApport
    ? `
      <div class="${rowClass}">
        <div class="label">Capital après apport :</div>
        <div class="total-row">
          <div class="card card-white lift">
            ${escapeHtml(formatInputNumberDisplay(data.capital || "0"))}
            + ${formatCommaNumber(apportTotal)}
            = ${formatCommaNumber(capitalAfterApport)}
          </div>
        </div>
      </div>
    `
    : ``
}

${
  pApport?.finalized
    ? `
      <div class="${rowClass}">
        <div class="label">Apport total :</div>
        <div class="total-row">
          <div class="card card-white lift">Total : ${formatTotal(apportWeekTotal)}</div>
        </div>
      </div>
    `
    : ``
}




          <!-- PRÉLÈVEMENT SUR CAPITAL -->
          ${renderPrelevementSectionHTML(pCap, "prelevCap", "Prélèvement sur capital", rowClass, data.daySaved)}

          ${
            showCapitalAfterPrelev
              ? `
                <div class="${rowClass}">
                  <div class="label">Capital après prélèvement :</div>
                  <div class="total-row">
                    <div class="card card-white lift">
                      ${formatCommaNumber(baseCapitalForPrelev)}
- ${formatCommaNumber(prelevCapTotal)}
= ${formatCommaNumber(capitalAfter)}

                    </div>
                  </div>
                </div>
              `
              : ``
          }



                    


          <!-- CAISSE DÉPART -->
          <div class="${rowClass}">
            <div class="label">Caisse départ :</div>
            ${
              data.caisseDepartFinalized
                ? `
                  <div class="total-row">
                    <div class="card card-white lift">${escapeHtml(formatInputNumberDisplay(data.caisseDepart || "0"))}</div>
                    <button id="caisseDepartModify" class="btn btn-blue lift" ${hideModifyStyle}>Modifier</button>
                  </div>
                `
                : `
                  <div class="inline-actions">
                    <input class="input" id="caisseDepart" placeholder="${placeholders.caisseDepart}"
                      value="${escapeAttr(data.caisseDepart)}" style="flex:1; min-width: 220px;" />
                    <button id="caisseDepartValidate" class="btn btn-green lift"
                      style="${(data.caisseDepart || "").trim() ? "" : "display:none;"}">Valider</button>
                  </div>
                `
            }
          </div>

                    <!-- PRÉLÈVEMENT SUR CAISSE -->
          ${renderPrelevementSectionHTML(pCaisse, "prelevCaisse", "Prélèvement sur caisse", rowClass, data.daySaved)}

          ${
            showCaisseDepartAfterPrelev
             ? `
               <div class="${rowClass}">
                <div class="label">Caisse départ après prélèvement :</div>
                <div class="total-row">
                 <div class="card card-white lift">
                  ${escapeHtml(formatInputNumberDisplay(data.caisseDepart || "0"))}
                  - ${formatCommaNumber(prelevCaisseTotal)}
                  = ${formatCommaNumber(caisseDepartAfter)}
                 </div>
                </div>
               </div>
             `
            : ``
          }


        


          <!-- ✅ DÉPENSES (pile) -->
          ${renderPrelevementSectionHTML(pDep, "depenses", "Dépenses", rowClass, data.daySaved)}
          
          ${!pDep.finalized ? nouvelleCaisseHTML : ``}


          ${
            pDep.finalized
              ? `
                <div class="${rowClass}">
                  <div class="label">Dépenses totales :</div>
                  <div class="total-row">
                    <div class="card card-white lift">Total : ${formatTotal(depensesWeekTotal)}</div>
                  </div>
                </div>
              `
              : ``
          }

          ${pDep.finalized ? nouvelleCaisseHTML : ``}


          

          

          <!-- RECETTE -->
          <div class="${rowClass}">
            <div class="label">Recette :</div>
            ${
              data.recetteFinalized
                ? `
                  <div class="total-row">
                    <div class="card card-white lift">
                      ${escapeHtml(formatOperationDisplay(data.recette || "0"))} = ${formatCommaNumber(recetteRes ?? 0)}
                    </div>
                    <button id="recetteModify" class="btn btn-blue lift" ${hideModifyStyle}>Modifier</button>
                  </div>
                `
                : `
                  <div class="inline-actions">
                    <input class="input" id="recette" inputmode="decimal"
                      placeholder="${placeholders.recette}"
                      value="${escapeAttr(data.recette)}"
                      style="flex:1; min-width: 220px;" />
                    ${recetteValBtn}
                  </div>
                `
            }
          </div>

          ${
            data.recetteFinalized
              ? `
                <div class="${rowClass}">
                  <div class="label">Recette hebdomadaire :</div>
                  <div class="total-row">
                    <div class="card card-white lift">Total : ${formatTotal(recetteWeekTotal)}</div>
                  </div>
                </div>

                <div class="${rowClass}">
                  <div class="label">Recette totale :</div>
                  <div class="total-row">
                    <div class="card card-white lift">Total : ${formatTotal(recetteYearTotal)}</div>
                  </div>
                </div>
              `
              : ``
          }

          <!-- PRT -->
          <div class="${rowClass}">
            <div class="label">Prix de revient total :</div>
            ${
              data.prtFinalized
                ? `
                  <div class="total-row">
                    <div class="card card-white lift">${escapeHtml(formatInputNumberDisplay(data.prt || "0"))}</div>
                    <button id="prtModify" class="btn btn-blue lift" ${hideModifyStyle}>Modifier</button>
                  </div>
                `
                : `
                  <div class="inline-actions">
                    <input class="input" id="prt" placeholder="${placeholders.prt}"
                      value="${escapeAttr(data.prt)}" style="flex:1; min-width: 220px;" />
                    <button id="prtValidate" class="btn btn-green lift"
                      style="${(data.prt || "").trim() ? "" : "display:none;"}">Valider</button>
                  </div>
                `
            }
          </div>

          <!-- BÉNÉFICE RÉEL -->
          <div class="${rowClass}">
            <div class="label">Bénéfice réel :</div>
            ${
              data.beneficeReelFinalized
                ? `
                  <div class="total-row">
                    <div class="card card-white lift">
                     ${escapeHtml(formatOperationDisplay(data.beneficeReel || "0"))} = ${formatCommaNumber(evalOperation(data.beneficeReel) ?? 0)}
                    </div>

                    <button id="benefModify" class="btn btn-blue lift" ${hideModifyStyle}>Modifier</button>
                  </div>
                `
                : `
                  <div class="inline-actions">
                    <input class="input ${data.beneficeReelError ? "error" : ""}" id="beneficeReel" inputmode="decimal"
                      placeholder="${placeholders.beneficeReel}"
                      value="${escapeAttr(data.beneficeReel)}"
                      style="flex:1; min-width: 220px;" />
                    <button id="benefValidate" class="btn btn-green lift"
                      style="${benefHasText ? "" : "display:none;"}"
                      ${benefOk ? "" : "disabled"}>Valider</button>
                  </div>
                `
            }
          </div>

          ${
            data.beneficeReelFinalized
              ? `
                <div class="${rowClass}">
                  <div class="label">Bénéfice réel total :</div>
                  <div class="total-row">
                    <div class="card card-white lift">Total : ${formatTotal(monthTotal)}</div>
                  </div>
                </div>
              `
              : ``
          }

          <!-- ✅ NOUVELLE CAISSE RÉELLE (OPÉRATION) -->
          <div class="${rowClass}">
            <div class="label">Nouvelle caisse réelle :</div>
            ${
              data.nouvelleCaisseReelleFinalized
                ? `
                  <div class="total-row">
                    <div class="card card-white lift">
                      ${escapeHtml(formatOperationDisplay(data.nouvelleCaisseReelle || "0"))}
                      = ${formatCommaNumber(evalOperation(data.nouvelleCaisseReelle) ?? 0)}
                    </div>
                    <button id="ncrModify" class="btn btn-blue lift" ${hideModifyStyle}>Modifier</button>
                  </div>
                `
                : `
                  <div class="inline-actions">
                    <input class="input" id="nouvelleCaisseReelle" inputmode="decimal"
                      placeholder="(ex: 100+20-5)"
                      value="${escapeAttr(data.nouvelleCaisseReelle)}"
                      style="flex:1; min-width: 220px;" />
                    ${opValidateButtonHTML("ncrValidate", data.nouvelleCaisseReelle)}
                  </div>
                `
            }
          </div>


          ${ncSectionHTML}

          <!-- NOUVELLE LIQUIDITÉ -->
          <div class="${rowClass}">
            <div class="label">Nouvelle liquidité :</div>
            ${
              data.nouvelleLiquiditeFinalized
                ? `
                  <div class="total-row">
                    <div class="card card-white lift">
                      ${escapeHtml(formatOperationDisplay(data.nouvelleLiquidite || "0"))} = ${formatCommaNumber(nlRes ?? 0)}
                    </div>
                    <button id="nlModify" class="btn btn-blue lift" ${hideModifyStyle}>Modifier</button>
                  </div>
                `
                : `
                  <div class="inline-actions">
                    <input class="input" id="nouvelleLiquidite" inputmode="decimal"
                      placeholder="${placeholders.nouvelleLiquidite}"
                      value="${escapeAttr(data.nouvelleLiquidite)}"
                      style="flex:1; min-width: 220px;" />
                    ${nlValBtn}
                  </div>
                `
            }
          </div>

          <!-- ✅ ENREGISTRER / MIGRER / MODIFIER -->
          <div style="display:flex; justify-content:center; gap:12px; margin-top: 16px; flex-wrap:wrap;">
            ${
              !data.daySaved
                ? `
                  <button id="saveDay" class="btn btn-green lift"
                    ${saveEligible ? "" : "disabled"}
                    style="min-width: 220px;">
                    Enregistrer
                  </button>

                  <button id="migrateDay" class="btn btn-blue lift"
                    ${migrateEligible ? "" : "disabled"}
                    style="min-width: 220px;">
                    Migrer
                  </button>
                `
                : `
                  <button id="editDay" class="btn btn-blue lift"
                    style="min-width: 220px;">
                    Modifier
                  </button>
                `
            }
          </div>

        </div>
      </div>
    </div>
  `;

      bindPrevNextDayButtons(isoDate, { baseHashPrefix: "#daily/" });

      const hb = document.getElementById("homeBtn");
      if (hb) hb.addEventListener("click", () => navigateTo("#"));

      const cb = document.getElementById("calBtn");
      if (cb) cb.addEventListener("click", () => navigateTo("#daily"));

      const backBtn = document.getElementById("back");
if (backBtn) backBtn.addEventListener("click", () => smartBack());




  



    // -------------------------
  // ✅ Champs numériques simples : chiffres + virgule uniquement
  // liquidite / capital / caisseDepart / prt
  // -------------------------
  function filterDigitsComma(raw) {
  let s = String(raw || "");
  s = s.replace(/\./g, ",");

  // ✅ autorise chiffres, virgule, espaces
  let cleaned = s.replace(/[^0-9,\s]/g, "");

  // ✅ une seule virgule
  const firstComma = cleaned.indexOf(",");
  if (firstComma !== -1) {
    cleaned =
      cleaned.slice(0, firstComma + 1) +
      cleaned.slice(firstComma + 1).replace(/,/g, "");
  }

  // (optionnel) évite 50 espaces d’affilée
  cleaned = cleaned.replace(/\s{2,}/g, " ");

  return cleaned;
}


  function bindNumericFinalize(inputId, key, finalizedKey, validateId, modifyId) {
    const input = inputId ? document.getElementById(inputId) : null;
    const validateBtn = document.getElementById(validateId);
    const modifyBtn = document.getElementById(modifyId);

    function sync() {
      const hasText = (data[key] || "").trim().length > 0;
      if (validateBtn) validateBtn.style.display = hasText ? "" : "none";
    }

    if (input) {
      sync();

      input.addEventListener("input", () => {
        const filtered = filterDigitsComma(input.value);
        if (filtered !== input.value) {
          input.value = filtered;
          shake(input);
        }
        data[key] = filtered;
        markDirty();
        sync();
        
        // ✅ si l'utilisateur efface tout en mode modification : on persiste immédiatement
        if (filtered.trim() === "") {
          // on s'assure que c'est bien "non finalisé"
          data[finalizedKey] = false;

          // persist immédiat (silencieux)
          safePersistNow();
        }

      });

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const hasText = (data[key] || "").trim().length > 0;
          if (validateBtn && hasText) validateBtn.click();
        }
      });
    }

    if (validateBtn) {
      validateBtn.addEventListener("click", async () => {
        const v = (data[key] || "").trim();
        if (!v) {
          validateBtn.style.display = "none";
          return;
        }
        data[finalizedKey] = true;
        markDirty();
        await safePersistNow();
        renderDailyDayPage(isoDate);
      });
    }

    if (modifyBtn) {
      modifyBtn.addEventListener("click", async () => {
        data[finalizedKey] = false;
        markDirty();
        await safePersistNow();
        renderDailyDayPage(isoDate);
      });
    }
  }

  // LIQUIDITÉS
  if (!data.liquiditeFinalized)
    bindNumericFinalize("liquidite", "liquidite", "liquiditeFinalized", "liquiditeValidate", "liquiditeModify");
  else
    bindNumericFinalize(null, "liquidite", "liquiditeFinalized", "liquiditeValidate", "liquiditeModify");

  // CAPITAL
  if (!data.capitalFinalized)
    bindNumericFinalize("capital", "capital", "capitalFinalized", "capitalValidate", "capitalModify");
  else
    bindNumericFinalize(null, "capital", "capitalFinalized", "capitalValidate", "capitalModify");

  // ✅ CAISSE DÉPART (corrigé)
  if (!data.caisseDepartFinalized)
    bindNumericFinalize("caisseDepart", "caisseDepart", "caisseDepartFinalized", "caisseDepartValidate", "caisseDepartModify");
  else
    bindNumericFinalize(null, "caisseDepart", "caisseDepartFinalized", "caisseDepartValidate", "caisseDepartModify");

  // ✅ NOUVELLE CAISSE (simple numérique)
  if (!data.nouvelleCaisseFinalized)
   bindNumericFinalize(
     "nouvelleCaisse",
     "nouvelleCaisse",
     "nouvelleCaisseFinalized",
     "nouvelleCaisseValidate",
     "nouvelleCaisseModify"
    );
  else
   bindNumericFinalize(
    null,
    "nouvelleCaisse",
    "nouvelleCaisseFinalized",
    "nouvelleCaisseValidate",
    "nouvelleCaisseModify"
   );

  
  // PRT
  if (!data.prtFinalized)
    bindNumericFinalize("prt", "prt", "prtFinalized", "prtValidate", "prtModify");
  else
    bindNumericFinalize(null, "prt", "prtFinalized", "prtValidate", "prtModify");


  // -------------------------
  // ✅ Prélèvements + Dépenses
  // -------------------------
  bindPrelevementHandlers(pDep, "depenses", isoDate, markDirty);
  bindPrelevementHandlers(pApport, "apport", isoDate, markDirty);
  bindPrelevementHandlers(pCap, "prelevCap", isoDate, markDirty);
  bindPrelevementHandlers(pCaisse, "prelevCaisse", isoDate, markDirty);

  // -------------------------
  // ✅ Opérations (Recette / NL / Bénéfice réel)
  // -------------------------
  function bindOpInput(inputId, dataKey, buttonId, onValid) {
    const input = document.getElementById(inputId);
    const btn = buttonId ? document.getElementById(buttonId) : null;
    if (!input) return;

    // ✅ Au clic UNIQUEMENT : overlay avec la calculette (mobile/touch)
const isTouch = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);

if (isTouch) {
  // ✅ 1) Désactive le clavier natif (mobile) MAIS garde le caret
  input.setAttribute("readonly", "readonly");    // empêche le clavier
  input.setAttribute("inputmode", "none");

  // ✅ IMPORTANT : on NE cache PAS le caret
  input.style.caretColor = ""; // reset

  const open = () => {
    openOpOverlay({
      inputEl: input,
      title: "",
      initialValue: data[dataKey] || "",
      placeholder: input.getAttribute("placeholder") || "(ex: 100+20-5)",
      searchItems: buildOverlaySearchItems(),
      onCancel: () => {},
      onOk: () => {
        if (btn && btn.style.display !== "none" && !btn.disabled) btn.click();
        else shake(input);
      },
    });
  };

  // ✅ 2) Ouvre uniquement au click (pas pendant scroll)
  // ⚠️ Ne pas preventDefault : laisse le caret se placer
  input.addEventListener("click", () => {
    // laisse le caret se placer, puis ouvre l’overlay
    setTimeout(open, 0);
  });

  // ✅ 3) On NE blur pas : sinon caret invisible / non déplaçable
}






    let lastValid = data[dataKey] || "";

    function syncButtonAndErrorState(value) {
      const hasText = value.trim().length > 0;
      const ok = isOperationPosed(value);

      if (btn) {
        btn.style.display = hasText ? "" : "none";
        btn.disabled = hasText ? !ok : true;
      }

      if (hasText && !ok) input.classList.add("error");
      else input.classList.remove("error");
    }

    syncButtonAndErrorState(lastValid);

    input.addEventListener("input", () => {
      const value = input.value;

      if (!charsAllowedForOpInput(value)) {
        input.value = lastValid;
        input.classList.add("error");
        shake(input);
        return;
      }

      lastValid = value;
      data[dataKey] = value;
      markDirty();
      syncButtonAndErrorState(value);
      // ✅ si effacé totalement en mode modification : on persiste tout de suite (DB)
      if (value.trim() === "") {
        safePersistNow();
      }

    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (btn && btn.style.display !== "none" && !btn.disabled) btn.click();
      }
    });

    if (btn) {
      btn.addEventListener("click", async (e) => {
        const v = (data[dataKey] || "").trim();
        if (!v || !isOperationPosed(v)) {
          input.classList.add("error");
          shake(input);
          shake(btn);
          e.preventDefault();
          return;
        }

        const result = evalOperation(v);
        if (result === null) {
          input.classList.add("error");
          shake(input);
          shake(btn);
          e.preventDefault();
          return;
        }

        input.classList.remove("error");
        if (typeof onValid === "function") await onValid(v, result);
      });
    }
  }

  if (!data.recetteFinalized) {
    bindOpInput("recette", "recette", "recetteValidate", async () => {
      data.recetteFinalized = true;
      markDirty();
      await safePersistNow();
      renderDailyDayPage(isoDate);
    });
  }

  if (!data.nouvelleLiquiditeFinalized) {
    bindOpInput("nouvelleLiquidite", "nouvelleLiquidite", "nlValidate", async () => {
      data.nouvelleLiquiditeFinalized = true;
      markDirty();
      await safePersistNow();
      renderDailyDayPage(isoDate);
    });
  }

  // ✅ NOUVELLE CAISSE RÉELLE (OPÉRATION)
  if (!data.nouvelleCaisseReelleFinalized) {
    bindOpInput("nouvelleCaisseReelle", "nouvelleCaisseReelle", "ncrValidate", async () => {
      data.nouvelleCaisseReelleFinalized = true;
      markDirty();
      await safePersistNow();
      renderDailyDayPage(isoDate);
    });
  }

  const ncrModify = document.getElementById("ncrModify");
  if (ncrModify) {
    ncrModify.addEventListener("click", async () => {
      data.nouvelleCaisseReelleFinalized = false;
      markDirty();
      await safePersistNow();
      renderDailyDayPage(isoDate);
    });
  }


  const recetteModify = document.getElementById("recetteModify");
  if (recetteModify) {
    recetteModify.addEventListener("click", async () => {
      data.recetteFinalized = false;
      markDirty();
      await safePersistNow();
      renderDailyDayPage(isoDate);
    });
  }

  const nlModify = document.getElementById("nlModify");
  if (nlModify) {
    nlModify.addEventListener("click", async () => {
      data.nouvelleLiquiditeFinalized = false;
      markDirty();
      await safePersistNow();
      renderDailyDayPage(isoDate);
    });
  }

  if (!data.beneficeReelFinalized) {
    bindOpInput("beneficeReel", "beneficeReel", "benefValidate");

    const benefValidateBtn = document.getElementById("benefValidate");
    const benefInput = document.getElementById("beneficeReel");

    if (benefValidateBtn) {
      benefValidateBtn.addEventListener("click", async () => {
        const raw = (data.beneficeReel || "").trim();

        if (!raw || !isOperationPosed(raw)) {
          data.beneficeReelError = true;
          if (benefInput) benefInput.classList.add("error");
          if (benefInput) shake(benefInput);
          shake(benefValidateBtn);
          return;
        }

        const result = evalOperation(raw);
        if (result === null) {
          data.beneficeReelError = true;
          if (benefInput) benefInput.classList.add("error");
          if (benefInput) shake(benefInput);
          shake(benefValidateBtn);
          return;
        }

        data.beneficeReelFinalized = true;
        data.beneficeReelError = false;
        markDirty();
        await safePersistNow();
        renderDailyDayPage(isoDate);
      });
    }
  }

  const benefModifyBtn = document.getElementById("benefModify");
  if (benefModifyBtn) {
    benefModifyBtn.addEventListener("click", async () => {
      data.beneficeReelFinalized = false;
      data.beneficeReelError = false;
      markDirty();
      await safePersistNow();
      renderDailyDayPage(isoDate);
    });
  }

  // -------------------------
  // ✅ Helpers pile NC/NCR + handlers (persist) — (inchangé chez toi)
  // -------------------------
    function bindNcTextFilter(inputEl, getVal, setVal, clearErrorFlag) {
    if (!inputEl) return;
    // ✅ MOBILE : overlay (comme recette), PC : comportement normal + Enter
const isTouch = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);

function resolveValidateBtnId(id) {
  if (id === "ncDraft") return "ncValidate";
  if (id === "ncEditInput") return "ncEditValidate";
  if (id === "ncrDraft") return "ncrValidate";
  if (id === "ncrEditInput") return "ncrEditValidate";
  return null;
}

function clickValidateIfPossible() {
  const btnId = resolveValidateBtnId(inputEl.id);
  const vb = btnId ? document.getElementById(btnId) : null;
  if (vb && vb.style.display !== "none" && !vb.disabled) vb.click();
  else shake(inputEl);
}

if (isTouch) {
  // ✅ Désactive clavier natif mais garde caret
  inputEl.setAttribute("readonly", "readonly");
  inputEl.setAttribute("inputmode", "none");
  inputEl.style.caretColor = ""; // caret visible

  // ✅ Ouvre overlay sur click (pas de preventDefault -> caret déplaçable)
  inputEl.addEventListener("click", () => {
    setTimeout(() => {
      openOpOverlay({
        inputEl,
        title: "", // tu peux mettre "Nouveau capital" si tu veux
        initialValue: getVal() || "",
        placeholder: inputEl.getAttribute("placeholder") || "(ex: 200-10)",
        searchItems: buildOverlaySearchItems(),
        onCancel: () => {},
        onOk: () => clickValidateIfPossible(),
      });
    }, 0);
  });

} else {
  // PC : Enter => Valider
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      clickValidateIfPossible();
    }
  });
}



    let lastValid = getVal() || "";

    function resolveValidateBtnId(id) {
      if (id === "ncDraft") return "ncValidate";
      if (id === "ncEditInput") return "ncEditValidate";
      if (id === "ncrDraft") return "ncrValidate";
      if (id === "ncrEditInput") return "ncrEditValidate";
      return null;
    }

    function syncValidateButton(value) {
      const btnId = resolveValidateBtnId(inputEl.id);
      if (!btnId) return;

      const vb = document.getElementById(btnId);
      if (!vb) return;

      const hasText = value.trim().length > 0;
      const ok = isOperationPosed(value);

      // ✅ comme recette : apparait dès qu’on écrit, et grisé si invalide
      vb.style.display = hasText ? "" : "none";
      vb.disabled = hasText ? !ok : true;
    }

    // ✅ synchro au chargement
    syncValidateButton(lastValid);

    inputEl.addEventListener("input", async () => {

      const value = inputEl.value;

      // caractères autorisés seulement
      if (!charsAllowedForOpInput(value)) {
        inputEl.value = lastValid;
        inputEl.classList.add("error");
        shake(inputEl);
        syncValidateButton(inputEl.value);
        return;
      }

      lastValid = value;
      setVal(value);
      markDirty();

            // ✅ NC : si on est en mode "modifier une ligne" (ncEditInput)
      // et que l'utilisateur efface tout -> suppression définitive de la ligne
      if (inputEl.id === "ncEditInput" && nc.editIndex !== null && value.trim() === "") {
        const idx = nc.editIndex;

        // supprime la ligne en cours d’édition
        nc.items.splice(idx, 1);

        // reset état édition
        nc.editIndex = null;
        nc.editDraft = "";
        nc.editError = false;

        // si plus rien -> reset complet
        if (nc.items.length === 0) {
          resetNouveauCapitalToZero();
        } else {
          nc.finalized = false;
        }

        // persiste + rerender (suppression définitive)
        await persistAndRerender();
        return;
      }


      const hasText = value.trim().length > 0;
      const ok = isOperationPosed(value);

      if (hasText && !ok) inputEl.classList.add("error");
      else inputEl.classList.remove("error");

      if (typeof clearErrorFlag === "function") clearErrorFlag(false);

      // ✅ IMPORTANT : afficher/masquer + activer/désactiver le bouton Valider
      syncValidateButton(value);
    });

    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const btnId = resolveValidateBtnId(inputEl.id);
        if (!btnId) return;
        const vb = document.getElementById(btnId);
        if (vb && vb.style.display !== "none" && !vb.disabled) vb.click();
      }
    });
  }

  async function persistAndRerender() {
    await safePersistNow();
    renderDailyDayPage(isoDate);
  }

  function resetNouveauCapitalToZero() {
    nc.items = [];
    nc.draft = "";
    nc.finalized = false;
    nc.editIndex = null;
    nc.editDraft = "";
    nc.editError = false;
    nc.draftError = false;
  }

  // ... (tes handlers NC / NCR identiques à ton code actuel)
  // ⚠️ Je laisse exactement ton code ci-dessous inchangé dans ton fichier.

    // ===============================
  // ✅ HANDLERS — NOUVEAU CAPITAL (NC)
  // ===============================

  // Filtre / synchro pour les inputs NC
  bindNcTextFilter(
    document.getElementById("ncDraft"),
    () => nc.draft,
    (v) => (nc.draft = v),
    (flag) => (nc.draftError = flag)
  );

  bindNcTextFilter(
    document.getElementById("ncEditInput"),
    () => nc.editDraft,
    (v) => (nc.editDraft = v),
    (flag) => (nc.editError = flag)
  );

  // Valider draft NC
  const ncValidateBtn = document.getElementById("ncValidate");
  if (ncValidateBtn) {
    ncValidateBtn.addEventListener("click", async () => {
      const raw = (nc.draft || "").trim();
      if (!raw || !isOperationPosed(raw)) {
        nc.draftError = true;
        const el = document.getElementById("ncDraft");
        if (el) el.classList.add("error");
        if (el) shake(el);
        shake(ncValidateBtn);
        await persistAndRerender();
        return;
      }

      const res = evalOperation(raw);
      if (res === null) {
        nc.draftError = true;
        const el = document.getElementById("ncDraft");
        if (el) el.classList.add("error");
        if (el) shake(el);
        shake(ncValidateBtn);
        await persistAndRerender();
        return;
      }

      nc.items.push({ raw, result: res });

      // ✅ le résultat “descend” dans la case à écrire
      nc.draft = formatCommaNumber(res);
      nc.draftAutoFilled = true;

      nc.draftError = false;
      nc.editIndex = null;
      nc.editDraft = "";
      nc.editError = false;

      // tant que pas "Terminer", ce n'est pas finalized
      nc.finalized = false;

      markDirty();
      await persistAndRerender();
    });
  }

  // Modifier une ligne NC (ouvrir edit)
  app.querySelectorAll("[data-nc-mod]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const idx = Number(btn.getAttribute("data-nc-mod"));
      if (!Number.isFinite(idx)) return;

      nc.editIndex = idx;
      nc.editDraft = nc.items[idx]?.raw ?? "";
      nc.editError = false;

      nc.finalized = false;
      markDirty();
      await persistAndRerender();
    });
  });

  // Supprimer une ligne NC
  app.querySelectorAll("[data-nc-del]").forEach((xbtn) => {
    xbtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const idx = Number(xbtn.getAttribute("data-nc-del"));
      if (!Number.isFinite(idx)) return;

      
      nc.items.splice(idx, 1);


      // si on supprimait celle en cours d'édition
      if (nc.editIndex === idx) {
        nc.editIndex = null;
        nc.editDraft = "";
        nc.editError = false;
      } else if (nc.editIndex !== null && idx < nc.editIndex) {
        nc.editIndex -= 1;
      }

      // si plus rien, reset complet
      if (nc.items.length === 0) {
        resetNouveauCapitalToZero();
      } else {
        nc.finalized = false;
      }

      markDirty();
      await persistAndRerender();
    });
  });

  // Valider edit NC
  const ncEditValidateBtn = document.getElementById("ncEditValidate");
  if (ncEditValidateBtn) {
    ncEditValidateBtn.addEventListener("click", async () => {
      if (nc.editIndex === null) return;

      const raw = (nc.editDraft || "").trim();
      const input = document.getElementById("ncEditInput");

      if (!raw || !isOperationPosed(raw)) {
        nc.editError = true;
        if (input) input.classList.add("error");
        if (input) shake(input);
        shake(ncEditValidateBtn);
        await persistAndRerender();
        return;
      }

      const res = evalOperation(raw);
      if (res === null) {
        nc.editError = true;
        if (input) input.classList.add("error");
        if (input) shake(input);
        shake(ncEditValidateBtn);
        await persistAndRerender();
        return;
      }

      nc.items[nc.editIndex] = { raw, result: res };

nc.editIndex = null;
nc.editDraft = "";

// ✅ le résultat “descend” dans la case à écrire
nc.draft = formatCommaNumber(res);
nc.draftAutoFilled = true;

      nc.editError = false;

      nc.finalized = false;
      markDirty();
      await persistAndRerender();
    });
  }

  // Terminer NC
  const ncFinishBtn = document.getElementById("ncFinish");
  if (ncFinishBtn) {
    ncFinishBtn.addEventListener("click", async (e) => {
      const draftHasText = (nc.draft || "").trim().length > 0;
      const editHasText = nc.editIndex !== null && (nc.editDraft || "").trim().length > 0;

      if (nc.items.length === 0 || draftHasText || editHasText) {
        const el = document.getElementById(draftHasText ? "ncDraft" : "ncEditInput");
        if (el) shake(el);
        shake(ncFinishBtn);
        e.preventDefault();
        return;
      }

      nc.finalized = true;
      nc.editIndex = null;
      nc.editDraft = "";
      nc.editError = false;
      nc.draft = "";
      nc.draftError = false;

      markDirty();
      await persistAndRerender();
    });
  }

  // Modifier (tout) NC après finalisation
  const ncModifyAllBtn = document.getElementById("ncModifyAll");
  if (ncModifyAllBtn) {
    ncModifyAllBtn.addEventListener("click", async () => {
      nc.finalized = false;
      nc.editIndex = null;
      nc.editDraft = "";
      nc.editError = false;
      markDirty();
      await persistAndRerender();
    });
  }

  const ncIgnoreBtn = document.getElementById("ncIgnore");
if (ncIgnoreBtn) {
  ncIgnoreBtn.addEventListener("click", async () => {
    nc.draft = "";
    nc.draftAutoFilled = false;
    nc.draftError = false;
    markDirty();
    await persistAndRerender();
  });
}


  // ===============================
  // ✅ HANDLERS — NOUVELLE CAISSE RÉELLE (NCR)
  // ===============================

  function resetNouvelleCaisseReelleToZero() {
    ncr.items = [];
    ncr.draft = "";
    ncr.finalized = false;
    ncr.editIndex = null;
    ncr.editDraft = "";
    ncr.editError = false;
    ncr.draftError = false;
  }

  bindNcTextFilter(
    document.getElementById("ncrDraft"),
    () => ncr.draft,
    (v) => (ncr.draft = v),
    (flag) => (ncr.draftError = flag)
  );

  bindNcTextFilter(
    document.getElementById("ncrEditInput"),
    () => ncr.editDraft,
    (v) => (ncr.editDraft = v),
    (flag) => (ncr.editError = flag)
  );

  // Valider draft NCR
  const ncrValidateBtn = document.getElementById("ncrValidate");
  if (ncrValidateBtn) {
    ncrValidateBtn.addEventListener("click", async () => {
      const raw = (ncr.draft || "").trim();
      const input = document.getElementById("ncrDraft");

      if (!raw || !isOperationPosed(raw)) {
        ncr.draftError = true;
        if (input) input.classList.add("error");
        if (input) shake(input);
        shake(ncrValidateBtn);
        await persistAndRerender();
        return;
      }

      const res = evalOperation(raw);
      if (res === null) {
        ncr.draftError = true;
        if (input) input.classList.add("error");
        if (input) shake(input);
        shake(ncrValidateBtn);
        await persistAndRerender();
        return;
      }

      ncr.items.unshift({ raw, result: res });
      ncr.draft = "";
      ncr.draftError = false;
      ncr.editIndex = null;
      ncr.editDraft = "";
      ncr.editError = false;

      ncr.finalized = false;

      markDirty();
      await persistAndRerender();
    });
  }

  // Modifier une ligne NCR
  app.querySelectorAll("[data-ncr-mod]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const idx = Number(btn.getAttribute("data-ncr-mod"));
      if (!Number.isFinite(idx)) return;

      ncr.editIndex = idx;
      ncr.editDraft = ncr.items[idx]?.raw ?? "";
      ncr.editError = false;

      ncr.finalized = false;
      markDirty();
      await persistAndRerender();
    });
  });

  // Supprimer une ligne NCR
  app.querySelectorAll("[data-ncr-del]").forEach((xbtn) => {
    xbtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const idx = Number(xbtn.getAttribute("data-ncr-del"));
      if (!Number.isFinite(idx)) return;

      
      ncr.items.splice(idx, 1);

      if (ncr.editIndex === idx) {
        ncr.editIndex = null;
        ncr.editDraft = "";
        ncr.editError = false;
      } else if (ncr.editIndex !== null && idx < ncr.editIndex) {
        ncr.editIndex -= 1;
      }

      if (ncr.items.length === 0) {
        resetNouvelleCaisseReelleToZero();
      } else {
        ncr.finalized = false;
      }

      markDirty();
      await persistAndRerender();
    });
  });

  // Valider edit NCR
  const ncrEditValidateBtn = document.getElementById("ncrEditValidate");
  if (ncrEditValidateBtn) {
    ncrEditValidateBtn.addEventListener("click", async () => {
      if (ncr.editIndex === null) return;

      const raw = (ncr.editDraft || "").trim();
      const input = document.getElementById("ncrEditInput");

      if (!raw || !isOperationPosed(raw)) {
        ncr.editError = true;
        if (input) input.classList.add("error");
        if (input) shake(input);
        shake(ncrEditValidateBtn);
        await persistAndRerender();
        return;
      }

      const res = evalOperation(raw);
      if (res === null) {
        ncr.editError = true;
        if (input) input.classList.add("error");
        if (input) shake(input);
        shake(ncrEditValidateBtn);
        await persistAndRerender();
        return;
      }

      ncr.items[ncr.editIndex] = { raw, result: res };

      ncr.editIndex = null;
      ncr.editDraft = "";
      ncr.editError = false;

      ncr.finalized = false;
      markDirty();
      await persistAndRerender();
    });
  }

  // Terminer NCR
  const ncrFinishBtn = document.getElementById("ncrFinish");
  if (ncrFinishBtn) {
    ncrFinishBtn.addEventListener("click", async (e) => {
      const draftHasText = (ncr.draft || "").trim().length > 0;
      const editHasText = ncr.editIndex !== null && (ncr.editDraft || "").trim().length > 0;

      if (ncr.items.length === 0 || draftHasText || editHasText) {
        const el = document.getElementById(draftHasText ? "ncrDraft" : "ncrEditInput");
        if (el) shake(el);
        shake(ncrFinishBtn);
        e.preventDefault();
        return;
      }

      ncr.finalized = true;
      ncr.editIndex = null;
      ncr.editDraft = "";
      ncr.editError = false;
      ncr.draft = "";
      ncr.draftError = false;

      markDirty();
      await persistAndRerender();
    });
  }

  // Modifier (tout) NCR après finalisation
  const ncrModifyAllBtn = document.getElementById("ncrModifyAll");
  if (ncrModifyAllBtn) {
    ncrModifyAllBtn.addEventListener("click", async () => {
      ncr.finalized = false;
      ncr.editIndex = null;
      ncr.editDraft = "";
      ncr.editError = false;
      markDirty();
      await persistAndRerender();
    });
  }

  // -------------------------
  // ✅ ENREGISTRER / MODIFIER / MIGRER (persisté en DB)
  // -------------------------

  const saveBtn = document.getElementById("saveDay");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const ok = computeSaveEligible();
      if (!ok) {
        shake(saveBtn);
        return;
      }

      saveBtn.disabled = true;

      try {
        // ✅ Auto-carryover sur le lendemain (samedi -> lundi)
        const nextIso = nextBusinessIso(isoDate);
        const nextDay = getDailyData(nextIso);

        // NL -> liquidité du lendemain (validée)
        if (data.nouvelleLiquiditeFinalized) {
          const r = evalOperation(data.nouvelleLiquidite);
          if (r !== null) {
            nextDay.liquidite = formatCommaNumber(r);
            nextDay.liquiditeFinalized = true;
          }
        }

        // Dernier NC -> capital du lendemain (validé)
        if (data.nouveauCapitalStack?.finalized && data.nouveauCapitalStack.items?.length) {
          const last = data.nouveauCapitalStack.items[data.nouveauCapitalStack.items.length - 1];
          const r = Number.isFinite(last?.result) ? last.result : null;
          if (r !== null) {
            nextDay.capital = formatCommaNumber(r);
            nextDay.capitalFinalized = true;
          }
        }

                // ✅ Nouvelle caisse réelle -> caisse départ du lendemain (validée)
        if (data.nouvelleCaisseReelleFinalized) {
          const r = evalOperation(data.nouvelleCaisseReelle);
          if (r !== null) {
            nextDay.caisseDepart = formatCommaNumber(r);
            nextDay.caisseDepartFinalized = true;
          }
        }


        data.daySaved = true;
        data.dayMigrated = false; // ✅ Enregistrer > plus “migré”
        await apiSaveData(dailyStore);
        renderDailyDayPage(isoDate);
        alert("Enregistré !");
      } catch (e) {
        data.daySaved = false;
        renderDailyDayPage(isoDate);
        alert("Erreur sauvegarde : " + (e?.message || "inconnue"));
        shake(saveBtn);
      } finally {
        const b = document.getElementById("saveDay");
        if (b) b.disabled = false;
      }
    });
  }

  const migrateBtn = document.getElementById("migrateDay");
  if (migrateBtn) {
    migrateBtn.addEventListener("click", async () => {
      if (!computeMigrateEligible()) {
        shake(migrateBtn);
        return;
      }

      migrateBtn.disabled = true;

      try {
  const nextIso = nextBusinessIso(isoDate);
  const dst = getDailyData(nextIso);

  // ✅ helper : dernier résultat d’une pile (NC)
  function lastStackResult(stack) {
    if (!stack || !Array.isArray(stack.items) || stack.items.length === 0) return null;
    const last = stack.items[stack.items.length - 1];
    const r = Number.isFinite(last?.result) ? last.result : null;
    return r;
  }

  // ✅ NOUVELLE RÈGLE MIGRATION :
  // NCR -> caisseDepart du lendemain
  // NL  -> liquidite du lendemain
  // NC  -> capital du lendemain
  // Rien d’autre ne migre.

  // 1) Nouvelle caisse réelle => caisse départ du lendemain
  if (data.nouvelleCaisseReelleFinalized) {
    const r = evalOperation(data.nouvelleCaisseReelle);
    if (r !== null) {
      dst.caisseDepart = formatCommaNumber(r);
      dst.caisseDepartFinalized = true;
    }
  }

  // 2) Nouvelle liquidité => liquidité du lendemain
  if (data.nouvelleLiquiditeFinalized) {
    const r = evalOperation(data.nouvelleLiquidite);
    if (r !== null) {
      dst.liquidite = formatCommaNumber(r);
      dst.liquiditeFinalized = true;
    }
  }

  // 3) Nouveau capital (pile) => capital du lendemain
  if (nc?.finalized) {
    const r = lastStackResult(nc);
    if (r !== null) {
      dst.capital = formatCommaNumber(r);
      dst.capitalFinalized = true;
    }
  }

  // ✅ marquer le jour comme migré (bleu)
  data.dayMigrated = true;

  await apiSaveData(dailyStore);
  renderDailyDayPage(isoDate);
  alert("Migré vers le lendemain !");
} catch (e) {
  alert("Erreur migration : " + (e?.message || "inconnue"));
  shake(migrateBtn);
} finally {
  const b = document.getElementById("migrateDay");
  if (b) b.disabled = false;
}

    });
  }

  const editDayBtn = document.getElementById("editDay");
  if (editDayBtn) {
    editDayBtn.addEventListener("click", async () => {
      data.daySaved = false;
      await safePersistNow();
      renderDailyDayPage(isoDate);
    });
  }
}
// ===============================
// ✅ FIN — renderDailyDayPage(isoDate)
// ===============================


function doPrelevValidate(p, prefix, isoDate, onDirty) {
  // ✅ draft actif : soit p.draft (ajout), soit p.editDraft (édition)
  const raw = ((p.editIndex === null) ? (p.draft || "") : (p.editDraft || "")).trim();

  const inputEl = document.getElementById(`${prefix}Input`);
  const validateBtn = document.getElementById(`${prefix}Validate`);

  if (!raw) {
    if (validateBtn) shake(validateBtn);
    if (inputEl) shake(inputEl);
    return;
  }

  const n = toNumberLoose(raw);
  if (n === null) {
    if (inputEl) {
      inputEl.classList.add("error");
      shake(inputEl);
    }
    if (validateBtn) shake(validateBtn);
    return;
  }

  const normalized = raw.replace(/\s+/g, "").replace(",", ".");

  if (p.editIndex !== null && Number.isFinite(p.editIndex)) {
    // ✅ ÉDITION : remplace sans déplacer
    p.items[p.editIndex] = normalized;
    p.editIndex = null;
    p.editDraft = "";
  } else {
    // ✅ AJOUT : le plus récent vers la droite
    p.items.push(normalized);
    p.draft = "";
  }

  p.editing = true;
  p.finalized = false;

  if (typeof onDirty === "function") onDirty();
  renderDailyDayPage(isoDate);
}


// --------- PAGES "HEBDO/ACHAT" (provisoire) ---------
function renderGenericDayPage(pageName, isoDate) {
  const date = fromISODate(isoDate);
  app.innerHTML = `
  <div class="page">
    <div class="topbar">
      <div class="slot left">
        <button id="homeBtn" class="icon-btn" title="Accueil" aria-label="Accueil">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 10.5L12 3l9 7.5" />
            <path d="M5 10v10h14V10" />
          </svg>
        </button>
      </div>

      <div class="slot center">
        <button id="back" class="back-btn">← Retour</button>
      </div>

      <div class="slot right"></div>
    </div>

    <div class="day-page">
      ${dayHeaderHTML(formatFullDate(date), { withPrevNext: true })}

      <div style="display:flex; justify-content:center; align-items:center; gap:14px; margin-top:18px; flex-wrap:wrap;">
        <button id="saleDay" class="btn btn-blue lift" style="min-width:220px;">
  ${pageName === "buy" ? "Catégories" : "Vente du jour"}
</button>
<button id="accountDay" class="btn btn-blue lift" style="min-width:220px;">
  ${pageName === "buy" ? "Articles" : "Compte du jour"}
</button>

      </div>
    </div>
  </div>
`;


  bindPrevNextDayButtons(isoDate, { baseHashPrefix: `#${pageName}/` });

  const hb = document.getElementById("homeBtn");
  if (hb) hb.addEventListener("click", () => navigateTo("#"));


  document.getElementById("back").addEventListener("click", () => smartBack());

  const saleBtn = document.getElementById("saleDay");
const accBtn = document.getElementById("accountDay");

if (pageName === "buy") {
  if (saleBtn) saleBtn.addEventListener("click", () => navigateTo(`#buy/${isoDate}/categories`));
  if (accBtn) accBtn.addEventListener("click", () => navigateTo(`#buy/${isoDate}/articles`));
} else {
  // (weekly) tu peux laisser vide ou garder plus tard ton comportement
}

}

// ===============================
// ✅ DÉBUT — renderDailyDayMenu(isoDate)
// ===============================
function renderDailyDayMenu(isoDate) {
  const date = fromISODate(isoDate);

  app.innerHTML = `
  <div class="page">
    <div class="topbar">
      <div class="slot left">
        <button id="homeBtn" class="icon-btn" title="Accueil" aria-label="Accueil">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 10.5L12 3l9 7.5" />
            <path d="M5 10v10h14V10" />
          </svg>
        </button>
      </div>

      <div class="slot center">
        <button id="back" class="back-btn">← Retour</button>
      </div>

      <div class="slot right"></div>
    </div>

    <div class="day-page">
      ${dayHeaderHTML(formatFullDate(date), { withPrevNext: true })}

      <div style="display:flex; justify-content:center; align-items:center; gap:14px; margin-top:18px; flex-wrap:wrap;">
        <button id="saleDay" class="btn btn-blue lift" style="min-width:220px;">Vente du jour</button>
        <button id="accountDay" class="btn btn-blue lift" style="min-width:220px;">Compte du jour</button>
      </div>
    </div>
  </div>
`;


  document.getElementById("back").addEventListener("click", () => smartBack());
  const hb = document.getElementById("homeBtn");
  if (hb) hb.addEventListener("click", () => navigateTo("#"));

  document.getElementById("accountDay").addEventListener("click", () => navigateTo(`#daily/${isoDate}`));
  document.getElementById("saleDay").addEventListener("click", () => navigateTo(`#daily/${isoDate}/sale`));
}
// ===============================
// ✅ FIN — renderDailyDayMenu(isoDate)
// ===============================


// ===============================
// ✅ DÉBUT — renderDailySalePage(isoDate)
// ===============================
function renderDailySalePage(isoDate) {
  const date = fromISODate(isoDate);

  app.innerHTML = `
  <div class="page">
    <div class="topbar">
      <div class="slot left">
        <button id="homeBtn" class="icon-btn" title="Accueil" aria-label="Accueil">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 10.5L12 3l9 7.5" />
            <path d="M5 10v10h14V10" />
          </svg>
        </button>
      </div>

      <div class="slot center">
        <button id="back" class="back-btn">← Retour</button>
      </div>

      <div class="slot right">
        <button id="calBtn" class="icon-btn" title="Calendrier" aria-label="Calendrier">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M7 3v3M17 3v3" />
            <path d="M3.5 8h17" />
            <path d="M5 6h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
          </svg>
        </button>
      </div>
    </div>

    <div class="day-page">
  ${dayHeaderHTML(formatFullDate(date), { withPrevNext: true })}

  <div class="buy-categories-wrap">

    <!-- ✅ Barre de recherche + suggestions -->
    <div class="op-search-wrap" style="margin-top:0;">
      <span class="op-search-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="7"></circle>
          <path d="M20 20l-3.5-3.5"></path>
        </svg>
      </span>

      <input id="dailySaleSearch" class="input op-search"
        inputmode="text"
        autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
        placeholder="Rechercher un article (nom ou code)..." />

      <div id="dailySaleSuggest" class="op-suggest" style="display:none;"></div>
    </div>

    <!-- ✅ Bouton carré + -->
    <button id="addDailySaleBtn" class="add-cat-btn" type="button" aria-label="Ajouter" title="Ajouter">
      <span>+</span>
    </button>

        <!-- ✅ Totaux globaux du jour (apparaît dès qu’il y a ≥ 1 vente) -->
    <div id="dailySaleGlobals" style="display:none; margin-top:12px;">
      <div style="display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:12px;">
        <div>
          <div style="font-weight:1000; opacity:.95; margin-bottom:6px;">PRT global :</div>
          <div id="dailySalePRTGlobal" class="buy-cat-white"></div>
        </div>
        <div>
          <div style="font-weight:1000; opacity:.95; margin-bottom:6px;">PVT global :</div>
          <div id="dailySalePVTGlobal" class="buy-cat-white"></div>
        </div>
      </div>
    </div>


    <!-- ✅ LISTE : récapitulatifs (groupés par catégorie) -->
    <div id="dailySaleList" class="buy-cat-list" style="margin-top:14px;"></div>

    

  </div>
</div>


  </div>
`;

// ===============================
// ✅ Vente du jour — Récap articles BUY (par catégories)
// ===============================
const buy = getBuyStore();

// ===============================
// ✅ Vente du jour — Sales store + helpers
// ===============================
buy.dailySalesByIso = buy.dailySalesByIso || {};        // { [iso]: [sale...] }
buy.dailySaleDraftByIso = buy.dailySaleDraftByIso || {}; // optionnel (draft modale)

// ===============================
// ✅ Provisoires (RAP figé par jour)
// ===============================
buy.provByCode = buy.provByCode || {}; 
// { [provCode]: { provCode, originCode, articleNameSnap, pvSnap, createdAtIso, closedAtIso|null, rapByIso: { [iso]: number } } }

function normProvCode(s) {
  return String(s || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function findProvRecord(provCode) {
  const k = normProvCode(provCode);
  return buy.provByCode[k] || null;
}

// ✅ actif un jour donné (actif jusqu’au jour de clôture inclus ; inactif à partir du lendemain)
function isProvActiveOnDay(provCode, iso) {
  const rec = findProvRecord(provCode);
  if (!rec) return false;
  if (!rec.closedAtIso) return true;
  return isoToDayTs(iso) <= isoToDayTs(rec.closedAtIso);
}

// ✅ RAP “tel qu’il était” ce jour-là (ou dernier RAP connu avant ce jour)
function rapForProvOnDay(provCode, iso) {
  const rec = findProvRecord(provCode);
  if (!rec) return null;

  // si RAP stocké pour ce jour => direct
  if (rec.rapByIso && rec.rapByIso[iso] !== undefined) return rec.rapByIso[iso];

  // sinon, on remonte au dernier jour <= iso
  let bestIso = null;
  for (const dIso in (rec.rapByIso || {})) {
    if (isoToDayTs(dIso) <= isoToDayTs(iso)) {
      if (!bestIso || isoToDayTs(dIso) > isoToDayTs(bestIso)) bestIso = dIso;
    }
  }
  if (!bestIso) return null;
  return rec.rapByIso[bestIso];
}

function setRapForProvOnDay(provCode, iso, rapN) {
  const rec = findProvRecord(provCode);
  if (!rec) return;
  rec.rapByIso = rec.rapByIso || {};
  rec.rapByIso[iso] = rapN;

  // ✅ si atteint 0 => fermeture à ce jour (inexistant à partir de demain)
  if (Number.isFinite(rapN) && rapN === 0) {
    rec.closedAtIso = iso;
  }
}

function activeProvRecordsForOriginOnDay(originCode, iso) {
  const oc = normSearch(String(originCode || ""));
  const arr = [];

  for (const k in (buy.provByCode || {})) {
    const rec = buy.provByCode[k];
    if (!rec) continue;
    if (normSearch(rec.originCode) !== oc) continue;

    // ✅ actif ce jour
    if (!isProvActiveOnDay(rec.provCode, iso)) continue;

    // ✅ RAP du jour (ou dernier connu avant) > 0
    const rap = rapForProvOnDay(rec.provCode, iso);
    if (!Number.isFinite(rap) || rap <= 0) continue;

    arr.push({
      provCode: rec.provCode,
      rap,
      createdAtIso: rec.createdAtIso || "",
      createdAtTs: Number(rec.createdAtTs) || 0
    });
  }

  // ✅ plus récent en haut
  arr.sort((a,b) => (b.createdAtTs || 0) - (a.createdAtTs || 0) || (isoToDayTs(b.createdAtIso) - isoToDayTs(a.createdAtIso)));
  return arr;
}


// ✅ cumulé "Payé" pour un code provisoire jusqu'à un jour donné (inclus)
function paidForProvUpToDay(provCode, iso) {
  const k = normProvCode(provCode);
  let total = 0;

  for (const dayIso in (buy.dailySalesByIso || {})) {
    if (isoToDayTs(dayIso) > isoToDayTs(iso)) continue; // ✅ après le jour => ignore
    const arr = buy.dailySalesByIso[dayIso] || [];

    for (const s of arr) {
      if (s?.type !== "advance") continue;
      if (!s.provCode) continue;
      if (normProvCode(s.provCode) !== k) continue;

      const aN = parseLooseNumber(s.avance);
      if (Number.isFinite(aN)) total += aN;
    }
  }

  return total;
}

// ✅ liste détaillée des paiements d’un provisoire (plus récent en haut)
function listPaymentsForProvUpToDay(provCode, iso) {
  const k = normProvCode(provCode);
  const out = [];

  for (const dayIso in (buy.dailySalesByIso || {})) {
    if (isoToDayTs(dayIso) > isoToDayTs(iso)) continue; // ✅ jusqu’au jour inclus
    const arr = buy.dailySalesByIso[dayIso] || [];

    for (const s of arr) {
      if (!s || s.type !== "advance") continue;
      if (!s.provCode) continue;
      if (normProvCode(s.provCode) !== k) continue;

      const aN = parseLooseNumber(s.avance);
      if (!Number.isFinite(aN) || aN <= 0) continue;

      out.push({
        amount: aN,
        dayIso,
        ts: Number(s.ts) || isoToDayTs(dayIso) || 0
      });
    }
  }

  out.sort((a,b) => (b.ts || 0) - (a.ts || 0)); // ✅ plus récent au-dessus
  return out;
}

function paymentsTotal(payments) {
  return (payments || []).reduce((acc, p) => acc + (Number.isFinite(p.amount) ? p.amount : 0), 0);
}




// tolérant : espaces + virgule
function parseLooseNumber(s) {
  const raw = String(s ?? "").trim();
  if (!raw) return NaN;
  if (typeof toNumberLoose === "function") return toNumberLoose(raw.replace(/\s+/g, ""));
  return Number(raw.replace(/\s+/g, "").replace(",", "."));
}

// autorise chiffres, virgule, espaces (comme Articles)
function digitsCommaOnly(raw) {
  let s = String(raw || "");
  s = s.replace(/\./g, ",");
  let cleaned = s.replace(/[^0-9,\s]/g, "");
  const firstComma = cleaned.indexOf(",");
  if (firstComma !== -1) {
    cleaned = cleaned.slice(0, firstComma + 1) + cleaned.slice(firstComma + 1).replace(/,/g, "");
  }
  return cleaned;
}

function getSalesOfDay(iso) {
  buy.dailySalesByIso[iso] = buy.dailySalesByIso[iso] || [];
  return buy.dailySalesByIso[iso];
}

function salesTodayForCode(code) {
  const c = normSearch(String(code || ""));
  return getSalesOfDay(isoDate).filter(s => normSearch(s.code) === c);
}

function sumQtySales(list) {
  return list.reduce((acc, s) => {
    const q = parseLooseNumber(s.qty);
    return acc + (Number.isFinite(q) ? q : 0);
  }, 0);
}

function sumPvSales(list) {
  return list.reduce((acc, s) => {
    const p = parseLooseNumber(s.pv);
    const q = parseLooseNumber(s.qty);
    const pv = Number.isFinite(p) ? p : 0;
    const qty = Number.isFinite(q) ? q : 0;
    return acc + (pv * qty);
  }, 0);
}

// ✅ [AJOUT] montant qui alimente le PVT pour UNE ligne (vente OU avance)
function pvtAmountOfEntry(s) {
  if (!s) return 0;

  // Avance : c’est "avance" qui alimente le PVT
  if (s.type === "advance") {
    const a = parseLooseNumber(s.avance);
    return Number.isFinite(a) ? a : 0;
  }

  // Vente normale : PV × quantité
  const p = parseLooseNumber(s.pv);
  const q = parseLooseNumber(s.qty);
  const pv = Number.isFinite(p) ? p : 0;
  const qty = Number.isFinite(q) ? q : 0;
  return pv * qty;
}

// ✅ [AJOUT] somme PVT d'une liste (compatible ventes + avances)
function sumPvtEntries(list) {
  return (list || []).reduce((acc, s) => acc + pvtAmountOfEntry(s), 0);
}

// ✅ [AJOUT] cumul PVT STRICTEMENT avant un jour (compatible ventes + avances)
function totalPvtBeforeDayForCode(code, iso) {
  const c = normSearch(String(code || ""));
  let total = 0;

  for (const dayIso in (buy.dailySalesByIso || {})) {
    if (isoToDayTs(dayIso) >= isoToDayTs(iso)) continue; // strictement avant
    const arr = buy.dailySalesByIso[dayIso] || [];
    for (const s of arr) {
      if (normSearch(s.code) !== c) continue;
      total += pvtAmountOfEntry(s);
    }
  }
  return total;
}



// total PV historique (toutes dates) pour un code
function totalPvAllDaysForCode(code) {
  const c = normSearch(String(code || ""));
  let total = 0;
  for (const iso in (buy.dailySalesByIso || {})) {
    const arr = buy.dailySalesByIso[iso] || [];
    for (const s of arr) {
      if (normSearch(s.code) !== c) continue;
      const p = parseLooseNumber(s.pv);
      if (Number.isFinite(p)) total += p;
    }
  }
  return total;
}

// compression PV du jour : conserve l’ordre d’apparition des valeurs uniques
function pvtExpressionForToday(code) {
  const list = salesTodayForCode(code);

  // ✅ cumul AVANT aujourd’hui (ne doit jamais modifier les jours passés)
  const prevCum = totalPvtBeforeDayForCode(code, isoDate);

  // ✅ pas de vente aujourd’hui => ligne PVT = cumul précédent
  if (!list.length) {
    return {
      hasAny: false,
      dayTotal: 0,
      prevCum,
      cumToDay: prevCum,
      displayNoSale: (Number.isFinite(prevCum) && prevCum > 0) ? fmtResult(prevCum) : ""
    };
  }

  // ✅ vente aujourd’hui => expression compressée
  // ✅ vente aujourd’hui => expression compressée (PV × Quantité)
// ✅ vente aujourd’hui => expression compressée (ventes + avances)
const order = [];               // clés ordonnées (S|... ou A|...)
const qtyByKey = new Map();     // somme qty (vente) ou compteur (avance)
const valByKey = new Map();     // valeur numérique (pv ou avance)
const kindByKey = new Map();    // "sale" | "advance"

for (const s of list) {

  // ✅ Avance : on compresse par valeur "avance" (et on affiche (A))
  if (s.type === "advance") {
    const aN = parseLooseNumber(s.avance);
    if (!Number.isFinite(aN) || aN <= 0) continue;

    const k = "A|" + String(aN).replace(".", ","); // clé stable (affichage)
    if (!qtyByKey.has(k)) {
      qtyByKey.set(k, 1);
      valByKey.set(k, aN);
      kindByKey.set(k, "advance");
      order.push(k);
    } else {
      qtyByKey.set(k, qtyByKey.get(k) + 1);
    }
    continue;
  }

  // ✅ Vente normale : PV × quantité (ta logique inchangée)
  const pvN = parseLooseNumber(s.pv);
  const qtyN = parseLooseNumber(s.qty);
  if (!Number.isFinite(pvN) || !Number.isFinite(qtyN) || qtyN <= 0) continue;

  const k = "S|" + String(pvN).replace(".", ","); // clé stable
  if (!qtyByKey.has(k)) {
    qtyByKey.set(k, qtyN);
    valByKey.set(k, pvN);
    kindByKey.set(k, "sale");
    order.push(k);
  } else {
    qtyByKey.set(k, qtyByKey.get(k) + qtyN);
  }
}

const parts = [];
for (const k of order) {
  const n = valByKey.get(k);
  const qSum = qtyByKey.get(k) || 0;
  const kind = kindByKey.get(k);

  if (!Number.isFinite(n) || !Number.isFinite(qSum) || qSum <= 0) continue;

  let disp = fmtResult(n);

  // ✅ Avance : ajouter (A) après la valeur
  if (kind === "advance") disp = `${disp} (A)`;

  // ✅ même règle de multiplication : répétition => "×"
  if (qSum === 1) parts.push(`${disp}`);
  else parts.push(`${disp} × ${fmtResult(qSum)}`);
}




  const dayTotal = sumPvtEntries(list);
  const expr = parts.length ? parts.join(" + ") : "";
  const exprWithTotal = expr ? `${expr} = ${fmtResult(dayTotal)}` : `${fmtResult(dayTotal)}`;

  // ✅ cumul à date = cumul avant + total du jour
  const cumToDay = prevCum + dayTotal;

  return {
    hasAny: true,
    dayTotal,
    prevCum,
    cumToDay,
    displaySaleDay: `${exprWithTotal} (${fmtResult(cumToDay)})`
  };
}


// PRT du jour : PR × qtyVendueJour = résultat
function prtExpressionForToday(article) {
  const list = salesTodayForCode(article.code);
  const qtySum = sumQtySales(list);
  const pr = Number(article.prResult);

  if (!list.length || !Number.isFinite(pr)) {
    return { hasAny:false, qtySum: qtySum, display: "" };
  }

  const res = pr * qtySum;
  const display = `${fmtResult(pr)} × ${fmtResult(qtySum)} = ${fmtResult(res)}`;
  return { hasAny:true, qtySum, display };
}

// ===============================
// ✅ Globals (évolutifs) : PRT global / PVT global
// ===============================
function computeGlobalsForDay(iso) {
  const sales = getSalesOfDay(iso);
  if (!sales.length) return { has:false, prtGlobal:0, pvtGlobal:0 };

  // regroupe par code
  const byCode = new Map();
  for (const s of sales) {
    const code = String(s.code || "").trim();
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(s);
  }

  let prtGlobal = 0;
  let pvtGlobal = 0;

  for (const [code, list] of byCode.entries()) {
    // article correspondant
    const art = (buy.articles || []).find(a => !a.deletedAtIso && normSearch(a.code) === normSearch(code));
    if (!art) continue;

    const pr = Number(art.prResult);
    const qtySum = sumQtySales(list);
    const pvSum = sumPvtEntries(list);



    if (Number.isFinite(pr)) prtGlobal += pr * qtySum;
    pvtGlobal += pvSum;
  }

  return { has:true, prtGlobal, pvtGlobal };
}

function renderDailySaleGlobals() {
  const wrap = document.getElementById("dailySaleGlobals");
  const elPRT = document.getElementById("dailySalePRTGlobal");
  const elPVT = document.getElementById("dailySalePVTGlobal");
  if (!wrap || !elPRT || !elPVT) return;

  const g = computeGlobalsForDay(isoDate);
  if (!g.has) {
    wrap.style.display = "none";
    elPRT.textContent = "";
    elPVT.textContent = "";
    return;
  }

  wrap.style.display = "";
  elPRT.textContent = fmtResult(g.prtGlobal);
  elPVT.textContent = fmtResult(g.pvtGlobal);
}


// ---- helpers date robustes
function isoToDayTs(iso) {
  const s = String(iso || "").trim();
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]);
}

function isoToFr(iso) {
  const s = String(iso || "").trim();
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return "";
  const dd = String(m[3]).padStart(2, "0");
  const mm = String(m[2]).padStart(2, "0");
  const yy = String(m[1]);
  return `${dd}/${mm}/${yy}`;
}

// ---- format milliers (réutilise tes fonctions existantes)
function fmtWhite(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (typeof formatInputNumberDisplay === "function") return formatInputNumberDisplay(s.replace(/\s+/g, ""));
  return s;
}
function fmtResult(n) {
  if (!Number.isFinite(n)) return "(...)";
  const s = String(n).replace(".", ",");
  if (typeof formatInputNumberDisplay === "function") return formatInputNumberDisplay(s);
  if (typeof formatCommaNumber === "function") return formatCommaNumber(n);
  return s;
}

function sumSoldQtyBeforeDayForCode(code, iso) {
  const c = normSearch(String(code || ""));
  let total = 0;

  for (const dayIso in (buy.dailySalesByIso || {})) {
    if (isoToDayTs(dayIso) >= isoToDayTs(iso)) continue; // ✅ strictement avant
    const arr = buy.dailySalesByIso[dayIso] || [];
    for (const s of arr) {
      if (normSearch(s.code) !== c) continue;
      const q = parseLooseNumber(s.qty);
      if (Number.isFinite(q)) total += q;
    }
  }
  return total;
}

function computeStartQtyForDay(article, iso) {
  // qty initiale de l’article (celle que tu stockes dans a.qty)
  const ini = parseLooseNumber(article.qty);
  if (!Number.isFinite(ini)) return NaN;

  const soldBefore = sumSoldQtyBeforeDayForCode(article.code, iso);
  return ini - soldBefore;
}


function totalPvBeforeDayForCode(code, iso) {
  const c = normSearch(String(code || ""));
  let total = 0;

  for (const dayIso in (buy.dailySalesByIso || {})) {
    // ✅ uniquement les jours strictement AVANT iso
    if (isoToDayTs(dayIso) >= isoToDayTs(iso)) continue;

    const arr = buy.dailySalesByIso[dayIso] || [];
    for (const s of arr) {
      if (normSearch(s.code) !== c) continue;
      const p = parseLooseNumber(s.pv);
const q = parseLooseNumber(s.qty);
if (Number.isFinite(p) && Number.isFinite(q)) total += (p * q);

    }
  }
  return total;
}

function totalPvUpToDayForCode(code, iso) {
  // cumul jusqu’au jour affiché (inclu) = avant + du jour
  return totalPvBeforeDayForCode(code, iso) + sumPvSales(salesTodayForCode(code));
}


// ---- visibilité : créé avant ou le même jour, et pas supprimé avant/au jour
function isVisibleOnDay(a) {
  const cur = isoToDayTs(isoDate);
  const cts = isoToDayTs(a.createdAtIso);
  const dts = a.deletedAtIso ? isoToDayTs(a.deletedAtIso) : NaN;

  if (!Number.isFinite(cur) || !Number.isFinite(cts)) return false;
  if (cts > cur) return false;

  // supprimé le même jour ou avant => ne plus afficher
  if (Number.isFinite(dts) && dts <= cur) return false;

  return true;
}

// ---- extraction code : catégorie = avant le point ; article = après le point
function splitArticleCode(code) {
  const raw = String(code || "").trim();
  const m = raw.match(/^(\d+)\.(.+)$/);   // ex: "12.07" ou "3.A"
  if (!m) return { cat: "", art: raw };
  return { cat: m[1], art: m[2] };
}

function cmpAsc(a, b) {
  // si tu as déjà codeCompare global, on l'utilise
  if (typeof codeCompare === "function") return codeCompare(a, b);
  return String(a).localeCompare(String(b), "fr", { numeric: true, sensitivity: "base" });
}

function cmpArticleSuffix(aCode, bCode) {
  const a = splitArticleCode(aCode).art;
  const b = splitArticleCode(bCode).art;

  // numeric-first
  const na = Number(String(a).replace(",", "."));
  const nb = Number(String(b).replace(",", "."));
  const fa = Number.isFinite(na);
  const fb = Number.isFinite(nb);
  if (fa && fb) return na - nb;

  return cmpAsc(a, b);
}

// ---- composants UI
function kv(label, value) {
  return `
    <div style="min-width:0; display:flex; align-items:center; gap:8px;">
      <div style="font-weight:900; opacity:.95; white-space:nowrap; flex:0 0 auto;">
        ${escapeHtml(label)} :
      </div>
      <div class="buy-cat-white" style="flex:1 1 auto; min-width:0;">
        ${escapeHtml(value || "")}
      </div>
    </div>
  `;
}



function saleCardHTML(a) {
  const title = `${a.name || ""} (${a.code || ""})`;

  // ✅ si stock début du jour = 0, on cache l’article SAUF s’il reste des provisoires actifs (RAP > 0)
// dans ce cas, on affiche une carte minimaliste avec pile des codes provisoires.
const startQtyN_top = computeStartQtyForDay(a, isoDate);
const provList = activeProvRecordsForOriginOnDay(a.code, isoDate);

const shouldHideBecauseZeroStock = Number.isFinite(startQtyN_top) && startQtyN_top <= 0 && provList.length === 0;
if (shouldHideBecauseZeroStock) return "";

const shouldShowProvOnly = Number.isFinite(startQtyN_top) && startQtyN_top <= 0 && provList.length > 0;
if (shouldShowProvOnly) {
  const stack = provList.map(p => `
    <div style="display:flex; align-items:center; gap:10px;">
      <div style="font-weight:1000; white-space:nowrap;">${escapeHtml(p.provCode)} :</div>
      <div class="buy-cat-white" style="flex:1; min-width:0;">
        ${escapeHtml(`Reste à payer : ${fmtResult(p.rap)}`)}
      </div>
    </div>
  `).join(`<div style="height:10px;"></div>`);

  return `
    <div class="buy-cat-card" style="padding:14px; display:block;">
      <div style="display:block; text-align:center; font-weight:1000; margin:0 0 12px 0;">
        ${escapeHtml(title)}
      </div>

      <div style="display:flex; flex-direction:column; gap:10px;">
        ${stack}
      </div>
    </div>
  `;
}


  const pr  = fmtResult(Number(a.prResult));
  const prg = fmtResult(Number(a.prgResult));
  const pv  = fmtWhite(a.pv || "");

  const ajout = isoToFr(a.createdAtIso);
  // ✅ Qté ini = stock au début du jour (reste de la veille)
// ✅ base évolutive pour Qté res (NE PAS TOUCHER)
const startQtyN = startQtyN_top;


// ✅ Qté ini = quantité initiale constante de l’article
const qteIni = fmtWhite(a.qty || "");



    // ✅ Vendu = somme des ventes du jour pour cet article
  const salesToday = salesTodayForCode(a.code);
  const venduN = sumQtySales(salesToday);
  const vendu = salesToday.length ? fmtResult(venduN) : "";


  const qtyN  = (typeof toNumberLoose === "function")
    ? toNumberLoose(String(a.qty || "").replace(/\s+/g, ""))
    : Number(String(a.qty || "").replace(/\s+/g, "").replace(",", "."));

  const vendN = venduN; // ✅ déjà numérique


  // ✅ Qté res = stock début du jour - vendu du jour
const resN = (Number.isFinite(startQtyN) ? startQtyN : 0) - (Number.isFinite(venduN) ? venduN : 0);
const qteRes = Number.isFinite(startQtyN) ? fmtResult(resN) : "";


    const prt = prtExpressionForToday(a);     // {hasAny, display}
  const pvt = pvtExpressionForToday(a.code); // {hasAny, display}

  // ✅ Cas "pas de vente aujourd’hui" : PVT = cumul des jours précédents (jusqu’à hier)
// ✅ Cas "vente aujourd’hui" : PVT = expression du jour + (cumul jusqu’à aujourd’hui)
let showPRT = prt.hasAny;
let pvtLineDisplay = "";

if (pvt.hasAny) {
  // vente aujourd'hui => expression + total + (cumul à date)
  pvtLineDisplay = pvt.displaySaleDay;
} else {
  // pas de vente aujourd’hui => récap cumul avant aujourd’hui (ne doit pas inclure le futur)
  pvtLineDisplay = pvt.displayNoSale;
}



  return `
    <div class="buy-cat-card" style="padding:14px; display:block;">
      
      <!-- ✅ (1) Titre : sa propre ligne -->
      <div style="
        display:block;
        text-align:center;
        font-weight:1000;
        margin:0 0 12px 0;
      ">
        ${escapeHtml(title)}
      </div>

      <!-- ✅ (2) Ligne PR/PRG/PV : 3 colonnes égales -->
      <div style="
        display:grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap:12px;
        margin:0 0 10px 0;
      ">
        ${kv("PR", pr)}
        ${kv("PRG", prg)}
        ${kv("PV", pv)}
      </div>

      <!-- ✅ (3) Ligne Ajout/Qté ini/Vendu/Qté res : 4 colonnes égales -->
      <div style="
        display:grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap:12px;
        margin:0;
      ">
        ${kv("Ajout", ajout)}
        ${kv("Qté ini", qteIni)}
        ${kv("Vendu", vendu)}
        ${kv("Qté res", qteRes)}
      </div>

            <!-- ✅ (4) Ligne PRT (seulement si vente aujourd’hui) -->
      ${
        showPRT
          ? `
            <div style="height:10px;"></div>
            <div style="display:grid; grid-template-columns: 1fr; gap:12px; margin:0;">
              ${kv("PRT", prt.display)}
            </div>
          `
          : ``
      }

      <!-- ✅ (5) Ligne PVT (toujours : jour=expression, sinon=cumul) -->
      <div style="height:10px;"></div>
      <div style="display:grid; grid-template-columns: 1fr; gap:12px; margin:0;">
        ${kv("PVT", pvtLineDisplay)}
      </div>


    </div>
  `;
}



// ---- regroupe par catégorie (code avant le point)
function buildGroupedArticles() {
    const arts = (buy.articles || [])
    .filter(a => {
      if (isVisibleOnDay(a)) return true;

      // ✅ même si "invisible" (cas stock=0 le lendemain), on garde si provisoires actifs RAP>0
      const provs = activeProvRecordsForOriginOnDay(a.code, isoDate);
      return provs.length > 0;
    });


  // group by catCode
  const groups = new Map(); // catCode -> [articles]
  for (const a of arts) {
    const { cat } = splitArticleCode(a.code);
    const key = cat || ""; // "" = non classé
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }

  // sort articles inside each group by suffix after dot (asc)
  for (const [k, list] of groups.entries()) {
    list.sort((x, y) => cmpArticleSuffix(x.code, y.code));
  }

  // sort group keys by cat code asc ("" last)
  const keys = Array.from(groups.keys()).sort((a, b) => {
    if (a === "" && b !== "") return 1;
    if (b === "" && a !== "") return -1;
    return cmpAsc(a, b);
  });

  return { groups, keys };
}

// ---- get category name from buy.categories by code
function categoryNameByCode(code) {
  const c = String(code || "").trim();
  const cats = (buy.categories || []).filter(x => !x.deletedAtIso);
  const found = cats.find(x => String(x.code || "").trim() === c);
  return found?.name || (c ? `Catégorie ${c}` : "Non classé");
}

function renderDailySaleRecap() {
  const listEl = document.getElementById("dailySaleList");
  if (!listEl) return;

  const { groups, keys } = buildGroupedArticles();

  if (!keys.length) {
    listEl.innerHTML = `<div style="opacity:.75; font-weight:800; margin-top:10px;">Aucun article disponible</div>`;
    return;
  }

  let html = "";

  keys.forEach((catCode, idx) => {
    const title = categoryNameByCode(catCode);

    // titre catégorie : gras + espace 18px après (fait par margin)
    html += `
      <div style="font-weight:1000; margin: 0 0 18px 0;">
        ${escapeHtml(title)}
      </div>
    `;

    const items = groups.get(catCode) || [];
    html += items.map((a, i) => {
      // espace 14px entre rectangles
      return `<div style="${i ? "margin-top:14px;" : ""}">${saleCardHTML(a)}</div>`;
    }).join("");

    // démarcation entre catégories
    if (idx < keys.length - 1) {
      html += `
        <div style="height:18px;"></div>
        <div style="height:1px; background: rgba(255,255,255,0.9);"></div>
        <div style="height:18px;"></div>
      `;
    } else {
      html += `<div style="height:18px;"></div>`;
    }
  });

  listEl.innerHTML = html;
}



renderDailySaleRecap();
renderDailySaleGlobals();


// ===============================
// ✅ Recherche + suggestions (Vente du jour)
// ===============================
const saleSearch  = document.getElementById("dailySaleSearch");
const saleSuggest = document.getElementById("dailySaleSuggest");

function allVisibleForSaleSearch() {
  return (buy.articles || [])
    .filter(a => isVisibleOnDay(a))
    .sort((a,b) => (b.createdAtTs || 0) - (a.createdAtTs || 0));
}

function showSaleSuggest(html) {
  if (!saleSuggest) return;
  if (!html) {
    saleSuggest.style.display = "none";
    saleSuggest.innerHTML = "";
    return;
  }
  saleSuggest.innerHTML = html;
  saleSuggest.style.display = "";
}

function renderSaleSearch(q) {
  const raw = String(q || "");
  const nq = normSearch(raw);

  if (!nq) {
    showSaleSuggest("");
    renderDailySaleRecap(); // ✅ retour affichage groupé
    return;
  }

  const list = allVisibleForSaleSearch();

  // ✅ Détecte si l'utilisateur est en train de taper un "préfixe de code" numérique
  // On accepte chiffres + éventuellement un point (ex: "12."), et espaces ignorés.
  const qNoSpace = raw.replace(/\s+/g, "");
  const isNumericPrefixQuery = /^[0-9]+(\.)?$/.test(qNoSpace);

  // ---------- FILTRAGE
  let filtered;

  if (isNumericPrefixQuery) {
    // ✅ mode "préfixe" sur le code (commence par)
    const prefix = qNoSpace; // ex: "1" ou "12" ou "12."
    filtered = list.filter(a => {
      const codeRaw = String(a.code || "").replace(/\s+/g, "");
      return codeRaw.startsWith(prefix);
    });
  } else {
    // ✅ mode générique : nom contient OU code contient (comme avant)
    filtered = list.filter(a => {
      const n = normSearch(a.name);
      const c = normSearch(a.code);
      return n.includes(nq) || c.includes(nq);
    });
  }

  // ---------- SUGGESTIONS (top 7)
  const top = filtered.slice(0, 7);
  if (!top.length) {
    showSaleSuggest("");
  } else {
    showSaleSuggest(top.map(a => {
      const label = `${a.code} — ${a.name}`;
      return `<div class="op-suggest-item" data-sale-sel="${escapeAttr(a.id)}">${escapeHtml(label)}</div>`;
    }).join(""));
  }

  // ---------- AFFICHAGE LISTE "Résultats"
  const listEl = document.getElementById("dailySaleList");
  if (listEl) {
    listEl.innerHTML = `
      <div class="buy-cat-section-title">Résultats</div>
      ${filtered.map(a => `<div style="margin-top:14px;">${saleCardHTML(a)}</div>`).join("")}
    `;
  }
}


if (saleSearch && saleSuggest) {
  saleSearch.addEventListener("input", () => renderSaleSearch(saleSearch.value));

  saleSuggest.addEventListener("click", (e) => {
    const it = e.target.closest(".op-suggest-item");
    if (!it) return;

    const id = it.getAttribute("data-sale-sel");
    const art = allVisibleForSaleSearch().find(a => a.id === id);
    showSaleSuggest("");

    const listEl = document.getElementById("dailySaleList");
    if (art && listEl) {
      listEl.innerHTML = `
        <div class="buy-cat-section-title">Résultat</div>
        <div style="margin-top:14px;">${saleCardHTML(art)}</div>
      `;
    }
  });

  document.addEventListener("pointerdown", (e) => {
    if (saleSuggest.contains(e.target)) return;
    if (saleSearch.contains(e.target)) return;
    showSaleSuggest("");
  }, { capture: true });
}


// ===============================
// ✅ MODAL "Avance ?" (Vente du jour)
// ===============================
function closeDailySaleAdvanceModal() {
  const bd = document.getElementById("dailySaleAdvanceBackdrop");
  if (bd) bd.remove();
}

function openDailySaleAdvanceModal() {
  if (document.getElementById("dailySaleAdvanceBackdrop")) return;

  const bd = document.createElement("div");
  bd.id = "dailySaleAdvanceBackdrop";
  bd.className = "cat-del-backdrop";

  bd.innerHTML = `
    <div class="cat-del-modal" role="dialog" aria-modal="true" aria-label="Avance vente du jour">
      <div class="cat-del-text">Avance ?</div>
      <div class="cat-del-actions">
        <button id="dailySaleAdvanceYes" class="cat-del-btn" type="button" style="color:#2e7bff;">oui</button>
        <button id="dailySaleAdvanceNo"  class="cat-del-btn" type="button" style="color:#2e7bff;">non</button>
      </div>
    </div>
  `;

  bd.addEventListener("click", (e) => {
    if (e.target === bd) closeDailySaleAdvanceModal();
  });

  document.body.appendChild(bd);

  const yes = document.getElementById("dailySaleAdvanceYes");
  const no  = document.getElementById("dailySaleAdvanceNo");

  if (yes) yes.addEventListener("click", () => {
  closeDailySaleAdvanceModal();
  openDailySaleAdvanceEntryModal(); // ✅ OUI => modale Avance
});


if (no) no.addEventListener("click", () => {
  closeDailySaleAdvanceModal();
  openDailySaleModal(); // ✅ c’est "non" qui ouvre "Nouvelle vente"
});

}

// ===============================
// ✅ MODAL "Nouvelle vente" (Vente du jour)
// ===============================
function closeDailySaleModal() {
  const bd = document.getElementById("dailySaleModalBackdrop");
  if (bd) bd.remove();
}

function openDailySaleModal() {
  if (document.getElementById("dailySaleModalBackdrop")) return;

  // draft persistant du jour (optionnel)
  const draft = buy.dailySaleDraftByIso[isoDate] || {
    code: "",
    qty: "", qtyFinalized: false,
    pv:  "", pvFinalized: false,
  };
  buy.dailySaleDraftByIso[isoDate] = draft;

  const bd = document.createElement("div");
  bd.id = "dailySaleModalBackdrop";
  bd.className = "cat-modal-backdrop";

  bd.innerHTML = `
    <div class="cat-modal" role="dialog" aria-modal="true" aria-label="Nouvelle vente"
         style="display:flex; flex-direction:column; max-height: min(78vh, 560px);">
      <div class="cat-modal-title" style="flex:0 0 auto;">Nouvelle vente</div>

      <div style="flex:1 1 auto; overflow:auto; padding-right:6px;">
        <div id="dailySaleModalGrid" class="cat-modal-grid"></div>
      </div>

      <div class="cat-modal-actions" style="flex:0 0 auto; margin-top:10px;">
        <button id="dailySaleCancelBtn" class="modal-btn cancel" type="button">Annuler</button>
        <button id="dailySaleOkBtn" class="modal-btn ok" type="button" disabled>OK</button>
      </div>
    </div>
  `;

  bd.addEventListener("click", (e) => { if (e.target === bd) closeDailySaleModal(); });
  document.body.appendChild(bd);

  function renderSimpleRow({ label, key, finalizedKey, inputId, validateId, modifyId }) {
    const isFinal = !!draft[finalizedKey];

    if (!isFinal) {
      const hasText = String(draft[key] || "").trim().length > 0;
      return `
        <div class="label">${label}</div>
        <div class="art-inline-actions">
          <input id="${inputId}" class="input" inputmode="decimal" autocomplete="off"
            value="${escapeAttr(draft[key] || "")}" />
          <button id="${validateId}" class="art-mini-btn art-mini-validate" type="button"
            ${hasText ? "" : "disabled"}
          >Valider</button>
        </div>
      `;
    }

    return `
      <div class="label">${label}</div>
      <div class="art-inline-actions">
        <div class="card card-white lift" style="flex:1; min-width: 220px;">
          ${escapeHtml(fmtWhite(draft[key] || ""))}
        </div>
        <button id="${modifyId}" class="art-mini-btn art-mini-modify" type="button">Modifier</button>
      </div>
    `;
  }

  function rerenderBody() {
    const grid = document.getElementById("dailySaleModalGrid");
    if (!grid) return;

    grid.innerHTML = `
      <div class="label">Code</div>
      <div>
        <input id="dailySaleCode" class="input" autocomplete="off" value="${escapeAttr(draft.code || "")}" />
        <div id="dailySaleCodeErr" class="cat-err" style="display:none;"></div>
      </div>

      ${renderSimpleRow({ label:"Quantité", key:"qty", finalizedKey:"qtyFinalized", inputId:"dailySaleQty", validateId:"dailySaleQtyValidate", modifyId:"dailySaleQtyModify" })}
      ${renderSimpleRow({ label:"PV",       key:"pv",  finalizedKey:"pvFinalized",  inputId:"dailySalePV",  validateId:"dailySalePVValidate",  modifyId:"dailySalePVModify" })}
    `;

    bindHandlers();
    syncOk();
  }

  function setErr(inputEl, msgEl, msg) {
    if (!inputEl || !msgEl) return;
    if (!msg) {
      inputEl.classList.remove("error");
      msgEl.style.display = "none";
      msgEl.textContent = "";
    } else {
      inputEl.classList.add("error");
      msgEl.style.display = "block";
      msgEl.textContent = msg;
    }
  }

  function syncOk() {
    const okBtn = document.getElementById("dailySaleOkBtn");
    const codeEl = document.getElementById("dailySaleCode");
    const errEl  = document.getElementById("dailySaleCodeErr");
    if (!okBtn) return;

    const code = String(draft.code || "").trim();
    const hasCode = code.length > 0;

    // article doit exister
    const art = hasCode ? (buy.articles || []).find(a => !a.deletedAtIso && normSearch(a.code) === normSearch(code)) : null;
    setErr(codeEl, errEl, (hasCode && !art) ? "code introuvable" : "");

    const ok =
      !!art &&
      !!draft.qtyFinalized &&
      !!draft.pvFinalized;

    okBtn.disabled = !ok;
    okBtn.classList.toggle("enabled", ok);
  }

  function bindOneSimple({ key, finalizedKey, inputId, validateId, modifyId }) {
    const input = document.getElementById(inputId);
    const vBtn = document.getElementById(validateId);
    const mBtn = document.getElementById(modifyId);

    if (input) {
      input.addEventListener("input", async () => {
        const filtered = digitsCommaOnly(input.value);
        if (filtered !== input.value) {
          input.value = filtered;
          if (typeof shake === "function") shake(input);
        }

        // réactivité immédiate
        if (vBtn) {
          const hasTextNow = filtered.trim().length > 0;
          vBtn.disabled = !hasTextNow;
          vBtn.classList.toggle("started", hasTextNow);
        }

        draft[key] = filtered;
        draft[finalizedKey] = false;

        // effacement total => suppression
        if (filtered.trim() === "") {
          draft[key] = "";
          draft[finalizedKey] = false;
        }

        await safePersistNow();
        syncOk();
      });

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (vBtn && !vBtn.disabled) vBtn.click();
        }
      });
    }

    if (vBtn) {
      vBtn.addEventListener("click", async () => {
        const v = String(draft[key] || "").trim();
        if (!v) {
          if (typeof shake === "function") shake(vBtn);
          return;
        }
        draft[finalizedKey] = true;
        await safePersistNow();
        rerenderBody();
      });
    }

    if (mBtn) {
      mBtn.addEventListener("click", async () => {
        draft[finalizedKey] = false;
        await safePersistNow();
        rerenderBody();
        setTimeout(() => {
          const i = document.getElementById(inputId);
          if (i) i.focus();
        }, 0);
      });
    }
  }

  function bindHandlers() {
    const codeEl = document.getElementById("dailySaleCode");
    if (codeEl) {
      codeEl.addEventListener("input", async () => {
  draft.code = codeEl.value;

  // ✅ si code correspond à un article et que PV n'a pas encore été touché, on pré-remplit
  const code = String(draft.code || "").trim();
  const art = code
    ? (buy.articles || []).find(a => !a.deletedAtIso && normSearch(a.code) === normSearch(code))
    : null;

  if (art && !draft.pvFinalized) {
  const artPv = String(art.pv || "").trim();

  // ✅ tant que PV pas validé, on force le PV de l’article lié au code
  draft.pv = artPv || "";

  const pvInput = document.getElementById("dailySalePV");
  if (pvInput) pvInput.value = draft.pv;

  const pvVal = document.getElementById("dailySalePVValidate");
  if (pvVal) {
    const has = String(draft.pv || "").trim().length > 0;
    pvVal.disabled = !has;
    pvVal.classList.toggle("started", has);
  }
}


  await safePersistNow();
  syncOk();
});

    }

    bindOneSimple({ key:"qty", finalizedKey:"qtyFinalized", inputId:"dailySaleQty", validateId:"dailySaleQtyValidate", modifyId:"dailySaleQtyModify" });
    bindOneSimple({ key:"pv",  finalizedKey:"pvFinalized",  inputId:"dailySalePV",  validateId:"dailySalePVValidate",  modifyId:"dailySalePVModify" });

    const cancelBtn = document.getElementById("dailySaleCancelBtn");
if (cancelBtn) {
  cancelBtn.onclick = async () => {
    delete buy.dailySaleDraftByIso[isoDate];
    await safePersistNow();
    closeDailySaleModal();
  };
}

const okBtn = document.getElementById("dailySaleOkBtn");
if (okBtn) {
  okBtn.onclick = async () => {
    syncOk();
    if (okBtn.disabled) return;

    const code = String(draft.code || "").trim();
    const qty  = String(draft.qty || "").trim();
    const pv   = String(draft.pv  || "").trim();

    const sale = {
      id: "sale_" + Math.random().toString(16).slice(2) + Date.now().toString(16),
      code,
      qty,
      pv,
      ts: Date.now(),
    };
    getSalesOfDay(isoDate).push(sale);

    delete buy.dailySaleDraftByIso[isoDate];

    await safePersistNow();
    closeDailySaleModal();

    renderDailySaleRecap();
    renderDailySaleGlobals();
  };
}

  }

  rerenderBody();

  const first = document.getElementById("dailySaleCode");
  if (first) first.focus();
}

// ===============================
// ✅ MODAL "Avance" (Vente du jour)
// ===============================

// draft persistant "Avance" du jour
buy.dailyAdvanceDraftByIso = buy.dailyAdvanceDraftByIso || {};

function closeDailySaleAdvanceEntryModal() {
  const bd = document.getElementById("dailyAdvanceModalBackdrop");
  if (bd) bd.remove();
}

// ✅ lettre suivante (A,B,C,...) en tenant compte des provisoires "inexistants" (fermés avant aujourd’hui)
function nextProvLetterForCode(originCode) {
  const oc = normSearch(String(originCode || ""));
  let maxIdx = -1;

  for (const k in (buy.provByCode || {})) {
    const rec = buy.provByCode[k];
    if (!rec) continue;
    if (normSearch(rec.originCode) !== oc) continue;

    // ✅ actif AUJOURD’HUI = non fermé, ou fermé aujourd’hui (encore valable aujourd’hui)
    const closed = rec.closedAtIso ? isoToDayTs(rec.closedAtIso) : NaN;
    const today = isoToDayTs(isoDate);

    const isActiveToday = !Number.isFinite(closed) || closed >= today;
    if (!isActiveToday) continue; // ✅ fermé avant aujourd’hui => lettre réutilisable

    const provCode = String(rec.provCode || "").trim();
    const m = provCode.match(/^([A-Z])\s+/i);
    if (!m) continue;

    const idx = m[1].toUpperCase().charCodeAt(0) - 65;
    if (idx > maxIdx) maxIdx = idx;
  }

  const next = Math.min(maxIdx + 1, 25);
  return String.fromCharCode(65 + next);
}


function openDailySaleAdvanceEntryModal() {
  if (document.getElementById("dailyAdvanceModalBackdrop")) return;

  const draft = buy.dailyAdvanceDraftByIso[isoDate] || {
  code: "", codeFinalized: false,

  // ✅ nouveau : mode provisoire
  isProv: false,
  provCode: "",
  originCode: "",
  rapCurrent: null,     // RAP affiché (du jour)
  rapNew: null,         // Nouv RAP = RAP - avance (preview)

  pv: "",   pvFinalized: false,
  avance: "", avanceFinalized: false,
};

  buy.dailyAdvanceDraftByIso[isoDate] = draft;

  const bd = document.createElement("div");
  bd.id = "dailyAdvanceModalBackdrop";
  bd.className = "cat-modal-backdrop";

  bd.innerHTML = `
    <div class="cat-modal" role="dialog" aria-modal="true" aria-label="Avance"
         style="display:flex; flex-direction:column; max-height: min(78vh, 560px);">
      <div class="cat-modal-title" style="flex:0 0 auto; text-align:center;">Avance</div>

      <div style="flex:1 1 auto; overflow:auto; padding-right:6px;">
        <div id="dailyAdvanceModalGrid" class="cat-modal-grid"></div>
      </div>

      <div class="cat-modal-actions" style="flex:0 0 auto; margin-top:10px;">
        <button id="dailyAdvanceCancelBtn" class="modal-btn cancel" type="button">Annuler</button>
        <button id="dailyAdvanceOkBtn" class="modal-btn ok" type="button" disabled>OK</button>
      </div>
    </div>
  `;

  bd.addEventListener("click", (e) => { if (e.target === bd) closeDailySaleAdvanceEntryModal(); });
  document.body.appendChild(bd);

  function setErr(inputEl, msgEl, msg) {
    if (!inputEl || !msgEl) return;
    if (!msg) {
      inputEl.classList.remove("error");
      msgEl.style.display = "none";
      msgEl.textContent = "";
    } else {
      inputEl.classList.add("error");
      msgEl.style.display = "block";
      msgEl.textContent = msg;
    }
  }

  // ✅ [AJOUT] carte affichage TEXTE (ne PAS appliquer fmtWhite)
function renderValidatedTextCard(value) {
  return `<div class="card card-white lift" style="flex:1; min-width:220px;">${escapeHtml(String(value || ""))}</div>`;
}

// ✅ carte affichage "num" (avec format milliers si possible)
function renderValidatedCard(value) {
  const s = String(value ?? "").trim();
  if (!s) {
    return `<div class="card card-white lift" style="flex:1; min-width:220px;"></div>`;
  }

  // on tente de formater en milliers si c'est un nombre
  const n = parseLooseNumber(s);
  const formatted = Number.isFinite(n)
    ? fmtResult(n) // ✅ ton fmtResult applique déjà milliers (via formatInputNumberDisplay si dispo)
    : escapeHtml(s);

  return `<div class="card card-white lift" style="flex:1; min-width:220px;">${formatted}</div>`;
}



  function renderRowWithValidate({ label, key, finalizedKey, inputId, validateId, modifyId, inputmode = "text", filterFn = null }) {
    const isFinal = !!draft[finalizedKey];

    if (!isFinal) {
      const hasText = String(draft[key] || "").trim().length > 0;
      return `
        <div class="label">${label}</div>
        <div class="art-inline-actions">
          <input id="${inputId}" class="input" inputmode="${inputmode}" autocomplete="off"
            value="${escapeAttr(draft[key] || "")}" />
          <button id="${validateId}" class="art-mini-btn art-mini-validate" type="button" ${hasText ? "" : "disabled"}>Valider</button>
        </div>
      `;
    }

    return `
      <div class="label">${label}</div>
      <div class="art-inline-actions">
        ${renderValidatedCard(draft[key] || "")}
        <button id="${modifyId}" class="art-mini-btn art-mini-modify" type="button">Modifier</button>
      </div>
    `;
  }

  function computeProvCodeIfAny() {
    const code = String(draft.code || "").trim();
    const art = code ? (buy.articles || []).find(a => !a.deletedAtIso && normSearch(a.code) === normSearch(code)) : null;

    if (!draft.codeFinalized) return "";
    if (!art) return "";
    if (!code) return "";

    const letter = nextProvLetterForCode(code);
    return `${letter} ${code}`;
  }

  function computeRapIfAny() {
  // ✅ IMPORTANT : en mode provisoire, on n'affiche JAMAIS "RAP = PV - Avance"
  // (seul "Nouv RAP = RAP - Avance" est autorisé)
  if (draft.isProv) return "";

  if (!draft.pvFinalized || !draft.avanceFinalized) return "";
  const pvN = parseLooseNumber(draft.pv);
  const avN = parseLooseNumber(draft.avance);
  if (!Number.isFinite(pvN) || !Number.isFinite(avN)) return "";
  return fmtResult(pvN - avN);
}


  function syncOk() {
  const okBtn = document.getElementById("dailyAdvanceOkBtn");
  const codeEl = document.getElementById("dailyAdvanceCode");
  const errEl  = document.getElementById("dailyAdvanceCodeErr");
  if (!okBtn) return;

  const typed = String(draft.code || "").trim();
  const hasTyped = typed.length > 0;

  const art = hasTyped
    ? (buy.articles || []).find(a => !a.deletedAtIso && normSearch(a.code) === normSearch(typed))
    : null;

  const provKey = normProvCode(typed);
  const rec = findProvRecord(provKey);
  const provOk = !!(rec && isProvActiveOnDay(provKey, isoDate));

  // erreur si ni provisoire ni article
  setErr(codeEl, errEl, (hasTyped && !art && !provOk) ? "code introuvable" : "");

  const ok =
    !!draft.codeFinalized &&
    !!draft.avanceFinalized &&
    (draft.isProv ? provOk : !!art) &&
    (draft.isProv ? true : !!draft.pvFinalized);

  okBtn.disabled = !ok;
  okBtn.classList.toggle("enabled", ok);
}


  function rerenderBody() {
    const grid = document.getElementById("dailyAdvanceModalGrid");
    if (!grid) return;

    // code provisoire (si code validé + existant)
    const prov = computeProvCodeIfAny();
    const showProv = !!prov;

    // RAP (si pv+avance validés)
    const rap = computeRapIfAny();
    const showRap = !!rap;

    // ✅ preview Nouv RAP (uniquement mode provisoire)
draft.rapNew = null;
if (draft.isProv && draft.avanceFinalized && Number.isFinite(draft.rapCurrent)) {
  const aN = parseLooseNumber(draft.avance);
  if (Number.isFinite(aN)) {
    let nn = draft.rapCurrent - aN;
    if (nn < 0) nn = 0;
    if (Object.is(nn, -0)) nn = 0;
    draft.rapNew = nn;
  }
}


    grid.innerHTML = `
      ${renderRowWithValidate({
        label:"Code",
        key:"code",
        finalizedKey:"codeFinalized",
        inputId:"dailyAdvanceCode",
        validateId:"dailyAdvanceCodeValidate",
        modifyId:"dailyAdvanceCodeModify",
        inputmode:"text"
      })}
      <div id="dailyAdvanceCodeErr" class="cat-err" style="display:none;"></div>

      ${
        showProv
          ? `
            <div class="label">Code provisoire</div>
            <div class="art-inline-actions">
              ${renderValidatedTextCard(prov)}
            </div>
          `
          : ``
      }

      ${
  draft.isProv
    ? (() => {
        const provKey = (draft.provCode || draft.code);
const payList = listPaymentsForProvUpToDay(provKey, isoDate);
const payTotal = paymentsTotal(payList);

const payStackHtml = payList.length
  ? payList.map(p => `
      <div style="display:flex; align-items:center; gap:10px;">
        ${renderValidatedCard(fmtResult(p.amount))}
        <div style="opacity:.9; font-weight:900; white-space:nowrap;">(${escapeHtml(isoToFr(p.dayIso))})</div>
      </div>
    `).join(`<div style="height:8px;"></div>`)
  : `<div style="opacity:.75; font-weight:800;">Aucun paiement</div>`;

const payTotalHtml = renderValidatedCard(`Total : ${fmtResult(payTotal)}`);


        const rapDisp = Number.isFinite(draft.rapCurrent) ? fmtResult(draft.rapCurrent) : "";

        return `
          <div class="label">PV</div>
          <div class="art-inline-actions">
            ${renderValidatedCard(draft.pv || "")}
          </div>

          <div class="label">Payé</div>
<div class="art-inline-actions" style="display:block;">
  <div style="display:flex; flex-direction:column; gap:8px; width:100%;">
    ${payStackHtml}
    <div style="height:8px;"></div>
    ${payTotalHtml}
  </div>
</div>


          <div class="label">RAP</div>
          <div class="art-inline-actions">
            ${renderValidatedCard(rapDisp)}
          </div>
        `;
      })()
    : `
      ${renderRowWithValidate({
        label:"PV",
        key:"pv",
        finalizedKey:"pvFinalized",
        inputId:"dailyAdvancePV",
        validateId:"dailyAdvancePVValidate",
        modifyId:"dailyAdvancePVModify",
        inputmode:"decimal"
      })}
    `
}



      ${renderRowWithValidate({
        label:"Avance",
        key:"avance",
        finalizedKey:"avanceFinalized",
        inputId:"dailyAdvanceAvance",
        validateId:"dailyAdvanceAvanceValidate",
        modifyId:"dailyAdvanceAvanceModify",
        inputmode:"decimal"
      })}

      ${
  (draft.isProv && draft.avanceFinalized && draft.rapNew !== null)
    ? `
      <div class="label">Nouv RAP</div>
      <div class="art-inline-actions">
        ${renderValidatedCard(draft.rapNew)}
      </div>
    `
    : ``
}


      ${
        showRap
          ? `
            <div class="label">RAP</div>
            <div class="art-inline-actions">
              ${renderValidatedCard(rap)}
            </div>
          `
          : ``
      }
    `;

    bindHandlers();
    syncOk();
  }

  function bindSimpleNumber({ key, finalizedKey, inputId, validateId, modifyId }) {
    const input = document.getElementById(inputId);
    const vBtn  = document.getElementById(validateId);
    const mBtn  = document.getElementById(modifyId);

    if (input) {
      input.addEventListener("input", async () => {
        const filtered = digitsCommaOnly(input.value); // ✅ autorise espaces
        if (filtered !== input.value) {
          input.value = filtered;
          if (typeof shake === "function") shake(input);
        }

        if (vBtn) {
          const has = filtered.trim().length > 0;
          vBtn.disabled = !has;
          vBtn.classList.toggle("started", has);
        }

        draft[key] = filtered;
        draft[finalizedKey] = false;

        // effacement total => suppression
        if (filtered.trim() === "") {
          draft[key] = "";
          draft[finalizedKey] = false;
        }

        await safePersistNow();
        syncOk();
      });

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (vBtn && !vBtn.disabled) vBtn.click();
        }
      });
    }

    if (vBtn) {
      vBtn.addEventListener("click", async () => {
        const v = String(draft[key] || "").trim();
        if (!v) {
          if (typeof shake === "function") shake(vBtn);
          return;
        }
        draft[finalizedKey] = true;
        await safePersistNow();
        rerenderBody();
      });
    }

    if (mBtn) {
      mBtn.addEventListener("click", async () => {
        draft[finalizedKey] = false;
        await safePersistNow();
        rerenderBody();
        setTimeout(() => {
          const i = document.getElementById(inputId);
          if (i) i.focus();
        }, 0);
      });
    }
  }

  function bindCodeRow() {
    const input = document.getElementById("dailyAdvanceCode");
    const vBtn  = document.getElementById("dailyAdvanceCodeValidate");
    const mBtn  = document.getElementById("dailyAdvanceCodeModify");

    if (input) {
      input.addEventListener("input", async () => {
        // ✅ on laisse les espaces (pas de filtre destructeur)
        draft.code = input.value;

        // ✅ détecter si le code tapé est un code provisoire ACTIF ce jour
const typed = String(draft.code || "").trim();
const provKey = normProvCode(typed);
const rec = findProvRecord(provKey);
const provOk = !!(rec && isProvActiveOnDay(provKey, isoDate));

if (provOk) {
  draft.isProv = true;
  draft.provCode = rec.provCode || typed;
  draft.originCode = rec.originCode || "";

  // PV snapshot (non modifiable en mode provisoire)
  draft.pv = String(rec.pvSnap ?? "").trim();
  draft.pvFinalized = true;

  // RAP figé pour ce jour
  const rap = rapForProvOnDay(provKey, isoDate);
  draft.rapCurrent = Number.isFinite(rap) ? rap : null;

} else {
  // mode normal
  draft.isProv = false;
  draft.provCode = "";
  draft.originCode = "";
  draft.rapCurrent = null;
  draft.rapNew = null;
}


        // ✅ si l'utilisateur vide => fait disparaître "code provisoire"
        if (String(draft.code || "").trim() === "") {
          draft.code = "";
          draft.codeFinalized = false;
        } else {
          draft.codeFinalized = false;
        }

        // ✅ pré-remplissage PV si code correspond à un article et PV pas encore validé
        const code = String(draft.code || "").trim();
        const art = code
          ? (buy.articles || []).find(a => !a.deletedAtIso && normSearch(a.code) === normSearch(code))
          : null;

        if (art && !draft.pvFinalized) {
          const artPv = String(art.pv || "").trim();
          draft.pv = artPv || "";

          const pvInput = document.getElementById("dailyAdvancePV");
          if (pvInput) pvInput.value = draft.pv;

          const pvVal = document.getElementById("dailyAdvancePVValidate");
          if (pvVal) {
            const has = String(draft.pv || "").trim().length > 0;
            pvVal.disabled = !has;
            pvVal.classList.toggle("started", has);
          }
        }

        // bouton valider code : actif si texte non vide
        if (vBtn) {
          const has = String(draft.code || "").trim().length > 0;
          vBtn.disabled = !has;
          vBtn.classList.toggle("started", has);
        }

        await safePersistNow();
        syncOk();
      });

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (vBtn && !vBtn.disabled) vBtn.click();
        }
      });
    }

    if (vBtn) {
  vBtn.addEventListener("click", async () => {
    const code = String(draft.code || "").trim();
    if (!code) {
      if (typeof shake === "function") shake(vBtn);
      return;
    }

    const provKey = normProvCode(code);
    const rec = findProvRecord(provKey);
    const provOk = !!(rec && isProvActiveOnDay(provKey, isoDate));

    const art = (buy.articles || []).find(a => !a.deletedAtIso && normSearch(a.code) === normSearch(code));

    if (!provOk && !art) {
      if (typeof shake === "function") shake(vBtn);
      syncOk();
      return;
    }

    draft.codeFinalized = true;
    await safePersistNow();
    rerenderBody();
  });
}


    if (mBtn) {
      mBtn.addEventListener("click", async () => {
        draft.codeFinalized = false;
        await safePersistNow();
        rerenderBody();
        setTimeout(() => {
          const i = document.getElementById("dailyAdvanceCode");
          if (i) i.focus();
        }, 0);
      });
    }
  }

  function bindHandlers() {
    bindCodeRow();
    bindSimpleNumber({ key:"pv",     finalizedKey:"pvFinalized",     inputId:"dailyAdvancePV",     validateId:"dailyAdvancePVValidate",     modifyId:"dailyAdvancePVModify" });
    bindSimpleNumber({ key:"avance", finalizedKey:"avanceFinalized", inputId:"dailyAdvanceAvance", validateId:"dailyAdvanceAvanceValidate", modifyId:"dailyAdvanceAvanceModify" });

    const cancelBtn = document.getElementById("dailyAdvanceCancelBtn");
    if (cancelBtn) {
      cancelBtn.onclick = async () => {
        delete buy.dailyAdvanceDraftByIso[isoDate];
        await safePersistNow();
        closeDailySaleAdvanceEntryModal();
      };
    }

    const okBtn = document.getElementById("dailyAdvanceOkBtn");
    if (okBtn) {
      okBtn.onclick = async () => {
        syncOk();
        if (okBtn.disabled) return;

        const typed = String(draft.code || "").trim();
const avance = String(draft.avance || "").trim();

const aN = parseLooseNumber(avance);
if (!Number.isFinite(aN)) return;

if (draft.isProv) {
  // ✅ paiement sur provisoire : PVT = avance, PRT inchangé (qty=0)
  const provKey = normProvCode(typed);
  const rec = findProvRecord(provKey);
  if (!rec || !isProvActiveOnDay(provKey, isoDate)) return;

  const rapCur = rapForProvOnDay(provKey, isoDate);
  if (!Number.isFinite(rapCur)) return;

  let rapNew = rapCur - aN;
  if (rapNew < 0) rapNew = 0;
  if (Object.is(rapNew, -0)) rapNew = 0;

  // stocker RAP figé du jour + fermer si 0
  setRapForProvOnDay(provKey, isoDate, rapNew);

  const sale = {
    id: "sale_" + Math.random().toString(16).slice(2) + Date.now().toString(16),
    type: "advance",
    subType: "rapPay",
    code: rec.originCode,        // article réel
    qty: "0",                    // ✅ NE TOUCHE PAS PRT/VENDU
    pv: String(rec.pvSnap ?? ""),
    avance,
    provCode: rec.provCode,
    ts: Date.now(),
  };

  getSalesOfDay(isoDate).push(sale);

} else {
  // ✅ 1ère avance : création d’un provisoire
  const art = (buy.articles || []).find(a => !a.deletedAtIso && normSearch(a.code) === normSearch(typed));
  if (!art) return;

  const pv = String(draft.pv || "").trim();
  const pvN = parseLooseNumber(pv);
  if (!Number.isFinite(pvN)) return;

  let rap0 = pvN - aN;
  if (rap0 < 0) rap0 = 0;
  if (Object.is(rap0, -0)) rap0 = 0;

  const letter = nextProvLetterForCode(typed);
  const provCode = `${letter} ${typed}`;

  // ✅ créer dossier provisoire (snapshot + rapByIso)
  buy.provByCode[normProvCode(provCode)] = {
    provCode,
    originCode: typed,
    articleNameSnap: art.name || "",
    pvSnap: pvN,
    createdAtIso: isoDate,
    createdAtTs: Date.now(),
    closedAtIso: null,
    rapByIso: { [isoDate]: rap0 }
  };

  const sale = {
    id: "sale_" + Math.random().toString(16).slice(2) + Date.now().toString(16),
    type: "advance",
    subType: "createProv",
    code: typed,
    qty: "1",     // ✅ première avance = vendu +1 (PRT pris en compte)
    pv,
    avance,
    provLetter: letter,
    provCode,
    ts: Date.now(),
  };

  getSalesOfDay(isoDate).push(sale);
}


        delete buy.dailyAdvanceDraftByIso[isoDate];

        await safePersistNow();
        closeDailySaleAdvanceEntryModal();

        renderDailySaleRecap();
        renderDailySaleGlobals();
      };
    }
  }

  rerenderBody();

  const first = document.getElementById("dailyAdvanceCode");
  if (first) first.focus();
}








  bindPrevNextDayButtons(isoDate, { baseHashPrefix: "#daily/" });

  // ✅ on force la route /sale
  const prev = document.getElementById("prevDay");
  const next = document.getElementById("nextDay");
  if (prev) prev.onclick = () => navigateTo(`#daily/${addDaysIso(isoDate,-1)}/sale`);
  if (next && !next.disabled) next.onclick = () => navigateTo(`#daily/${addDaysIso(isoDate,+1)}/sale`);


  document.getElementById("back").addEventListener("click", () => smartBack());


  const hb = document.getElementById("homeBtn");
  if (hb) hb.addEventListener("click", () => navigateTo("#"));

  const cb = document.getElementById("calBtn");
  if (cb) cb.addEventListener("click", () => navigateTo("#daily"));

  const addSaleBtn = document.getElementById("addDailySaleBtn");
if (addSaleBtn) addSaleBtn.addEventListener("click", () => openDailySaleAdvanceModal());



}
// ===============================
// ✅ FIN — renderDailySalePage(isoDate)
// ===============================

// ===============================
// ✅ DÉBUT — BUY : Catégories (COMPLET)
// ===============================
function renderBuyCategoriesPage(isoDate) {
  const date = fromISODate(isoDate);
  const buy = getBuyStore();
  ensureBuyDayMark(isoDate);

  // catégories actives = pas supprimées
  function activeCategories() {
    return (buy.categories || []).filter(c => !c.deletedAtIso);
  }

  // catégories visibles ce jour:
  // - visibles si createdAtIso <= isoDate
  // - et pas supprimées (deletedAtIso null)
  function visibleNormalCategories() {
    return activeCategories()
      .filter(c => String(c.createdAtIso || "") < String(isoDate))
      .sort((a,b) => codeCompare(a.code, b.code));
  }

  // Ajoutées récemment = créées AUJOURD’HUI, ordre “plus récent d’abord”
  function recentAdded() {
    return activeCategories()
      .filter(c => String(c.createdAtIso || "") === String(isoDate))
      .sort((a,b) => (b.createdAtTs || 0) - (a.createdAtTs || 0));
  }

  // Supprimées récemment = supprimées AUJOURD’HUI mais créées AVANT aujourd’hui
  function recentDeleted() {
    return (buy.categories || [])
      .filter(c => String(c.deletedAtIso || "") === String(isoDate) && String(c.createdAtIso || "") !== String(isoDate))
      .sort((a,b) => (b.deletedAtTs || 0) - (a.deletedAtTs || 0));
  }

  function isoToDayTs(iso) {
  const s = String(iso || "").trim();
  // attend YYYY-MM-DD
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return NaN;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  // timestamp UTC du "jour"
  return Date.UTC(y, mo - 1, d);
}

function isNameTaken(name, exceptId = null) {
  const n = normSearch(name);
  const curTs = isoToDayTs(isoDate);

  return activeArticles().some(a => {
    if (a.id === exceptId) return false;
    const aTs = isoToDayTs(a.createdAtIso);
    if (!Number.isFinite(aTs) || !Number.isFinite(curTs)) return false;

    // ✅ interdit doublon si article créé AVANT ou le MÊME jour
    return aTs <= curTs && normSearch(a.name) === n;
  });
}

function findCodeOwner(code, exceptId = null) {
  const c0 = normSearch(code);
  const curTs = isoToDayTs(isoDate);

  return activeArticles().find(a => {
    if (a.id === exceptId) return false;
    const aTs = isoToDayTs(a.createdAtIso);
    if (!Number.isFinite(aTs) || !Number.isFinite(curTs)) return false;

    // ✅ propriétaire déjà existant AVANT ou le MÊME jour
    return aTs <= curTs && normSearch(a.code) === c0;
  }) || null;
}



  function markBuyTouchedAndPersist() {
    const d = ensureBuyDayMark(isoDate);
    d.buyCatTouched = true;
    safePersistNow();
  }

  // ----------- UI helpers
  function cardHTML(cat) {
    const id = cat.id;
    return `
      <div class="buy-cat-card" data-cat-id="${escapeAttr(id)}">
        <div class="buy-cat-body">
          <div class="buy-cat-col">
            <div class="buy-cat-label">Nom</div>
            <div class="buy-cat-white">${escapeHtml(cat.name || "")}</div>
          </div>

          <div class="buy-cat-col">
            <div class="buy-cat-label">Code</div>
            <div class="buy-cat-white">${escapeHtml(cat.code || "")}</div>
          </div>
        </div>

        <div class="buy-cat-actions">
          <button class="buy-cat-iconbtn" data-cat-edit="${escapeAttr(id)}" title="Modifier" aria-label="Modifier">
            <!-- crayon simplifié -->
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
            </svg>
          </button>

          <button class="buy-cat-iconbtn" data-cat-del="${escapeAttr(id)}" title="Supprimer" aria-label="Supprimer">
            <!-- poubelle simplifiée -->
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"></path>
              <path d="M8 6V4h8v2"></path>
              <path d="M6 6l1 16h10l1-16"></path>
              <path d="M10 11v6"></path>
              <path d="M14 11v6"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  const added = recentAdded();
  const deleted = recentDeleted();
  const normal = visibleNormalCategories();

  app.innerHTML = `
    <div class="page">
      <div class="topbar">
        <div class="slot left">
          <button id="homeBtn" class="icon-btn" title="Accueil" aria-label="Accueil">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 10.5L12 3l9 7.5" />
              <path d="M5 10v10h14V10" />
            </svg>
          </button>
        </div>

        <div class="slot center">
          <button id="back" class="back-btn">← Retour</button>
        </div>

        <div class="slot right">
          <button id="calBtn" class="icon-btn" title="Calendrier" aria-label="Calendrier">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M7 3v3M17 3v3" />
              <path d="M3.5 8h17" />
              <path d="M5 6h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
            </svg>
          </button>
        </div>
      </div>

      <div class="day-page">
        ${dayHeaderHTML(formatFullDate(date), { withPrevNext: true })}

        <div class="buy-categories-wrap">

          <!-- ✅ Barre de recherche + suggestions dynamiques -->
          <div class="op-search-wrap" style="margin-top:0;">
            <span class="op-search-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="7"></circle>
                <path d="M20 20l-3.5-3.5"></path>
              </svg>
            </span>

            <input id="buyCatSearch" class="input op-search"
              inputmode="text"
              autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
              placeholder="Rechercher une catégorie (nom ou code)..." />

            <div id="buyCatSuggest" class="op-suggest" style="display:none;"></div>
          </div>

          <!-- ✅ Bouton carré + -->
          <button id="addCatBtn" class="add-cat-btn" type="button" aria-label="Ajouter une catégorie" title="Ajouter">
            <span>+</span>
          </button>

          <!-- ✅ LISTE -->
          <div id="buyCatList" class="buy-cat-list">

            ${
              added.length
                ? `
                  <div class="buy-cat-section-title">Ajoutées récemment</div>
                  ${added.map(cardHTML).join("")}
                `
                : ``
            }

            ${
              (added.length && deleted.length) || (added.length && normal.length) || (deleted.length && (added.length || normal.length))
                ? `<div class="buy-cat-sep spaced"><span></span></div>`
                : ``
            }

            ${
              deleted.length
                ? `
                  <div class="buy-cat-section-title">Supprimées récemment</div>
                  ${deleted.map(c => `
                    <div class="buy-cat-card buy-cat-card-deleted" data-cat-id="${escapeAttr(c.id)}">
                      <div class="buy-cat-body">
                        <div class="buy-cat-col">
                          <div class="buy-cat-label">Nom</div>
                          <div class="buy-cat-white">${escapeHtml(c.name || "")}</div>
                        </div>
                        <div class="buy-cat-col">
                          <div class="buy-cat-label">Code</div>
                          <div class="buy-cat-white">${escapeHtml(c.code || "")}</div>
                        </div>
                      </div>
                    </div>
                  `).join("")}
                `
                : ``
            }

            ${
              (deleted.length && normal.length)
                ? `<div class="buy-cat-sep spaced"><span></span></div>`
                : ``
            }

            ${normal.map(cardHTML).join("")}

            ${
              (!added.length && !deleted.length && !normal.length)
                ? `<div style="opacity:.75; font-weight:800; margin-top:10px;">Aucune catégorie</div>`
                : ``
            }
          </div>
        </div>
      </div>
    </div>
  `;

  // flèches => restent sur /categories
  bindPrevNextDayButtons(isoDate, { baseHashPrefix: "#buy/" });
  const prev = document.getElementById("prevDay");
  const next = document.getElementById("nextDay");
  if (prev) prev.onclick = () => navigateTo(`#buy/${addDaysIso(isoDate,-1)}/categories`);
  if (next && !next.disabled) next.onclick = () => navigateTo(`#buy/${addDaysIso(isoDate,+1)}/categories`);

  const hb = document.getElementById("homeBtn");
  if (hb) hb.addEventListener("click", () => navigateTo("#"));

  const cb = document.getElementById("calBtn");
  if (cb) cb.addEventListener("click", () => navigateTo("#buy"));

  const backBtn = document.getElementById("back");
  if (backBtn) backBtn.addEventListener("click", () => smartBack());

  // =========================
  // ✅ MODAL AJOUT / MODIF
  // =========================
  function closeCatModal() {
    const bd = document.getElementById("catModalBackdrop");
    if (bd) bd.remove();
  }

  

  function openCatModal({ mode = "create", catId = null } = {}) {
    if (document.getElementById("catModalBackdrop")) return;

    const existing = catId ? (buy.categories || []).find(c => c.id === catId) : null;
    const initialName = existing?.name || "";
    const initialCode = existing?.code || "";

    const bd = document.createElement("div");
    bd.id = "catModalBackdrop";
    bd.className = "cat-modal-backdrop";

    bd.innerHTML = `
      <div class="cat-modal" role="dialog" aria-modal="true" aria-label="Catégorie">
        ${mode === "create" ? `<div class="cat-modal-title">Nouvelle catégorie</div>` : ``}

        <div class="cat-modal-grid">
          <div class="label">Nom</div>
          <div>
            <input id="catName" class="input" placeholder="(ex: Boissons)" autocomplete="off" value="${escapeAttr(initialName)}"/>
            <div id="catNameErr" class="cat-err" style="display:none;"></div>
          </div>

          <div class="label">Code</div>
          <div>
            <input id="catCode" class="input" placeholder="(ex: 1)" autocomplete="off" value="${escapeAttr(initialCode)}"/>
            <div id="catCodeErr" class="cat-err" style="display:none;"></div>
          </div>
        </div>

        <div class="cat-modal-actions">
          <button id="catCancelBtn" class="modal-btn cancel" type="button">Annuler</button>
          <button id="catOkBtn" class="modal-btn ok" type="button" disabled>OK</button>
        </div>
      </div>
    `;

    bd.addEventListener("click", (e) => {
      if (e.target === bd) closeCatModal();
    });

    document.body.appendChild(bd);

    const nameEl = document.getElementById("catName");
    const codeEl = document.getElementById("catCode");
    const nameErr = document.getElementById("catNameErr");
    const codeErr = document.getElementById("catCodeErr");
    const okBtn = document.getElementById("catOkBtn");
    const cancelBtn = document.getElementById("catCancelBtn");



    function setErr(elInput, elMsg, msg) {
  if (!elInput || !elMsg) return;
  if (!msg) {
    elInput.classList.remove("error");
    elMsg.style.display = "none";
    elMsg.textContent = "";
  } else {
    elInput.classList.add("error");
    elMsg.style.display = "";
    elMsg.textContent = msg;
  }
}

function syncOkState() {
  const { nameEl, codeEl, nameErr, codeErr, okBtn } = getArtEls();
  if (!nameEl || !codeEl || !okBtn) return;

  const name = (nameEl.value || "").trim();
  const code = (codeEl.value || "").trim();

  // ✅ conditions de base (texte)
  let ok =
    name.length > 0 &&
    code.length > 0 &&
    allFieldsValidated();

  // ✅ doublons (uniquement visibles après clic sur OK)
  const nameTaken = name ? isNameTaken(name, existing?.id || null) : false;
  const codeOwner = code ? findCodeOwner(code, existing?.id || null) : null;

  if (showUniqErrors) {
    setErr(nameEl, nameErr, nameTaken ? "nom déjà attribué" : "");
    setErr(codeEl, codeErr, codeOwner ? `code déjà attribué : ${codeOwner.name || ""}` : "");
  } else {
    setErr(nameEl, nameErr, "");
    setErr(codeEl, codeErr, "");
  }

  if (nameTaken || codeOwner) ok = false;

  okBtn.disabled = !ok;
  okBtn.classList.toggle("enabled", ok);
}


    if (nameEl) nameEl.addEventListener("input", syncOkState);
    if (codeEl) codeEl.addEventListener("input", syncOkState);
    if (cancelBtn) cancelBtn.addEventListener("click", closeCatModal);

    if (okBtn) {
      okBtn.addEventListener("click", async () => {
        const name = (nameEl.value || "").trim();
        const code = (codeEl.value || "").trim();

        // re-check
        if (!name || !code) return;

        const nameTaken = isNameTaken(name, existing?.id || null);
        const codeOwner = findCodeOwner(code, existing?.id || null);
        if (nameTaken || codeOwner) {
          syncOkState();
          return;
        }

        // ✅ CREATE
        if (mode === "create") {
          const id = "cat_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
          buy.categories.unshift({
            id,
            name,
            code,
            createdAtIso: isoDate,
            createdAtTs: Date.now(),
            updatedAtTs: Date.now(),
            deletedAtIso: null,
            deletedAtTs: null,
          });

          // ✅ cercle vert ce jour + DB
          markBuyTouchedAndPersist();
          await safePersistNow();
          closeCatModal();
          renderBuyCategoriesPage(isoDate);
          return;
        }

        // ✅ EDIT
        if (mode === "edit" && existing) {
          existing.name = name;
          existing.code = code;
          existing.updatedAtTs = Date.now();

          // ✅ si modif le jour-même: il reste “ajouté récemment”
          // (rien à faire, createdAtIso est déjà bon)

          markBuyTouchedAndPersist();
          await safePersistNow();
          closeCatModal();
          renderBuyCategoriesPage(isoDate);
          return;
        }
      });
    }

    if (nameEl) nameEl.focus();
    syncOkState();
  }

  // =========================
  // ✅ MODAL SUPPRESSION
  // =========================
  function closeDelModal() {
    const bd = document.getElementById("catDelBackdrop");
    if (bd) bd.remove();
  }

  

  function openDelModal(catId) {
    if (document.getElementById("catDelBackdrop")) return;

    const cat = (buy.categories || []).find(c => c.id === catId);
    if (!cat) return;

    const bd = document.createElement("div");
    bd.id = "catDelBackdrop";
    bd.className = "cat-del-backdrop";

    bd.innerHTML = `
      <div class="cat-del-modal" role="dialog" aria-modal="true" aria-label="Suppression catégorie">
        <div class="cat-del-text">Supprimer cette catégorie ?</div>
        <div class="cat-del-actions">
          <button id="catDelCancel" class="cat-del-btn cat-del-cancel" type="button">Annuler</button>
          <button id="catDelOk" class="cat-del-btn cat-del-ok" type="button">confirmer</button>
        </div>
      </div>
    `;

    bd.addEventListener("click", (e) => {
      if (e.target === bd) closeDelModal();
    });

    document.body.appendChild(bd);

    const cancel = document.getElementById("catDelCancel");
    const ok = document.getElementById("catDelOk");
    if (cancel) cancel.addEventListener("click", closeDelModal);

    if (ok) {
      ok.addEventListener("click", async () => {
        // ✅ Si supprimée le même jour que création => “n’a jamais existé”
        if (String(cat.createdAtIso || "") === String(isoDate)) {
  // ✅ “n’a jamais existé”
  buy.categories = (buy.categories || []).filter(c => c.id !== catId);

  // ✅ si plus aucune action catégorie aujourd’hui => cercle NON vert
  const d = ensureBuyDayMark(isoDate);

  const anyToday =
    (buy.categories || []).some(c =>
      String(c.createdAtIso || "") === String(isoDate) ||
      String(c.deletedAtIso || "") === String(isoDate)
    );

  d.buyCatTouched = anyToday; // false si plus rien aujourd’hui
} else {
  // ✅ suppression normale (catégorie existante avant)
  cat.deletedAtIso = isoDate;
  cat.deletedAtTs = Date.now();

  // ✅ là, oui : action du jour
  markBuyTouchedAndPersist();
}

await safePersistNow();
closeDelModal();
renderBuyCategoriesPage(isoDate);

        closeDelModal();
        renderBuyCategoriesPage(isoDate);
      });
    }
    


  }

  // =========================
  // ✅ Bouton + (création)
  // =========================
  const addBtn = document.getElementById("addCatBtn");
  if (addBtn) addBtn.addEventListener("click", () => openCatModal({ mode: "create" }));

  // =========================
  // ✅ Clic crayon / poubelle
  // =========================
  app.querySelectorAll("[data-cat-edit]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const id = btn.getAttribute("data-cat-edit");
      openCatModal({ mode: "edit", catId: id });
    });
  });

  app.querySelectorAll("[data-cat-del]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const id = btn.getAttribute("data-cat-del");
      openDelModal(id);
    });
  });

  // =========================
  // ✅ Recherche + suggestions dynamiques (nom OU code)
  // =========================
  const search = document.getElementById("buyCatSearch");
  const suggest = document.getElementById("buyCatSuggest");

  function allVisibleForSearch() {
    // visibles ce jour = (créées <= isoDate) et pas supprimées
    return activeCategories().filter(c => String(c.createdAtIso || "") <= String(isoDate));
  }

  function renderSuggestions(q) {
    const nq = normSearch(q);
    if (!nq) {
      suggest.style.display = "none";
      suggest.innerHTML = "";
      // reset affichage complet
      renderBuyCategoriesPage(isoDate);
      return;
    }

    const list = allVisibleForSearch();
    const filtered = list.filter(c => {
      const n = normSearch(c.name);
      const cd = normSearch(c.code);
      return n.includes(nq) || cd.includes(nq);
    });

    // suggestions (7 max)
    const top = filtered.slice(0, 7);
    if (!top.length) {
      suggest.style.display = "none";
      suggest.innerHTML = "";
    } else {
      suggest.innerHTML = top.map(c => {
        const label = `${c.code} — ${c.name}`;
        return `<div class="op-suggest-item" data-cat-sel="${escapeAttr(c.id)}">${escapeHtml(label)}</div>`;
      }).join("");
      suggest.style.display = "";
    }

    // filtre la liste affichée (sans re-render total)
    const listEl = document.getElementById("buyCatList");
    if (listEl) {
      // on reconstruit 1 seule section “résultats”
      const sorted = filtered.slice().sort((a,b)=> codeCompare(a.code,b.code));
      listEl.innerHTML = `
        <div class="buy-cat-section-title">Résultats</div>
        ${sorted.map(cardHTML).join("")}
      `;
      // rebinde edit/del dans les résultats
      listEl.querySelectorAll("[data-cat-edit]").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          const id = btn.getAttribute("data-cat-edit");
          openCatModal({ mode: "edit", catId: id });
        });
      });
      listEl.querySelectorAll("[data-cat-del]").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          const id = btn.getAttribute("data-cat-del");
          openDelModal(id);
        });
      });
    }
  }

  if (search) {
    search.addEventListener("input", () => renderSuggestions(search.value));

    suggest.addEventListener("click", (e) => {
      const el = e.target.closest(".op-suggest-item");
      if (!el) return;
      const id = el.getAttribute("data-cat-sel");
      suggest.style.display = "none";
      suggest.innerHTML = "";

      // affiche uniquement la catégorie sélectionnée
      const cat = allVisibleForSearch().find(c => c.id === id);
      const listEl = document.getElementById("buyCatList");
      if (cat && listEl) {
        listEl.innerHTML = `
          <div class="buy-cat-section-title">Résultat</div>
          ${cardHTML(cat)}
        `;
        // rebind
        listEl.querySelectorAll("[data-cat-edit]").forEach(btn => {
          btn.addEventListener("click", (ev) => {
            ev.preventDefault();
            openCatModal({ mode: "edit", catId: btn.getAttribute("data-cat-edit") });
          });
        });
        listEl.querySelectorAll("[data-cat-del]").forEach(btn => {
          btn.addEventListener("click", (ev) => {
            ev.preventDefault();
            openDelModal(btn.getAttribute("data-cat-del"));
          });
        });
      }
    });

    document.addEventListener("pointerdown", (e) => {
      if (suggest.contains(e.target)) return;
      if (search.contains(e.target)) return;
      suggest.style.display = "none";
    }, { capture: true });
  }
}
// ===============================
// ✅ FIN — BUY : Catégories (COMPLET)
// ===============================



// ===============================
// ✅ DÉBUT — BUY : Articles (COMPLET - base UI + liste + modals)
// ===============================
function renderBuyArticlesPage(isoDate) {
  const date = fromISODate(isoDate);
  const buy = getBuyStore();
  ensureBuyDayMark(isoDate);

  // ✅ articles actifs = pas supprimés
  function activeArticles() {
    return (buy.articles || []).filter(a => !a.deletedAtIso);
  }

  // ✅ visibles ce jour UNIQUEMENT = createdAtIso === isoDate
  function visibleTodayArticles() {
    return activeArticles()
      .filter(a => String(a.createdAtIso || "") === String(isoDate))
      .sort((a,b) => (b.createdAtTs || 0) - (a.createdAtTs || 0)); // plus récent au-dessus
  }

  function isNameTaken(name, exceptId = null) {
    const n = normSearch(name);
    return activeArticles().some(a =>
      a.id !== exceptId &&
      String(a.createdAtIso || "") === String(isoDate) &&
      normSearch(a.name) === n
    );
  }

  function findCodeOwner(code, exceptId = null) {
    const c0 = normSearch(code);
    return activeArticles().find(a =>
      a.id !== exceptId &&
      String(a.createdAtIso || "") === String(isoDate) &&
      normSearch(a.code) === c0
    ) || null;
  }

  function markBuyTouchedAndPersist() {
    const d = ensureBuyDayMark(isoDate);
    d.buyArtTouched = true;
    safePersistNow();
  }

  function formatResultNumberLocal(n) {
  if (!Number.isFinite(n)) return "(...)";
  const s = String(n).replace(".", ",");
  if (typeof formatInputNumberDisplay === "function") return formatInputNumberDisplay(s);
  if (typeof formatCommaNumber === "function") return formatCommaNumber(n);
  return s;
}

function formatOpDisplay(raw) {
  let s = String(raw || "");

  // normalise opérateurs affichés
  s = s.replace(/\*/g, "×").replace(/\//g, "÷");

  const tokens = [];
  let i = 0;

  function isDigit(ch){ return /[0-9]/.test(ch); }

  while (i < s.length) {
    const ch = s[i];

    // nombres (digits + espaces + , .)
    if (isDigit(ch) || ch === "," || ch === "." || ch === " ") {
      let start = i;
      i++;
      while (i < s.length && (isDigit(s[i]) || s[i] === "," || s[i] === "." || s[i] === " ")) i++;
      const part = s.slice(start, i);

      const numRaw = part.replace(/\s+/g, "").replace(/\./g, ",");
      const n = (typeof toNumberLoose === "function") ? toNumberLoose(numRaw) : Number(numRaw.replace(",", "."));
      if (Number.isFinite(n)) tokens.push({ t:"num", v: formatResultNumberLocal(n) });
      else tokens.push({ t:"txt", v: part.trim() });
      continue;
    }

    if ("+-×÷^()".includes(ch)) {
      tokens.push({ t:"op", v: ch });
      i++;
      continue;
    }

    tokens.push({ t:"txt", v: ch });
    i++;
  }

  // rebuild avec espaces
  let out = "";
  for (const tk of tokens) {
    if (tk.t === "op") {
      if (tk.v === "(") { out += "("; continue; }
      if (tk.v === ")") { out = out.replace(/\s+$/,""); out += ")"; continue; }
      out = out.replace(/\s+$/,"");
      out += " " + tk.v + " ";
      continue;
    }
    out += tk.v;
  }

  out = out.replace(/\s+/g, " ").trim();
  out = out.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");

  return out;
}



  // ----------- UI helpers (rectangle article)
  // ----------- UI helpers (rectangle article)
function cardHTML(a) {
  const id = a.id;

  // ✅ format "milliers" pour cases blanches numériques
  function whiteNum(label, value) {
    const v = String(value ?? "").trim();
    // si vide => on affiche vide (comme avant)
    if (!v) {
      return `
        <div class="buy-cat-col">
          <div class="buy-cat-label">${escapeHtml(label)}</div>
          <div class="buy-cat-white"></div>
        </div>
      `;
    }

    // format milliers (réutilise ton formatInputNumberDisplay si dispo)
    const formatted =
      (typeof formatInputNumberDisplay === "function")
        ? formatInputNumberDisplay(v.replace(/\s+/g, "")) // ✅ tolère espaces stockés
        : v;

    return `
      <div class="buy-cat-col">
        <div class="buy-cat-label">${escapeHtml(label)}</div>
        <div class="buy-cat-white">${escapeHtml(formatted)}</div>
      </div>
    `;
  }

  function white(label, value) {
    return `
      <div class="buy-cat-col">
        <div class="buy-cat-label">${escapeHtml(label)}</div>
        <div class="buy-cat-white">${escapeHtml(value ?? "")}</div>
      </div>
    `;
  }

  // ✅ opérations : espaces autour des signes + résultat formaté "milliers"
  function opWhite(label, op, res) {
    const opStr = String(op ?? "").trim();

    // 👉 op affichée avec espaces + format milliers sur les nombres
    const opDisplay = opStr ? formatOpDisplay(opStr) : "";



    const resStr =
      (res === null || res === undefined || res === "")
        ? ""
        : formatResultNumberLocal(Number(res));


    const line = (opDisplay && resStr) ? `${opDisplay} = ${resStr}` : (opDisplay || resStr || "");
    return white(label, line);
  }

  return `
    <div class="buy-cat-card" data-art-id="${escapeAttr(id)}" style="position:relative;">
      <div class="buy-cat-actions" style="position:absolute; top:10px; right:10px; display:flex; flex-direction:column; gap:10px;">
        <button class="buy-cat-iconbtn" data-art-edit="${escapeAttr(id)}" title="Modifier" aria-label="Modifier">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
          </svg>
        </button>

        <button class="buy-cat-iconbtn" data-art-del="${escapeAttr(id)}" title="Supprimer" aria-label="Supprimer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18"></path>
            <path d="M8 6V4h8v2"></path>
            <path d="M6 6l1 16h10l1-16"></path>
            <path d="M10 11v6"></path>
            <path d="M14 11v6"></path>
          </svg>
        </button>
      </div>

      <div class="buy-cat-body" style="padding-right:64px;">
        ${white("Nom", a.name)}
        ${white("Code", a.code)}

        ${whiteNum("Quantité", a.qty)}
        ${whiteNum("Extra", a.extra)}
        ${whiteNum("Pris d’ensemble (PE)", a.pe)}
        ${whiteNum("Prix de gros unitaire (PGU)", a.pgu)}

        ${opWhite("Prix de gros total (PGT)", a.pgt, a.pgtResult)}
        ${opWhite("Prix de revient global (PRG)", a.prg, a.prgResult)}
        ${opWhite("Prix de revient (PR)", a.pr, a.prResult)}
        ${whiteNum("Prix de vente (PV)", a.pv)}
      </div>
    </div>
  `;
}



  const listToday = visibleTodayArticles();

  app.innerHTML = `
  <div class="page">
    <div class="topbar">
      <div class="slot left">
        <button id="homeBtn" class="icon-btn" title="Accueil" aria-label="Accueil">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 10.5L12 3l9 7.5" />
            <path d="M5 10v10h14V10" />
          </svg>
        </button>
      </div>

      <div class="slot center">
        <button id="back" class="back-btn">← Retour</button>
      </div>

      <div class="slot right">
        <button id="calBtn" class="icon-btn" title="Calendrier" aria-label="Calendrier">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M7 3v3M17 3v3" />
            <path d="M3.5 8h17" />
            <path d="M5 6h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
          </svg>
        </button>
      </div>
    </div>

    <div class="day-page">
      ${dayHeaderHTML(formatFullDate(date), { withPrevNext: true })}

      <div class="buy-categories-wrap">

        <!-- ✅ Barre de recherche + suggestions dynamiques -->
        <div class="op-search-wrap" style="margin-top:0;">
          <span class="op-search-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="7"></circle>
              <path d="M20 20l-3.5-3.5"></path>
            </svg>
          </span>

          <input id="buyArtSearch" class="input op-search"
            inputmode="text"
            autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
            placeholder="Rechercher un article (nom ou code)..." />

          <div id="buyArtSuggest" class="op-suggest" style="display:none;"></div>
        </div>

        <!-- ✅ Bouton carré + -->
        <button id="addArtBtn" class="add-cat-btn" type="button" aria-label="Ajouter un article" title="Ajouter">
          <span>+</span>
        </button>

        <!-- ✅ LISTE -->
        <div id="buyArtList" class="buy-cat-list">
          ${listToday.map(cardHTML).join(
  `<div class="buy-art-space"></div>
   <div class="buy-art-sep" aria-hidden="true"></div>
   <div class="buy-art-space"></div>`
)}

          ${
            !listToday.length
              ? `<div style="opacity:.75; font-weight:800; margin-top:10px;">Aucun article ce jour</div>`
              : ``
          }
        </div>

      </div>
    </div>
  </div>
  `;

  // flèches => restent sur /articles
  bindPrevNextDayButtons(isoDate, { baseHashPrefix: "#buy/" });
  const prev = document.getElementById("prevDay");
  const next = document.getElementById("nextDay");
  if (prev) prev.onclick = () => navigateTo(`#buy/${addDaysIso(isoDate,-1)}/articles`);
  if (next && !next.disabled) next.onclick = () => navigateTo(`#buy/${addDaysIso(isoDate,+1)}/articles`);

  const hb = document.getElementById("homeBtn");
  if (hb) hb.addEventListener("click", () => navigateTo("#"));

  const cb = document.getElementById("calBtn");
  if (cb) cb.addEventListener("click", () => navigateTo("#buy"));

  const backBtn = document.getElementById("back");
  if (backBtn) backBtn.addEventListener("click", () => smartBack());

  // =========================
  // ✅ MODAL ARTICLE — AJOUT (scrollable)
  // =========================
  function closeArtModal() {
    const bd = document.getElementById("artModalBackdrop");
    if (bd) bd.remove();
  }

  function openArtModal({ mode = "create", artId = null, isRajout = false } = {}) {
    if (document.getElementById("artModalBackdrop")) return;

    const existing = artId ? (buy.articles || []).find(a => a.id === artId) : null;

    const initialName = existing?.name || "";
    const initialCode = existing?.code || "";

    const bd = document.createElement("div");
    bd.id = "artModalBackdrop";
    bd.className = "cat-modal-backdrop";

    bd.innerHTML = `
  <div class="cat-modal" role="dialog" aria-modal="true" aria-label="Article"
       style="display:flex; flex-direction:column; max-height: min(78vh, 560px);">

    <div class="cat-modal-title" style="flex:0 0 auto;">
      ${mode === "create" ? "Nouvel article" : "Modifier l’article"}
    </div>

    <div id="artModalBody" style="flex:1 1 auto; overflow:auto; padding-right:6px;">
      <div id="artModalGrid" class="cat-modal-grid">

        <div class="label">Nom</div>
        <div>
          <input id="artName" class="input" autocomplete="off" value="${escapeAttr(initialName)}"/>
          <div id="artNameErr" class="cat-err" style="display:none;"></div>
        </div>

        <div class="label">Code</div>
        <div>
          <input id="artCode" class="input" autocomplete="off" value="${escapeAttr(initialCode)}"/>
          <div id="artCodeErr" class="cat-err" style="display:none;"></div>
        </div>

        <div class="label">Quantité</div>
        <div>
          <input id="artQty" class="input" autocomplete="off" value="${escapeAttr(existing?.qty || "")}"/>
          <div id="artQtyErr" class="cat-err" style="display:none;"></div>
        </div>

        <div class="label">Extra</div>
        <div>
          <input id="artExtra" class="input" autocomplete="off" value="${escapeAttr(existing?.extra || "")}"/>
          <div id="artExtraErr" class="cat-err" style="display:none;"></div>
        </div>

        <div class="label">Pris d’ensemble (PE)</div>
        <div>
          <input id="artPE" class="input" autocomplete="off" value="${escapeAttr(existing?.pe || "")}"/>
          <div id="artPEErr" class="cat-err" style="display:none;"></div>
        </div>

        <div class="label">Prix de gros unitaire (PGU)</div>
        <div>
          <input id="artPGU" class="input" autocomplete="off" value="${escapeAttr(existing?.pgu || "")}"/>
          <div id="artPGUErr" class="cat-err" style="display:none;"></div>
        </div>

        <div class="label">Prix de gros total (PGT)</div>
        <div>
          
          <input id="artPGT" class="input" autocomplete="off" value="${escapeAttr(existing?.pgt || "")}"/>
          <div id="artPGTErr" class="cat-err" style="display:none;"></div>
        </div>

        <div class="label">Prix de revient global (PRG)</div>
        <div>
          
          <input id="artPRG" class="input" autocomplete="off" value="${escapeAttr(existing?.prg || "")}"/>
          <div id="artPRGErr" class="cat-err" style="display:none;"></div>
        </div>

        <div class="label">Prix de revient (PR)</div>
        <div>
          
          <input id="artPR" class="input" autocomplete="off" value="${escapeAttr(existing?.pr || "")}"/>
          <div id="artPRErr" class="cat-err" style="display:none;"></div>
        </div>

      </div>
    </div>

    <div class="cat-modal-actions" style="flex:0 0 auto; margin-top:10px;">
      <button id="artCancelBtn" class="modal-btn cancel" type="button">Annuler</button>
      <button id="artOkBtn" class="modal-btn ok" type="button" disabled>OK</button>
    </div>
  </div>
`;


    bd.addEventListener("click", (e) => {
      if (e.target === bd) closeArtModal();
    });

    document.body.appendChild(bd);

    



  


   

// récupère toujours les éléments ACTUELS (après rerender)
function getArtEls() {
  return {
    nameEl: document.getElementById("artName"),
    codeEl: document.getElementById("artCode"),
    nameErr: document.getElementById("artNameErr"),
    codeErr: document.getElementById("artCodeErr"),
    okBtn: document.getElementById("artOkBtn"),
  };
}

function allFieldsValidated() {
  return (
    !!draft.qtyFinalized &&
    !!draft.extraFinalized &&
    !!draft.peFinalized &&
    !!draft.pguFinalized &&
    !!draft.pvFinalized &&        // ✅ AJOUT
    !!draft.pgtFinalized &&
    !!draft.prgFinalized &&
    !!draft.prFinalized
  );
}


function setErr(inputEl, msgEl, msg) {
  if (!inputEl || !msgEl) return;
  if (!msg) {
    inputEl.classList.remove("error");
    msgEl.style.display = "none";
    msgEl.textContent = "";
  } else {
    inputEl.classList.add("error");
    msgEl.style.display = "block";
    msgEl.textContent = msg; // ✅ en rouge via .cat-err
  }
}


function syncOkState() {
  const { nameEl, codeEl, nameErr, codeErr, okBtn } = getArtEls();
  if (!okBtn) return;

  const name = String(draft.name || "").trim();
  const code = String(draft.code || "").trim();

  const isRajoutLocked = !!draft.nameCodeLocked; // ✅ rajout : champs verrouillés

  // ✅ doublons (affichés immédiatement), sauf si rajout verrouillé
  const nameTaken = (!isRajoutLocked && name) ? isNameTaken(name, existing?.id || null) : false;
  const codeOwner = (!isRajoutLocked && code) ? findCodeOwner(code, existing?.id || null) : null;

  setErr(nameEl, nameErr, nameTaken ? "nom déjà attribué" : "");
  setErr(codeEl, codeErr, codeOwner ? `code déjà attribué : ${codeOwner.name || ""}` : "");

  const ok =
    name.length > 0 &&
    code.length > 0 &&
    allFieldsValidated() &&
    !nameTaken &&
    !codeOwner;

  okBtn.disabled = !ok;
  okBtn.classList.toggle("enabled", ok);
}





    // =========================
// ✅ ARTICLES — VALIDER / MODIFIER (NUMÉRIQUES SIMPLES)
// Quantité / Extra / PE / PGU
// =========================

// 1) helpers format + filtre (tu as déjà filterDigitsComma et formatInputNumberDisplay côté daily)
// => ici, on réutilise ton format d'affichage "milliers" via formatInputNumberDisplay si dispo.
// Sinon fallback: formatCommaNumber(toNumberLoose(...))

function formatWhiteNumber(v) {
  // v est stocké en string avec virgule possible
  if (typeof formatInputNumberDisplay === "function") return formatInputNumberDisplay(v || "0");
  // fallback
  const n = (typeof toNumberLoose === "function") ? toNumberLoose(v || "0") : Number(String(v||"0").replace(",", "."));
  if (!Number.isFinite(n)) return String(v || "0");
  if (typeof formatCommaNumber === "function") return formatCommaNumber(n);
  return String(n);
}

function digitsCommaOnly(raw) {
  // si tu as déjà filterDigitsComma global, on l’utilise
  // ⚠️ IMPORTANT : si ton filterDigitsComma supprime les espaces, on ne l'utilise PAS ici.
  let s = String(raw || "");
  s = s.replace(/\./g, ",");
  // ✅ autorise chiffres, virgule, espaces
  let cleaned = s.replace(/[^0-9,\s]/g, "");

  // ✅ une seule virgule
  const firstComma = cleaned.indexOf(",");
  if (firstComma !== -1) {
    cleaned =
      cleaned.slice(0, firstComma + 1) +
      cleaned.slice(firstComma + 1).replace(/,/g, "");
  }

  return cleaned;
}

function formatResultNumber(n) {
  if (!Number.isFinite(n)) return "(...)";
  // format en string avec virgule
  const s = String(n).replace(".", ",");
  if (typeof formatInputNumberDisplay === "function") return formatInputNumberDisplay(s);
  if (typeof formatCommaNumber === "function") return formatCommaNumber(n);
  return s;
}

function formatOpDisplay(raw) {
  // ✅ met espaces autour des opérateurs + formate les nombres (milliers)
  let s = String(raw || "");

  // normalise opérateurs clavier -> symboles affichés
  s = s.replace(/\*/g, "×").replace(/\//g, "÷");

  // tokenisation simple : nombres vs opérateurs
  const tokens = [];
  let i = 0;

  function isDigit(ch){ return /[0-9]/.test(ch); }

  while (i < s.length) {
    const ch = s[i];

    // nombres (digits + espaces + , .)
    if (isDigit(ch) || ch === "," || ch === "." || ch === " ") {
      let start = i;
      i++;
      while (i < s.length && (isDigit(s[i]) || s[i] === "," || s[i] === "." || s[i] === " ")) i++;
      const part = s.slice(start, i);

      // nettoie espaces dans le nombre puis parse
      const numRaw = part.replace(/\s+/g, "").replace(/\./g, ",");
      const n = (typeof toNumberLoose === "function") ? toNumberLoose(numRaw) : Number(numRaw.replace(",", "."));
      if (Number.isFinite(n)) {
        tokens.push({ t:"num", v: formatResultNumber(n) });
      } else {
        tokens.push({ t:"txt", v: part.trim() });
      }
      continue;
    }

    // opérateurs
    if ("+-×÷^()".includes(ch)) {
      tokens.push({ t:"op", v: ch });
      i++;
      continue;
    }

    // autres caractères (on garde)
    tokens.push({ t:"txt", v: ch });
    i++;
  }

  // rebuild avec espaces autour des opérateurs binaires
  let out = "";
  for (const tk of tokens) {
    if (tk.t === "op") {
      if (tk.v === "(") { out += "("; continue; }
      if (tk.v === ")") { out = out.replace(/\s+$/,""); out += ")"; continue; }
      out = out.replace(/\s+$/,"");
      out += " " + tk.v + " ";
      continue;
    }
    out += tk.v;
  }

  out = out.replace(/\s+/g, " ").trim();
  out = out.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");

  return out;
}



// 2) état "draft" de la modale (persisté en DB pour survivre au refresh)
// On stocke ça dans buy.articleDraftByIso[isoDate] (n'apparaît PAS dans la liste tant que OK n'a pas créé l'article)
buy.articleDraftByIso = buy.articleDraftByIso || {};
const draft = buy.articleDraftByIso[isoDate] || {
  // texte
  name: "", code: "",

    // ✅ rajout
  isRajout: false,
  nameCodeLocked: false,
  rajoutOriginCode: "",


  // valeurs simples
  qty: "", qtyFinalized: false,
  extra: "", extraFinalized: false,
  pe: "", peFinalized: false,
  pgu: "", pguFinalized: false,
  pv: "", pvFinalized: false,


    // opérations
  pgt: "", pgtFinalized: false, pgtResult: null, pgtErr: "",
  prg: "", prgFinalized: false, prgResult: null, prgErr: "",
  pr:  "", prFinalized: false,  prResult: null,  prErr: "",

};
buy.articleDraftByIso[isoDate] = draft;
draft.isRajout = (mode === "create" && !!isRajout);
draft.nameCodeLocked = false;
draft.rajoutOriginCode = "";


// =======================================
// ✅ EDIT : pré-remplir le draft depuis l’article existant
// =======================================
function loadDraftFromExistingArticle(a) {
  if (!a) return;

  // texte
  draft.name = a.name || "";
  draft.code = a.code || "";

  // simples
  draft.qty   = a.qty   || "";
  draft.extra = a.extra || "";
  draft.pe    = a.pe    || "";
  draft.pgu   = a.pgu   || "";
  draft.pv = a.pv || "";



  // opérations (op + résultat)
  draft.pgt = a.pgt || "";
  draft.pgtResult = (a.pgtResult ?? null);

  draft.prg = a.prg || "";
  draft.prgResult = (a.prgResult ?? null);

  draft.pr = a.pr || "";
  draft.prResult = (a.prResult ?? null);

  // erreurs reset
  draft.pgtErr = "";
  draft.prgErr = "";
  draft.prErr  = "";

  // ✅ flags "validés" selon ce qui existe déjà
  draft.qtyFinalized   = String(draft.qty).trim()   !== "";
  draft.extraFinalized = String(draft.extra).trim() !== "";
  draft.peFinalized    = String(draft.pe).trim()    !== "";
  draft.pguFinalized   = String(draft.pgu).trim()   !== "";
  draft.pvFinalized = String(draft.pv).trim() !== "";

  // Pour opérations : considéré "validé" si résultat présent (ou si op non vide, au pire)
  draft.pgtFinalized = (draft.pgtResult !== null && draft.pgtResult !== undefined) || String(draft.pgt).trim() !== "";
  draft.prgFinalized = (draft.prgResult !== null && draft.prgResult !== undefined) || String(draft.prg).trim() !== "";
  draft.prFinalized  = (draft.prResult  !== null && draft.prResult  !== undefined) || String(draft.pr).trim()  !== "";
}

// ✅ si on ouvre via crayon : on charge l’existant
if (mode === "edit" && existing) {
  loadDraftFromExistingArticle(existing);
}


// 3) render d’une ligne numérique simple (input+valider OU carte+modifier)
function renderSimpleNumRow({ key, finalizedKey, label, inputId, validateId, modifyId }) {
  const isFinal = !!draft[finalizedKey];

  if (!isFinal) {
    const hasText = String(draft[key] || "").trim().length > 0;
    return `
      <div class="label">${label}</div>
      <div class="art-inline-actions">
        <input id="${inputId}" class="input" inputmode="decimal" autocomplete="off"
          value="${escapeAttr(draft[key] || "")}" />
        <button id="${validateId}" class="art-mini-btn art-mini-validate"
          type="button"
          ${hasText ? "" : "disabled"}
        >Valider</button>
      </div>
    `;
  }

  // ✅ finalisé: case blanche + modifier
  return `
    <div class="label">${label}</div>
    <div class="art-inline-actions">
      <div class="card card-white lift" style="flex:1; min-width: 220px;">
        ${escapeHtml(formatWhiteNumber(draft[key] || "0"))}
      </div>
      <button id="${modifyId}" class="art-mini-btn art-mini-modify" type="button">Modifier</button>
    </div>
  `;
}

function renderOpRow({ key, finalizedKey, resultKey, errKey, label, hint, boxId, modId }) {
  const isFinal = !!draft[finalizedKey];
  const raw = String(draft[key] || "");
  const err = String(draft[errKey] || "");

      if (!isFinal) {
    const posed = (typeof isOperationPosed === "function") ? isOperationPosed(raw) : false;
    


    return `
      <div class="label">${label}</div>


      <div>
        <div class="art-inline-actions">

          <!-- ✅ PC: input direct / Mobile: case cliquable -->
          ${
            // si écran large (= PC), on met un input
            !(window.matchMedia && window.matchMedia("(max-width: 520px)").matches)
              ? `
                <input
                  id="${boxId}Input"
                  class="input"
                  autocomplete="off"
                  value="${escapeAttr(raw)}"
                  placeholder="(poser l’opération…)"
                  style="flex:1;"
                />
              `
              : `
                <div id="${boxId}" class="input" style="cursor:pointer; user-select:none; flex:1;">
                  ${raw ? escapeHtml(raw) : `<span style="opacity:.65; font-weight:800;">(poser l’opération…)</span>`}
                </div>
              `
          }

          <button
            id="${boxId}Validate"
            class="art-mini-btn art-mini-validate"
            type="button"
            ${posed ? "" : "disabled"}
            style="${posed ? "background:#1e5eff; opacity:1;" : ""}"
          >Valider</button>
        </div>

        ${err ? `<div class="cat-err" style="display:block;">${escapeHtml(err)}</div>` : ``}
      </div>
    `;
  }



  const opDisplay = formatOpDisplay(raw);
  const res = draft[resultKey];
  const resDisplay = (res === null || res === undefined) ? "(...)" : formatResultNumber(res);

  return `
    <div class="label">${label}</div>
    <div>
      <div class="card card-white lift" style="width:100%;">
        ${escapeHtml(opDisplay)} = ${escapeHtml(resDisplay)}
      </div>
      <button id="${modId}" type="button"
        style="
          margin-top:10px;
          width:100%;
          background:#000;
          border:1px solid rgba(255,255,255,0.9);
          color:#1e5eff;
          font-weight:900;
          border-radius:12px;
          padding:12px 10px;
          cursor:pointer;
        "
      >Modifier</button>
    </div>
  `;
}

function originCodeOf(code) {
  return String(code || "").trim().replace(/\s+[A-Z]{1,2}$/i, "").trim();
}

function nextEnrichedCode(origin) {
  const base = String(origin || "").trim();
  if (!base) return "";

  const used = new Set();
  for (const a of (buy.articles || [])) {
    if (a.deletedAtIso) continue;
    const oc = originCodeOf(a.code);
    if (oc !== base) continue;

    const m = String(a.code || "").trim().match(new RegExp("^" + base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+([A-Z]{1,2})$"));
    if (m && m[1]) used.add(m[1].toUpperCase());
  }

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  for (const L of letters) {
    if (!used.has(L)) return `${base} ${L}`;
  }

  // fallback si A..Z tous pris : AA, AB, ...
  for (const L1 of letters) {
    for (const L2 of letters) {
      const v = `${L1}${L2}`;
      if (!used.has(v)) return `${base} ${v}`;
    }
  }
  return `${base} Z`;
}


// 4) re-render du contenu modal (sans la fermer)
function rerenderArtModalBody() {
  const grid = document.getElementById("artModalGrid");
  if (!grid) return;

  grid.innerHTML = `
        <div class="label">Nom</div>
    <div style="position:relative;">
      <input id="artName" class="input" autocomplete="off"
        value="${escapeAttr(draft.name || "")}"
        ${draft.nameCodeLocked ? "disabled" : ""}
      />
      <div id="artNameErr" class="cat-err" style="display:none;"></div>
      ${draft.isRajout && !draft.nameCodeLocked ? `<div id="artNameSuggest" class="op-suggest" style="display:none;"></div>` : ``}
    </div>

    <div class="label">Code</div>
    <div style="position:relative;">
      <input id="artCode" class="input" autocomplete="off"
        value="${escapeAttr(draft.code || "")}"
        ${draft.nameCodeLocked ? "disabled" : ""}
      />
      <div id="artCodeErr" class="cat-err" style="display:none;"></div>
      ${draft.isRajout && !draft.nameCodeLocked ? `<div id="artCodeSuggest" class="op-suggest" style="display:none;"></div>` : ``}
    </div>


    ${renderSimpleNumRow({ key:"qty",   finalizedKey:"qtyFinalized",   label:"Quantité", inputId:"artQty",   validateId:"artQtyValidate",   modifyId:"artQtyModify" })}
    ${renderSimpleNumRow({ key:"extra", finalizedKey:"extraFinalized", label:"Extra",    inputId:"artExtra", validateId:"artExtraValidate", modifyId:"artExtraModify" })}
    ${renderSimpleNumRow({ key:"pe",    finalizedKey:"peFinalized",    label:"Pris d’ensemble (PE)", inputId:"artPE", validateId:"artPEValidate", modifyId:"artPEModify" })}
    ${renderSimpleNumRow({ key:"pgu",   finalizedKey:"pguFinalized",   label:"Prix de gros unitaire (PGU)", inputId:"artPGU", validateId:"artPGUValidate", modifyId:"artPGUModify" })}

    ${renderOpRow({
  key:"pgt", finalizedKey:"pgtFinalized", resultKey:"pgtResult", errKey:"pgtErr",
  label:"Prix de gros total (PGT)",
  hint:"(PGU × quantité)",
  boxId:"artPGTBox",
  modId:"artPGTModifyOp"
})}

${renderOpRow({
  key:"prg", finalizedKey:"prgFinalized", resultKey:"prgResult", errKey:"prgErr",
  label:"Prix de revient global (PRG)",
  hint:"(PGT + extra × (PGT / PE))",
  boxId:"artPRGBox",
  modId:"artPRGModifyOp"
})}

${renderOpRow({
  key:"pr", finalizedKey:"prFinalized", resultKey:"prResult", errKey:"prErr",
  label:"Prix de revient (PR)",
  hint:"(PRG / quantité)",
  boxId:"artPRBox",
  modId:"artPRModifyOp"
})}

${renderSimpleNumRow({
  key:"pv", finalizedKey:"pvFinalized",
  label:"Prix de vente (PV)",
  inputId:"artPV", validateId:"artPVValidate", modifyId:"artPVModify"
})}


  `;

  bindArtModalHandlers();
syncOkState();

}


// 5) bind handlers (input + validate + modify + effacement)
function bindOneSimpleNum({ key, finalizedKey, inputId, validateId, modifyId }) {
  const input = document.getElementById(inputId);
  const vBtn = document.getElementById(validateId);
  const mBtn = document.getElementById(modifyId);

  // ---- mode input
  if (input) {
    // bouton Valider actif dès qu'on tape
    input.addEventListener("input", async () => {
  const filtered = digitsCommaOnly(input.value);
  if (filtered !== input.value) {
    input.value = filtered;
    if (typeof shake === "function") shake(input);
  }

  // ✅ 1) UI d’abord (réactivité immédiate)
  if (vBtn) {
    const hasTextNow = filtered.trim().length > 0;
    vBtn.disabled = !hasTextNow;
    vBtn.classList.toggle("started", hasTextNow);
  }

  // ✅ 2) logique existante inchangée
  draft[key] = filtered;
  draft[finalizedKey] = false; // tant que pas validé
  markBuyTouchedAndPersist();  // on garde ton comportement

  // ✅ 3) si effacement total => suppression définitive (DB)
  if (filtered.trim() === "") {
    draft[key] = "";
    draft[finalizedKey] = false;
  }

  // ✅ 4) persistance (une seule fois)
  await safePersistNow();
});


    // Enter = Valider
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (vBtn && !vBtn.disabled) vBtn.click();
      }
    });
  }

  // ---- Valider
  if (vBtn) {
    vBtn.addEventListener("click", async () => {
      const v = String(draft[key] || "").trim();
      if (!v) {
        if (typeof shake === "function") shake(vBtn);
        return;
      }
      draft[finalizedKey] = true;
      await safePersistNow();
      rerenderArtModalBody();
    });
  }

  // ---- Modifier
  if (mBtn) {
    mBtn.addEventListener("click", async () => {
      draft[finalizedKey] = false;
      await safePersistNow();
      rerenderArtModalBody();
      // focus input après rerender
      setTimeout(() => {
        const i = document.getElementById(inputId);
        if (i) i.focus();
      }, 0);
    });
  }
}

function bindArtModalHandlers() {
  // Nom / Code
  const nameEl = document.getElementById("artName");
  const codeEl = document.getElementById("artCode");

  if (nameEl) nameEl.addEventListener("input", async () => {
  draft.name = nameEl.value;
  await safePersistNow();
  syncOkState();
});

if (codeEl) codeEl.addEventListener("input", async () => {
  draft.code = codeEl.value;
  await safePersistNow();
  syncOkState();
});

function getRajoutCandidates() {
  // ✅ suggérer tous les articles actifs déjà enregistrés (y compris les rajouts),
  // y compris les jours précédents (et aujourd’hui aussi si tu veux)
  return (buy.articles || [])
    .filter(a => !a.deletedAtIso)
    .filter(a => String(a.createdAtIso || "") <= String(isoDate))
    .sort((a,b) => (b.createdAtTs || 0) - (a.createdAtTs || 0));
}

function showSuggest(elSuggest, itemsHtml) {
  if (!elSuggest) return;
  if (!itemsHtml) {
    elSuggest.style.display = "none";
    elSuggest.innerHTML = "";
    return;
  }
  elSuggest.innerHTML = itemsHtml;
  elSuggest.style.display = "";
}

function bindRajoutSuggest() {
  if (!draft.isRajout) return;
  if (draft.nameCodeLocked) return;

  const nameEl = document.getElementById("artName");
  const codeEl = document.getElementById("artCode");
  const nameSuggest = document.getElementById("artNameSuggest");
  const codeSuggest = document.getElementById("artCodeSuggest");

  const list = getRajoutCandidates();

  function renderListForName(q) {
    const nq = normSearch(q);
    if (!nq) return "";
    const top = list.filter(a => normSearch(a.name).includes(nq)).slice(0, 7);
    return top.map(a => {
      const oc = originCodeOf(a.code);
      return `<div class="op-suggest-item" data-rj-id="${escapeAttr(a.id)}">`
        + `${escapeHtml(a.name)} <span class="op-suggest-muted">(${escapeHtml(oc)})</span>`
        + `</div>`;
    }).join("");
  }

  function renderListForCode(q) {
    const nq = normSearch(q);
    if (!nq) return "";
    const top = list.filter(a => normSearch(originCodeOf(a.code)).includes(nq)).slice(0, 7);
    return top.map(a => {
      const oc = originCodeOf(a.code);
      return `<div class="op-suggest-item" data-rj-id="${escapeAttr(a.id)}">`
        + `<span class="op-suggest-strong">${escapeHtml(oc)}</span>`
        + ` <span class="op-suggest-muted">— ${escapeHtml(a.name)}</span>`
        + `</div>`;
    }).join("");
  }

  async function pickArticleById(id) {
    const a = list.find(x => x.id === id);
    if (!a) return;

    const oc = originCodeOf(a.code);
    const enriched = nextEnrichedCode(oc);

    // ✅ Remplir les deux sans déclencher doublons
    draft.name = a.name || "";
    draft.code = enriched;
    draft.rajoutOriginCode = oc;

    // ✅ Verrouiller
    draft.nameCodeLocked = true;

    await safePersistNow();
    rerenderArtModalBody();
  }

  if (nameEl && nameSuggest) {
    nameEl.addEventListener("input", () => {
      if (draft.nameCodeLocked) return;
      showSuggest(nameSuggest, renderListForName(nameEl.value));
    });
    nameSuggest.addEventListener("click", (e) => {
      const it = e.target.closest(".op-suggest-item");
      if (!it) return;
      pickArticleById(it.getAttribute("data-rj-id"));
    });
  }

  if (codeEl && codeSuggest) {
    codeEl.addEventListener("input", () => {
      if (draft.nameCodeLocked) return;
      showSuggest(codeSuggest, renderListForCode(codeEl.value));
    });
    codeSuggest.addEventListener("click", (e) => {
      const it = e.target.closest(".op-suggest-item");
      if (!it) return;
      pickArticleById(it.getAttribute("data-rj-id"));
    });
  }

  // clic dehors => fermer
  document.addEventListener("pointerdown", (e) => {
    if (nameSuggest && nameSuggest.contains(e.target)) return;
    if (codeSuggest && codeSuggest.contains(e.target)) return;
    if (nameEl && nameEl.contains(e.target)) return;
    if (codeEl && codeEl.contains(e.target)) return;
    showSuggest(nameSuggest, "");
    showSuggest(codeSuggest, "");
  }, { capture:true });
}

bindRajoutSuggest();



  // champs num simples
  bindOneSimpleNum({ key:"qty",   finalizedKey:"qtyFinalized",   inputId:"artQty",   validateId:"artQtyValidate",   modifyId:"artQtyModify" });
  bindOneSimpleNum({ key:"extra", finalizedKey:"extraFinalized", inputId:"artExtra", validateId:"artExtraValidate", modifyId:"artExtraModify" });
  bindOneSimpleNum({ key:"pe",    finalizedKey:"peFinalized",    inputId:"artPE",    validateId:"artPEValidate",    modifyId:"artPEModify" });
  bindOneSimpleNum({ key:"pgu",   finalizedKey:"pguFinalized",   inputId:"artPGU",   validateId:"artPGUValidate",   modifyId:"artPGUModify" });
  bindOneSimpleNum({
  key:"pv", finalizedKey:"pvFinalized",
  inputId:"artPV", validateId:"artPVValidate", modifyId:"artPVModify"
});


  // bouton Annuler
  const cancelBtn = document.getElementById("artCancelBtn");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", async () => {
      if (buy.articleDraftByIso && buy.articleDraftByIso[isoDate]) {
        delete buy.articleDraftByIso[isoDate];
      }
      await safePersistNow();
      closeArtModal();
    });
  }

  // bouton OK (création / modification)
const okBtn = document.getElementById("artOkBtn");
if (okBtn) {
  okBtn.addEventListener("click", async () => {
    syncOkState(); // affiche erreurs doublons si nécessaire

    const name = String(draft.name || "").trim();
    const code = String(draft.code || "").trim();
    if (!name || !code) return;
    if (!allFieldsValidated()) return;

    const nameTaken = isNameTaken(name, existing?.id || null);
    const codeOwner = findCodeOwner(code, existing?.id || null);
    if (nameTaken || codeOwner) return;

    // ✅ CREATE
    if (mode === "create") {
      const id = "art_" + Math.random().toString(16).slice(2) + Date.now().toString(16);

      buy.articles = buy.articles || [];
      buy.articles.unshift({
        id,
        name,
        code,

        // valeurs simples (strings)
        qty: draft.qty || "",
        extra: draft.extra || "",
        pe: draft.pe || "",
        pgu: draft.pgu || "",
        pv: draft.pv || "",


        // opérations (on stocke l’op posée + le résultat)
        pgt: draft.pgt || "",
        pgtResult: draft.pgtResult ?? null,
        prg: draft.prg || "",
        prgResult: draft.prgResult ?? null,
        pr: draft.pr || "",
        prResult: draft.prResult ?? null,

        createdAtIso: isoDate,
        createdAtTs: Date.now(),
        updatedAtTs: Date.now(),
        deletedAtIso: null,
        deletedAtTs: null,
      });

      // ✅ on supprime le draft du jour (comme Annuler)
      if (buy.articleDraftByIso && buy.articleDraftByIso[isoDate]) {
        delete buy.articleDraftByIso[isoDate];
      }

      markBuyTouchedAndPersist();
      await safePersistNow();
      closeArtModal();
      renderBuyArticlesPage(isoDate);
      return;
    }

    // ✅ EDIT
    if (mode === "edit" && existing) {
      existing.name = name;
      existing.code = code;

      existing.qty = draft.qty || "";
      existing.extra = draft.extra || "";
      existing.pe = draft.pe || "";
      existing.pgu = draft.pgu || "";
      existing.pv = draft.pv || "";


      existing.pgt = draft.pgt || "";
      existing.pgtResult = draft.pgtResult ?? null;
      existing.prg = draft.prg || "";
      existing.prgResult = draft.prgResult ?? null;
      existing.pr = draft.pr || "";
      existing.prResult = draft.prResult ?? null;

      existing.updatedAtTs = Date.now();

      if (buy.articleDraftByIso && buy.articleDraftByIso[isoDate]) {
        delete buy.articleDraftByIso[isoDate];
      }

      markBuyTouchedAndPersist();
      await safePersistNow();
      closeArtModal();
      renderBuyArticlesPage(isoDate);
      return;
    }
  });
}


  // ✅ 1) isTouchDevice (bien fermé)
  function isTouchDevice() {
    return (
      ("ontouchstart" in window) ||
      (navigator.maxTouchPoints > 0) ||
      (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
    );
  }

  // ✅ 2) buildOverlaySearchItems
  function buildOverlaySearchItems() {
    const items = [];
    if (draft.qtyFinalized) items.push({ key:"quantite", label:"Quantité", valueText: formatWhiteNumber(draft.qty || "0") });
    if (draft.extraFinalized) items.push({ key:"extra", label:"Extra", valueText: formatWhiteNumber(draft.extra || "0") });
    if (draft.peFinalized) items.push({ key:"pe", label:"PE", valueText: formatWhiteNumber(draft.pe || "0") });
    if (draft.pguFinalized) items.push({ key:"pgu", label:"PGU", valueText: formatWhiteNumber(draft.pgu || "0") });
    if (draft.pvFinalized) items.push({ key:"pv", label:"PV", valueText: formatWhiteNumber(draft.pv || "0") });
    return items;
  }

  // ===================================================
// ✅ CASCADE : remplacer 1er nombre d'une opération + recalculer
// ===================================================
function toOpNumString(n) {
  // string simple (sans espaces) compatible evalOperation
  if (!Number.isFinite(n)) return "";
  return String(n).replace(".", ",");
}

function replaceFirstNumberInOp(opStr, newNumStr) {
  const s = String(opStr || "");
  const nn = String(newNumStr || "").trim();
  if (!nn) return s;

  // Si vide => on met juste le nombre
  if (!s.trim()) return nn;

  // Remplace le premier "nombre" rencontré (digits + espaces + , .)
  // Exemple: "1 234,5 + 2" => "999 + 2"
  const re = /[0-9][0-9\s.,]*/;
  if (re.test(s)) return s.replace(re, nn);

  // Sinon (pas de nombre trouvé), on préfixe
  return `${nn} ${s}`;
}

async function recalcOp(key) {
  const raw = String(draft[key] || "").trim();

  // Si vide => reset
  if (!raw) {
    draft[key] = "";
    draft[key + "Finalized"] = false;
    draft[key + "Result"] = null;
    draft[key + "Err"] = "";
    return;
  }

  if (typeof charsAllowedForOpInput === "function" && !charsAllowedForOpInput(raw)) {
    draft[key + "Err"] = "Caractères invalides.";
    draft[key + "Finalized"] = false;
    draft[key + "Result"] = null;
    return;
  }

  const res = (typeof evalOperation === "function") ? evalOperation(raw) : null;
  if (res === null) {
    draft[key + "Err"] = "Opération invalide.";
    draft[key + "Finalized"] = false;
    draft[key + "Result"] = null;
    return;
  }

  draft[key + "Err"] = "";
  draft[key + "Result"] = res;
  draft[key + "Finalized"] = true;
}

async function cascadeFrom(key, newResultNumber) {
  // newResultNumber = résultat numérique recalculé du key
  const nn = toOpNumString(newResultNumber);
  if (!nn) return;

  if (key === "pgt") {
    // 1) injecte dans PRG (même si déjà validé)
    draft.prg = replaceFirstNumberInOp(draft.prg, nn);
    await recalcOp("prg");

    // 2) injecte le nouveau résultat PRG dans PR (même si déjà validé)
    if (Number.isFinite(draft.prgResult)) {
      const nn2 = toOpNumString(draft.prgResult);
      draft.pr = replaceFirstNumberInOp(draft.pr, nn2);
      await recalcOp("pr");
    } else {
      // si PRG invalide => PR devient non fiable
      draft.prFinalized = false;
      draft.prResult = null;
      draft.prErr = "";
    }
  }

  if (key === "prg") {
    // injecte dans PR
    draft.pr = replaceFirstNumberInOp(draft.pr, nn);
    await recalcOp("pr");
  }
}


  // ✅ 3) validateOpField
  async function validateOpField({ key, finalizedKey, resultKey, errKey, nextKey }) {
    const raw = String(draft[key] || "").trim();

    if (!raw) {
      draft[key] = "";
      draft[finalizedKey] = false;
      draft[resultKey] = null;
      draft[errKey] = "";
      await safePersistNow();
      rerenderArtModalBody();
      return;
    }

    if (typeof charsAllowedForOpInput === "function" && !charsAllowedForOpInput(raw)) {
      draft[errKey] = "Caractères invalides.";
      draft[finalizedKey] = false;
      await safePersistNow();
      rerenderArtModalBody();
      return;
    }

    const res = (typeof evalOperation === "function") ? evalOperation(raw) : null;
    if (res === null) {
      draft[errKey] = "Opération invalide.";
      draft[finalizedKey] = false;
      await safePersistNow();
      rerenderArtModalBody();
      return;
    }

    draft[errKey] = "";
draft[resultKey] = res;
draft[finalizedKey] = true;

// ============================================
// ✅ 2 MODES : bascule simple OU cascade (modif)
// ============================================

// petit helper (valeur à basculer)
const resStr = (typeof formatResultNumber === "function")
  ? formatResultNumber(res)
  : String(res).replace(".", ",");

if (key === "pgt") {
  // Si PRG déjà validé (case blanche) => cascade (recalc PRG puis PR)
  if (draft.prgFinalized) {
    await cascadeFrom("pgt", res);
  } else {
    // ✅ bascule simple (PRG encore en input/vierge) : on écrase la valeur basculée
    draft.prg = resStr;
    draft.prgErr = "";
    draft.prgResult = null;
    draft.prgFinalized = false; // car PRG n'est pas "validé" tant qu'on n'a pas cliqué Valider sur PRG

    // ✅ et si PR est encore en input avec une valeur basculée, on met à jour aussi
    if (!draft.prFinalized) {
      draft.pr = (draft.prgResult !== null && draft.prgResult !== undefined) ? resStr : resStr;
      draft.prErr = "";
      draft.prResult = null;
    }
  }
}

else if (key === "prg") {
  // Si PR déjà validé (case blanche) => cascade (recalc PR)
  if (draft.prFinalized) {
    await cascadeFrom("prg", res);
  } else {
    // ✅ bascule simple (PR encore en input/vierge) : on écrase la valeur basculée
    draft.pr = resStr;
    draft.prErr = "";
    draft.prResult = null;
    draft.prFinalized = false;
  }
}

// key === "pr" => rien après

await safePersistNow();
rerenderArtModalBody();


  }

  // ✅ 4) openOpFor
  function openOpFor(key, title, hint) {
    if (!isTouchDevice()) return;

    const ghost = document.createElement("input");
    ghost.type = "text";
    ghost.value = String(draft[key] || "");
    document.body.appendChild(ghost);
    ghost.style.position = "fixed";
    ghost.style.opacity = "0";
    ghost.style.pointerEvents = "none";
    ghost.style.height = "0";
    ghost.style.width = "0";

    openOpOverlay({
      inputEl: ghost,
      title,
      hint,
      initialValue: String(draft[key] || ""),
      placeholder: "(poser une opération)",
      searchItems: buildOverlaySearchItems(),
      onCancel: () => {
        draft[key] = String(ghost.value || "");
        ghost.remove();
        safePersistNow();
        rerenderArtModalBody();
      },
      onOk: async () => {
        draft[key] = String(ghost.value || "");
        ghost.remove();

        if (key === "pgt") {
          await validateOpField({ key:"pgt", finalizedKey:"pgtFinalized", resultKey:"pgtResult", errKey:"pgtErr", nextKey:"prg" });
        } else if (key === "prg") {
          await validateOpField({ key:"prg", finalizedKey:"prgFinalized", resultKey:"prgResult", errKey:"prgErr", nextKey:"pr" });
        } else if (key === "pr") {
          await validateOpField({ key:"pr", finalizedKey:"prFinalized", resultKey:"prResult", errKey:"prErr", nextKey:null });
        }
      },
    });
  }

  // binds overlay (mobile)
  const pgtBox = document.getElementById("artPGTBox");
  if (pgtBox) pgtBox.addEventListener("click", () => openOpFor("pgt", "PGT", "PGU × quantité"));

  const prgBox = document.getElementById("artPRGBox");
  if (prgBox) prgBox.addEventListener("click", () => openOpFor("prg", "PRG", "PGT + extra × (PGT / PE)"));

  const prBox = document.getElementById("artPRBox");
  if (prBox) prBox.addEventListener("click", () => openOpFor("pr", "PR", "PRG / quantité"));

  const pgtMod = document.getElementById("artPGTModifyOp");
  if (pgtMod) pgtMod.addEventListener("click", () => openOpFor("pgt", "PGT", "PGU × quantité"));

  const prgMod = document.getElementById("artPRGModifyOp");
  if (prgMod) prgMod.addEventListener("click", () => openOpFor("prg", "PRG", "PGT + extra × (PGT / PE)"));

  const prMod = document.getElementById("artPRModifyOp");
  if (prMod) prMod.addEventListener("click", () => openOpFor("pr", "PR", "PRG / quantité"));

  // PC inputs
  function bindOpInputPc(key, boxId) {
    const input = document.getElementById(boxId + "Input");
    const vBtn = document.getElementById(boxId + "Validate");
    if (!input || !vBtn) return;

    input.addEventListener("input", async () => {
      draft[key] = input.value;
      draft[key + "Finalized"] = false;

      const posed = (typeof isOperationPosed === "function") ? isOperationPosed(draft[key]) : false;
      vBtn.disabled = !posed;
      vBtn.style.background = posed ? "#1e5eff" : "";
      vBtn.style.opacity = posed ? "1" : "";

      await safePersistNow();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (!vBtn.disabled) vBtn.click();
      }
    });
  }

  bindOpInputPc("pgt", "artPGTBox");
  bindOpInputPc("prg", "artPRGBox");
  bindOpInputPc("pr",  "artPRBox");
} // ✅ FIN bindArtModalHandlers()


// 6) premier rendu body + bind
rerenderArtModalBody();




    

    const { nameEl } = getArtEls();
if (nameEl) nameEl.focus();
syncOkState();

} // ✅ FIN openArtModal()



  // =========================
  // ✅ MODAL SUPPRESSION (article)
  // =========================
  function closeArtDelModal() {
    const bd = document.getElementById("artDelBackdrop");
    if (bd) bd.remove();
  }

  function openArtDelModal(artId) {
    if (document.getElementById("artDelBackdrop")) return;

    const art = (buy.articles || []).find(a => a.id === artId);
    if (!art) return;

    const bd = document.createElement("div");
    bd.id = "artDelBackdrop";
    bd.className = "cat-del-backdrop";

    bd.innerHTML = `
      <div class="cat-del-modal" role="dialog" aria-modal="true" aria-label="Suppression article">
        <div class="cat-del-text">Supprimer cet article ?</div>
        <div class="cat-del-actions">
          <button id="artDelCancel" class="cat-del-btn cat-del-cancel" type="button">Annuler</button>
          <button id="artDelOk" class="cat-del-btn cat-del-ok" type="button">confirmer</button>
        </div>
      </div>
    `;

    bd.addEventListener("click", (e) => {
      if (e.target === bd) closeArtDelModal();
    });

    document.body.appendChild(bd);

    const cancel = document.getElementById("artDelCancel");
    const ok = document.getElementById("artDelOk");
    if (cancel) cancel.addEventListener("click", closeArtDelModal);

    if (ok) {
      ok.addEventListener("click", async () => {
        // ✅ supprimé le même jour => “n’a jamais existé”
        if (String(art.createdAtIso || "") === String(isoDate)) {
          buy.articles = (buy.articles || []).filter(a => a.id !== artId);

          // ✅ si plus aucune action article aujourd’hui => cercle NON vert
          const d = ensureBuyDayMark(isoDate);
          const anyToday =
            (buy.articles || []).some(a =>
              String(a.createdAtIso || "") === String(isoDate) ||
              String(a.deletedAtIso || "") === String(isoDate)
            );
          d.buyArtTouched = anyToday;
        } else {
          art.deletedAtIso = isoDate;
          art.deletedAtTs = Date.now();
          markBuyTouchedAndPersist();
        }

        await safePersistNow();
        closeArtDelModal();
        renderBuyArticlesPage(isoDate);
      });
    }
  }

  // =========================
// ✅ MODAL "RAJOUT ?" (avant création)
// =========================
function closeArtAddChoiceModal() {
  const bd = document.getElementById("artAddChoiceBackdrop");
  if (bd) bd.remove();
}

function openArtAddChoiceModal() {
  if (document.getElementById("artAddChoiceBackdrop")) return;

  const bd = document.createElement("div");
  bd.id = "artAddChoiceBackdrop";
  bd.className = "cat-del-backdrop";

  bd.innerHTML = `
    <div class="cat-del-modal" role="dialog" aria-modal="true" aria-label="Rajout article">
      <div class="cat-del-text">Rajout ?</div>
      <div class="cat-del-actions">
        <button id="artAddYes" class="cat-del-btn" type="button" style="color:#2e7bff;">oui</button>
        <button id="artAddNo"  class="cat-del-btn" type="button" style="color:#2e7bff;">non</button>
      </div>
    </div>
  `;

  bd.addEventListener("click", (e) => {
    if (e.target === bd) closeArtAddChoiceModal();
  });

  document.body.appendChild(bd);

  const yes = document.getElementById("artAddYes");
  const no  = document.getElementById("artAddNo");

  if (yes) yes.addEventListener("click", () => {
    closeArtAddChoiceModal();
    openArtModal({ mode: "create", isRajout: true });
  });

  if (no) no.addEventListener("click", () => {
    closeArtAddChoiceModal();
    openArtModal({ mode: "create", isRajout: false });
  });
}


  // =========================
  // ✅ Bouton + (création)
  // =========================
  const addBtn = document.getElementById("addArtBtn");
if (addBtn) addBtn.addEventListener("click", () => openArtAddChoiceModal());


  // =========================
  // ✅ Clic crayon / poubelle
  // =========================
  app.querySelectorAll("[data-art-edit]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const id = btn.getAttribute("data-art-edit");
      openArtModal({ mode: "edit", artId: id });
    });
  });

  app.querySelectorAll("[data-art-del]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const id = btn.getAttribute("data-art-del");
      openArtDelModal(id);
    });
  });

  // =========================
  // ✅ Recherche + suggestions dynamiques (nom OU code)
  // =========================
  const search = document.getElementById("buyArtSearch");
  const suggest = document.getElementById("buyArtSuggest");

  function allVisibleForSearch() {
  // ✅ tous les articles actifs enregistrés jusqu’à ce jour inclus
  return activeArticles()
    .filter(a => String(a.createdAtIso || "") <= String(isoDate))
    .sort((a,b) => (b.createdAtTs || 0) - (a.createdAtTs || 0));
}

  function artAddedLabel(a) {
  const d = fromISODate(a.createdAtIso);
  return `Article rajouté le ${formatFullDate(d)}`;
}

function cardWithDate(a) {
  return `
    <div class="buy-art-date">${escapeHtml(artAddedLabel(a))}</div>
    ${cardHTML(a)}
  `;
}
  

  function renderSuggestions(q) {
    const nq = normSearch(q);
    if (!nq) {
      suggest.style.display = "none";
      suggest.innerHTML = "";
      // reset liste
      const listEl = document.getElementById("buyArtList");
      if (listEl) {
        listEl.innerHTML = `
          ${listToday.map(cardHTML).join(
  `<div class="buy-art-space"></div>
   <div class="buy-art-sep" aria-hidden="true"></div>
   <div class="buy-art-space"></div>`
)}

          ${!listToday.length ? `<div style="opacity:.75; font-weight:800; margin-top:10px;">Aucun article ce jour</div>` : ``}
        `;
      }
      return;
    }

    const list = allVisibleForSearch();
    const filtered = list.filter(a => {
      const n = normSearch(a.name);
      const cd = normSearch(a.code);
      return n.includes(nq) || cd.includes(nq);
    });

    const top = filtered.slice(0, 7);
    if (!top.length) {
      suggest.style.display = "none";
      suggest.innerHTML = "";
    } else {
      suggest.innerHTML = top.map(a => {
        const label = `${a.code} — ${a.name}`;
        return `<div class="op-suggest-item" data-art-sel="${escapeAttr(a.id)}">${escapeHtml(label)}</div>`;
      }).join("");
      suggest.style.display = "";
    }

    const listEl = document.getElementById("buyArtList");
    if (listEl) {
      listEl.innerHTML = `
        <div class="buy-cat-section-title">Résultats</div>
        ${filtered.map(cardWithDate).join("")}
      `;

      // rebind edit/del sur résultats
      listEl.querySelectorAll("[data-art-edit]").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          openArtModal({ mode: "edit", artId: btn.getAttribute("data-art-edit") });
        });
      });
      listEl.querySelectorAll("[data-art-del]").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          openArtDelModal(btn.getAttribute("data-art-del"));
        });
      });
    }
  }

  if (search && suggest) {
    search.addEventListener("input", () => renderSuggestions(search.value));

    suggest.addEventListener("click", (e) => {
      const el = e.target.closest(".op-suggest-item");
      if (!el) return;
      const id = el.getAttribute("data-art-sel");

      suggest.style.display = "none";
      suggest.innerHTML = "";

      const art = allVisibleForSearch().find(a => a.id === id);
      const listEl = document.getElementById("buyArtList");
      if (art && listEl) {
        listEl.innerHTML = `
          <div class="buy-cat-section-title">Résultat</div>
          ${cardWithDate(art)}

        `;
        // rebind
        listEl.querySelectorAll("[data-art-edit]").forEach(btn => {
          btn.addEventListener("click", (ev) => {
            ev.preventDefault();
            openArtModal({ mode: "edit", artId: btn.getAttribute("data-art-edit") });
          });
        });
        listEl.querySelectorAll("[data-art-del]").forEach(btn => {
          btn.addEventListener("click", (ev) => {
            ev.preventDefault();
            openArtDelModal(btn.getAttribute("data-art-del") );
          });
        });
      }
    });

    document.addEventListener("pointerdown", (e) => {
      if (suggest.contains(e.target)) return;
      if (search.contains(e.target)) return;
      suggest.style.display = "none";
    }, { capture: true });
  }
}
// ===============================
// ✅ FIN — BUY : Articles
// ===============================




// ===============================
// ✅ DÉBUT — parseRoute()
// ===============================
function parseRoute() {
  const hash = (location.hash || "").replace("#", "");
  if (!hash) return { kind: "home" };

  const parts = hash.split("/");
  const page = parts[0];

  if (!["daily", "weekly", "buy"].includes(page)) return { kind: "home" };
  if (parts.length === 1) return { kind: "calendar", page };

  // #daily/YYYY-MM-DD/menu
  if (page === "daily" && parts.length === 3 && parts[2] === "menu") {
    return { kind: "dailyMenu", page, iso: parts[1] };
  }

  // #daily/YYYY-MM-DD/sale
  if (page === "daily" && parts.length === 3 && parts[2] === "sale") {
    return { kind: "dailySale", page, iso: parts[1] };
  }

  // #buy/YYYY-MM-DD/categories
if (page === "buy" && parts.length === 3 && parts[2] === "categories") {
  return { kind: "buyCategories", page, iso: parts[1] };
}

// #buy/YYYY-MM-DD/articles
if (page === "buy" && parts.length === 3 && parts[2] === "articles") {
  return { kind: "buyArticles", page, iso: parts[1] };
}


  return { kind: "day", page, iso: parts[1] };
}
// ===============================
// ✅ FIN — parseRoute()
// ===============================


function navigateTo(hash) {
  history.pushState({}, "", hash);
  render();
}

function smartBack() {
  const route = parseRoute();

  // ✅ Calendriers => accueil
  if (route.kind === "calendar") return navigateTo("#");

  // ✅ Menu daily => calendrier daily
  if (route.kind === "dailyMenu") return navigateTo("#daily");

  // ✅ Compte du jour => menu du jour
  if (route.kind === "day" && route.page === "daily") return navigateTo(`#daily/${route.iso}/menu`);

  // ✅ Vente du jour => menu du jour
  if (route.kind === "dailySale") return navigateTo(`#daily/${route.iso}/menu`);

  // ✅ BUY : Catégories/Articles => revenir au menu du jour (buy)
if (route.kind === "buyCategories") return navigateTo(`#buy/${route.iso}`);
if (route.kind === "buyArticles") return navigateTo(`#buy/${route.iso}`);


  // ✅ Day weekly/buy => leur calendrier
  if (route.kind === "day" && (route.page === "weekly" || route.page === "buy")) return navigateTo(`#${route.page}`);

  // fallback
  return navigateTo("#");
}


function renderLogin() {
  app.innerHTML = `
    <div class="page">
      <div class="home-wrap">
        <div style="width:min(92vw, 520px); display:flex; flex-direction:column; gap:12px;">
          <div style="text-align:center; font-size:22px; font-weight:800;">Connexion</div>

          <input id="loginUser" class="input" placeholder="Identifiant" autocomplete="username" />
          <div style="display:flex; gap:10px; align-items:center;">
            <input id="loginPass" class="input" placeholder="Mot de passe" type="password"
              autocomplete="current-password" style="flex:1;" />
            <button id="togglePass" class="btn btn-blue lift" type="button" style="min-width:140px;">👁 Afficher</button>
          </div>

          <button id="loginBtn" class="btn btn-blue lift">Se connecter</button>
          <div id="loginErr" style="color:#ff8080; font-weight:700; text-align:center; display:none;"></div>
        </div>
      </div>
    </div>
  `;

  const u = document.getElementById("loginUser");
  const p = document.getElementById("loginPass");
  const b = document.getElementById("loginBtn");
  const e = document.getElementById("loginErr");

  const t = document.getElementById("togglePass");
  if (t && p) {
    t.addEventListener("click", () => {
      const showing = p.type === "text";
      p.type = showing ? "password" : "text";
      t.textContent = showing ? "👁 Afficher" : "🙈 Masquer";
      p.focus();
    });
  }

  async function doLogin() {
    e.style.display = "none";
    b.disabled = true;
    try {
      const user = await apiLogin(u.value.trim(), p.value);
      currentUser = user;
      dailyStore = await apiLoadData();
      navigateTo("#daily");
    } catch (err) {
      e.textContent = err.message || "Erreur";
      e.style.display = "";
    } finally {
      b.disabled = false;
    }
  }

  b.addEventListener("click", doLogin);
  p.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") doLogin();
  });
}

// ===============================
// ✅ DÉBUT — render()
// ===============================
function render() {
  const route = parseRoute();

  if (route.kind === "home") return renderHome();
  if (route.kind === "calendar") return renderCalendarPage(route.page);

  if (route.kind === "dailyMenu") return renderDailyDayMenu(route.iso);
  if (route.kind === "dailySale") return renderDailySalePage(route.iso);

  if (route.kind === "buyCategories") return renderBuyCategoriesPage(route.iso);
if (route.kind === "buyArticles") return renderBuyArticlesPage(route.iso);


  if (route.page === "daily") return renderDailyDayPage(route.iso);
  return renderGenericDayPage(route.page, route.iso);
}
// ===============================
// ✅ FIN — render()
// ===============================


window.addEventListener("popstate", render);

window.addEventListener("unhandledrejection", (event) => {
  console.error("🔥 Unhandled promise rejection:", event.reason);
  alert("Unhandled promise rejection: " + (event.reason?.message || event.reason));
});

window.addEventListener("error", (event) => {
  console.error("🔥 Window error:", event.error || event.message, event);
});


// --------- DÉMARRAGE ---------
(async function startApp() {
  currentUser = await apiGetMe();
  if (!currentUser) {
    renderLogin();
    return;
  }
  dailyStore = await apiLoadData();
  render();
})();
