const { test } = require('node:test');
const assert = require('node:assert');
const { blankLesson, blankQuiz } = require('../lib/outline');

test('blank lesson minutes sum to the duration for 15, 45 and 120', () => {
  for (const durationMin of [15, 45, 120]) {
    const out = blankLesson({ topic: 'T', durationMin });
    const sum = out.body.activities.reduce((s, a) => s + a.minutes, 0);
    assert.equal(sum, durationMin, `duration ${durationMin}`);
    assert.ok(out.body.activities.every(a => a.minutes >= 5));
  }
});

test('the blank quiz has the asked-for counts', () => {
  const out = blankQuiz({ mcCount: 5, essayCount: 2 });
  assert.equal(out.body.mc.length, 5);
  assert.equal(out.body.essay.length, 2);
  assert.equal(out.body.mc[0].choices.length, 4);
  assert.deepEqual(out.body.essay[0].rubric.map(r => r.points), [4, 3, 2, 1]);
});

const { TRACK_LEVELS } = require('../lib/normalize');

test('a blank lesson with Differentiate has three empty tracks and the context', () => {
  const out = blankLesson({ topic: 'T', durationMin: 45, studentCount: 24, tools: 'handouts', differentiate: true });
  const main = out.body.activities[1];
  assert.deepEqual(main.tracks.map(t => t.level), TRACK_LEVELS);
  assert.ok(main.tracks.every(t => t.steps.length === 1 && t.steps[0] === ''));
  assert.deepEqual(out.body.context, { studentCount: 24, tools: 'handouts', differentiate: true });
});

test('a blank lesson without Differentiate has no tracks and no context', () => {
  const out = blankLesson({ topic: 'T', durationMin: 45 });
  assert.equal('tracks' in out.body.activities[1], false);
  assert.equal('context' in out.body, false);
});
