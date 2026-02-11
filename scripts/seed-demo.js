require("dotenv").config();
const db = require("../src/db");

async function run() {
  const trackSlug = "python-basics";
  const trackTitle = "Python Basics";
  const officialSources = ["https://docs.python.org/3/tutorial/"];

  const trackResult = await db.query(
    `INSERT INTO tracks (slug, title, official_sources, track_type, status)
     VALUES ($1, $2, $3::jsonb, 'official', 'active')
     ON CONFLICT (slug) DO UPDATE
     SET title = EXCLUDED.title,
         official_sources = EXCLUDED.official_sources,
         track_type = EXCLUDED.track_type,
         status = EXCLUDED.status
     RETURNING id, slug, title`,
    [trackSlug, trackTitle, JSON.stringify(officialSources)]
  );

  const track = trackResult.rows[0];

  const lessons = [
    {
      lesson_order: 1,
      title: "Install Python and run your first script",
      objectives: ["Install Python", "Run a hello world script"],
      tags: ["setup", "syntax"],
      source_urls: ["https://docs.python.org/3/tutorial/interpreter.html"]
    },
    {
      lesson_order: 2,
      title: "Variables, types, and control flow",
      objectives: ["Use variables", "Write if/else and loops"],
      tags: ["fundamentals"],
      source_urls: ["https://docs.python.org/3/tutorial/introduction.html"]
    },
    {
      lesson_order: 3,
      title: "Functions and modules",
      objectives: ["Define functions", "Import modules"],
      tags: ["functions", "modules"],
      source_urls: ["https://docs.python.org/3/tutorial/modules.html"]
    }
  ];

  for (const lesson of lessons) {
    await db.query(
      `INSERT INTO lessons (track_id, lesson_order, title, objectives, tags, source_urls)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
       ON CONFLICT (track_id, lesson_order) DO UPDATE
       SET title = EXCLUDED.title,
           objectives = EXCLUDED.objectives,
           tags = EXCLUDED.tags,
           source_urls = EXCLUDED.source_urls`,
      [
        track.id,
        lesson.lesson_order,
        lesson.title,
        JSON.stringify(lesson.objectives),
        JSON.stringify(lesson.tags),
        JSON.stringify(lesson.source_urls)
      ]
    );
  }

  console.log(
    JSON.stringify({
      event: "seed-demo-complete",
      track_slug: track.slug,
      lessons_seeded: lessons.length
    })
  );
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(JSON.stringify({ event: "seed-demo-failed", error: error.message }));
    process.exit(1);
  });
