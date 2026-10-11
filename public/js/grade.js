// The Grade tab: a three-step form — quiz and student, answer sheet photo,
// check and save — with Recently graded underneath.

import {
  api, esc, fmtWhen, navigate, register, skeletons, stateEmpty, stateError,
  toast, confirmDialog, TOKEN,
} from './app.js';
import { ICONS, gradeLabel, subjectTile, subjectLabel } from './icons.js';

const LETTERS = ['A', 'B', 'C', 'D'];
const LEVELS = ['Excellent', 'Good', 'Developing', 'Beginning', 'No answer'];
const RUBRIC_PTS = [4, 3, 2, 1, 0];

const state = {
  quizId: '', quiz: null, className: '', student: '',
  photoDataUrl: null, photoUrl: null, photoFileId: null,
  mc: [], essay: [], feedback: '', method: 'hand', aiStatus: null,
};

export async function gradeScreen(view) {
  view.innerHTML = `<div class="mx-4 mt-3" id="g-top">${skeletons(2)}</div><div class="mx-4 mt-7" id="g-lower">${skeletons(2)}</div>`;
  try {
    const [quizzes, classes, ai] = await Promise.all([
      api('/api/documents?kind=quiz'),
      api('/api/classes').catch(() => []),
      api('/api/ai/status').catch(() => ({ available: false })),
    ]);
    state.aiStatus = ai.available;
    state.quizId = state.quizId || (quizzes[0] && String(quizzes[0].id)) || '';
    if (state.quizId) {
      await loadQuiz(state.quizId);
    }
    renderForm(view, quizzes, classes);
  } catch {
    view.querySelector('#g-top').innerHTML = stateError("Couldn't load the grade form. Nothing you saved is lost.");
    view.querySelector('#retry').addEventListener('click', () => gradeScreen(view));
    return;
  }
  try {
    const recent = await api('/api/gradings?limit=10');
    const lower = view.querySelector('#g-lower');
    lower.innerHTML = recent.length
      ? `<div class="mb-2 px-1 flex items-baseline justify-between">
          <h2 class="font-display text-heading font-semibold">Recently graded</h2>
        </div>
        <ul class="list">${recent.map(g => `
          <li class="list-row" data-id="${g.id}" data-nav="#/grade/${g.id}">
            <div class="min-w-0 flex-1">
              <div class="truncate font-semibold">${esc(g.student_name)}</div>
              <div class="text-small text-muted">${esc(g.quiz_title)}, ${esc(g.class_name)}</div>
            </div>
            <span class="text-right leading-tight">
              <span class="block font-semibold text-mark">${esc(fmtScore(g))}</span>
              <span class="block text-small text-muted">${pct(g)}%</span>
            </span>
          </li>`).join('')}</ul>`
      : stateEmpty('Nothing graded yet', 'Grade your first answer sheet above.');
    lower.querySelectorAll('[data-id]').forEach(row =>
      row.addEventListener('click', () => navigate(`#/grade/${row.dataset.id}`)));
  } catch {
    view.querySelector('#g-lower').innerHTML =
      stateError("Couldn't load your graded sheets. Nothing you saved is lost.");
  }
}

const fmtScore = g => `${Number(g.score)} / ${Number(g.max_score)}`;
const pct = g => g.max_score ? Math.round(Number(g.score) / Number(g.max_score) * 100) : 0;

async function loadQuiz(quizId) {
  state.quiz = await api(`/api/documents/${quizId}`);
  state.mc = new Array((state.quiz.body.mc || []).length).fill(null);
  state.essay = new Array((state.quiz.body.essay || []).length).fill(4);
}

