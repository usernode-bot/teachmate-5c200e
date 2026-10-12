const { test } = require('node:test');
const assert = require('node:assert');
const { normalizeLesson, normalizeQuiz } = require('../lib/normalize');
const { LESSONS, QUIZZES, SETS } = require('../lib/demo');

test('every demo lesson passes the normalizer', () => {
  for (const l of LESSONS) {
    const out = normalizeLesson({
      title: l.topic, objectives: l.obj, materials: l.mat,
      activities: [
        { phase: 'opening', title: 'Opening', minutes: l.mins[0], steps: l.open },
        { phase: 'main', title: 'Main activity', minutes: l.mins[1], steps: l.main },
        { phase: 'closing', title: 'Closing', minutes: l.mins[2], steps: l.close },
      ],
      assessment: { checks: l.checks },
    }, { topic: l.topic, durationMin: l.dur });
    assert.ok(out.body.activities.length === 3, l.key);
  }
});

test('every demo quiz passes the normalizer', () => {
  for (const q of QUIZZES) {
    const out = normalizeQuiz({
      title: q.title, mc: q.mc,
      essay: q.essay.map(e => ({ ...e, points: 4 })),
    }, { topic: q.title, mcCount: q.mcCount, essayCount: q.essayCount });
    assert.equal(out.body.mc.length, q.mcCount, q.key);
    assert.equal(out.body.essay.length, q.essayCount, q.key);
  }
});

test('every grading names a quiz that exists, and the counts hold', () => {
  const quizKeys = new Set(QUIZZES.map(q => q.key));
  for (const set of SETS) {
    assert.ok(quizKeys.has(set.quizKey), set.quizKey);
  }
  assert.equal(LESSONS.length, 8);
  assert.equal(QUIZZES.length, 4);
  assert.equal(SETS.reduce((s, x) => s + x.students.length, 0), 17);
});

test('student names are the made-up alliterative list', () => {
  const names = SETS.flatMap(s => s.students.map(st => st.name));
  assert.ok(names.every(n => /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(n)), names.join(', '));
  assert.ok(new Set(names).size === 17);
});

const { demoLesson } = require('../lib/demo');

test('the water cycle demo lesson is differentiated with its context', () => {
  const out = demoLesson(LESSONS.find(l => l.key === 'lesson-water-cycle'));
  const main = out.body.activities[1];
  assert.deepEqual(main.tracks.map(t => t.level), ['support', 'core', 'challenge']);
  assert.deepEqual(out.body.context, { studentCount: 24, tools: 'handouts', differentiate: true });
  const sum = out.body.activities.reduce((s, a) => s + a.minutes, 0);
  assert.equal(sum, 45);
});
