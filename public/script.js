// script.js
const app = document.getElementById("app");

/* =========================================================
   ✅ STYLE GLOBAL : griser tous les boutons non cliquables
   - Tous les <button disabled> seront automatiquement gris
   - Pour les cas "non appuyable mais doit rester cliquable"
     (ex: Terminer Nouveau capital => shake), on utilise
     la classe .pseudo-disabled
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

/**
 * Stockage en mémoire (pour l’instant).
 * Plus tard : localStorage / serveur.
 */
const dailyStore = {};

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
      <div class="home-wrap">
        <div class="home-row">
          <button id="daily" class="big-btn">Compte quotidien</button>
          <button id="weekly" class="big-btn">Compte hebdomadaire</button>
          <button id="buy" class="big-btn">Compte d’achat</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("daily").addEventListener("click", () => navigateTo("#daily"));
  document.getElementById("weekly").addEventListener("click", () => navigateTo("#weekly"));
  document.getElementById("buy").addEventListener("click", () => navigateTo("#buy"));
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
 * - "50"
 * - "12,5"
 * - "12.5"
 * - "1 000,50"
 */
function toNumberLoose(value) {
  if (typeof value !== "string") return null;

  const cleaned = value.trim().replace(/\s+/g, "").replace(",", ".");

  if (cleaned === "" || cleaned === "." || cleaned === "-") return null;

  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
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

// --------- CALENDRIER ---------

function renderCalendarPage(pageName) {
  const offset = monthOffsetByPage[pageName] ?? 0;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const currentMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const shownMonthDate = addMonths(currentMonthDate, offset);

  const showRight = offset < 0;

  const dows = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const cells = buildCalendarCells(shownMonthDate);

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

            return `
              <button
                class="day-box ${isToday ? "today" : ""} ${isFutureDay ? "disabled" : ""}"
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
      navigateTo(`#${pageName}/${iso}`);
    });
  });
}

// --------- PAGE "COMPTE QUOTIDIEN" ---------