function renderForm(view, quizzes, classes) {
  const aiLine = state.aiStatus
    ? ''
    : `<p class="mt-1 text-small text-muted">AI isn't available here right now. You can still enter answers by hand.</p>`;
  view.querySelector('#g-top').innerHTML = `
    <form id="grade-form" class="card" data-noprint onsubmit="return false">
      <h2 class="mb-3 font-display text-heading font-semibold">Grade an answer sheet</h2>
      <p class="section-label">1. Quiz and student</p>
      <div class="mb-3 grid grid-cols-2 gap-3">
        <div>
          <label class="section-label" for="g-quiz">Quiz</label>
          <select class="field" id="g-quiz">${quizzes.map(q =>
            `<option value="${q.id}" ${String(q.id) === state.quizId ? 'selected' : ''}>${esc(q.title)}</option>`).join('')}</select>
        </div>
        <div>
          <label class="section-label" for="g-class">Class</label>
          <input class="field" id="g-class" list="g-classes" placeholder="e.g. Period 3" value="${esc(state.className)}">
          <datalist id="g-classes">${classes.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
        </div>
      </div>
      <label class="section-label" for="g-student">Student</label>
      <input class="field mb-3" id="g-student" placeholder="e.g. Avery A." maxlength="80" value="${esc(state.student)}">
      <p class="section-label">2. Answer sheet photo</p>
      <div class="mb-3 flex items-center gap-3">
        <button type="button" id="g-photo" class="btn-secondary flex-1">${ICONS.camera}${state.photoDataUrl ? 'Retake' : 'Take or choose photo'}</button>
        <input type="file" id="g-file" accept="image/*" capture="environment" class="hidden">
        ${state.photoDataUrl ? `<img src="${state.photoDataUrl}" alt="Answer sheet" class="h-16 w-16 rounded-lg border border-line object-cover">` : ''}
      </div>
      <p class="section-label">3. Check and save</p>
      <button type="button" id="g-read" class="btn-primary w-full" ${state.aiStatus && state.photoDataUrl ? '' : 'disabled'}>Read with AI</button>
      ${aiLine}
      <button type="button" id="g-hand" class="btn-secondary mt-2 w-full">Enter answers by hand</button>
      <p id="g-progress" class="mt-2 hidden text-center text-small text-muted">Reading the answer sheet…</p>
      <div id="g-error" class="mt-2" hidden></div>
      <div id="g-check" class="mt-3"></div>
    </form>`;
  bindForm(view);
}

function bindForm(view) {
  view.querySelector('#g-quiz').addEventListener('change', async e => {
    state.quizId = e.target.value;
    try {
      await loadQuiz(state.quizId);
    } catch { state.quiz = null; }
  });
  view.querySelector('#g-class').addEventListener('input', e => { state.className = e.target.value; });
  view.querySelector('#g-student').addEventListener('input', e => { state.student = e.target.value; });
  const file = view.querySelector('#g-file');
  view.querySelector('#g-photo').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    const scaled = await downscale(f);
    if (!scaled) {
      const errorBox = view.querySelector('#g-error');
      errorBox.hidden = false;
      errorBox.innerHTML = '<p class="text-small text-muted">That photo can\'t be used. Try a JPEG or PNG.</p>';
      return;
    }
    state.photoDataUrl = scaled.dataUrl;
    state.photoUrl = null;
    state.photoFileId = null;
    // Upload runs alongside the reading; a failed upload keeps the photo
    // locally and the score is saved without it.
    upload(scaled.blob);
    renderForm(view);
  });
  view.querySelector('#g-read').addEventListener('click', readWithAi);
  view.querySelector('#g-hand').addEventListener('click', () => {
    state.method = 'hand';
    state.mc = state.mc.map(() => null);
    state.essay = state.essay.map(() => 4);
    state.feedback = '';
    renderCheck(view);
  });
}

