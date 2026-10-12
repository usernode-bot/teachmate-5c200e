const { test } = require('node:test');
const assert = require('node:assert');
const { lessonPrompt } = require('../lib/ai');

const base = { subject: 'sci', grade: '4', topic: 'The water cycle', durationMin: 45 };

test('the lesson prompt is unchanged without classroom context', () => {
  const text = lessonPrompt(base);
  assert.ok(!text.includes('students'));
  assert.ok(!text.includes('whiteboard'));
  assert.ok(!text.includes('"tracks"'));
  assert.ok(text.includes('45-minute lesson plan for grade 4 sci'));
});

test('the lesson prompt mentions the values that are set, and only those', () => {
  assert.ok(lessonPrompt({ ...base, studentCount: 24 }).includes('There are 24 students'));
  assert.ok(lessonPrompt({ ...base, tools: 'whiteboard' }).includes('The only tool is a whiteboard'));
  assert.ok(lessonPrompt({ ...base, tools: 'handouts' }).includes('printed handouts, but no projector'));
  assert.ok(lessonPrompt({ ...base, tools: 'projector' }).includes('a whiteboard and a projector'));
  const tracks = lessonPrompt({ ...base, differentiate: true });
  assert.ok(tracks.includes('"tracks"'));
  assert.ok(tracks.includes('"challenge"'));
  assert.ok(!lessonPrompt({ ...base }).includes('"tracks"'));
});