function getDailyData(isoDate) {
  if (!dailyStore[isoDate]) {
    dailyStore[isoDate] = {
      liquidite: "",
      liquiditeFinalized: false,

      capital: "",
      capitalFinalized: false,

      // ✅ caisse départ
      caisseDepart: "",
      caisseDepartFinalized: false,

      depense: "",
      depenseFinalized: false,

      recette: "",
      recetteFinalized: false,

      prt: "",
      prtFinalized: false,

      // ✅ bénéfice réel : valeur + état (ANCIEN CONSERVÉ)
      beneficeReel: "",
      beneficeReelFinalized: false,
      beneficeReelError: false,

      // ⚠️ ancien compat (on garde les champs mais on ne les utilise plus en rendu)
      nouvelleCaisseReelle: "",
      nouvelleCaisseReelleFinalized: false,

      // ✅ NOUVELLE STRUCTURE : Nouvelle caisse réelle (mêmes règles que Nouveau capital)
      nouvelleCaisseReelleStack: {
        items: [], // { raw, result }
        draft: "",
        finalized: false,
        editIndex: null,
        editDraft: "",
        editError: false,
        draftError: false,
      },

      // ⚠️ ancien (compat)
      nouveauCapital: "",
      nouveauCapitalFinalized: false,

      // ✅ NOUVELLE STRUCTURE pour "Nouveau capital"
      nouveauCapitalStack: {
        items: [], // { raw, result }
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
      prelevement: {
        items: [],
        editing: false,
        finalized: false,
        draft: "",
      },

      // ✅ prélèvement sur caisse
      prelevementCaisse: {
        items: [],
        editing: false,
        finalized: false,
        draft: "",
      },

      // ✅ état "enregistrer" de la page
      daySaved: false,
    };
  }

  const d = dailyStore[isoDate];

  // migrations (valeurs par défaut si manquantes)
  if (d.beneficeReelFinalized == null) d.beneficeReelFinalized = false;
  if (d.beneficeReelError == null) d.beneficeReelError = false;

  if (d.recetteFinalized == null) d.recetteFinalized = false;
  if (d.nouveauCapitalFinalized == null) d.nouveauCapitalFinalized = false;
  if (d.nouvelleLiquiditeFinalized == null) d.nouvelleLiquiditeFinalized = false;

  if (d.liquiditeFinalized == null) d.liquiditeFinalized = false;
  if (d.capitalFinalized == null) d.capitalFinalized = false;

  if (d.caisseDepartFinalized == null) d.caisseDepartFinalized = false;
  if (d.caisseDepart == null) d.caisseDepart = "";

  if (d.depenseFinalized == null) d.depenseFinalized = false;
  if (d.prtFinalized == null) d.prtFinalized = false;

  if (d.daySaved == null) d.daySaved = false;

  // migration nouveauCapitalStack
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

  // migration prélèvement sur caisse
  if (!d.prelevementCaisse) {
    d.prelevementCaisse = { items: [], editing: false, finalized: false, draft: "" };
  }

  // migration nouvelleCaisseReelleStack
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
  if (s[i] === "+") {
    sign = +1;
    i++;
  } else if (s[i] === "-") {
    sign = -1;
    i++;
  }

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
   ✅ PRÉLÈVEMENT (générique)
   - Valider grisé tant que draft vide / invalide
   - Quand draft a du texte => Valider actif, Terminer grisé (non appuyable)
   - Terminer valide seulement si draft vide (donc après Valider OU effacement)
   - Entrée = Valider
------------------------- */

function renderPrelevementSectionHTML(p, prefix, label, rowClass, daySaved) {
  const total = computePrelevementTotal(p.items);
  const showInitialButtons = !p.editing && !p.finalized && p.items.length === 0;

  const draft = (p.draft || "").trim();
  const draftHasText = draft.length > 0;
  const draftIsValid = !draftHasText ? false : toNumberLoose(p.draft) !== null;

  const finishPseudoDisabled = draftHasText; // tant qu'il y a quelque chose, terminer est grisé
  const hideModifyStyle = daySaved ? 'style="display:none;"' : "";

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
              <div class="prelev-items" id="${prefix}Items">
                ${p.items
                  .map(
                    (val, idx) => `
                      <div class="card card-white lift">
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


function bindPrelevementHandlers(p, prefix, isoDate, onDirty) {
  const addBtn = document.getElementById(`${prefix}Add`);
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      p.editing = true;
      p.finalized = false;
      if (typeof onDirty === "function") onDirty();
      renderDailyDayPage(isoDate);
    });
  }

  const finishDirectBtn = document.getElementById(`${prefix}FinishDirect`);
  if (finishDirectBtn) {
    finishDirectBtn.addEventListener("click", () => {
      p.finalized = true;
      p.editing = false;
      p.draft = "";
      if (typeof onDirty === "function") onDirty();
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
        if (validateBtn && !validateBtn.disabled) validateBtn.click(); // Entrée = Valider
      }
    });

    syncButtonsFromDraft();
  }

  if (validateBtn) validateBtn.addEventListener("click", () => doPrelevValidate(p, prefix, isoDate, onDirty));

  if (finishBtn) {
    finishBtn.addEventListener("click", (e) => {
      const draftHasText = (p.draft || "").trim().length > 0;

      if (draftHasText) {
        // grisé/non valide => shake input + bouton
        if (input) shake(input);
        shake(finishBtn);
        e.preventDefault();
        return;
      }

      p.finalized = true;
      p.editing = false;
      p.draft = "";
      if (typeof onDirty === "function") onDirty();
      renderDailyDayPage(isoDate);
    });
  }

  const modifyBtn = document.getElementById(`${prefix}Modify`);
  if (modifyBtn) {
    modifyBtn.addEventListener("click", () => {
      p.finalized = false;
      p.editing = true;
      if (typeof onDirty === "function") onDirty();
      renderDailyDayPage(isoDate);
    });
  }

  app.querySelectorAll("[data-prelev-del]").forEach((xbtn) => {
    const payload = xbtn.getAttribute("data-prelev-del") || "";
    const [pfx, idxStr] = payload.split(":");
    if (pfx !== prefix) return;

    xbtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const idx = Number(idxStr);
      if (!Number.isFinite(idx)) return;

      p.items.splice(idx, 1);

      p.editing = true;
      p.finalized = false;
      if (p.items.length === 0) p.draft = "";

      if (typeof onDirty === "function") onDirty();
      renderDailyDayPage(isoDate);
    });
  });
}

/* -------------------------
   ✅ PAGE JOUR (DAILY)
------------------------- */

function renderDailyDayPage(isoDate) {
  const date = fromISODate(isoDate);
  const data = getDailyData(isoDate);

  const pCap = data.prelevement; // prélèvement sur capital
  const pCaisse = data.prelevementCaisse; // prélèvement sur caisse

  const placeholders = {
    liquidite: "(...)",
    capital: "(...)",
    caisseDepart: "(...)",
    depense: "(...)",
    recette: "(ex: 10+2-1,5)",
    beneficeReel: "(ex: 50-12,5)",
    nouvelleLiquidite: "(ex: 80+5)",
    prt: "(...)",
  };

  // état "dirty"
  function markDirty() {
    data.daySaved = false;
  }

  // ✅ AJOUT ICI
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
  // ✅ NOUVEAU CAPITAL (pile)
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

  const ncSectionHTML = nc.finalized
    ? `
      <div class="${rowClass}">
        <div class="label">Nouveau capital :</div>

        <div style="display:flex; flex-direction:column; gap:10px;">
          ${nc.items
            .map(
              (it) => `
                <div class="card card-white lift" style="width:100%;">
                  ${escapeHtml(it.raw)} = ${formatTotal(it.result ?? 0)}
                </div>
              `
            )
            .join("")}
        </div>

        <div style="display:flex; justify-content:center; margin-top:12px;">
          <button id="ncModifyAll" class="btn btn-blue lift">Modifier</button>
        </div>
      </div>
    `
    : `
      <div class="row">
        <div class="label">Nouveau capital :</div>

        ${ncItemsHTML_editing}

        <div style="margin-top:10px;">
          ${ncInputHTML}
        </div>
      </div>
    `;

  // -------------------------
  // ✅ NOUVELLE CAISSE RÉELLE (pile) — mêmes règles que Nouveau capital
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

  const ncrSectionHTML = ncr.finalized
    ? `
      <div class="row">
        <div class="label">Nouvelle caisse réelle :</div>

        <div style="display:flex; flex-direction:column; gap:10px;">
          ${ncr.items
            .map(
              (it) => `
                <div class="card card-white lift" style="width:100%;">
                  ${escapeHtml(it.raw)} = ${formatTotal(it.result ?? 0)}
                </div>
              `
            )
            .join("")}
        </div>

        <div style="display:flex; justify-content:center; margin-top:12px;">
          <button id="ncrModifyAll" class="btn btn-blue lift">Modifier</button>
        </div>
      </div>
    `
    : `
      <div class="row">
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
      data.depenseFinalized &&
      data.recetteFinalized &&
      data.prtFinalized &&
      data.beneficeReelFinalized &&
      data.nouvelleLiquiditeFinalized;

    const requiredRecorded =
      pCap.finalized &&
      pCaisse.finalized &&
      ncr.finalized &&
      nc.finalized;

    return !!(requiredFinalized && requiredRecorded);
  }

  let saveEligible = computeSaveEligible();
  if (data.daySaved && !saveEligible) data.daySaved = false;
  saveEligible = computeSaveEligible();

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
                    <input class="input" id="liquidite" placeholder="${placeholders.liquidite}" value="${escapeAttr(
                      data.liquidite
                    )}" style="flex:1; min-width: 220px;" />
                    <button id="liquiditeValidate" class="btn btn-green lift" style="${
                      (data.liquidite || "").trim() ? "" : "display:none;"
                    }">Valider</button>
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
                    <input class="input" id="capital" placeholder="${placeholders.capital}" value="${escapeAttr(
                      data.capital
                    )}" style="flex:1; min-width: 220px;" />
                    <button id="capitalValidate" class="btn btn-green lift" style="${
                      (data.capital || "").trim() ? "" : "display:none;"
                    }">Valider</button>
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
                    <input class="input" id="caisseDepart" placeholder="${placeholders.caisseDepart}" value="${escapeAttr(
                      data.caisseDepart
                    )}" style="flex:1; min-width: 220px;" />
                    <button id="caisseDepartValidate" class="btn btn-green lift" style="${
                      (data.caisseDepart || "").trim() ? "" : "display:none;"
                    }">Valider</button>
                  </div>
                `
            }
          </div>

          <!-- DÉPENSES -->
          <div class="${rowClass}">
            <div class="label">Dépenses :</div>
            ${
              data.depenseFinalized
                ? `
                  <div class="total-row">
                    <div class="card card-white lift">${escapeHtml(data.depense || "0")}</div>
                    <button id="depenseModify" class="btn btn-blue lift" ${hideModifyStyle}>Modifier</button>
                  </div>
                `
                : `
                  <div class="inline-actions">
                    <input class="input" id="depense" placeholder="${placeholders.depense}" value="${escapeAttr(
                      data.depense
                    )}" style="flex:1; min-width: 220px;" />
                    <button id="depenseValidate" class="btn btn-green lift" style="${
                      (data.depense || "").trim() ? "" : "display:none;"
                    }">Valider</button>
                  </div>
                `
            }
          </div>

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
                    <input class="input" id="prt" placeholder="${placeholders.prt}" value="${escapeAttr(
                      data.prt
                    )}" style="flex:1; min-width: 220px;" />
                    <button id="prtValidate" class="btn btn-green lift" style="${
                      (data.prt || "").trim() ? "" : "display:none;"
                    }">Valider</button>
                  </div>
                `
            }
          </div>

          <!-- BÉNÉFICE RÉEL (inchangé) -->
          <div class="${rowClass}">
            <div class="label">Bénéfice réel :</div>

            ${
              data.beneficeReelFinalized
                ? `
                  <div class="total-row">
                    <div class="card card-white lift">${escapeHtml(data.beneficeReel || "0")}</div>
                    <button id="benefModify" class="btn btn-blue lift" ${hideModifyStyle}>Modifier</button>
                  </div>

                  <div class="row" style="margin-top: 8px;">
                    <div class="label">Bénéfice réel total :</div>
                    <div class="card card-white lift">Total : ${formatTotal(monthTotal)}</div>
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

          <!-- ✅ NOUVELLE CAISSE RÉELLE (pile) -->
          ${ncrSectionHTML}

          <!-- NOUVEAU CAPITAL (pile) -->
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

          <!-- ✅ ENREGISTRER / MODIFIER (global) -->
<div style="display:flex; justify-content:center; margin-top: 16px;">
  ${
    !data.daySaved
      ? `
        <button id="saveDay" class="btn btn-green lift"
          ${saveEligible ? "" : "disabled"}
          style="min-width: 220px;">
          Enregistrer
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
  // liquidite / capital / caisseDepart / depense / prt
  // Entrée = Valider
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

    if (input) {
      function sync() {
        const hasText = (data[key] || "").trim().length > 0;
        if (validateBtn) validateBtn.style.display = hasText ? "" : "none";
      }

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

      if (validateBtn) {
        validateBtn.addEventListener("click", () => {
          const v = (data[key] || "").trim();
          if (!v) {
            validateBtn.style.display = "none";
            return;
          }
          data[finalizedKey] = true;
          markDirty();
          renderDailyDayPage(isoDate);
        });
      }
    }

    if (modifyBtn) {
      modifyBtn.addEventListener("click", () => {
        data[finalizedKey] = false;
        markDirty();
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
    bindNumericFinalize(
      "caisseDepart",
      "caisseDepart",
      "caisseDepartFinalized",
      "caisseDepartValidate",
      "caisseDepartModify"
    );
  else
    bindNumericFinalize(
      null,
      "caisseDepart",
      "caisseDepartFinalized",
      "caisseDepartValidate",
      "caisseDepartModify"
    );

  if (!data.depenseFinalized)
    bindNumericFinalize("depense", "depense", "depenseFinalized", "depenseValidate", "depenseModify");
  else bindNumericFinalize(null, "depense", "depenseFinalized", "depenseValidate", "depenseModify");

  if (!data.prtFinalized) bindNumericFinalize("prt", "prt", "prtFinalized", "prtValidate", "prtModify");
  else bindNumericFinalize(null, "prt", "prtFinalized", "prtValidate", "prtModify");

  // -------------------------
  // ✅ Prélèvements (nouvelles règles boutons)
  // -------------------------
  bindPrelevementHandlers(pCap, "prelevCap", isoDate, markDirty);
  bindPrelevementHandlers(pCaisse, "prelevCaisse", isoDate, markDirty);

  // -------------------------
  // ✅ Handlers champs opérations (Recette / NL / Bénéfice réel)
  // Entrée = Valider
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
      btn.addEventListener("click", (e) => {
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

        if (typeof onValid === "function") onValid(v, result);
      });
    }
  }

  // Recette
  if (!data.recetteFinalized) {
    bindOpInput("recette", "recette", "recetteValidate", () => {
      data.recetteFinalized = true;
      markDirty();
      renderDailyDayPage(isoDate);
    });
  }

  // NL
  if (!data.nouvelleLiquiditeFinalized) {
    bindOpInput("nouvelleLiquidite", "nouvelleLiquidite", "nlValidate", () => {
      data.nouvelleLiquiditeFinalized = true;
      markDirty();
      renderDailyDayPage(isoDate);
    });
  }

  const recetteModify = document.getElementById("recetteModify");
  if (recetteModify)
    recetteModify.addEventListener("click", () => {
      data.recetteFinalized = false;
      markDirty();
      renderDailyDayPage(isoDate);
    });

  const nlModify = document.getElementById("nlModify");
  if (nlModify)
    nlModify.addEventListener("click", () => {
      data.nouvelleLiquiditeFinalized = false;
      markDirty();
      renderDailyDayPage(isoDate);
    });

  // Bénéfice réel (inchangé + Entrée=Valider via bindOpInput)
  if (!data.beneficeReelFinalized) {
    bindOpInput("beneficeReel", "beneficeReel", "benefValidate");

    const benefValidateBtn = document.getElementById("benefValidate");
    const benefInput = document.getElementById("beneficeReel");

    if (benefInput && benefValidateBtn) {
      benefInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (benefValidateBtn.style.display !== "none" && !benefValidateBtn.disabled) benefValidateBtn.click();
        }
      });
    }

    if (benefValidateBtn) {
      benefValidateBtn.addEventListener("click", () => {
        const raw = (data.beneficeReel || "").trim();

        if (!raw || !isOperationPosed(raw)) {
          data.beneficeReelError = true;
          const i = document.getElementById("beneficeReel");
          const b = document.getElementById("benefValidate");
          if (i) i.classList.add("error");
          if (i) shake(i);
          if (b) shake(b);
          return;
        }

        const result = evalOperation(raw);
        if (result === null) {
          data.beneficeReelError = true;
          const i = document.getElementById("beneficeReel");
          const b = document.getElementById("benefValidate");
          if (i) i.classList.add("error");
          if (i) shake(i);
          if (b) shake(b);
          return;
        }

        data.beneficeReelFinalized = true;
        data.beneficeReelError = false;
        markDirty();
        renderDailyDayPage(isoDate);
      });
    }
  }

  const benefModifyBtn = document.getElementById("benefModify");
  if (benefModifyBtn) {
    benefModifyBtn.addEventListener("click", () => {
      data.beneficeReelFinalized = false;
      data.beneficeReelError = false;
      markDirty();
      renderDailyDayPage(isoDate);
    });
  }

  // -------------------------
  // ✅ Helpers pile (Nouveau capital / Nouvelle caisse réelle)
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
        // le click est géré par les validate buttons (on clique si possible)
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

  // -------------------------
  // ✅ NOUVEAU CAPITAL handlers (pile)
  // -------------------------
  function resetNouveauCapitalToZero() {
    nc.items = [];
    nc.draft = "";
    nc.finalized = false;
    nc.editIndex = null;
    nc.editDraft = "";
    nc.editError = false;
    nc.draftError = false;
  }

  // Draft
  const ncDraftInput = document.getElementById("ncDraft");
  const ncValidate = document.getElementById("ncValidate");
  const ncFinish = document.getElementById("ncFinish"); // peut être null

  if (ncDraftInput) {
    bindNcTextFilter(
      ncDraftInput,
      () => nc.draft,
      (v) => (nc.draft = v),
      (flag) => (nc.draftError = flag)
    );

    function syncNcValidateBtn() {
      const v = nc.draft || "";
      const hasText = v.trim().length > 0;
      const ok = isOperationPosed(v);

      if (ncValidate) {
        ncValidate.style.display = hasText ? "" : "none";
        ncValidate.disabled = hasText ? !ok : true;
      }

      if (hasText && !ok) ncDraftInput.classList.add("error");
      else ncDraftInput.classList.remove("error");
    }

    syncNcValidateBtn();
    ncDraftInput.addEventListener("input", syncNcValidateBtn);

    if (ncValidate) {
      ncValidate.addEventListener("click", (e) => {
        const raw = (nc.draft || "").trim();
        if (!raw || !isOperationPosed(raw)) {
          nc.draftError = true;
          ncDraftInput.classList.add("error");
          shake(ncDraftInput);
          shake(ncValidate);
          e.preventDefault();
          return;
        }

        const res = evalOperation(raw);
        if (res === null) {
          nc.draftError = true;
          ncDraftInput.classList.add("error");
          shake(ncDraftInput);
          shake(ncValidate);
          e.preventDefault();
          return;
        }

        nc.items.push({ raw, result: res });
        nc.draft = "";
        nc.draftError = false;

        markDirty();
        renderDailyDayPage(isoDate);
      });
    }
  }

  // Terminer
  if (ncFinish) {
    ncFinish.addEventListener("click", (e) => {
      const draftHasTextNow = (nc.draft || "").trim().length > 0;
      const editHasTextNow = nc.editIndex !== null && (nc.editDraft || "").trim().length > 0;
      const canFinishNow = nc.items.length > 0 && !draftHasTextNow && !editHasTextNow;

      if (!canFinishNow) {
        const editInput = document.getElementById("ncEditInput");
        const draftInput = document.getElementById("ncDraft");

        if (editHasTextNow && editInput) {
          editInput.classList.add("error");
          shake(editInput);
        } else if (draftHasTextNow && draftInput) {
          draftInput.classList.add("error");
          shake(draftInput);
        }

        shake(ncFinish);
        e.preventDefault();
        return;
      }

      nc.finalized = true;
      nc.editIndex = null;
      nc.editDraft = "";
      nc.editError = false;
      nc.draftError = false;

      markDirty();
      renderDailyDayPage(isoDate);
    });
  }

  // Modifier (bleu)
  const ncModifyAll = document.getElementById("ncModifyAll");
  if (ncModifyAll) {
    ncModifyAll.addEventListener("click", () => {
      nc.finalized = false;
      nc.draftError = false;
      nc.editError = false;
      markDirty();
      renderDailyDayPage(isoDate);
    });
  }

  // Supprimer
  app.querySelectorAll("[data-nc-del]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const idx = Number(btn.getAttribute("data-nc-del"));
      if (!Number.isFinite(idx)) return;

      nc.items.splice(idx, 1);

      if (nc.items.length === 0) {
        resetNouveauCapitalToZero();
      } else {
        if (nc.editIndex === idx) {
          nc.editIndex = null;
          nc.editDraft = "";
          nc.editError = false;
        } else if (nc.editIndex !== null && idx < nc.editIndex) {
          nc.editIndex -= 1;
        }
      }

      markDirty();
      renderDailyDayPage(isoDate);
    });
  });

  // Modifier une case
  app.querySelectorAll("[data-nc-mod]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const idx = Number(btn.getAttribute("data-nc-mod"));
      if (!Number.isFinite(idx)) return;

      nc.editIndex = idx;
      nc.editDraft = nc.items[idx]?.raw ?? "";
      nc.editError = false;

      markDirty();
      renderDailyDayPage(isoDate);
    });
  });

  // Edition
  const ncEditInput = document.getElementById("ncEditInput");
  const ncEditValidate = document.getElementById("ncEditValidate");

  if (ncEditInput) {
    bindNcTextFilter(
      ncEditInput,
      () => nc.editDraft,
      (v) => (nc.editDraft = v),
      (flag) => (nc.editError = flag)
    );

    function syncNcEditValidateBtn() {
      const v = nc.editDraft || "";
      const hasText = v.trim().length > 0;
      const ok = isOperationPosed(v);

      if (ncEditValidate) {
        ncEditValidate.style.display = hasText ? "" : "none";
        ncEditValidate.disabled = hasText ? !ok : true;
      }

      if (hasText && !ok) ncEditInput.classList.add("error");
      else ncEditInput.classList.remove("error");
    }

    syncNcEditValidateBtn();
    ncEditInput.addEventListener("input", syncNcEditValidateBtn);

    if (ncEditValidate) {
      ncEditValidate.addEventListener("click", (e) => {
        const raw = (nc.editDraft || "").trim();
        if (!raw || !isOperationPosed(raw)) {
          nc.editError = true;
          ncEditInput.classList.add("error");
          shake(ncEditInput);
          shake(ncEditValidate);
          e.preventDefault();
          return;
        }

        const res = evalOperation(raw);
        if (res === null) {
          nc.editError = true;
          ncEditInput.classList.add("error");
          shake(ncEditInput);
          shake(ncEditValidate);
          e.preventDefault();
          return;
        }

        const idx = nc.editIndex;
        if (idx === null || idx < 0 || idx >= nc.items.length) return;

        nc.items[idx] = { raw, result: res };

        nc.editIndex = null;
        nc.editDraft = "";
        nc.editError = false;

        markDirty();
        renderDailyDayPage(isoDate);
      });
    }
  }

  // -------------------------
  // ✅ NOUVELLE CAISSE RÉELLE handlers (pile)
  // -------------------------
  function resetNcrToZero() {
    ncr.items = [];
    ncr.draft = "";
    ncr.finalized = false;
    ncr.editIndex = null;
    ncr.editDraft = "";
    ncr.editError = false;
    ncr.draftError = false;
  }

  const ncrDraftInput = document.getElementById("ncrDraft");
  const ncrValidate = document.getElementById("ncrValidate");
  const ncrFinish = document.getElementById("ncrFinish");

  if (ncrDraftInput) {
    bindNcTextFilter(
      ncrDraftInput,
      () => ncr.draft,
      (v) => (ncr.draft = v),
      (flag) => (ncr.draftError = flag)
    );

    function syncNcrValidateBtn() {
      const v = ncr.draft || "";
      const hasText = v.trim().length > 0;
      const ok = isOperationPosed(v);

      if (ncrValidate) {
        ncrValidate.style.display = hasText ? "" : "none";
        ncrValidate.disabled = hasText ? !ok : true;
      }

      if (hasText && !ok) ncrDraftInput.classList.add("error");
      else ncrDraftInput.classList.remove("error");
    }

    syncNcrValidateBtn();
    ncrDraftInput.addEventListener("input", syncNcrValidateBtn);

    if (ncrValidate) {
      ncrValidate.addEventListener("click", (e) => {
        const raw = (ncr.draft || "").trim();
        if (!raw || !isOperationPosed(raw)) {
          ncr.draftError = true;
          ncrDraftInput.classList.add("error");
          shake(ncrDraftInput);
          shake(ncrValidate);
          e.preventDefault();
          return;
        }

        const res = evalOperation(raw);
        if (res === null) {
          ncr.draftError = true;
          ncrDraftInput.classList.add("error");
          shake(ncrDraftInput);
          shake(ncrValidate);
          e.preventDefault();
          return;
        }

        ncr.items.push({ raw, result: res });
        ncr.draft = "";
        ncr.draftError = false;

        markDirty();
        renderDailyDayPage(isoDate);
      });
    }
  }

  if (ncrFinish) {
    ncrFinish.addEventListener("click", (e) => {
      const draftHasTextNow = (ncr.draft || "").trim().length > 0;
      const editHasTextNow = ncr.editIndex !== null && (ncr.editDraft || "").trim().length > 0;
      const canFinishNow = ncr.items.length > 0 && !draftHasTextNow && !editHasTextNow;

      if (!canFinishNow) {
        const editInput = document.getElementById("ncrEditInput");
        const draftInput = document.getElementById("ncrDraft");

        if (editHasTextNow && editInput) {
          editInput.classList.add("error");
          shake(editInput);
        } else if (draftHasTextNow && draftInput) {
          draftInput.classList.add("error");
          shake(draftInput);
        }

        shake(ncrFinish);
        e.preventDefault();
        return;
      }

      ncr.finalized = true;
      ncr.editIndex = null;
      ncr.editDraft = "";
      ncr.editError = false;
      ncr.draftError = false;

      markDirty();
      renderDailyDayPage(isoDate);
    });
  }

  const ncrModifyAll = document.getElementById("ncrModifyAll");
  if (ncrModifyAll) {
    ncrModifyAll.addEventListener("click", () => {
      ncr.finalized = false;
      ncr.draftError = false;
      ncr.editError = false;
      markDirty();
      renderDailyDayPage(isoDate);
    });
  }

  app.querySelectorAll("[data-ncr-del]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const idx = Number(btn.getAttribute("data-ncr-del"));
      if (!Number.isFinite(idx)) return;

      ncr.items.splice(idx, 1);

      if (ncr.items.length === 0) {
        resetNcrToZero();
      } else {
        if (ncr.editIndex === idx) {
          ncr.editIndex = null;
          ncr.editDraft = "";
          ncr.editError = false;
        } else if (ncr.editIndex !== null && idx < ncr.editIndex) {
          ncr.editIndex -= 1;
        }
      }

      markDirty();
      renderDailyDayPage(isoDate);
    });
  });

  app.querySelectorAll("[data-ncr-mod]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const idx = Number(btn.getAttribute("data-ncr-mod"));
      if (!Number.isFinite(idx)) return;

      ncr.editIndex = idx;
      ncr.editDraft = ncr.items[idx]?.raw ?? "";
      ncr.editError = false;

      markDirty();
      renderDailyDayPage(isoDate);
    });
  });

  const ncrEditInput = document.getElementById("ncrEditInput");
  const ncrEditValidate = document.getElementById("ncrEditValidate");

  if (ncrEditInput) {
    bindNcTextFilter(
      ncrEditInput,
      () => ncr.editDraft,
      (v) => (ncr.editDraft = v),
      (flag) => (ncr.editError = flag)
    );

    function syncNcrEditValidateBtn() {
      const v = ncr.editDraft || "";
      const hasText = v.trim().length > 0;
      const ok = isOperationPosed(v);

      if (ncrEditValidate) {
        ncrEditValidate.style.display = hasText ? "" : "none";
        ncrEditValidate.disabled = hasText ? !ok : true;
      }

      if (hasText && !ok) ncrEditInput.classList.add("error");
      else ncrEditInput.classList.remove("error");
    }

    syncNcrEditValidateBtn();
    ncrEditInput.addEventListener("input", syncNcrEditValidateBtn);

    if (ncrEditValidate) {
      ncrEditValidate.addEventListener("click", (e) => {
        const raw = (ncr.editDraft || "").trim();
        if (!raw || !isOperationPosed(raw)) {
          ncr.editError = true;
          ncrEditInput.classList.add("error");
          shake(ncrEditInput);
          shake(ncrEditValidate);
          e.preventDefault();
          return;
        }

        const res = evalOperation(raw);
        if (res === null) {
          ncr.editError = true;
          ncrEditInput.classList.add("error");
          shake(ncrEditInput);
          shake(ncrEditValidate);
          e.preventDefault();
          return;
        }

        const idx = ncr.editIndex;
        if (idx === null || idx < 0 || idx >= ncr.items.length) return;

        ncr.items[idx] = { raw, result: res };

        ncr.editIndex = null;
        ncr.editDraft = "";
        ncr.editError = false;

        markDirty();
        renderDailyDayPage(isoDate);
      });
    }
  }

  // -------------------------
  // ✅ ENREGISTRER
  // -------------------------
  const saveBtn = document.getElementById("saveDay");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const ok = computeSaveEligible();
      if (!ok) {
        shake(saveBtn);
        return;
      }
      data.daySaved = true;
      renderDailyDayPage(isoDate);
      alert("Enregistré !");
    });
  }
  const editDayBtn = document.getElementById("editDay");
  if (editDayBtn) {
    editDayBtn.addEventListener("click", () => {
      data.daySaved = false;
      renderDailyDayPage(isoDate);
    });
  }
}

function doPrelevValidate(p, prefix, isoDate, onDirty) {
  const raw = (p.draft || "").trim();

  const inputEl = document.getElementById(`${prefix}Input`);
  const validateBtn = document.getElementById(`${prefix}Validate`);

  if (!raw) {
    // draft vide => Valider grisé
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

// --------- ROUTING / HISTORIQUE ---------

function parseRoute() {
  const hash = (location.hash || "").replace("#", "");
  if (!hash) return { kind: "home" };

  const parts = hash.split("/");
  const page = parts[0];

  if (!["daily", "weekly", "buy"].includes(page)) return { kind: "home" };
  if (parts.length === 1) return { kind: "calendar", page };

  return { kind: "day", page, iso: parts[1] };
}

function navigateTo(hash) {
  history.pushState({}, "", hash);
  render();
}

function render() {
  const route = parseRoute();

  if (route.kind === "home") return renderHome();
  if (route.kind === "calendar") return renderCalendarPage(route.page);

  if (route.page === "daily") return renderDailyDayPage(route.iso);
  return renderGenericDayPage(route.page, route.iso);
}

window.addEventListener("popstate", render);

// --------- DÉMARRAGE ---------
render();
