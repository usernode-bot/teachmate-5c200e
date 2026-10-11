// Pure validators that make AI output safe to store. Anything a shape rule
// can't repair throws, and the route answers ai_failed.

const LETTERS = ['A', 'B', 'C', 'D'];

function asText(v, max = 400) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

function asLines(v, maxItems) {
  if (!Array.isArray(v)) return null;
  const out = [];
  for (const item of v) {
    const s = asText(item);
    if (s) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

function asInt(v) {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

// Forces a set of activity minutes to sum to the duration, never below 5
// each: take the difference off main first, then closing, then opening; add
// any shortfall to main.
function fitMinutes(phases, duration) {
  let diff = phases.reduce((s, p) => s + p.minutes, 0) - duration;
  for (const p of [phases[1], phases[2], phases[0]]) {
    if (diff <= 0) break;
    const take = Math.min(p.minutes - 5, diff);
    p.minutes -= take;
    diff -= take;
  }
  if (diff > 0) throw new Error('duration too short');
  if (diff < 0) phases[1].minutes += -diff;
}

const PHASE_FALLBACK = { opening: 'Opening', main: 'Main activity', closing: 'Closing' };

function normalizeLesson(raw, input) {
  const duration = asInt(input && input.durationMin);
  if (!duration || duration < 15 || duration > 120) throw new Error('bad duration');
  if (!raw || typeof raw !== 'object') throw new Error('bad lesson');
  const objectives = (asLines(raw.objectives, 5) || []).slice(0, 5);
  if (objectives.length < 2) throw new Error('bad objectives');
  const materials = (asLines(raw.materials, 8) || []).slice(0, 8);
  const list = Array.isArray(raw.activities) ? raw.activities : [];
  const phases = ['opening', 'main', 'closing'].map(phase => {
    const a = list.find(x => x && typeof x.phase === 'string' && x.phase.toLowerCase().includes(phase));
    if (!a) throw new Error('missing ' + phase);
    const steps = asLines(a.steps, 8) || [];
    if (!steps.length) throw new Error('bad steps');
    let minutes = asInt(a.minutes);
    if (minutes === null || minutes < 5) minutes = 5;
    if (minutes > duration) minutes = duration;
    const title = asText(a.title, 200) || PHASE_FALLBACK[phase];
    return { phase, title, minutes, steps };
  });
  fitMinutes(phases, duration);
  const checks = (asLines(raw.assessment && raw.assessment.checks, 5) || []).slice(0, 5);
  if (!checks.length) throw new Error('bad assessment');
  const title = asText(raw.title, 200) || asText(input && input.topic, 200);
  if (!title) throw new Error('bad title');
  return {
    title,
    body: { objectives, materials, activities: phases, assessment: { checks }, durationMin: duration },
  };
}

const RUBRIC_DEFAULTS = [
  { level: 'Excellent', desc: 'Complete and accurate, with clear reasoning' },
  { level: 'Good', desc: 'Mostly accurate with some reasoning' },
  { level: 'Developing', desc: 'Partly accurate or unclear' },
  { level: 'Beginning', desc: 'Attempted with little accuracy' },
];

function normalizeQuiz(raw, input) {
  const mcCount = Math.min(20, Math.max(0, asInt(input && input.mcCount) ?? 0));
  const essayCount = Math.min(5, Math.max(0, asInt(input && input.essayCount) ?? 0));
  if (mcCount + essayCount < 1) throw new Error('no questions');
  if (!raw || typeof raw !== 'object') throw new Error('bad quiz');
  const mc = [];
  for (const q of Array.isArray(raw.mc) ? raw.mc : []) {
    if (mc.length >= mcCount) break;
    const text = asText(q && q.q);
    const choices = (asLines(q && q.choices, 4) || []).slice(0, 4);
    const answer = asInt(q && q.answer);
    if (!text || choices.length !== 4 || answer === null || answer < 0 || answer > 3) throw new Error('bad mc');
    mc.push({ q: text, choices, answer });
  }
  if (mc.length !== mcCount) throw new Error('mc count');
  const essay = [];
  for (const q of Array.isArray(raw.essay) ? raw.essay : []) {
    if (essay.length >= essayCount) break;
    const text = asText(q && q.q);
    if (!text) throw new Error('bad essay');
    let points = asInt(q && q.points);
    if (points === null || points < 1 || points > 10) points = 4;
    const rubric = RUBRIC_DEFAULTS.map((d, i) => ({
      level: d.level,
      desc: asText(q.rubric && q.rubric[i] && q.rubric[i].desc, 200) || d.desc,
      points: points - i,
    }));
    essay.push({ q: text, points, rubric });
  }
  if (essay.length !== essayCount) throw new Error('essay count');
  const title = asText(raw.title, 200) || asText(input && input.topic, 200);
  if (!title) throw new Error('bad title');
  return { title, body: { mc, essay } };
}

const LEVEL_NAMES = ['Excellent', 'Good', 'Developing', 'Beginning', 'No answer'];

function normalizeReading(raw, quiz) {
  if (!raw || typeof raw !== 'object') throw new Error('bad reading');
  const mc = (quiz.body.mc || []).map((q, i) => {
    const a = raw.mc && raw.mc[i];
    let letter = null;
    if (a) {
      if (typeof a.answer === 'string') {
        const s = a.answer.trim().toUpperCase();
        if (LETTERS.includes(s)) letter = s;
        else {
          const n = asInt(a.answer);
          if (n !== null && n >= 0 && n <= 3) letter = LETTERS[n];
        }
      } else {
        const n = asInt(a && a.answer);
        if (n !== null && n >= 0 && n <= 3) letter = LETTERS[n];
      }
    }
    return { letter, clear: !(a && a.clear === false) };
  });
  const essay = (quiz.body.essay || []).map((q, i) => {
    const a = raw.essay && raw.essay[i];
    let level = 4;
    if (a) {
      if (typeof a.level === 'string') {
        const idx = LEVEL_NAMES.indexOf(a.level.trim());
        level = idx >= 0 ? idx : 4;
      } else {
        const n = asInt(a.level);
        if (n !== null && n >= 0 && n <= 4) level = n;
      }
    }
    return { level, reason: asText(a && a.reason, 160) || '' };
  });
  return {
    mc,
    essay,
    feedback: asText(raw.feedback, 400) || '',
    studentName: asText(raw.studentName, 80),
  };
}

module.exports = { normalizeLesson, normalizeQuiz, normalizeReading, LETTERS };
