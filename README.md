# TeachMate

AI lesson plans, quizzes and grading for K-12 teachers. A Homeroom app: the
teacher enters a subject, grade, topic and class length and gets a complete
lesson plan; writes quizzes with an answer key and rubric; photographs an
answer sheet and gets suggested marks with feedback; and sees class score
summaries. Everything can be exported as a PDF.

## How it works

- **Lessons tab** — write a lesson plan from subject, grade, class length and
  topic. Saved plans list below, searchable. Each plan opens as a ruled
  notebook sheet with the minutes for each activity in the margin.
- **Quizzes tab** — write a quiz with multiple-choice and essay questions, an
  answer key (correct choices circled in red) and a four-level rubric. A quiz
  can be based on one of your lesson plans.
- **Grade tab** — take or choose a photo of a student's answer sheet. AI reads
  each answer, marks it against the key, places essays on the rubric and
  writes feedback. The teacher checks every mark and saves. Entering answers
  by hand is always available.
- **Scores tab** — class summaries: average, range, each student's result, and
  how many students got each question right.

## Under the hood

- `server.js` — Express app: auth (iframe JWT), the API in `lib/routes.js`,
  schema migration in `lib/db.js`, static serving.
- `lib/` — `ai.js` (platform LLM proxy), `normalize.js` (validators that make
  AI output safe to store), `scoring.js` (the one place scores are computed),
  `outline.js` (blank outlines), `demo.js` (staging demo data).
- `public/js/` — the frontend: hash-routed tabs, the notebook sheet
  (`sheet.js`), one module per tab.
- Plans, quizzes and scores live in private tables (`staging:private`), one
  teacher per account. AI runs through the platform proxy; answer-sheet
  photos upload through platform storage as private files.
- `npm test` runs the unit tests; the proposal checks live in `dapp.json`.
