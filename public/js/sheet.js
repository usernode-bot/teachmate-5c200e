// The notebook sheet: renders a lesson or quiz body as ruled paper, read and
// edit modes, plus the PDF export.

import { esc, toast } from './app.js';
import { gradeLabel, subjectLabel, curriculumLabel } from './icons.js';

const RUBRIC_LEVELS = ['Excellent', 'Good', 'Developing', 'Beginning'];
const TRACK_NAMES = { support: 'Support', core: 'Core', challenge: 'Challenge' };
const TOOL_WORDS = { whiteboard: 'whiteboard only', handouts: 'printed handouts', projector: 'projector' };

// Cumulative minute ranges for the margin: 0–5, 5–35, 35–45.
function timeRanges(activities) {
  let t = 0;
  return activities.map(a => {
    const from = t;
    t += a.minutes;
    return `${from}–${t}`;
  });
}

export function lessonSheetHtml(doc) {
  const b = doc.body;
  const ranges = timeRanges(b.activities || []);
  const list = (items, ordered = false) => {
    const rows = (items || []).filter(s => String(s).trim());
    if (!rows.length) return '';
    return ordered ? `<ol>${rows.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`
      : `<ul>${rows.map(s => `<li>${esc(s)}</li>`).join('')}</ul>`;
  };
  const tracks = a => (a.tracks || []).map(t => `
    <h4 class="trk-h"><span class="trk">${esc(TRACK_NAMES[t.level] || t.level)}</span>${esc(t.title)}</h4>
    ${list(t.steps, true)}`).join('');
  const phase = (a, i) => a && `
    <h3><span class="mt">${esc(ranges[i] || '')}</span>${esc(a.title)}</h3>
    ${list(a.steps, true)}
    ${tracks(a)}`;
  const ctx = b.context || {};
  const meta = [`${esc(b.durationMin)} minutes`];
  if (ctx.studentCount != null) meta.push(`${esc(ctx.studentCount)} students`);
  if (ctx.tools && TOOL_WORDS[ctx.tools]) meta.push(TOOL_WORDS[ctx.tools]);
  const cur = curriculumLabel(doc);
  if (cur) meta.push(esc(cur));
  const standards = (b.standards || []).filter(s => String(s).trim());
  const aligned = b.assessment && String(b.assessment.aligned || '').trim();
  return `<article class="sheet">
    <h2 class="sheet-title">${esc(doc.title)}</h2>
    <p class="meta">${esc(gradeLabel(doc.grade))} ${esc(subjectLabel(doc).toLowerCase())}, ${meta.join(', ')}</p>
    <h3>Learning objectives</h3>${list(b.objectives)}
    ${standards.length ? `<h3>Curriculum standards</h3>${list(standards)}` : ''}
    ${b.materials && b.materials.filter(s => String(s).trim()).length ? `<h3>Materials</h3>${list(b.materials)}` : ''}
    ${phase((b.activities || [])[0], 0)}
    ${phase((b.activities || [])[1], 1)}
    ${phase((b.activities || [])[2], 2)}
    <h3>Assessment</h3>${list(b.assessment && b.assessment.checks)}
    ${aligned ? `<p><strong>Aligned assessment:</strong> ${esc(aligned)}</p>` : ''}
  </article>`;
}

// The same lesson as plain text, for Copy and Share on the saved plan cards.
export function lessonText(doc) {
  const b = doc.body || {};
  const out = [doc.title, `${gradeLabel(doc.grade)} ${subjectLabel(doc).toLowerCase()}, ${b.durationMin} minutes`];
  const cur = curriculumLabel(doc);
  if (cur) out[1] += `, ${cur}`;
  const clean = items => (items || []).filter(s => String(s).trim());
  const section = (title, items, ordered = false) => {
    const rows = clean(items);
    if (!rows.length) return;
    out.push('', title, ...rows.map((s, i) => (ordered ? `${i + 1}. ` : '- ') + s));
  };
  section('Learning objectives', b.objectives);
  section('Curriculum standards', b.standards);
  section('Materials', b.materials);
  const ranges = timeRanges(b.activities || []);
  (b.activities || []).forEach((a, i) => {
    if (!a) return;
    section(`${a.title} (${ranges[i]} min)`, a.steps, true);
    (a.tracks || []).forEach(t => section(`${TRACK_NAMES[t.level] || t.level}: ${t.title}`, t.steps, true));
  });
  section('Assessment', b.assessment && b.assessment.checks);
  const aligned = b.assessment && String(b.assessment.aligned || '').trim();
  if (aligned) out.push('', `Aligned assessment: ${aligned}`);
  return out.join('\n');
}

