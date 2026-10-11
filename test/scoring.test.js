const { test } = require('node:test');
const assert = require('node:assert');
const { scoreSheet, summarize } = require('../lib/scoring');

const quiz = {
  body: {
    mc: [
      { q: 'q1', choices: ['a', 'b', 'c', 'd'], answer: 0 },
      { q: 'q2', choices: ['a', 'b', 'c', 'd'], answer: 2 },
    ],
    essay: [{
      q: 'essay', points: 4,
      rubric: [
        { level: 'Excellent', points: 4, desc: '' },
        { level: 'Good', points: 3, desc: '' },
        { level: 'Developing', points: 2, desc: '' },
        { level: 'Beginning', points: 1, desc: '' },
      ],
    }],
  },
};

test('multiple choice is 1 point for the matching letter, 0 otherwise', () => {
  const r = scoreSheet(quiz, ['A', 'B'], []);
  assert.equal(r.results[0].points, 1);
  assert.equal(r.results[1].points, 0);
  assert.equal(r.score, 1);
  assert.equal(r.max, 6); // 2 multiple choice + a 4-point essay
});

test('blank answers score nothing', () => {
  const r = scoreSheet(quiz, [null, null], [4]);
  assert.equal(r.score, 0);
  assert.equal(r.max, 6);
});

test('essay levels score rubric points; No answer scores 0', () => {
  assert.equal(scoreSheet(quiz, ['A', 'C'], [0]).score, 6); // both mc + Excellent
  assert.equal(scoreSheet(quiz, ['A', 'C'], [3]).score, 3); // both mc + Beginning
  assert.equal(scoreSheet(quiz, ['A', 'C'], [4]).score, 2); // both mc + No answer
});

test('summarize averages and counts per-question rights', () => {
  const gradings = [
    { id: 1, student_name: 'A', score: 6, max_score: 6, results: [{ q: 1, points: 1, max: 1 }, { q: 2, points: 1, max: 1 }, { q: 3, points: 4, max: 4 }] },
    { id: 2, student_name: 'B', score: 2, max_score: 6, results: [{ q: 1, points: 1, max: 1 }, { q: 2, points: 0, max: 1 }, { q: 3, points: 1, max: 4 }] },
  ];
  const s = summarize(gradings, quiz);
  assert.equal(s.count, 2);
  assert.equal(s.average, 67); // (100 + 33.3) / 2
  assert.equal(s.min, 33);
  assert.equal(s.max, 100);
  assert.equal(s.questions[0].right, 2);
  assert.equal(s.questions[1].right, 1);
  assert.equal(s.questions[2].right, 1);
});
