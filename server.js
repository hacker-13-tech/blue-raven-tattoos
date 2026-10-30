require("dotenv").config();
const express = require("express");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("render.com")
    ? { rejectUnauthorized: false } : undefined
});

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "30kb" }));
app.use(express.urlencoded({ extended: true, limit: "30kb" }));

app.use(session({
  store: process.env.DATABASE_URL ? new PgSession({
    pool, tableName: "user_sessions", createTableIfMissing: true
  }) : undefined,
  secret: process.env.SESSION_SECRET || "change-this-session-secret-before-launch",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 8 * 60 * 60 * 1000 }
}));

const bookingLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: "draft-7", legacyHeaders: false });
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: "draft-7", legacyHeaders: false });

async function initDb() {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL is not set. Add a PostgreSQL database before deploying.");
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      tattoo_type TEXT NOT NULL,
      placement TEXT NOT NULL,
      size TEXT NOT NULL,
      description TEXT NOT NULL,
      reference_url TEXT,
      preferred_date DATE,
      preferred_time TEXT,
      status TEXT NOT NULL DEFAULT 'New',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS admin_users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );
  `);
  if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
    const found = await pool.query("SELECT id FROM admin_users WHERE username = $1", [process.env.ADMIN_USERNAME]);
    if (!found.rowCount) {
      const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
      await pool.query("INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)", [process.env.ADMIN_USERNAME, hash]);
      console.log("Initial admin account created.");
    }
  }
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, database: "connected" });
  } catch {
    res.status(503).json({ ok: false, database: "not configured" });
  }
});

app.post("/api/bookings", bookingLimiter, async (req, res) => {
  const { name, email, phone, tattooType, placement, size, description, referenceUrl, preferredDate, preferredTime, website } = req.body || {};
  // Honeypot field: real visitors leave this blank.
  if (website) return res.json({ ok: true, message: "Your request has been received." });
  if (![name, email, phone, tattooType, placement, size, description].every(v => typeof v === "string" && v.trim())) {
    return res.status(400).json({ error: "Please complete all required fields." });
  }
  if (name.length > 100 || email.length > 160 || phone.length > 40 || description.length > 2000) {
    return res.status(400).json({ error: "One or more fields are too long." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (preferredDate && !/^\d{4}-\d{2}-\d{2}$/.test(preferredDate)) return res.status(400).json({ error: "Choose a valid preferred date." });
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Bookings are temporarily unavailable. Please contact the studio directly." });
    await pool.query(
      `INSERT INTO bookings (name,email,phone,tattoo_type,placement,size,description,reference_url,preferred_date,preferred_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [name.trim(), email.trim().toLowerCase(), phone.trim(), tattooType, placement.trim(), size, description.trim(),
       (referenceUrl || "").trim() || null, preferredDate || null, preferredTime || null]
    );
    res.status(201).json({ ok: true, message: "Your booking request has been sent. The studio will contact you to confirm the design, quote and appointment." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again or contact the studio." });
  }
});

function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) return next();
  return res.status(401).json({ error: "Please sign in to the studio dashboard." });
}
app.post("/api/admin/login", adminLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password || !process.env.DATABASE_URL) return res.status(400).json({ error: "Enter your login details." });
  try {
    const result = await pool.query("SELECT * FROM admin_users WHERE username = $1", [username]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Incorrect username or password." });
    req.session.adminId = user.id;
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Unable to sign in." });
  }
});
app.post("/api/admin/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get("/api/admin/bookings", requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM bookings ORDER BY created_at DESC LIMIT 300");
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: "Could not load bookings." }); }
});
app.patch("/api/admin/bookings/:id", requireAdmin, async (req, res) => {
  const allowed = ["New", "Contacted", "Confirmed", "Completed", "Cancelled"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Invalid booking status." });
  try {
    const result = await pool.query("UPDATE bookings SET status=$1 WHERE id=$2 RETURNING id,status", [req.body.status, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: "Booking not found." });
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: "Could not update booking." }); }
});

app.get("/admin", (_req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

initDb().then(() => app.listen(PORT, () => console.log(`Blue Raven Tattoo running on ${PORT}`)))
  .catch(err => { console.error("Database initialization failed:", err); process.exit(1); });