async function downscale(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const long = Math.max(img.width, img.height);
    const scale = Math.min(1, 1600 / long);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (!blob || blob.size > 5 * 1024 * 1024) return null;
    const dataUrl = await new Promise(r => {
      const fr = new FileReader();
      fr.onload = () => r(fr.result);
      fr.readAsDataURL(blob);
    });
    return { blob, dataUrl };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function upload(blob) {
  try {
    const stored = await usernode.uploadFile(blob, { visibility: 'private' });
    state.photoUrl = stored.url;
    state.photoFileId = stored.id;
  } catch {
    // Kept locally; the score is saved without the photo.
  }
}

async function readWithAi() {
  const view = document.getElementById('view');
  const progress = view.querySelector('#g-progress');
  const errorBox = view.querySelector('#g-error');
  if (!state.quiz) { errorBox.hidden = false; errorBox.innerHTML = '<p class="text-small text-muted">Pick a quiz first.</p>'; return; }
  if (!state.photoDataUrl) { errorBox.hidden = false; errorBox.innerHTML = '<p class="text-small text-muted">Take or choose a photo first.</p>'; return; }
  progress.classList.remove('hidden');
  progress.textContent = 'Reading the answer sheet…';
  errorBox.hidden = true;
  try {
    const reading = await api('/api/gradings/read', {
      method: 'POST',
      body: { quizId: Number(state.quizId), image: state.photoDataUrl },
    });
    state.method = 'ai';
    state.mc = reading.mc.map(r => r.letter);
    state.essay = reading.essay.map(r => r.level);
    state.reasons = reading.essay.map(r => r.reason);
    state.unclear = reading.mc.map(r => !r.clear);
    state.feedback = reading.feedback || '';
    if (!state.student && reading.studentName) {
      state.student = reading.studentName;
      view.querySelector('#g-student').value = reading.studentName;
    }
    renderCheck(view);
  } catch (err) {
    progress.classList.add('hidden');
    errorBox.hidden = false;
    const msg = err.code === 'app_cap_exceeded' || err.code === 'budget_exceeded'
      ? "Today's AI limit for TeachMate is used up. It resets at midnight UTC."
      : err.code === 'declined'
        ? "TeachMate can't read that. Try a clearer photo."
        : "TeachMate couldn't read that photo. Try again, or enter the answers by hand.";
    errorBox.innerHTML = `<div class="rounded-lg border border-line bg-surface p-3 text-small text-muted"><p class="text-fg">${esc(msg)}</p></div>`;
  }
}

// The live total, from the same rule the server scores with: 1 point per
// multiple-choice match, rubric points per essay level.
function runningTotal() {
  let score = 0;
  let max = 0;
  (state.quiz.body.mc || []).forEach((q, i) => {
    max += 1;
    if (state.mc[i] != null && state.mc[i] === LETTERS[q.answer]) score += 1;
  });
  (state.quiz.body.essay || []).forEach((q, i) => {
    max += q.points;
    const lvl = state.essay[i];
    if (Number.isInteger(lvl) && lvl <= 3) score += q.rubric[lvl].points;
  });
  return { score, max };
}

function renderCheck(view) {
  const box = view.querySelector('#g-check');
  const { score, max } = runningTotal();
  // Once marks are showing, Save score is the primary action.
  const read = view.querySelector('#g-read');
  if (read) read.hidden = true;
  const mcCount = (state.quiz.body.mc || []).length;
  box.innerHTML = `
    ${(state.quiz.body.mc || []).map((q, i) => `
      <div class="mb-3">
        <div class="mb-1 flex items-center gap-2">
          <span class="text-small font-semibold">Q${i + 1}</span>
          <span class="flex-1 truncate text-small text-muted">${esc(q.q)}</span>
          ${mark(state.mc[i], q)}
          ${state.unclear && state.unclear[i] ? '<span class="text-small font-semibold text-mark">Check this</span>' : ''}
        </div>
        <div class="seg" data-kind="mc" data-i="${i}">${[...LETTERS, 'Blank'].map((L, li) => {
          const v = li < 4 ? L : null;
          const on = state.mc[i] == null ? v == null : state.mc[i] === v;
          return `<button type="button" data-v="${v || ''}" class="${on ? 'is-on' : ''}">${L}</button>`;
        }).join('')}</div>
      </div>`).join('')}
    ${(state.quiz.body.essay || []).map((q, i) => `
      <div class="mb-3">
        <div class="mb-1 flex items-center gap-2">
          <span class="text-small font-semibold">Essay ${i + 1}</span>
          <span class="flex-1 truncate text-small text-muted">${esc(q.q)}</span>
        </div>
        <div class="seg mb-1" data-kind="essay" data-i="${i}">${LEVELS.map((L, li) =>
          `<button type="button" data-v="${li}" class="${state.essay[i] === li ? 'is-on' : ''}">${L}</button>`).join('')}</div>
        ${state.reasons && state.reasons[i] ? `<p class="text-small text-muted">${esc(state.reasons[i])}</p>` : ''}
      </div>`).join('')}
    <label class="section-label" for="g-feedback">Feedback for the student</label>
    <textarea class="field mb-3" id="g-feedback" rows="3" maxlength="400">${esc(state.feedback)}</textarea>
    <div class="mb-2 flex items-center justify-between">
      <span class="text-body text-muted">Total</span>
      <span class="text-body font-semibold">${score} of ${max}</span>
    </div>
    <button id="g-save" class="btn-primary w-full">Save score</button>`;
  box.querySelectorAll('.seg').forEach(seg => seg.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const kind = seg.dataset.kind;
    const i = Number(seg.dataset.i);
    if (kind === 'mc') {
      state.mc[i] = b.dataset.v === '' ? null : b.dataset.v;
    } else {
      state.essay[i] = Number(b.dataset.v);
    }
    renderCheck(view);
  }));
  box.querySelector('#g-feedback').addEventListener('input', e => { state.feedback = e.target.value; });
  box.querySelector('#g-save').addEventListener('click', saveScore);
  view.querySelector('#g-read').textContent = 'Read with AI';
}