// The correct choice is circled in red pen on the answer key.
function choice(q, i, key) {
  const circled = key && i === q.answer;
  const letter = `<span${circled ? ' class="key-circle"' : ''}>${'ABCD'[i]}</span>`;
  return `<li>${letter}. ${esc(q.choices[i])}</li>`;
}

function rubricBlock(q) {
  return `<div class="rubric">${q.rubric.map(r =>
    `<div><b>${esc(r.level)} (${esc(r.points)})</b> — ${esc(r.desc)}</div>`).join('')}</div>`;
}

export function quizSheetHtml(doc, mode) {
  const b = doc.body;
  const key = mode === 'key';
  const mc = (b.mc || []).map((q, i) => `
    <li>
      <p class="q">${esc(q.q)}</p>
      <ul class="choices">${q.choices.map((c, ci) => choice(q, ci, key)).join('')}</ul>
    </li>`).join('');
  const essay = (b.essay || []).map((q, i) => `
    <li>
      <p class="q">${esc(q.q)} <span class="pts">(${esc(q.points)} points)</span></p>
      ${key ? rubricBlock(q) : ''}
    </li>`).join('');
  return `<article class="sheet">
    <h2 class="sheet-title">${esc(doc.title)}</h2>
    <p class="meta">${esc(gradeLabel(doc.grade))} ${esc(subjectLabel(doc).toLowerCase())}${key ? ' — Answer key' : ''}</p>
    ${mc ? `<h3>Multiple choice</h3><ol>${mc}</ol>` : ''}
    ${essay ? `<h3>Essay questions</h3><ol start="${(b.mc || []).length + 1}">${essay}</ol>` : ''}
    ${key ? '<h3>Scoring rubric</h3><div class="rubric"><div>Multiple choice: 1 point each. Essays: see each question\'s rubric above.</div></div>' : ''}
  </article>`;
}

// ── Edit mode ──────────────────────────────────────────────────────────────
const ta = (name, value, rows = 2) =>
  `<textarea class="field" data-f="${name}" rows="${rows}">${esc(value)}</textarea>`;

export function lessonEditHtml(doc) {
  const b = doc.body;
  const ranges = timeRanges(b.activities || []);
  const cur = curriculumLabel(doc);
  const standards = (b.standards || []).filter(s => String(s).trim());
  const aligned = b.assessment && String(b.assessment.aligned || '').trim();
  return `<article class="sheet sheet-edit">
    ${ta('title', doc.title, 1)}
    <p class="meta">${esc(gradeLabel(doc.grade))} ${esc(subjectLabel(doc).toLowerCase())}, ${esc(b.durationMin)} minutes${cur ? `, ${esc(cur)}` : ''}</p>
    <h3>Learning objectives</h3>${ta('objectives', (b.objectives || []).join('\n'), 3)}
    ${(cur || standards.length) ? `<h3>Curriculum standards</h3>${ta('standards', standards.join('\n'), 2)}` : ''}
    <h3>Materials</h3>${ta('materials', (b.materials || []).join('\n'), 2)}
    ${(b.activities || []).map((a, i) => `
      <h3><span class="mt">${esc(ranges[i] || '')}</span><span class="lab">${esc(a.title)}</span> <span class="min">${esc(a.minutes)} min</span></h3>
      <textarea class="field" data-f="steps:${i}" data-phase="${esc(a.phase)}" data-title="${esc(a.title)}" data-min="${esc(a.minutes)}" data-i="${i}" rows="3">${esc(a.steps.join('\n'))}</textarea>
      ${(a.tracks || []).map(t => `
        <h4 class="trk-h"><span class="trk">${esc(TRACK_NAMES[t.level] || t.level)}</span>${esc(t.title)}</h4>
        <textarea class="field" data-track="${esc(t.level)}" data-title="${esc(t.title)}" rows="3">${esc(t.steps.join('\n'))}</textarea>`).join('')}`).join('')}
    <span data-duration="${esc(b.durationMin)}" hidden></span>
    <h3>Assessment</h3>${ta('checks', ((b.assessment && b.assessment.checks) || []).join('\n'), 2)}
    ${(cur || aligned) ? `<label class="section-label">Aligned assessment</label>${ta('aligned', aligned || '', 2)}` : ''}
  </article>`;
}

