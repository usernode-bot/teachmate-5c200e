const { test } = require('node:test');
const assert = require('node:assert');
const { lessonPrompt, quizPrompt } = require('../lib/ai');

const input = { subject: 'math', grade: '3', topic: 'Equivalent fractions', durationMin: 40 };

test('a prompt without a curriculum asks for no standards', () => {
  const text = lessonPrompt(input);
  assert.ok(!text.includes('standards'));
  assert.ok(!text.includes('aligned'));
});

test('a Common Core prompt names the standards and asks for codes', () => {
  const text = lessonPrompt({ ...input, curriculum: 'ccss' });
  assert.ok(text.includes('Common Core State Standards'));
  assert.ok(text.includes('"standards"'));
  assert.ok(text.includes('"aligned"'));
  assert.ok(text.includes('Never invent a code'));
});

test('an Other prompt uses the typed curriculum name', () => {
  const text = lessonPrompt({ ...input, curriculum: 'other', curriculumName: 'National Curriculum for England' });
  assert.ok(text.includes('Align the plan to National Curriculum for England'));
});

test('subject keys are spelled out for the model', () => {
  assert.ok(lessonPrompt({ ...input, subject: 'civ' }).includes('grade 3 civics'));
  assert.ok(lessonPrompt({ ...input, subject: 'nat' }).includes('grade 3 national language'));
  assert.ok(quizPrompt({ subject: 'civ', grade: '5', topic: 'Pancasila', mcCount: 2, essayCount: 1 }).includes('grade 5 civics'));
});