require("dotenv").config();

const crypto = require("node:crypto");
const express = require("express");
const Database = require("better-sqlite3");

const app = express();
const port = Number(process.env.PORT) || 3001;
const database = new Database(process.env.DATABASE_PATH || "./tracker.db");
const sessionLifetime = 30 * 24 * 60 * 60 * 1000;
const applicationStatuses = ["Applied", "Interview", "Offer", "Rejected"];

database.pragma("journal_mode = WAL");
database.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    company TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Applied',
    applied_on TEXT NOT NULL
  );
`);
database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date().toISOString());

app.use(express.json({ limit: "10kb" }));

function normalizePhone(value) {
  if (typeof value !== "string" || !/^[+\d\s()-]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return digits.length === 10 ? `91${digits}` : digits;
}

async function callMinimoth(path, body) {
  const apiKey = process.env.MINIMOTH_API_KEY?.trim();
  if (!apiKey || apiKey === "mm_live_your_key_here") {
    return { error: "Set MINIMOTH_API_KEY in backend/.env.", status: 503 };
  }

  let response;
  try {
    response = await fetch(`https://api.minimoth.dev/v1/otp/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { error: "Minimoth is unavailable. Please try again.", status: 502 };
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const clientError = response.status >= 400 && response.status < 500;
    return {
      error: typeof data.error === "string" ? data.error : "Minimoth request failed.",
      status: clientError ? 400 : 502,
    };
  }
  return { data };
}

function requireUser(req, res, next) {
  const authorization = req.get("authorization") || "";
  const match = authorization.match(/^Bearer ([\w-]+)$/);
  if (!match) return res.status(401).json({ error: "Please sign in again." });

  const tokenHash = crypto.createHash("sha256").update(match[1]).digest("hex");
  const session = database.prepare(`
    SELECT users.id AS userId
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(tokenHash, new Date().toISOString());
  if (!session) return res.status(401).json({ error: "Please sign in again." });

  req.userId = session.userId;
  next();
}

app.post("/api/auth/send-otp", async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!phone) return res.status(400).json({ error: "Enter a valid phone number, including country code if needed." });

  const result = await callMinimoth("send", { phone });
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json({ message: "OTP sent." });
});

app.post("/api/auth/verify-otp", async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
  if (!phone || !/^\d{4,8}$/.test(code)) {
    return res.status(400).json({ error: "Enter a valid phone number and OTP." });
  }

  const result = await callMinimoth("verify", { phone, code });
  if (result.error) return res.status(result.status).json({ error: result.error });

  const createUser = database.prepare("INSERT INTO users (phone) VALUES (?) ON CONFLICT(phone) DO NOTHING");
  createUser.run(phone);
  const user = database.prepare("SELECT id FROM users WHERE phone = ?").get(phone);
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionLifetime).toISOString();
  database.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .run(crypto.createHash("sha256").update(token).digest("hex"), user.id, expiresAt);

  res.json({ token, phone });
});

app.get("/api/jobs", requireUser, (req, res) => {
  const jobs = database.prepare(`
    SELECT id, company, role, status, applied_on AS appliedOn
    FROM jobs WHERE user_id = ? ORDER BY applied_on DESC, id DESC
  `).all(req.userId);
  res.json(jobs);
});

app.post("/api/jobs", requireUser, (req, res) => {
  const company = typeof req.body?.company === "string" ? req.body.company.trim() : "";
  const role = typeof req.body?.role === "string" ? req.body.role.trim() : "";
  const appliedOn = typeof req.body?.appliedOn === "string" ? req.body.appliedOn : "";
  if (!company || company.length > 100 || !role || role.length > 100) {
    return res.status(400).json({ error: "Company and role are required (up to 100 characters each)." });
  }
  const date = new Date(`${appliedOn}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(appliedOn) || Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== appliedOn) {
    return res.status(400).json({ error: "Enter a valid application date." });
  }

  const result = database.prepare(`
    INSERT INTO jobs (user_id, company, role, applied_on) VALUES (?, ?, ?, ?)
  `).run(req.userId, company, role, appliedOn);
  res.status(201).json({
    id: Number(result.lastInsertRowid),
    company,
    role,
    status: "Applied",
    appliedOn,
  });
});

app.patch("/api/jobs/:id", requireUser, (req, res) => {
  const status = req.body?.status;
  if (!applicationStatuses.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${applicationStatuses.join(", ")}.` });
  }
  const result = database.prepare("UPDATE jobs SET status = ? WHERE id = ? AND user_id = ?")
    .run(status, req.params.id, req.userId);
  if (!result.changes) return res.status(404).json({ error: "Application not found." });
  res.json({ id: Number(req.params.id), status });
});

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({ error: "Request body must be valid JSON." });
  }
  console.error(error);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

app.listen(port, () => {
  console.log(`Job Application Tracker API listening on http://localhost:${port}`);
});
