// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { z } = require("zod");
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

function requireAdminKey(req, res, next) {
  const configuredKey = process.env.ADMIN_KEY;
  if (!configuredKey) {
    return res.status(500).json({ error: "ADMIN_KEY is not configured on the server." });
  }

  const providedKey = req.header("X-ADMIN-KEY");
  if (providedKey !== configuredKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
}

// ---------- routes ----------
app.get("/health", (req, res) => {
  res.json({ ok: true, message: "API is alive 🫡" });
});

// List tracks
app.get("/v1/tracks", async (req, res) => {
  const tracks = await db.query(`
    SELECT id, slug, title, official_sources, track_type, owner_user_id, status
    FROM tracks
    ORDER BY title
  `);
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
       RETURNING id, slug, title, official_sources, track_type, owner_user_id, status`,
      [slug.toLowerCase(), title, JSON.stringify(official_sources)]
    );
    res.status(201).json({ track: created.rows[0] });
  } catch (e) {
    res.status(400).json({ error: "Track slug already exists or invalid data." });
  }
});

app.use("/v1/internal", requireAdminKey);

app.post("/v1/internal/ensure-track", async (req, res) => {
  const schema = z.object({
    slug: z.string().min(2).max(50),
    title: z.string().min(2).max(100),
    official_sources: z.array(z.string().url()).optional(),
    track_type: z.enum(["official", "custom"]).optional(),
    owner_user_id: z.string().uuid().nullable().optional(),
    status: z.enum(["draft", "active", "archived"]).optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const payload = parsed.data;
  const slug = payload.slug.toLowerCase();
  const hasOfficialSources = Object.prototype.hasOwnProperty.call(payload, "official_sources");
  const hasTrackType = Object.prototype.hasOwnProperty.call(payload, "track_type");
  const hasOwnerUserId = Object.prototype.hasOwnProperty.call(payload, "owner_user_id");
  const hasStatus = Object.prototype.hasOwnProperty.call(payload, "status");

  try {
    if (hasOwnerUserId && payload.owner_user_id) {
      await ensureUser(payload.owner_user_id);
    }

    const existing = await db.query(`SELECT id FROM tracks WHERE slug = $1`, [slug]);

    const saved = await db.query(
      `INSERT INTO tracks (slug, title, official_sources, track_type, owner_user_id, status)
       VALUES (
         $1,
         $2,
         COALESCE($3::jsonb, '[]'::jsonb),
         COALESCE($4, 'custom'),
         $5,
         COALESCE($6, 'draft')
       )
       ON CONFLICT (slug) DO UPDATE
       SET title = EXCLUDED.title,
           official_sources = CASE WHEN $7 THEN EXCLUDED.official_sources ELSE tracks.official_sources END,
           track_type = CASE WHEN $8 THEN EXCLUDED.track_type ELSE tracks.track_type END,
           owner_user_id = CASE WHEN $9 THEN EXCLUDED.owner_user_id ELSE tracks.owner_user_id END,
           status = CASE WHEN $10 THEN EXCLUDED.status ELSE tracks.status END
       RETURNING id, slug, title, official_sources, track_type, owner_user_id, status`,
      [
        slug,
        payload.title,
        hasOfficialSources ? JSON.stringify(payload.official_sources) : null,
        hasTrackType ? payload.track_type : null,
        hasOwnerUserId ? payload.owner_user_id : null,
        hasStatus ? payload.status : null,
        hasOfficialSources,
        hasTrackType,
        hasOwnerUserId,
        hasStatus
      ]
    );

    return res.status(existing.rowCount === 0 ? 201 : 200).json({
      created: existing.rowCount === 0,
      track: saved.rows[0]
    });
  } catch (e) {
    return res.status(400).json({ error: "Unable to ensure track." });
  }
});

app.post("/v1/internal/seed-lessons", async (req, res) => {
  const schema = z.object({
    track_slug: z.string().min(2).max(50),
    lessons: z.array(
      z.object({
        lesson_order: z.number().int().positive(),
        title: z.string().min(2).max(160),
        objectives: z.array(z.string()).default([]),
        tags: z.array(z.string()).default([]),
        source_urls: z.array(z.string().url()).default([])
      })
    ).min(1)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const payload = parsed.data;
  const track = await getTrackBySlug(payload.track_slug.toLowerCase());
  if (!track) return res.status(404).json({ error: "Track not found" });

  const seeded = [];
  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    for (const lesson of payload.lessons) {
      const upserted = await client.query(
        `INSERT INTO lessons (track_id, lesson_order, title, objectives, tags, source_urls)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
         ON CONFLICT (track_id, lesson_order) DO UPDATE
         SET title = EXCLUDED.title,
             objectives = EXCLUDED.objectives,
             tags = EXCLUDED.tags,
             source_urls = EXCLUDED.source_urls
         RETURNING id, lesson_order, title`,
        [
          track.id,
          lesson.lesson_order,
          lesson.title,
          JSON.stringify(lesson.objectives),
          JSON.stringify(lesson.tags),
          JSON.stringify(lesson.source_urls)
        ]
      );
      seeded.push(upserted.rows[0]);
    }

    await client.query("COMMIT");

    return res.status(200).json({
      track: { id: track.id, slug: track.slug, title: track.title },
      inserted_or_updated: seeded.length,
      lessons: seeded
    });
  } catch (e) {
    await client.query("ROLLBACK");
    return res.status(400).json({ error: "Unable to seed lessons" });
  } finally {
    client.release();
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
  const trackPayload = {
    id: track.id,
    slug: track.slug,
    title: track.title,
    official_sources: track.official_sources,
    track_type: track.track_type,
    owner_user_id: track.owner_user_id,
    status: track.status
  };

  if (lessonRes.rowCount === 0) {
    return res.json({
      user_id,
      track: trackPayload,
      next_lesson: null,
      message: "No lessons found for this track yet. Seed lessons in the lessons table."
    });
  }

  res.json({
    user_id,
    track: trackPayload,
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
