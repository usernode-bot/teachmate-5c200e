// The API routes. Every query is scoped to req.user.id; ids from the client
// are parsed as integers; a guest (no req.user) gets empty lists on GET and
// the auth middleware has already answered 401 account_required on writes.
const express = require('express');
const { normalizeLesson, normalizeQuiz, normalizeReading } = require('./normalize');
const { scoreSheet, summarize } = require('./scoring');
const { blankLesson, blankQuiz } = require('./outline');
const { LLM_ENABLED, AiError, callClaude, lessonPrompt, quizPrompt, RULES, READ_SYSTEM } = require('./ai');
const { ensureDemo } = require('./demo');

const IS_STAGING = process.env.USERNODE_ENV === 'staging';
const SUBJECT_KEYS = new Set(['math', 'ela', 'sci', 'soc', 'art', 'nat', 'civ', 'rel', 'loc', 'other']);
const CURRICULUM_KEYS = new Set(['merdeka', 'ccss', 'cambridge', 'ib', 'other']);
const GRADES = new Set(['K', ...Array.from({ length: 12 }, (_, i) => String(i + 1))]);
const LETTERS = ['A', 'B', 'C', 'D'];

module.exports = function buildRoutes(pool) {
  const router = express.Router();

  // The staging demo: only in staging, only with ?demo=1, only for a
  // signed-in teacher. Written once per account; a reload changes nothing.
  router.use((req, res, next) => {
    if (IS_STAGING && req.query.demo === '1' && req.user) {
      req.demo = true;
      ensureDemo(pool, req.user.id, req.now).then(() => next(), err => {
        console.warn('demo seed failed: ' + err.message);
        next();
      });
    } else next();
  });

  const fail = (res, err) => {
    if (err instanceof AiError) return res.status(err.status).json({ code: err.code });
    if (err && err.code === '23505') return res.status(409).json({ code: 'duplicate_student' });
    console.warn('api error: ' + (err && err.stack || err));
    return res.status(500).json({ code: 'server_error' });
  };

  // Demo filtering: without ?demo=1 the route must show the
  // production-shaped answer, so demo rows are filtered out everywhere.
  const demoSql = req => (req.demo ? '' : ' AND NOT is_demo');

  router.get('/ai/status', (_req, res) => res.json({ available: LLM_ENABLED }));

  // ── Documents ────────────────────────────────────────────────────────────
  router.get('/documents', async (req, res) => {
    try {
      if (!req.user) return res.json([]);
      const kind = ['lesson', 'quiz'].includes(req.query.kind) ? req.query.kind : null;
      const { rows } = await pool.query(
        `SELECT id, kind, subject, subject_name, grade, topic, title, source, lesson_id,
                is_demo, created_at, updated_at,
                CASE WHEN kind = 'lesson' THEN body->>'durationMin' END AS duration_min,
                CASE WHEN kind = 'quiz' THEN jsonb_array_length(COALESCE(body->'mc', '[]'::jsonb)) END AS mc_count,
                CASE WHEN kind = 'quiz' THEN jsonb_array_length(COALESCE(body->'essay', '[]'::jsonb)) END AS essay_count
           FROM documents WHERE user_id = $1${demoSql(req)}${kind ? ' AND kind = $2' : ''}
          ORDER BY created_at DESC`,
        kind ? [req.user.id, kind] : [req.user.id]);
      res.json(rows);
    } catch (err) { fail(res, err); }
  });

  router.get('/documents/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id)) return res.sendStatus(404);
      const { rows } = await pool.query(
        'SELECT * FROM documents WHERE id = $1 AND user_id = $2', [id, req.user.id]);
      const row = rows[0];
      if (!row || (!req.demo && row.is_demo)) return res.sendStatus(404);
      res.json(row);
    } catch (err) { fail(res, err); }
  });

  function checkSubject(body) {
    if (!SUBJECT_KEYS.has(body.subject)) return 'bad subject';
    if (body.subject === 'other' && !(typeof body.subjectName === 'string' && body.subjectName.trim())) return 'bad subject name';
    if (!GRADES.has(String(body.grade))) return 'bad grade';
    if (typeof body.topic !== 'string' || !body.topic.trim() || body.topic.length > 120) return 'bad topic';
    return null;
  }

  // The optional classroom context on a lesson: absent or in shape.
  function checkContext(b) {
    if (b.studentCount !== undefined && b.studentCount !== null && b.studentCount !== '') {
      if (!Number.isInteger(b.studentCount) || b.studentCount < 1 || b.studentCount > 99) return 'bad students';
    }
    if (b.tools !== undefined && b.tools !== null &&
        !['whiteboard', 'handouts', 'projector'].includes(b.tools)) return 'bad tools';
    return null;
  }

  // Only lessons carry a curriculum; quizzes ignore the fields. A missing,
  // null or 'general' curriculum stays NULL; anything else must be a known
  // key, and 'other' needs a typed name of 1 to 60 characters.
  function checkCurriculum(b) {
    if (b.kind !== 'lesson') return null;
    const cur = b.curriculum;
    if (!cur || cur === 'general') return null;
    if (!CURRICULUM_KEYS.has(cur)) return 'bad curriculum';
    if (cur === 'other') {
      const name = typeof b.curriculumName === 'string' ? b.curriculumName.trim() : '';
      if (!name || name.length > 60) return 'bad curriculum name';
    }
    return null;
  }

  function curriculumInput(b) {
    const cur = b.kind === 'lesson' && b.curriculum && CURRICULUM_KEYS.has(b.curriculum)
      ? b.curriculum : null;
    return {
      curriculum: cur,
      curriculumName: cur === 'other' ? b.curriculumName.trim().slice(0, 60) : null,
      requireStandards: !!cur,
    };
  }

  router.post('/documents/generate', async (req, res) => {
    try {
      const b = req.body || {};
      const bad = checkSubject(b) ||
        (b.kind === 'lesson' && checkContext(b)) ||
        (b.kind === 'lesson' && (!(b.durationMin >= 15 && b.durationMin <= 120) ? 'bad duration' : null)) ||
        (b.kind === 'quiz' && ((!(b.mcCount >= 0 && b.mcCount <= 20) || !(b.essayCount >= 0 && b.essayCount <= 5) || (b.mcCount + b.essayCount) < 1) ? 'bad counts' : null)) ||
        (b.kind !== 'lesson' && b.kind !== 'quiz' ? 'bad kind' : null) ||
        checkCurriculum(b);
      if (bad) return res.status(400).json({ code: bad });

      let lessonBody = null;
      if (b.lessonId) {
        const lessonId = parseInt(b.lessonId, 10);
        const r = await pool.query(
          "SELECT body FROM documents WHERE id = $1 AND user_id = $2 AND kind = 'lesson'", [lessonId, req.user.id]);
        if (!r.rows[0] || (!req.demo && r.rows[0].is_demo)) return res.sendStatus(404);
        lessonBody = r.rows[0].body;
      }

      const input = {
        subject: b.subject, subjectName: b.subjectName, grade: String(b.grade),
        topic: b.topic.trim(), durationMin: b.durationMin, mcCount: b.mcCount, essayCount: b.essayCount, lessonBody,
        ...curriculumInput(b),
      };
      if (b.kind === 'lesson') {
        input.studentCount = b.studentCount ?? null;
        input.tools = b.tools ?? null;
        input.differentiate = b.differentiate === true;
      }
      let raw;
      if (b.kind === 'lesson') {
        raw = await callClaude(req, { system: RULES, content: lessonPrompt(input), maxTokens: 4000 });
      } else {
        raw = await callClaude(req, { system: RULES, content: quizPrompt(input), maxTokens: 6000 });
      }
      const norm = b.kind === 'lesson' ? normalizeLesson(raw, input) : normalizeQuiz(raw, input);

      // Write again: overwrite an existing document's body instead of
      // inserting a new one.
      const replaceId = parseInt(b.replaceId, 10);
      if (Number.isInteger(replaceId)) {
        const r = await pool.query(
          `UPDATE documents SET title = $3, body = $4, topic = $5, grade = $6, subject = $7,
                  subject_name = $8, curriculum = $9, curriculum_name = $10, source = 'ai', updated_at = $11
            WHERE id = $1 AND user_id = $2 RETURNING *`,
          [replaceId, req.user.id, norm.title, JSON.stringify(norm.body), input.topic,
           input.grade, b.subject, b.subjectName || null, input.curriculum, input.curriculumName, req.now]);
        if (!r.rows[0]) return res.sendStatus(404);
        return res.json(r.rows[0]);
      }
      const r = await pool.query(
        `INSERT INTO documents (user_id, kind, subject, subject_name, grade, topic, title, body, source, lesson_id, curriculum, curriculum_name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ai', $9, $10, $11, $12, $12) RETURNING *`,
        [req.user.id, b.kind, b.subject, b.subjectName || null, input.grade, input.topic,
         norm.title, JSON.stringify(norm.body), b.lessonId ? parseInt(b.lessonId, 10) : null,
         input.curriculum, input.curriculumName, req.now]);
      res.json(r.rows[0]);
    } catch (err) { fail(res, err); }
  });

  router.post('/documents', async (req, res) => {
    try {
      const b = req.body || {};
      const bad = checkSubject(b) ||
        (b.kind === 'lesson' && checkContext(b)) ||
        (b.kind === 'lesson' && (!(b.durationMin >= 15 && b.durationMin <= 120) ? 'bad duration' : null)) ||
        (b.kind === 'quiz' && ((!(b.mcCount >= 0 && b.mcCount <= 20) || !(b.essayCount >= 0 && b.essayCount <= 5) || (b.mcCount + b.essayCount) < 1) ? 'bad counts' : null)) ||
        (b.kind !== 'lesson' && b.kind !== 'quiz' ? 'bad kind' : null) ||
        checkCurriculum(b);
      if (bad) return res.status(400).json({ code: bad });
      const input = {
        subject: b.subject, subjectName: b.subjectName, grade: String(b.grade),
        topic: b.topic.trim(), durationMin: b.durationMin, mcCount: b.mcCount, essayCount: b.essayCount,
        ...curriculumInput(b),
      };
      if (b.kind === 'lesson') {
        input.studentCount = b.studentCount ?? null;
        input.tools = b.tools ?? null;
        input.differentiate = b.differentiate === true;
      }
      const out = b.kind === 'lesson' ? blankLesson(input) : blankQuiz(input);
      const r = await pool.query(
        `INSERT INTO documents (user_id, kind, subject, subject_name, grade, topic, title, body, source, curriculum, curriculum_name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'outline', $9, $10, $11, $11) RETURNING *`,
        [req.user.id, b.kind, b.subject, b.subjectName || null, input.grade, input.topic,
         out.title, JSON.stringify(out.body), input.curriculum, input.curriculumName, req.now]);
      res.json(r.rows[0]);
    } catch (err) { fail(res, err); }
  });

  // A hand edit. The body is re-validated with the same shape rules; no AI
  // repair. For a quiz the counts come from the body itself.
  router.patch('/documents/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const b = req.body || {};
      const r = await pool.query(
        'SELECT * FROM documents WHERE id = $1 AND user_id = $2', [id, req.user.id]);
      const row = r.rows[0];
      if (!row || (!req.demo && row.is_demo)) return res.sendStatus(404);
      // A lesson keeps its stored classroom context through a hand edit; the
      // tracks travel in the body itself and are re-validated as usual.
      const ctx = (row.kind === 'lesson' && row.body && row.body.context) || {};
      const input = row.kind === 'lesson'
        ? { topic: row.topic, durationMin: (b.body && b.body.durationMin) || 45,
            studentCount: ctx.studentCount ?? null, tools: ctx.tools ?? null,
            differentiate: ctx.differentiate === true }
        : { topic: row.topic, mcCount: (b.body && b.body.mc || []).length, essayCount: (b.body && b.body.essay || []).length };
      let norm;
      try {
        norm = row.kind === 'lesson' ? normalizeLesson(b.body, input) : normalizeQuiz(b.body, input);
      } catch {
        return res.status(400).json({ code: 'bad body' });
      }
      const u = await pool.query(
        'UPDATE documents SET title = $3, body = $4, updated_at = $5 WHERE id = $1 AND user_id = $2 RETURNING *',
        [id, req.user.id, b.title || norm.title, JSON.stringify(norm.body), req.now]);
      res.json(u.rows[0]);
    } catch (err) { fail(res, err); }
  });

  router.delete('/documents/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const r = await pool.query(
        'DELETE FROM documents WHERE id = $1 AND user_id = $2 RETURNING id', [id, req.user.id]);
      if (!r.rowCount) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (err) { fail(res, err); }
  });

  // ── Gradings ─────────────────────────────────────────────────────────────
  router.get('/gradings', async (req, res) => {
    try {
      if (!req.user) return res.json([]);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
      const quizId = parseInt(req.query.quizId, 10);
      const { rows } = await pool.query(
        `SELECT g.id, g.quiz_id, g.class_name, g.student_name, g.method, g.score, g.max_score,
                g.photo_url, g.is_demo, g.created_at, d.title AS quiz_title
           FROM gradings g JOIN documents d ON d.id = g.quiz_id
          WHERE g.user_id = $1${req.demo ? '' : ' AND NOT g.is_demo'}${Number.isInteger(quizId) ? ' AND g.quiz_id = $2' : ''}
          ORDER BY g.created_at DESC LIMIT ${limit}`,
        Number.isInteger(quizId) ? [req.user.id, quizId] : [req.user.id]);
      res.json(rows);
    } catch (err) { fail(res, err); }
  });

  router.get('/gradings/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { rows } = await pool.query(
        `SELECT g.*, d.title AS quiz_title, d.subject, d.subject_name, d.grade, d.body AS quiz_body
           FROM gradings g JOIN documents d ON d.id = g.quiz_id
          WHERE g.id = $1 AND g.user_id = $2`, [id, req.user.id]);
      const row = rows[0];
      if (!row || (!req.demo && row.is_demo)) return res.sendStatus(404);
      res.json(row);
    } catch (err) { fail(res, err); }
  });

  const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

  router.post('/gradings/read', async (req, res) => {
    try {
      const b = req.body || {};
      const quizId = parseInt(b.quizId, 10);
      if (!Number.isInteger(quizId)) return res.status(400).json({ code: 'bad quiz' });
      const match = typeof b.image === 'string' && b.image.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
      if (!match) return res.status(400).json({ code: 'bad image' });
      const bytes = Buffer.from(match[2], 'base64');
      if (bytes.length > 6 * 1024 * 1024) return res.status(400).json({ code: 'bad image' });
      const { rows } = await pool.query(
        'SELECT * FROM documents WHERE id = $1 AND user_id = $2 AND kind = $3',
        [quizId, req.user.id, 'quiz']);
      const quiz = rows[0];
      if (!quiz || (!req.demo && quiz.is_demo)) return res.sendStatus(404);
      const text = ['Read the photographed answer sheet for this quiz.', 'Multiple-choice key and questions:'];
      (quiz.body.mc || []).forEach((q, i) => {
        text.push(`Q${i + 1}: ${q.q} | A: ${q.choices[0]} | B: ${q.choices[1]} | C: ${q.choices[2]} | D: ${q.choices[3]} | Correct: ${LETTERS[q.answer]}`);
      });
      (quiz.body.essay || []).forEach((q, i) => {
        text.push(`Essay ${i + 1} (${q.points} points): ${q.q} Rubric: ${q.rubric.map(r => `${r.level}=${r.points} (${r.desc})`).join('; ')}`);
      });
      text.push('For each multiple-choice question report the letter you read (or null), and whether you are sure. For each essay, place the answer on the rubric with a one-line reason. Reply as {"mc": [{"answer": "A"|"B"|"C"|"D"|null, "clear": true|false}], "essay": [{"level": "Excellent"|"Good"|"Developing"|"Beginning"|"No answer", "reason": string}], "feedback": string, "studentName": string|null}.');
      const raw = await callClaude(req, {
        system: READ_SYSTEM,
        content: text.join('\n'),
        image: { type: 'base64', media_type: match[1], data: match[2] },
        maxTokens: 2000,
      });
      res.json(normalizeReading(raw, quiz));
    } catch (err) { fail(res, err); }
  });

  router.post('/gradings', async (req, res) => {
    try {
      const b = req.body || {};
      const quizId = parseInt(b.quizId, 10);
      if (!Number.isInteger(quizId)) return res.status(400).json({ code: 'bad quiz' });
      const className = typeof b.className === 'string' ? b.className.trim().slice(0, 80) : '';
      const studentName = typeof b.studentName === 'string' ? b.studentName.trim().slice(0, 80) : '';
      if (!className || !studentName) return res.status(400).json({ code: 'bad names' });
      const method = b.method === 'hand' ? 'hand' : 'ai';
      const { rows } = await pool.query(
        "SELECT * FROM documents WHERE id = $1 AND user_id = $2 AND kind = 'quiz'", [quizId, req.user.id]);
      const quiz = rows[0];
      if (!quiz || (!req.demo && quiz.is_demo)) return res.sendStatus(404);
      const { results, score, max } = scoreSheet(quiz, b.mcAnswers, b.essayLevels);

      const dupe = await pool.query(
        `SELECT id FROM gradings WHERE user_id = $1 AND quiz_id = $2
           AND lower(class_name) = lower($3) AND lower(student_name) = lower($4)${demoSql(req)}`,
        [req.user.id, quizId, className, studentName]);
      if (dupe.rows[0] && !b.replace) {
        return res.status(409).json({ code: 'duplicate_student', id: dupe.rows[0].id });
      }
      let row;
      if (dupe.rows[0]) {
        const u = await pool.query(
          `UPDATE gradings SET method = $3, photo_url = $4, photo_file_id = $5, mc_answers = $6,
                  essay_levels = $7, results = $8, score = $9, max_score = $10, feedback = $11, updated_at = $12
            WHERE id = $1 AND user_id = $2 RETURNING *`,
          [dupe.rows[0].id, req.user.id, method, b.photoUrl || null, b.photoFileId || null,
           JSON.stringify(b.mcAnswers || []), JSON.stringify(b.essayLevels || []),
           JSON.stringify(results), score, max, typeof b.feedback === 'string' ? b.feedback.slice(0, 400) : '', req.now]);
        row = u.rows[0];
      } else {
        const i = await pool.query(
          `INSERT INTO gradings (user_id, quiz_id, class_name, student_name, method, photo_url, photo_file_id,
                                 mc_answers, essay_levels, results, score, max_score, feedback, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14) RETURNING *`,
          [req.user.id, quizId, className, studentName, method, b.photoUrl || null, b.photoFileId || null,
           JSON.stringify(b.mcAnswers || []), JSON.stringify(b.essayLevels || []),
           JSON.stringify(results), score, max, typeof b.feedback === 'string' ? b.feedback.slice(0, 400) : '', req.now]);
        row = i.rows[0];
      }
      res.json({ ...row, quiz_title: quiz.title });
    } catch (err) { fail(res, err); }
  });

  router.patch('/gradings/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const b = req.body || {};
      const { rows } = await pool.query(
        `SELECT g.*, d.body AS quiz_body FROM gradings g JOIN documents d ON d.id = g.quiz_id
          WHERE g.id = $1 AND g.user_id = $2`, [id, req.user.id]);
      const row = rows[0];
      if (!row || (!req.demo && row.is_demo)) return res.sendStatus(404);
      const mcAnswers = Array.isArray(b.mcAnswers) ? b.mcAnswers : row.mc_answers;
      const essayLevels = Array.isArray(b.essayLevels) ? b.essayLevels : row.essay_levels;
      const { results, score, max } = scoreSheet({ body: row.quiz_body }, mcAnswers, essayLevels);
      const u = await pool.query(
        `UPDATE gradings SET mc_answers = $3, essay_levels = $4, results = $5, score = $6, max_score = $7,
                feedback = $8, updated_at = $9 WHERE id = $1 AND user_id = $2 RETURNING *`,
        [id, req.user.id, JSON.stringify(mcAnswers), JSON.stringify(essayLevels),
         JSON.stringify(results), score, max,
         typeof b.feedback === 'string' ? b.feedback.slice(0, 400) : row.feedback, req.now]);
      res.json(u.rows[0]);
    } catch (err) { fail(res, err); }
  });

  router.delete('/gradings/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const r = await pool.query(
        'DELETE FROM gradings WHERE id = $1 AND user_id = $2 RETURNING id', [id, req.user.id]);
      if (!r.rowCount) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (err) { fail(res, err); }
  });

  router.get('/classes', async (req, res) => {
    try {
      if (!req.user) return res.json([]);
      const { rows } = await pool.query(
        `SELECT DISTINCT class_name FROM gradings WHERE user_id = $1${demoSql(req)} ORDER BY 1`,
        [req.user.id]);
      res.json(rows.map(r => r.class_name));
    } catch (err) { fail(res, err); }
  });

  // Class score summary: sets grouped by quiz and class, then one set's
  // detail with students and per-question right counts.
  router.get('/scores', async (req, res) => {
    try {
      if (!req.user) return res.json([]);
      const { rows } = await pool.query(
        `SELECT g.quiz_id, max(d.title) AS quiz_title, max(d.subject) AS subject,
                max(d.subject_name) AS subject_name, max(d.grade) AS grade,
                g.class_name, count(*) AS n,
                round(avg(g.score / NULLIF(g.max_score, 0) * 100)) AS avg_pct
           FROM gradings g JOIN documents d ON d.id = g.quiz_id
          WHERE g.user_id = $1${req.demo ? '' : ' AND NOT g.is_demo'}
          GROUP BY g.quiz_id, lower(g.class_name), g.class_name
          ORDER BY max(g.created_at) DESC`,
        [req.user.id]);
      res.json(rows.map(r => ({ ...r, n: Number(r.n), avg_pct: Number(r.avg_pct || 0) })));
    } catch (err) { fail(res, err); }
  });

  router.get('/scores/:quizId', async (req, res) => {
    try {
      const quizId = parseInt(req.params.quizId, 10);
      const className = typeof req.query.class === 'string' ? req.query.class : '';
      if (!Number.isInteger(quizId) || !className) return res.sendStatus(404);
      const q = await pool.query(
        "SELECT * FROM documents WHERE id = $1 AND user_id = $2 AND kind = 'quiz'", [quizId, req.user.id]);
      const quiz = q.rows[0];
      if (!quiz || (!req.demo && quiz.is_demo)) return res.sendStatus(404);
      const g = await pool.query(
        `SELECT * FROM gradings WHERE user_id = $1 AND quiz_id = $2
           AND lower(class_name) = lower($3)${demoSql(req)} ORDER BY student_name`,
        [req.user.id, quizId, className]);
      res.json({ quiz, class_name: className, summary: summarize(g.rows, quiz) });
    } catch (err) { fail(res, err); }
  });

  return router;
};
