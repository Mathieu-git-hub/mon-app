// script.js
const app = document.getElementById("app");
let currentUser = null;
let dailyStore = {}; // store chargé depuis la DB

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
    <div class="page">
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
                class="day-box ${isToday ? "today" : ""} ${clsSaved} ${clsMigrated} ${isFutureDay ? "disabled" : ""}"
                data-date="${iso}"
                ${isFutureDay ? "disabled" : ""}
              >${n}</button>
            `;
          })
          .join("")}
      </div>
    </div>
  `;

  document.getElementById("back").addEventListener("click", () => history.back());

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
      z-index: 10000;
      background: #000;
      display: flex;
      flex-direction: column;
    }
    .op-overlay .top {
      padding: 14px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.12);
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .op-overlay .top input {
      flex: 1;
      min-width: 0;
      font-size: 18px;
    }
    .op-overlay .top .btn {
      min-width: 120px;
      white-space: nowrap;
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

    /* ✅ Optionnel : si tu veux un peu moins “massif” dans l’overlay */
    .op-overlay .calcpad button {
      font-size: 16px;
    }

  `;
  document.head.appendChild(st);
}

function openOpOverlay({
  inputEl,          // input original (celui de ta page)
  title = "",       // optionnel, si tu veux l’afficher (sinon laisse vide)
  initialValue = "",
  placeholder = "",
  onCancel = () => {},
  onOk = () => {},  // appelé quand on appuie OK (touche calculette)
} = {}) {
  if (!inputEl) return;

  ensureOpOverlayStyles();
  ensureCalcPadStyles();

  // évite double overlay
  const old = document.getElementById("opOverlay");
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.id = "opOverlay";
  overlay.className = "op-overlay";

  overlay.innerHTML = `
    <div class="top" style="flex-direction:column; align-items:stretch;">
      ${title ? `<div style="font-weight:900; opacity:.9; margin-bottom:8px;">${escapeHtml(title)}</div>` : ``}
      <input id="opOverlayInput" class="input" inputmode="none" readonly
        placeholder="${escapeAttr(placeholder)}" />
    </div>
    <div class="pad-wrap calcpad" id="opOverlayPad"></div>
  `;

  document.body.appendChild(overlay);

  const topInput = document.getElementById("opOverlayInput");
  const padWrap = document.getElementById("opOverlayPad");

  // init
  topInput.value = initialValue || "";
  topInput.focus();

  // IMPORTANT : sync overlay -> input réel (ça déclenche tes règles existantes)
  topInput.addEventListener("input", () => {
    inputEl.value = topInput.value;
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
  });

  function close() {
    overlay.remove();
    // pas de refocus (sinon ça relance l’overlay)
    try { inputEl.blur(); } catch {}
  }

  // Construire la calculette “comme avant” mais DANS l’overlay
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
    return !!(
      data.liquiditeFinalized ||
      data.capitalFinalized ||
      data.caisseDepartFinalized ||
      data.recetteFinalized ||
      data.prtFinalized ||
      data.beneficeReelFinalized ||
      data.nouvelleLiquiditeFinalized ||
      (pDep && pDep.finalized) ||
      (pCap && pCap.finalized) ||
      (pCaisse && pCaisse.finalized) ||
      (pApport && pApport.finalized) ||
      data.nouvelleCaisseReelleFinalized ||
      (nc && nc.finalized)
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
      if (backBtn) backBtn.addEventListener("click", () => history.back());



  



    // -------------------------
  // ✅ Champs numériques simples : chiffres + virgule uniquement
  // liquidite / capital / caisseDepart / prt
  // -------------------------
  function filterDigitsComma(raw) {
    let s = String(raw || "");
    s = s.replace(/\./g, ",");
    let cleaned = s.replace(/[^0-9,]/g, "");
    const firstComma = cleaned.indexOf(",");
    if (firstComma !== -1) {
      cleaned = cleaned.slice(0, firstComma + 1) + cleaned.slice(firstComma + 1).replace(/,/g, "");
    }
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

      nc.items.push({ raw, result: res }); // ✅ le plus récent se retrouve en dessous
      nc.draft = "";
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

        // ✅ copie “validé/terminé” vers le lendemain (sans supprimer le jour)
        if (data.liquiditeFinalized) { dst.liquidite = data.liquidite; dst.liquiditeFinalized = true; }
        if (data.capitalFinalized) { dst.capital = data.capital; dst.capitalFinalized = true; }
        if (data.caisseDepartFinalized) { dst.caisseDepart = data.caisseDepart; dst.caisseDepartFinalized = true; }
        if (data.prtFinalized) { dst.prt = data.prt; dst.prtFinalized = true; }

        if (data.nouvelleCaisseReelleFinalized) {
          dst.nouvelleCaisseReelle = data.nouvelleCaisseReelle;
          dst.nouvelleCaisseReelleFinalized = true;
        }


        if (data.recetteFinalized) { dst.recette = data.recette; dst.recetteFinalized = true; }
        if (data.beneficeReelFinalized) { dst.beneficeReel = data.beneficeReel; dst.beneficeReelFinalized = true; dst.beneficeReelError = false; }
        if (data.nouvelleLiquiditeFinalized) { dst.nouvelleLiquidite = data.nouvelleLiquidite; dst.nouvelleLiquiditeFinalized = true; }

        if (pDep?.finalized) {
          dst.depenses = { items: deepClone(pDep.items || []), editing: false, finalized: true, draft: "" };
        }
        if (pCap?.finalized) {
          dst.prelevement = { items: deepClone(pCap.items || []), editing: false, finalized: true, draft: "" };
        }
        if (pApport?.finalized) {
  dst.apport = { items: deepClone(pApport.items || []), editing: false, finalized: true, draft: "" };
}

        if (pCaisse?.finalized) {
          dst.prelevementCaisse = { items: deepClone(pCaisse.items || []), editing: false, finalized: true, draft: "" };
        }


        if (nc?.finalized) {
          dst.nouveauCapitalStack = deepClone(nc);
          dst.nouveauCapitalStack.editIndex = null;
          dst.nouveauCapitalStack.editDraft = "";
          dst.nouveauCapitalStack.editError = false;
          dst.nouveauCapitalStack.draftError = false;
          dst.nouveauCapitalStack.draft = "";
          dst.nouveauCapitalStack.finalized = true;
        }

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
        <button id="saleDay" class="btn btn-blue lift" style="min-width:220px;">Vente du jour</button>
        <button id="accountDay" class="btn btn-blue lift" style="min-width:220px;">Compte du jour</button>
      </div>
    </div>
  </div>
`;


  bindPrevNextDayButtons(isoDate, { baseHashPrefix: `#${pageName}/` });

  const hb = document.getElementById("homeBtn");
  if (hb) hb.addEventListener("click", () => navigateTo("#"));


  document.getElementById("back").addEventListener("click", () => history.back());
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


  document.getElementById("back").addEventListener("click", () => history.back());
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
      <div style="text-align:center; opacity:0.9; font-weight:800; margin-top:18px;">
        Vente du jour (à construire)
      </div>
    </div>
  </div>
`;


  bindPrevNextDayButtons(isoDate, { baseHashPrefix: "#daily/" });

  // ✅ on force la route /sale
  const prev = document.getElementById("prevDay");
  const next = document.getElementById("nextDay");
  if (prev) prev.onclick = () => navigateTo(`#daily/${addDaysIso(isoDate,-1)}/sale`);
  if (next && !next.disabled) next.onclick = () => navigateTo(`#daily/${addDaysIso(isoDate,+1)}/sale`);


  document.getElementById("back").addEventListener("click", () => history.back());

  const hb = document.getElementById("homeBtn");
  if (hb) hb.addEventListener("click", () => navigateTo("#"));

  const cb = document.getElementById("calBtn");
  if (cb) cb.addEventListener("click", () => navigateTo("#daily"));


}
// ===============================
// ✅ FIN — renderDailySalePage(isoDate)
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

  return { kind: "day", page, iso: parts[1] };
}
// ===============================
// ✅ FIN — parseRoute()
// ===============================


function navigateTo(hash) {
  history.pushState({}, "", hash);
  render();
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

  if (route.page === "daily") return renderDailyDayPage(route.iso);
  return renderGenericDayPage(route.page, route.iso);
}
// ===============================
// ✅ FIN — render()
// ===============================


window.addEventListener("popstate", render);

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