function mark(given, q) {
  const right = given != null && given === LETTERS[q.answer];
  const cls = 'h-5 w-5 text-mark';
  return right
    ? `<svg viewBox="0 0 24 24" class="${cls}" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-label="Correct"><path d="M4 13l5 5L20 7"/></svg>`
    : `<svg viewBox="0 0 24 24" class="${cls}" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" aria-label="Wrong"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
}

async function saveScore({ replace = false } = {}) {
  const view = document.getElementById('view');
  const payload = {
    quizId: Number(state.quizId),
    className: state.className.trim(),
    studentName: state.student.trim(),
    method: state.method,
    mcAnswers: state.mc,
    essayLevels: state.essay,
    feedback: state.feedback,
    photoUrl: state.photoUrl || undefined,
    photoFileId: state.photoFileId || undefined,
    replace,
  };
  if (!payload.className || !payload.studentName) {
    const errorBox = view.querySelector('#g-error');
    errorBox.hidden = false;
    errorBox.innerHTML = '<p class="text-small text-muted">Type the class and the student\'s name first.</p>';
    return;
  }
  try {
    const row = await api('/api/gradings', { method: 'POST', body: payload });
    toast('Score saved');
    resetGradeState();
    navigate(`#/grade/${row.id}`);
  } catch (err) {
    if (err.code === 'duplicate_student') {
      const ok = await confirmDialog({
        title: `Replace ${state.student.trim()}'s earlier score?`,
        confirmLabel: 'Replace',
      });
      if (ok) return saveScore({ replace: true });
      return;
    }
    toast('Could not save the score');
  }
}

function resetGradeState() {
  state.className = state.className; // keep the class typed for the next sheet
  state.student = '';
  state.photoDataUrl = null;
  state.photoUrl = null;
  state.photoFileId = null;
  state.mc = [];
  state.essay = [];
  state.feedback = '';
  state.reasons = null;
  state.unclear = null;
  state.method = 'hand';
}

