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

      caisseDepart: "",
      caisseDepartFinalized: false,

      // ✅ Dépenses (comme prélèvements)
      depenses: { items: [], editing: false, finalized: false, draft: "" },

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
      prelevement: { items: [], editing: false, finalized: false, draft: "" },

      // ✅ Prélèvement sur caisse
      prelevementCaisse: { items: [], editing: false, finalized: false, draft: "" },

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
  return n.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
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

/* -------------------------
   ✅ RÈGLES "OPÉRATIONS"
------------------------- */
function normalizeOp(s) {
  return String(s || "").replace(/\s+/g, "").replace(",", ".");
}

function charsAllowedForOpInput(value) {
  return /^[0-9\s.,+\-]*$/.test(value);
}

function isOperationPosed(raw) {
  const s = normalizeOp(raw);
  if (s === "") return false;
  if (!/^[0-9+\-\.]*$/.test(s)) return false;

  const withoutLeadingSign = s.replace(/^[+\-]/, "");
  if (!/[+\-]/.test(withoutLeadingSign)) return false;

  const re = /^[+\-]?\d+(?:\.\d+)?(?:[+\-]\d+(?:\.\d+)?)+$/;
  return re.test(s);
}

function evalOperation(raw) {
  const s = normalizeOp(raw);
  if (!isOperationPosed(raw)) return null;

  let i = 0;
  let total = 0;

  function readNumber() {
    let start = i;
    while (i < s.length && /[0-9.]/.test(s[i])) i++;
    const part = s.slice(start, i);
    const n = parseFloat(part);
    return Number.isFinite(n) ? n : null;
  }

  let sign = +1;
  if (s[i] === "+") { sign = +1; i++; }
  else if (s[i] === "-") { sign = -1; i++; }

  const first = readNumber();
  if (first === null) return null;
  total = sign * first;

  while (i < s.length) {
    const op = s[i];
    if (op !== "+" && op !== "-") return null;
    i++;

    const n = readNumber();
    if (n === null) return null;

    total = op === "+" ? total + n : total - n;
  }

  return total;
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

  const draft = (p.draft || "").trim();
  const draftHasText = draft.length > 0;
  const draftIsValid = !draftHasText ? false : toNumberLoose(p.draft) !== null;

  const finishPseudoDisabled = draftHasText; // tant qu'il y a quelque chose, terminer est grisé
  const hideModifyStyle = daySaved ? 'style="display:none;"' : "";

  // ✅ Après Enregistrer : prélevement sur capital = colonne verticale
  const forceColumn = daySaved && prefix === "prelevCap";
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
                      <div class="card card-white lift" ${forceColumn ? `style="width:100%;"` : ``}>
                        ${escapeHtml(val)}
                        ${
                          !p.finalized
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
                        <div class="card card-white lift">Total : ${formatTotal(total)}</div>
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
                        value="${escapeAttr(p.draft)}" style="flex:1; min-width: 220px;" />
                      <button id="${prefix}Validate" class="btn btn-blue lift"
                        ${draftIsValid ? "" : "disabled"}>Valider</button>
                      <button id="${prefix}Finish" class="btn btn-green lift ${
                        finishPseudoDisabled ? "pseudo-disabled" : ""
                      }">Terminer</button>
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

  function syncButtonsFromDraft() {
    if (!validateBtn && !finishBtn) return;
    const draft = (p.draft || "").trim();
    const hasText = draft.length > 0;
    const ok = hasText ? toNumberLoose(p.draft) !== null : false;

    if (validateBtn) validateBtn.disabled = !ok;
    if (finishBtn) {
      if (hasText) finishBtn.classList.add("pseudo-disabled");
      else finishBtn.classList.remove("pseudo-disabled");
    }
  }

  if (input) {
    let lastValid = p.draft || "";

    input.addEventListener("input", () => {
      const value = input.value;

      const charsOk = /^[0-9\s.,]*$/.test(value);
      const numericOk = value.trim() === "" || toNumberLoose(value) !== null;

      if (charsOk && numericOk) {
        lastValid = value;
        p.draft = value;
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
      const draftHasText = (p.draft || "").trim().length > 0;

      if (draftHasText) {
        if (input) shake(input);
        shake(finishBtn);
        e.preventDefault();
        return;
      }

      p.finalized = true;
      p.editing = false;
      p.draft = "";
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
}

// ===============================
// ✅ DÉBUT — renderDailyDayPage(isoDate)
// ===============================
function renderDailyDayPage(isoDate) {
  const date = fromISODate(isoDate);
  const data = getDailyData(isoDate);

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
              <div class="total-row" style="width:100%;">
                <div class="card card-white lift" style="flex:1; min-width:220px;">
                  ${
                    nc.items[0]
                      ? `${escapeHtml(nc.items[0].raw)} = ${formatTotal(nc.items[0].result ?? 0)}`
                      : `0`
                  }
                </div>
              </div>
              ${
                nc.items.length > 1
                  ? `<div style="margin-top:10px;">${ncFinalList}</div>`
                  : `<div style="display:flex; justify-content:center; margin-top:2px;">
                       <button id="ncModifyAll" class="btn btn-blue lift" ${hideModifyStyle}>Modifier</button>
                     </div>`
              }
            `
            : ncFinalList
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
      pCap.finalized &&
      pCaisse.finalized &&
      pDep.finalized &&
      ncr.finalized &&
      nc.finalized;

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
      (ncr && ncr.finalized) ||
      (nc && nc.finalized)
    );
  }
  const migrateEligible = computeMigrateEligible();

  // ✅ caisse départ après prélèvement (affiché seulement après Enregistrer, si total ≠ 0)
  const caisseDepartNum = toNumberLoose(data.caisseDepart || "0") ?? 0;
  const prelevCaisseTotal = computePrelevementTotal((pCaisse && pCaisse.items) ? pCaisse.items : []);
  const showCaisseDepartAfterPrelev =
    data.daySaved &&
    !!pCaisse?.finalized &&
    Math.abs(prelevCaisseTotal) > 0.0000001;

  const caisseDepartAfter = caisseDepartNum - prelevCaisseTotal;

  // -------------------------
  // ✅ RENDU
  // -------------------------
  app.innerHTML = `
    <div class="page">
      <button id="back" class="back-btn">← Retour</button>

      <div class="day-page">
        <div class="date-title">${formatFullDate(date)}</div>

        <div class="form-col">

          <!-- LIQUIDITÉS -->
          <div class="${rowClass}">
            <div class="label">Liquidités :</div>
            ${
              data.liquiditeFinalized
                ? `
                  <div class="total-row">
                    <div class="card card-white lift">${escapeHtml(data.liquidite || "0")}</div>
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
                    <div class="card card-white lift">${escapeHtml(data.capital || "0")}</div>
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

          <!-- CAISSE DÉPART -->
          <div class="${rowClass}">
            <div class="label">Caisse départ :</div>
            ${
              data.caisseDepartFinalized
                ? `
                  <div class="total-row">
                    <div class="card card-white lift">${escapeHtml(data.caisseDepart || "0")}</div>
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

          ${
            showCaisseDepartAfterPrelev
              ? `
                <div class="${rowClass}">
                  <div class="label">Caisse départ après prélèvement :</div>
                  <div class="total-row">
                    <div class="card card-white lift">
                      ${escapeHtml(data.caisseDepart || "0")} - ${formatCommaNumber(prelevCaisseTotal)} = ${formatCommaNumber(caisseDepartAfter)}
                    </div>
                  </div>
                </div>
              `
              : ``
          }

          <!-- ✅ DÉPENSES (pile) -->
          ${renderPrelevementSectionHTML(pDep, "depenses", "Dépenses", rowClass, data.daySaved)}
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

          <!-- PRÉLÈVEMENT SUR CAPITAL -->
          ${renderPrelevementSectionHTML(pCap, "prelevCap", "Prélèvement sur capital", rowClass, data.daySaved)}

          <!-- PRÉLÈVEMENT SUR CAISSE -->
          ${renderPrelevementSectionHTML(pCaisse, "prelevCaisse", "Prélèvement sur caisse", rowClass, data.daySaved)}

          <!-- RECETTE -->
          <div class="${rowClass}">
            <div class="label">Recette :</div>
            ${
              data.recetteFinalized
                ? `
                  <div class="total-row">
                    <div class="card card-white lift">
                      ${escapeHtml(data.recette || "0")} = ${formatTotal(recetteRes ?? 0)}
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
                    <div class="card card-white lift">${escapeHtml(data.prt || "0")}</div>
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
                    <div class="card card-white lift">${escapeHtml(data.beneficeReel || "0")}</div>
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

          ${ncrSectionHTML}
          ${ncSectionHTML}

          <!-- NOUVELLE LIQUIDITÉ -->
          <div class="${rowClass}">
            <div class="label">Nouvelle liquidité :</div>
            ${
              data.nouvelleLiquiditeFinalized
                ? `
                  <div class="total-row">
                    <div class="card card-white lift">
                      ${escapeHtml(data.nouvelleLiquidite || "0")} = ${formatTotal(nlRes ?? 0)}
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

  document.getElementById("back").addEventListener("click", () => history.back());

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

  if (!data.liquiditeFinalized)
    bindNumericFinalize("liquidite", "liquidite", "liquiditeFinalized", "liquiditeValidate", "liquiditeModify");
  else bindNumericFinalize(null, "liquidite", "liquiditeFinalized", "liquiditeValidate", "liquiditeModify");

  if (!data.capitalFinalized)
    bindNumericFinalize("capital", "capital", "capitalFinalized", "capitalValidate", "capitalModify");
  else bindNumericFinalize(null, "capital", "capitalFinalized", "capitalValidate", "capitalModify");

  if (!data.caisseDepartFinalized)
    bindNumericFinalize("caisseDepart", "caisseDepart", "caisseDepartFinalized", "caisseDepartValidate", "caisseDepartModify");
  else
    bindNumericFinalize(null, "caisseDepart", "caisseDepart", "caisseDepartValidate", "caisseDepartModify"); // (sans effet, mais gardé)

  if (!data.prtFinalized) bindNumericFinalize("prt", "prt", "prtFinalized", "prtValidate", "prtModify");
  else bindNumericFinalize(null, "prt", "prtFinalized", "prtValidate", "prtModify");

  // -------------------------
  // ✅ Prélèvements + Dépenses
  // -------------------------
  bindPrelevementHandlers(pDep, "depenses", isoDate, markDirty);
  bindPrelevementHandlers(pCap, "prelevCap", isoDate, markDirty);
  bindPrelevementHandlers(pCaisse, "prelevCaisse", isoDate, markDirty);

  // -------------------------
  // ✅ Opérations (Recette / NL / Bénéfice réel)
  // -------------------------
  function bindOpInput(inputId, dataKey, buttonId, onValid) {
    const input = document.getElementById(inputId);
    const btn = buttonId ? document.getElementById(buttonId) : null;
    if (!input) return;

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
    let lastValid = getVal() || "";

    inputEl.addEventListener("input", () => {
      const value = inputEl.value;

      if (!charsAllowedForOpInput(value)) {
        inputEl.value = lastValid;
        inputEl.classList.add("error");
        shake(inputEl);
        return;
      }

      lastValid = value;
      setVal(value);
      markDirty();

      const hasText = value.trim().length > 0;
      const ok = isOperationPosed(value);

      if (hasText && !ok) inputEl.classList.add("error");
      else inputEl.classList.remove("error");

      if (typeof clearErrorFlag === "function") clearErrorFlag(false);
    });

    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const id = inputEl.id;
        const validateId =
          id === "ncDraft"
            ? "ncValidate"
            : id === "ncEditInput"
              ? "ncEditValidate"
              : id === "ncrDraft"
                ? "ncrValidate"
                : id === "ncrEditInput"
                  ? "ncrEditValidate"
                  : null;
        if (!validateId) return;
        const vb = document.getElementById(validateId);
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

        if (data.recetteFinalized) { dst.recette = data.recette; dst.recetteFinalized = true; }
        if (data.beneficeReelFinalized) { dst.beneficeReel = data.beneficeReel; dst.beneficeReelFinalized = true; dst.beneficeReelError = false; }
        if (data.nouvelleLiquiditeFinalized) { dst.nouvelleLiquidite = data.nouvelleLiquidite; dst.nouvelleLiquiditeFinalized = true; }

        if (pDep?.finalized) {
          dst.depenses = { items: deepClone(pDep.items || []), editing: false, finalized: true, draft: "" };
        }
        if (pCap?.finalized) {
          dst.prelevement = { items: deepClone(pCap.items || []), editing: false, finalized: true, draft: "" };
        }
        if (pCaisse?.finalized) {
          dst.prelevementCaisse = { items: deepClone(pCaisse.items || []), editing: false, finalized: true, draft: "" };
        }

        if (ncr?.finalized) {
          dst.nouvelleCaisseReelleStack = deepClone(ncr);
          dst.nouvelleCaisseReelleStack.editIndex = null;
          dst.nouvelleCaisseReelleStack.editDraft = "";
          dst.nouvelleCaisseReelleStack.editError = false;
          dst.nouvelleCaisseReelleStack.draftError = false;
          dst.nouvelleCaisseReelleStack.draft = "";
          dst.nouvelleCaisseReelleStack.finalized = true;
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
  const raw = (p.draft || "").trim();

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
  p.items.unshift(normalized);
  p.draft = "";
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
      <button id="back" class="back-btn">← Retour</button>
      <div class="day-page">
        <div class="date-title">${formatFullDate(date)}</div>
      </div>
    </div>
  `;
  document.getElementById("back").addEventListener("click", () => history.back());
}

// ===============================
// ✅ DÉBUT — renderDailyDayMenu(isoDate)
// ===============================
function renderDailyDayMenu(isoDate) {
  const date = fromISODate(isoDate);

  app.innerHTML = `
    <div class="page">
      <button id="back" class="back-btn">← Retour</button>

      <div class="day-page">
        <div class="date-title">${formatFullDate(date)}</div>

        <div style="display:flex; justify-content:center; align-items:center; gap:14px; margin-top:18px; flex-wrap:wrap;">
          <button id="saleDay" class="btn btn-blue lift" style="min-width:220px;">Vente du jour</button>
          <button id="accountDay" class="btn btn-blue lift" style="min-width:220px;">Compte du jour</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("back").addEventListener("click", () => history.back());
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
      <button id="back" class="back-btn">← Retour</button>

      <div class="day-page">
        <div class="date-title">${formatFullDate(date)}</div>
        <div style="text-align:center; opacity:0.9; font-weight:800; margin-top:18px;">
          Vente du jour (à construire)
        </div>
      </div>
    </div>
  `;

  document.getElementById("back").addEventListener("click", () => history.back());
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
