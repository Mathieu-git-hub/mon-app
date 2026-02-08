// server.js (CommonJS)
const express = require("express");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");
const pgSession = require("connect-pg-simple")(session);

const app = express();

/** ---------------------------
 *  1) Config Render / Port
 * -------------------------- */
const PORT = process.env.PORT || 3000;

/** ---------------------------
 *  2) Sécurité & parsing
 * -------------------------- */
app.use(helmet({
  contentSecurityPolicy: false,
}));

app.use(express.json({ limit: "1mb" }));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

/** ---------------------------
 *  3) PostgreSQL
 * -------------------------- */
if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL manquant dans les variables d'environnement Render.");
}

const DATABASE_URL = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL && DATABASE_URL.includes("render.com") ? { rejectUnauthorized: false } : undefined,
});

/** ---------------------------
 *  4) Sessions (stockées en DB)
 * -------------------------- */
if (!process.env.SESSION_SECRET) {
  console.error("❌ SESSION_SECRET manquant dans les variables d'environnement Render.");
}

app.set("trust proxy", 1);

app.use(
  session({
    store: new pgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "dev-secret",
    proxy: true,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: "auto",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 30,
    },
  })
);

/** ---------------------------
 *  5) Static files (no-cache script/index)
 * -------------------------- */
app.use(
  express.static(path.join(__dirname, "public"), {
    setHeaders(res, filePath) {
      if (filePath.endsWith("script.js") || filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      }
    },
  })
);

/** ---------------------------
 *  6) Helpers auth
 * -------------------------- */
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Not authenticated" });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Not authenticated" });
  if (!req.session.user.is_admin) return res.status(403).json({ error: "Admin only" });
  next();
}

/** ---------------------------
 *  7) DB init : tables + admin
 * -------------------------- */
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      pass_hash TEXT NOT NULL,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_data (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      daily_store JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const adminUser = process.env.ADMIN_USER;
  const adminPass = process.env.ADMIN_PASS;

  if (!adminUser || !adminPass) {
    console.log("ℹ️ ADMIN_USER / ADMIN_PASS manquants : aucun admin auto créé.");
    return;
  }

  const hash = await bcrypt.hash(adminPass, 12);

  await pool.query(
    `
    INSERT INTO users (username, pass_hash, is_admin)
    VALUES ($1, $2, TRUE)
    ON CONFLICT (username)
    DO UPDATE SET pass_hash = EXCLUDED.pass_hash, is_admin = TRUE
    `,
    [adminUser, hash]
  );

  console.log(`✅ Admin synchronisé : ${adminUser}`);
}

initDb().catch((e) => {
  console.error("❌ initDb error:", e);
});

/** ---------------------------
 *  8) API Auth
 * -------------------------- */
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "Missing username/password" });

    const r = await pool.query("SELECT id, username, pass_hash, is_admin FROM users WHERE username=$1", [
      username,
    ]);
    if (r.rowCount === 0) return res.status(401).json({ error: "Invalid credentials" });

    const user = r.rows[0];
    const ok = await bcrypt.compare(password, user.pass_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    req.session.user = { id: user.id, username: user.username, is_admin: user.is_admin };
    res.json({ ok: true, user: req.session.user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/auth/me", (req, res) => {
  res.json({ user: req.session.user || null });
});

app.post("/api/admin/create-user", requireAdmin, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "Missing username/password" });

    const hash = await bcrypt.hash(password, 12);
    await pool.query("INSERT INTO users (username, pass_hash, is_admin) VALUES ($1,$2,FALSE)", [
      username,
      hash,
    ]);
    res.json({ ok: true });
  } catch (e) {
    if (String(e).includes("duplicate")) return res.status(409).json({ error: "Username already exists" });
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/admin/users", requireAdmin, async (req, res) => {
  const r = await pool.query("SELECT id, username, is_admin, created_at FROM users ORDER BY id ASC");
  res.json({ users: r.rows });
});

/** ---------------------------
 *  9) API Data
 * -------------------------- */
app.get("/api/data", requireAuth, async (req, res) => {
  const userId = req.session.user.id;

  const r = await pool.query("SELECT daily_store FROM user_data WHERE user_id=$1", [userId]);
  if (r.rowCount === 0) return res.json({ dailyStore: {} });

  res.json({ dailyStore: r.rows[0].daily_store || {} });
});

app.post("/api/data", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const dailyStore = req.body?.dailyStore ?? {};

    await pool.query(
      `
      INSERT INTO user_data (user_id, daily_store, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET daily_store = EXCLUDED.daily_store, updated_at = NOW();
    `,
      [userId, JSON.stringify(dailyStore)]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/** ---------------------------
 *  10) Start server
 * -------------------------- */
app.listen(PORT, () => {
  console.log(`Serveur lancé sur le port ${PORT}`);
});