// Reads the edit sheet back into a body the server re-validates. The
// standards fields only exist on plans written for a curriculum; when they
// are absent the body stays exactly as it was before.
export function readLessonEdit(root) {
  const val = name => (root.querySelector(`[data-f="${name}"]`) || {}).value;
  const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
  const activities = [];
  root.querySelectorAll('[data-phase]').forEach(el => {
    activities.push({
      phase: el.dataset.phase,
      title: el.dataset.title,
      minutes: Number(el.dataset.min),
      steps: lines(val(`steps:${el.dataset.i}`)),
    });
  });
  // Track boxes belong to the main activity; the server re-validates them.
  const trackEls = [...root.querySelectorAll('[data-track]')];
  if (trackEls.length) {
    const main = activities.find(a => a.phase === 'main');
    if (main) main.tracks = trackEls.map(el => ({
      level: el.dataset.track,
      title: el.dataset.title,
      steps: lines(el.value),
    }));
  }
  const hasStandards = root.querySelector('[data-f="standards"]');
  const hasAligned = root.querySelector('[data-f="aligned"]');
  const body = {
    objectives: lines(val('objectives')),
    materials: lines(val('materials')),
    activities,
    assessment: { checks: lines(val('checks')) },
    durationMin: Number(root.querySelector('[data-duration]').dataset.duration),
  };
  if (hasStandards) body.standards = lines(val('standards'));
  if (hasAligned) body.assessment.aligned = (val('aligned') || '').trim();
  return { title: val('title'), body };
}

export function quizEditHtml(doc) {
  const b = doc.body;
  return `<article class="sheet sheet-edit">
    ${ta('title', doc.title, 1)}
    <h3>Multiple choice</h3>
    ${(b.mc || []).map((q, i) => `
      <div class="qed" data-mc="${i}">
        <p class="qed-n">Q${i + 1}</p>
        ${ta(`mcq:${i}`, q.q, 2)}
        ${q.choices.map((c, ci) => `<input class="field" data-f="mcc:${i}:${ci}" value="${esc(c)}" placeholder="${'ABCD'[ci]}">`).join('')}
        <div class="qed-key"><span class="lab">Correct</span>
          <div class="seg" data-correct="${i}">${'ABCD'.split('').map((L, ci) =>
            `<button type="button" data-i="${ci}" class="${q.answer === ci ? 'is-on' : ''}">${L}</button>`).join('')}</div>
        </div>
      </div>`).join('')}
    <h3>Essay questions</h3>
    ${(b.essay || []).map((q, i) => `
      <div class="qed" data-essay="${i}">
        <p class="qed-n">Essay ${i + 1} <span class="pts">(${esc(q.points)} points)</span></p>
        ${ta(`essayq:${i}`, q.q, 2)}
        <div class="qed-key"><span class="lab">Points</span>
          <div class="stepper" data-pts="${i}"><button type="button" data-d="-1">${'-'}</button><output>${esc(q.points)}</output><button type="button" data-d="1">${'+'}</button></div>
        </div>
        ${q.rubric.map((r, ri) => `<label class="section-label">${esc(r.level)} (${esc(r.points)})</label>${ta(`rub:${i}:${ri}`, r.desc, 1)}`).join('')}
      </div>`).join('')}
  </article>`;
}

export function readQuizEdit(root) {
  const val = name => (root.querySelector(`[data-f="${name}"]`) || {}).value;
  const mc = [...root.querySelectorAll('[data-mc]')].map((el, i) => ({
    q: val(`mcq:${i}`) || '',
    choices: [0, 1, 2, 3].map(ci => (val(`mcc:${i}:${ci}`) || '').trim()),
    answer: Number(el.querySelector('.seg .is-on')?.dataset.i ?? 0),
  }));
  const essay = [...root.querySelectorAll('[data-essay]')].map((el, i) => {
    const points = Number(el.querySelector('[data-pts] output').textContent) || 4;
    return {
      q: val(`essayq:${i}`) || '',
      points,
      rubric: ['Excellent', 'Good', 'Developing', 'Beginning'].map((level, ri) => ({
        level,
        desc: (val(`rub:${i}:${ri}`) || '').trim() || ['Complete and accurate, with clear reasoning', 'Mostly accurate with some reasoning', 'Partly accurate or unclear', 'Attempted with little accuracy'][ri],
        points: Math.max(0, points - ri),
      })),
    };
  });
  return { title: val('title'), body: { mc, essay } };
}

export function exportPdf() {
  try {
    window.print();
  } catch {
    toast("Printing isn't available here.");
  }
}