// ── One saved sheet ────────────────────────────────────────────────────────
async function gradingDetail(view, id) {
  let g;
  try {
    g = await api(`/api/gradings/${id}`);
  } catch {
    view.innerHTML = stateError("Couldn't load that score. Nothing you saved is lost.");
    view.querySelector('#retry').addEventListener('click', () => gradingDetail(view, id));
    return;
  }
  const quiz = { body: g.quiz_body };
  const mcCount = (g.quiz_body.mc || []).length;
  const marks = (g.results || []).map(r => {
    const kind = r.kind === 'mc';
    const question = kind ? g.quiz_body.mc[r.q - 1] : g.quiz_body.essay[r.q - mcCount - 1];
    const given = kind ? ((g.mc_answers || [])[r.q - 1] || null) : LEVELS[(g.essay_levels || [])[r.q - mcCount - 1] ?? 4];
    return { ...r, question, given };
  });
  view.innerHTML = `
    <div class="flex items-center justify-between px-2 pt-2" data-noprint>
      <button class="flex min-h-11 items-center gap-1 px-2 font-medium" data-nav="#/grade">${ICONS.back}Grade</button>
    </div>
    <div class="flex gap-2 px-3 pb-3 pt-1" data-noprint>
      <button class="btn-secondary" id="gd-edit">${ICONS.pencil}Edit</button>
      <button class="btn-secondary" id="gd-delete">Delete</button>
    </div>
    ${g.photo_url ? `<div class="px-4 pb-3"><img src="${esc(g.photo_url)}${TOKEN ? '?token=' + encodeURIComponent(TOKEN) : ''}" alt="Answer sheet photo" class="max-h-96 w-full rounded-xl border border-line object-contain"></div>` : ''}
    <article class="sheet mx-4">
      <h2 class="sheet-title">${esc(g.student_name)}</h2>
      <p class="meta">${esc(g.quiz_title)}, ${esc(g.class_name)}</p>
      <h3>Score</h3>
      <p><span class="font-semibold text-mark">${Number(g.score)} of ${Number(g.max_score)}</span> (${pct(g)}%) — graded ${esc(g.method === 'ai' ? 'with AI' : 'by hand')}</p>
      <h3>Marks</h3>
      ${marks.map(m => `
        <div class="mb-2">
          <p class="q"><b>${m.kind === 'mc' ? 'Q' + m.q : 'Essay ' + (m.q - mcCount)}</b> ${m.kind === 'mc'
            ? `${esc(m.given || 'Blank')} — correct answer ${LETTERS[m.question.answer]}`
            : `${esc(m.given)} — ${m.points} of ${m.max}`}</p>
          ${m.kind === 'mc' ? `<p class="${m.correct ? 'text-fg' : 'text-mark'}">${m.correct ? 'Right' : 'Wrong'}</p>` : ''}
        </div>`).join('')}
      <h3>Feedback</h3>
      <p>${esc(g.feedback || '')}</p>
    </article>`;
  view.querySelector('[data-nav]').addEventListener('click', () => navigate('#/grade', { replace: false }));
  view.querySelector('#gd-edit').addEventListener('click', () => editGrading(view, g));
  view.querySelector('#gd-delete').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Delete this score?', destructive: true, confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await api(`/api/gradings/${g.id}`, { method: 'DELETE' });
      toast('Deleted');
      navigate('#/grade');
    } catch { toast('Could not delete'); }
  });
}

