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

const TRACK_LEVELS = ['support', 'core', 'challenge'];
const TRACK_FALLBACK = { support: 'Support', core: 'Core', challenge: 'Challenge' };
const TOOL_KEYS = ['whiteboard', 'handouts', 'projector'];

// The optional classroom context from the form: a class size, the room's
// tools, and the Differentiate switch. Anything missing or out of shape is
// dropped; all-empty means the plan has no context at all.
function cleanContext(input) {
  const count = asInt(input && input.studentCount);
  const studentCount = count !== null && count >= 1 && count <= 99 ? count : null;
  const tools = TOOL_KEYS.includes(input && input.tools) ? input.tools : null;
  const differentiate = (input && input.differentiate) === true;
  if (studentCount === null && tools === null && !differentiate) return null;
  return { studentCount, tools, differentiate };
}

// The three ability tracks on a differentiated main activity. All three must
// be present with at least one step each, matched by level; otherwise the
// whole set is dropped and the plan keeps one main activity. The core
// track's steps are kept apart as a fallback for an empty whole-class list.
function cleanTracks(a) {
  if (!a || !Array.isArray(a.tracks)) return { tracks: null, coreSteps: [] };
  const byLevel = { support: null, core: null, challenge: null };
  for (const t of a.tracks) {
    if (!t || typeof t !== 'object') continue;
    const lv = typeof t.level === 'string' ? t.level.toLowerCase() : '';
    const key = TRACK_LEVELS.find(k => lv.includes(k));
    if (!key || byLevel[key]) continue;
    const steps = asLines(t.steps, 6) || [];
    if (!steps.length) continue;
    byLevel[key] = { level: key, title: asText(t.title, 200) || TRACK_FALLBACK[key], steps };
  }
  const coreRaw = a.tracks.find(t => t && typeof t === 'object' &&
    typeof t.level === 'string' && t.level.toLowerCase().includes('core'));
  return {
    tracks: TRACK_LEVELS.every(k => byLevel[k]) ? TRACK_LEVELS.map(k => byLevel[k]) : null,
    coreSteps: (asLines(coreRaw && coreRaw.steps, 8) || []),
  };
}

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
    let tracks;
    if (phase === 'main') {
      // Whole-class steps may be empty only when the three tracks came out;
      // a failed track set falls back to the core track's steps, then throws.
      const t = cleanTracks(a);
      if (t.tracks) tracks = t.tracks;
      else if (!steps.length) {
        if (!t.coreSteps.length) throw new Error('bad steps');
        steps.push(...t.coreSteps);
      }
    } else if (!steps.length) throw new Error('bad steps');
    let minutes = asInt(a.minutes);
    if (minutes === null || minutes < 5) minutes = 5;
    if (minutes > duration) minutes = duration;
    const title = asText(a.title, 200) || PHASE_FALLBACK[phase];
    const out = { phase, title, minutes, steps };
    if (tracks) out.tracks = tracks;
    return out;
  });
  fitMinutes(phases, duration);
  const checks = (asLines(raw.assessment && raw.assessment.checks, 5) || []).slice(0, 5);
  if (!checks.length) throw new Error('bad assessment');
  // Standards and the aligned assessment idea are only written for a plan
  // that has a curriculum; without requireStandards they are optional (the
  // hand-edit path keeps whatever is supplied).
  const standards = (asLines(raw.standards, 3) || []).slice(0, 3);
  const aligned = asText(raw.assessment && raw.assessment.aligned);
  if (input && input.requireStandards && (!standards.length || !aligned)) throw new Error('bad standards');
  const body = { objectives, materials, activities: phases, assessment: { checks }, durationMin: duration };
  if (aligned) body.assessment.aligned = aligned;
  if (standards.length) body.standards = standards;
  const title = asText(raw.title, 200) || asText(input && input.topic, 200);
  if (!title) throw new Error('bad title');
  const context = cleanContext(input);
  if (context) body.context = context;
  return { title, body };
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

module.exports = {
  normalizeLesson, normalizeQuiz, normalizeReading, cleanContext,
  TRACK_LEVELS, TRACK_FALLBACK, LETTERS,
};
