const { test } = require('node:test');
const assert = require('node:assert');
const { normalizeLesson, normalizeQuiz, normalizeReading, cleanContext } = require('../lib/normalize');

const lessonInput = { topic: 'The water cycle', durationMin: 45 };
const goodLesson = {
  title: 'The water cycle',
  objectives: ['Name the four stages', 'Explain evaporation'],
  materials: ['Cups'],
  activities: [
    { phase: 'opening', title: 'Opening', minutes: 5, steps: ['Ask a question'] },
    { phase: 'main', title: 'Main', minutes: 30, steps: ['Demo', 'Pair work'] },
    { phase: 'closing', title: 'Closing', minutes: 10, steps: ['Exit ticket'] },
  ],
  assessment: { checks: ['Exit ticket'] },
};

test('lesson minutes are forced to sum to the duration', () => {
  const raw = structuredClone(goodLesson);
  raw.activities[1].minutes = 99;
  const out = normalizeLesson(raw, lessonInput);
  const sum = out.body.activities.reduce((s, a) => s + a.minutes, 0);
  assert.equal(sum, 45);
  assert.ok(out.body.activities.every(a => a.minutes >= 5));
});

test('a lesson short of the duration gets the difference added to main', () => {
  const raw = structuredClone(goodLesson);
  raw.activities.forEach(a => { a.minutes = 5; });
  const out = normalizeLesson(raw, lessonInput);
  const sum = out.body.activities.reduce((s, a) => s + a.minutes, 0);
  assert.equal(sum, 45);
  assert.equal(out.body.activities[1].minutes, 35);
});

test('missing phases or empty arrays throw', () => {
  assert.throws(() => normalizeLesson({ ...goodLesson, activities: goodLesson.activities.slice(0, 2) }, lessonInput));
  assert.throws(() => normalizeLesson({ ...goodLesson, objectives: ['only one'] }, lessonInput));
  assert.throws(() => normalizeLesson({ ...goodLesson, assessment: { checks: [] } }, lessonInput));
});

const quizInput = { topic: 'Fractions', mcCount: 2, essayCount: 1 };
const goodQuiz = {
  title: 'Fractions quiz',
  mc: [
    { q: 'Which is 1/2?', choices: ['2/4', '1/3', '3/5', '2/5'], answer: 0 },
    { q: 'How many eighths in a half?', choices: ['2', '3', '4', '6'], answer: 2 },
  ],
  essay: [{ q: 'Explain why 2/4 equals 1/2.', points: 4 }],
};

test('quiz choice count and answer range hold', () => {
  const out = normalizeQuiz(goodQuiz, quizInput);
  assert.equal(out.body.mc.length, 2);
  assert.equal(out.body.essay.length, 1);
  assert.throws(() => normalizeQuiz(
    { ...goodQuiz, mc: [{ q: 'x', choices: ['a', 'b'], answer: 0 }] }, quizInput));
  assert.throws(() => normalizeQuiz(
    { ...goodQuiz, mc: [{ q: 'x', choices: ['a', 'b', 'c', 'd'], answer: 4 }] }, quizInput));
});

test('the rubric descends and its top equals the points', () => {
  const out = normalizeQuiz(goodQuiz, quizInput);
  const rubric = out.body.essay[0].rubric;
  assert.equal(rubric.length, 4);
  assert.equal(rubric[0].points, 4);
  assert.deepEqual(rubric.map(r => r.points), [4, 3, 2, 1]);
});

test('a reading with bad letters becomes null', () => {
  const quiz = normalizeQuiz(goodQuiz, quizInput);
  const reading = normalizeReading(
    { mc: [{ answer: 'E', clear: false }, { answer: 2 }], essay: [{ level: 'Good', reason: 'Solid' }], feedback: 'Nice work' },
    quiz);
  assert.equal(reading.mc[0].letter, null);
  assert.equal(reading.mc[0].clear, false);
  assert.equal(reading.mc[1].letter, 'C');
  assert.equal(reading.essay[0].level, 1);
});

// ── Classroom context and differentiation tracks ───────────────────────────
const trackedInput = { topic: 'The water cycle', durationMin: 45, studentCount: 24, tools: 'handouts', differentiate: true };
const tracks = [
  { level: 'support', title: 'With a guide', steps: ['Follow the card'] },
  { level: 'core', title: 'On grade', steps: ['Build it', 'Sketch it'] },
  { level: 'challenge', title: 'Extension', steps: ['Change one thing'] },
];

test('three valid tracks are kept in Support, Core, Challenge order', () => {
  const raw = structuredClone(goodLesson);
  raw.activities[1].tracks = [...tracks].reverse();
  raw.activities[1].steps = ['Set up the cups'];
  const out = normalizeLesson(raw, trackedInput);
  const main = out.body.activities[1];
  assert.deepEqual(main.tracks.map(t => t.level), ['support', 'core', 'challenge']);
  assert.deepEqual(main.tracks.map(t => t.title), ['With a guide', 'On grade', 'Extension']);
  const sum = out.body.activities.reduce((s, a) => s + a.minutes, 0);
  assert.equal(sum, 45);
  assert.deepEqual(out.body.context, { studentCount: 24, tools: 'handouts', differentiate: true });
});

test('a track with no steps drops the whole set, main steps kept', () => {
  const raw = structuredClone(goodLesson);
  raw.activities[1].tracks = tracks.map(t => ({ ...t }));
  raw.activities[1].tracks[0].steps = [];
  const out = normalizeLesson(raw, trackedInput);
  const main = out.body.activities[1];
  assert.equal(main.tracks, undefined);
  assert.deepEqual(main.steps, ['Demo', 'Pair work']);
});

test('main steps empty with valid tracks: kept; with broken tracks: core steps used', () => {
  const raw = structuredClone(goodLesson);
  raw.activities[1].steps = [];
  raw.activities[1].tracks = tracks;
  const kept = normalizeLesson(raw, trackedInput);
  assert.equal(kept.body.activities[1].tracks.length, 3);
  assert.deepEqual(kept.body.activities[1].steps, []);

  const broken = structuredClone(raw);
  broken.activities[1].tracks = tracks.slice(0, 2);
  const fallback = normalizeLesson(broken, trackedInput);
  assert.equal(fallback.body.activities[1].tracks, undefined);
  assert.deepEqual(fallback.body.activities[1].steps, ['Build it', 'Sketch it']);

  const none = structuredClone(raw);
  none.activities[1].tracks = [{ level: 'support', title: 'S', steps: ['x'] }];
  assert.throws(() => normalizeLesson(none, trackedInput), /bad steps/);
});

test('cleanContext drops a bad tool and an out-of-range count; empty is null', () => {
  assert.deepEqual(cleanContext({ studentCount: 30, tools: 'projector' }),
    { studentCount: 30, tools: 'projector', differentiate: false });
  assert.deepEqual(cleanContext({ studentCount: 100, tools: 'paper', differentiate: true }),
    { studentCount: null, tools: null, differentiate: true });
  assert.equal(cleanContext({ studentCount: 'x' }), null);
  assert.equal(cleanContext({}), null);
  const out = normalizeLesson(goodLesson, lessonInput);
  assert.equal('context' in out.body, false);
});