// Edit a saved score: the same check controls, saved with a PATCH.
async function editGrading(view, g) {
  state.quizId = String(g.quiz_id);
  state.quiz = { body: g.quiz_body };
  state.className = g.class_name;
  state.student = g.student_name;
  state.mc = (g.mc_answers || []).slice();
  state.essay = (g.essay_levels || []).slice();
  state.feedback = g.feedback || '';
  state.method = g.method;
  state.photoDataUrl = null;
  state.reasons = null;
  state.unclear = null;
  const mcCount = (g.quiz_body.mc || []).length;
  while (state.mc.length < mcCount) state.mc.push(null);
  while (state.essay.length < (g.quiz_body.essay || []).length) state.essay.push(4);
  view.innerHTML = `
    <div class="flex items-center justify-between px-2 pt-2" data-noprint>
      <button class="flex min-h-11 items-center gap-1 px-2 font-medium" data-nav="#/grade/${g.id}">${ICONS.back}Back</button>
    </div>
    <div class="flex gap-2 px-3 pb-3 pt-1" data-noprint>
      <button class="btn-primary" id="ge-save">Save changes</button>
    </div>
    <article class="sheet mx-4">
      <h2 class="sheet-title">${esc(g.student_name)}</h2>
      <p class="meta">${esc(g.quiz_title)}, ${esc(g.class_name)}</p>
      <div id="ge-check"></div>
    </article>`;
  view.querySelector('[data-nav]').addEventListener('click', () => gradingDetail(view, g.id));
  // The editor's controls, transplanted into the sheet.
  const box = view.querySelector('#ge-check');
  const renderEditor = () => {
    const tmp = document.createElement('div');
    tmp.innerHTML = `<div id="g-check"></div>`;
    box.innerHTML = checkHtmlOnly();
    wireCheck(view, box, renderEditor);
  };
  renderEditor();
  view.querySelector('#ge-save').addEventListener('click', async () => {
    try {
      await api(`/api/gradings/${g.id}`, {
        method: 'PATCH',
        body: { mcAnswers: state.mc, essayLevels: state.essay, feedback: state.feedback },
      });
      toast('Score saved');
      gradingDetail(view, g.id);
    } catch { toast('Could not save'); }
  });
}

// Extracted so both the fresh flow and the edit flow can use the controls.
function checkHtmlOnly() {
  const mcCount = (state.quiz.body.mc || []).length;
  const { score, max } = runningTotal();
  return `
    ${(state.quiz.body.mc || []).map((q, i) => `
      <div class="mb-3">
        <div class="mb-1 flex items-center gap-2">
          <span class="text-small font-semibold">Q${i + 1}</span>
          <span class="flex-1 truncate text-small text-muted">${esc(q.q)}</span>
        </div>
        <div class="seg" data-kind="mc" data-i="${i}">${[...LETTERS, 'Blank'].map((L, li) =>
          `<button type="button" data-v="${li < 4 ? L : ''}" class="${li < 4 ? (state.mc[i] === L ? 'is-on' : '') : (state.mc[i] == null ? 'is-on' : '')}">${L}</button>`).join('')}</div>
      </div>`).join('')}
    ${(state.quiz.body.essay || []).map((q, i) => `
      <div class="mb-3">
        <div class="mb-1 flex items-center gap-2">
          <span class="text-small font-semibold">Essay ${i + 1}</span>
          <span class="flex-1 truncate text-small text-muted">${esc(q.q)}</span>
        </div>
        <div class="seg" data-kind="essay" data-i="${i}">${LEVELS.map((L, li) =>
          `<button type="button" data-v="${li}" class="${state.essay[i] === li ? 'is-on' : ''}">${L}</button>`).join('')}</div>
      </div>`).join('')}
    <label class="section-label" for="g-feedback">Feedback for the student</label>
    <textarea class="field mb-3" id="g-feedback" rows="3" maxlength="400">${esc(state.feedback)}</textarea>
    <div class="mb-2 flex items-center justify-between">
      <span class="text-body text-muted">Total</span>
      <span class="text-body font-semibold">${score} of ${max}</span>
    </div>`;
}

function wireCheck(view, box, rerender) {
  box.querySelectorAll('.seg').forEach(seg => seg.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const i = Number(seg.dataset.i);
    if (seg.dataset.kind === 'mc') state.mc[i] = b.dataset.v === '' ? null : b.dataset.v;
    else state.essay[i] = Number(b.dataset.v);
    rerender();
  }));
  const fb = box.querySelector('#g-feedback');
  if (fb) fb.addEventListener('input', e => { state.feedback = e.target.value; });
}

register([
  { pattern: /^\/grade\/(\d+)$/, render: gradingDetail, detail: true, transition: 'push' },
  { pattern: /^\/grade$/, render: gradeScreen },
]);
