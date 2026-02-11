// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { z } = require("zod");
const { v4: uuidv4 } = require("uuid");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

// ---------- helpers ----------
async function ensureUser(userId) {
  // If userId is missing, create a new user and return id
  if (!userId) {
    const created = await db.query(`INSERT INTO users DEFAULT VALUES RETURNING id`);
    return created.rows[0].id;
  }

  // If provided, ensure exists
  const found = await db.query(`SELECT id FROM users WHERE id = $1`, [userId]);
  if (found.rowCount === 0) {
    await db.query(`INSERT INTO users (id) VALUES ($1)`, [userId]);
  }
  return userId;
}

async function getTrackBySlug(slug) {
  const res = await db.query(`SELECT * FROM tracks WHERE slug = $1`, [slug]);
  return res.rows[0] || null;
}

// ---------- routes ----------
app.get("/health", (req, res) => {
  res.json({ ok: true, message: "API is alive 🫡" });
});

// List tracks
app.get("/v1/tracks", async (req, res) => {
  const tracks = await db.query(`SELECT id, slug, title, official_sources FROM tracks ORDER BY title`);
  res.json({ tracks: tracks.rows });
});

// Create track (admin-ish; keep it open for MVP)
app.post("/v1/tracks", async (req, res) => {
  const schema = z.object({
    slug: z.string().min(2).max(50),
    title: z.string().min(2).max(100),
    official_sources: z.array(z.string().url()).optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { slug, title, official_sources = [] } = parsed.data;

  try {
    const created = await db.query(
      `INSERT INTO tracks (slug, title, official_sources)
       VALUES ($1, $2, $3::jsonb)
       RETURNING id, slug, title, official_sources`,
      [slug.toLowerCase(), title, JSON.stringify(official_sources)]
    );
    res.status(201).json({ track: created.rows[0] });
  } catch (e) {
    res.status(400).json({ error: "Track slug already exists or invalid data." });
  }
});

// "Me" dashboard (MVP: user_id passed)
app.get("/v1/me", async (req, res) => {
  const user_id = await ensureUser(req.query.user_id);

  // Streak/basic activity (simple: count attempts in last 7 days)
  const attempts = await db.query(
    `SELECT COUNT(*)::int AS attempts_7d
     FROM attempts
     WHERE user_id = $1 AND created_at >= now() - interval '7 days'`,
    [user_id]
  );

  res.json({
    user_id,
    attempts_7d: attempts.rows[0].attempts_7d,
    tip: "MVP mode: progress is stored. Later we’ll add login (OAuth) so users don’t need user_id."
  });
});

// Get next lesson for a track + user progress
app.get("/v1/lessons/next", async (req, res) => {
  const trackSlug = req.query.track;
  if (!trackSlug) return res.status(400).json({ error: "Missing ?track=slug" });

  const user_id = await ensureUser(req.query.user_id);
  const track = await getTrackBySlug(trackSlug.toLowerCase());
  if (!track) return res.status(404).json({ error: "Track not found" });

  // Ensure user_track_state exists
  await db.query(
    `INSERT INTO user_track_state (user_id, track_id, last_seen)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id, track_id) DO UPDATE SET last_seen = now()`,
    [user_id, track.id]
  );

  const stateRes = await db.query(
    `SELECT current_lesson_order FROM user_track_state WHERE user_id = $1 AND track_id = $2`,
    [user_id, track.id]
  );
  const currentOrder = stateRes.rows[0].current_lesson_order;

  const lessonRes = await db.query(
    `SELECT id, lesson_order, title, objectives, tags, source_urls
     FROM lessons
     WHERE track_id = $1 AND lesson_order = $2`,
    [track.id, currentOrder]
  );

  // If no lesson exists yet, return a “needs seeding” response
  if (lessonRes.rowCount === 0) {
    return res.json({
      user_id,
      track: { slug: track.slug, title: track.title },
      next_lesson: null,
      message: "No lessons found for this track yet. Seed lessons in the lessons table."
    });
  }

  res.json({
    user_id,
    track: { slug: track.slug, title: track.title, official_sources: track.official_sources },
    next_lesson: lessonRes.rows[0]
  });
});

// Submit attempt + advance lesson if passed
app.post("/v1/attempts", async (req, res) => {
  const schema = z.object({
    user_id: z.string().uuid().optional(),
    lesson_id: z.string().uuid(),
    attempt_type: z.enum(["quiz", "challenge", "project"]),
    score: z.number().optional(),
    max_score: z.number().optional(),
    duration_sec: z.number().int().positive().optional(),
    weak_tags: z.array(z.string()).optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const body = parsed.data;
  const user_id = await ensureUser(body.user_id);

  // Insert attempt
  const created = await db.query(
    `INSERT INTO attempts (user_id, lesson_id, attempt_type, score, max_score, duration_sec, weak_tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING id, created_at`,
    [
      user_id,
      body.lesson_id,
      body.attempt_type,
      body.score ?? null,
      body.max_score ?? null,
      body.duration_sec ?? null,
      JSON.stringify(body.weak_tags ?? [])
    ]
  );

  // Find lesson + track to potentially advance
  const lesson = await db.query(
    `SELECT l.lesson_order, l.track_id
     FROM lessons l
     WHERE l.id = $1`,
    [body.lesson_id]
  );
  if (lesson.rowCount === 0) return res.status(404).json({ error: "Lesson not found" });

  const { lesson_order, track_id } = lesson.rows[0];

  // Simple pass rule: >= 70% if score and max_score provided
  let advanced = false;
  if (body.score != null && body.max_score != null && body.max_score > 0) {
    const pct = (body.score / body.max_score) * 100;
    if (pct >= 70) {
      await db.query(
        `UPDATE user_track_state
         SET current_lesson_order = GREATEST(current_lesson_order, $3),
             last_seen = now()
         WHERE user_id = $1 AND track_id = $2`,
        [user_id, track_id, lesson_order + 1]
      );
      advanced = true;
    }
  }

  res.json({
    user_id,
    attempt_id: created.rows[0].id,
    saved_at: created.rows[0].created_at,
    advanced
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API running on http://localhost:${port}`));
