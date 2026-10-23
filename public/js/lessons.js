// The Lessons tab: the New lesson plan form, the saved list, and the lesson
// detail on the notebook sheet.

import {
  api, esc, fmtWhen, navigate, register, skeletons, stateEmpty, stateError,
  toast, confirmDialog, AI_MESSAGES, withAi,
} from './app.js';
import { ICONS, SUBJECTS, CURRICULA, gradeLabel, subjectTile, subjectLabel, curriculumLabel } from './icons.js';
import { lessonSheetHtml, lessonEditHtml, readLessonEdit, exportPdf } from './sheet.js';

// The form starts where the teacher last left it. A stale curriculum value
// falls back to General.
const prefs = {
  subject: localStorage.getItem('tm.subject') || '',
  grade: localStorage.getItem('tm.grade') || '5',
  curriculum: CURRICULA[localStorage.getItem('tm.curriculum')] ? localStorage.getItem('tm.curriculum') : 'general',
};
let duration = 45;
let topic = '';
// Step 3 stays open once a topic has been typed, even if the topic is edited.
let detailsShown = false;
// The optional classroom context, remembered while the app is open.
let studentCount = '';
let tools = null;
let differentiate = false;
let contextOpen = false;
const TOOL_CHOICES = [
  ['whiteboard', 'Whiteboard only'],
  ['handouts', 'Printed handouts'],
  ['projector', 'Projector'],
];
const contextHasValues = () => studentCount !== '' || !!tools || differentiate;

const chipsHtml = () => Object.entries(SUBJECTS).map(([k, s]) =>
  `<button type="button" class="chip ${s.cls} ${prefs.subject === k ? 'is-on' : ''}" data-subject="${k}"><i></i>${k === 'other' ? 'Other' : s.label}</button>`).join('');

function formHtml() {
  const gradeOptions = ['K', ...Array.from({ length: 12 }, (_, i) => String(i + 1))]
    .map(g => `<option value="${g}" ${prefs.grade === g ? 'selected' : ''}>${g === 'K' ? 'Kindergarten' : 'Grade ' + g}</option>`).join('');
  // The form is three steps, each shown once the one before it is filled:
  // the subject, then the topic, then grade, length and the rest.
  const showTopic = !!prefs.subject;
  if (topic.trim()) detailsShown = true;
  const showDetails = showTopic && detailsShown;
  return `<section class="card mx-4 mt-3" data-noprint>
    <h2 class="mb-3 font-display text-heading font-semibold">New lesson plan</h2>
    <label class="section-label block" for="l-subject-chips"><span class="step-n">1</span>Subject</label>
    <div class="chip-row mb-3" id="l-subject-chips">${chipsHtml()}</div>
    ${prefs.subject === 'other' ? `<input class="field mb-3" id="l-subject-name" placeholder="e.g. Spanish" maxlength="40">` : ''}
    <div id="l-step-topic" ${showTopic ? '' : 'hidden'}>
      <label class="section-label block" for="l-topic"><span class="step-n">2</span>Topic</label>
      <input class="field mb-3" id="l-topic" placeholder="e.g. Fractions on a number line" maxlength="120" value="${esc(topic)}">
    </div>
    <div id="l-step-details" ${showDetails ? '' : 'hidden'}>
    <span class="section-label block"><span class="step-n">3</span>Grade and class length</span>
    <div class="mb-3 grid grid-cols-2 gap-3">
      <div>
        <label class="section-label" for="l-grade">Grade</label>
        <select class="field" id="l-grade">${gradeOptions}</select>
      </div>
      <div>
        <label class="section-label" for="l-duration">Class length</label>
        <div class="stepper" id="l-duration">
          <button type="button" data-d="-1" aria-label="Shorter">${ICONS.minus}</button>
          <output>${duration} min</output>
          <button type="button" data-d="1" aria-label="Longer">${ICONS.plus}</button>
        </div>
      </div>
    </div>
    <div class="mb-3">
      <label class="section-label" for="l-curriculum">Curriculum</label>
      <select class="field" id="l-curriculum">${Object.entries(CURRICULA)
        .map(([k, label]) => `<option value="${k}" ${prefs.curriculum === k ? 'selected' : ''}>${label}</option>`).join('')}</select>
    </div>
    ${prefs.curriculum === 'other' ? `<label class="section-label" for="l-curriculum-name">Curriculum name</label>
    <input class="field mb-3" id="l-curriculum-name" placeholder="e.g. National Curriculum for England" maxlength="60">` : ''}
    <button type="button" id="l-ctx-toggle" class="flex min-h-11 w-full items-center justify-between px-1 text-left font-medium text-fg" aria-expanded="${contextOpen || contextHasValues()}" aria-controls="l-ctx">
      <span>Classroom context <span class="text-small font-normal text-muted">Optional</span></span>
      <span class="${contextOpen || contextHasValues() ? 'rotate-180' : ''}" id="l-ctx-chev">${ICONS.chevron}</span>
    </button>
    <div id="l-ctx" class="mt-1" ${contextOpen || contextHasValues() ? '' : 'hidden'}>
      <label class="section-label" for="l-students">Number of students</label>
      <input class="field mb-3" id="l-students" type="number" inputmode="numeric" min="1" max="99" step="1" placeholder="e.g. 28" value="${esc(studentCount)}">
      <span class="section-label" id="l-tools-label">Tools available</span>
      <div class="seg seg-tall mb-3" role="group" aria-labelledby="l-tools-label">
        ${TOOL_CHOICES.map(([k, label]) =>
          `<button type="button" class="${tools === k ? 'is-on' : ''}" data-tools="${k}">${label}</button>`).join('')}
      </div>
      <label class="mb-3 flex min-h-11 items-center gap-3 px-1">
        <input type="checkbox" id="l-diff" class="h-5 w-5 accent-accent" ${differentiate ? 'checked' : ''}>
        <span class="text-body text-fg">Differentiate
          <span class="block text-small text-muted">Support, Core and Challenge tracks in the main activity</span>
        </span>
      </label>
    </div>
    </div>
    <div class="form-foot">
      <div id="l-error" class="mb-2" hidden></div>
      <button id="l-write" class="btn-primary w-full">Write lesson plan</button>
      <p id="l-progress" class="mt-2 hidden text-center text-small text-muted">Writing your lesson plan…</p>
    </div>
  </section>`;
}

function rowHtml(d) {
  const sub = d.grade ? `${d.grade === 'K' ? 'Kindergarten' : 'Grade ' + d.grade} ${subjectLabel(d).toLowerCase()}` : subjectLabel(d);
  return `<li class="list-row" data-id="${d.id}">
    ${subjectTile(d)}
    <div class="min-w-0 flex-1">
      <div class="truncate font-semibold">${esc(d.title)}</div>
      <div class="text-small text-muted">${esc(sub)}, ${esc(d.duration_min)} min</div>
    </div>
    <span class="text-small text-muted">${fmtWhen(d.created_at)}</span>
  </li>`;
}

async function lessonsScreen(view) {
  view.innerHTML = `${formHtml()}<div class="mx-4 mt-7" id="l-lower">${skeletons(3)}</div>`;
  bindForm(view);

  let docs;
  try {
    docs = await api('/api/documents?kind=lesson');
  } catch (err) {
    view.querySelector('#l-lower').innerHTML =
      stateError("Couldn't load your lesson plans. Nothing you saved is lost.");
    view.querySelector('#retry').addEventListener('click', () => lessonsScreen(view));
    return;
  }
  renderList(view, docs);
}

function renderList(view, docs) {
  const lower = view.querySelector('#l-lower');
  if (!lower) return;
  const show = (rows, count, empty) => {
    lower.innerHTML = count
      ? `<div class="mb-2 flex items-baseline justify-between px-1">
          <h2 class="font-display text-heading font-semibold">Your lesson plans</h2>
          <span class="text-small text-muted">${count} plan${count === 1 ? '' : 's'}</span>
        </div>
        <input class="field mb-2" id="l-search" placeholder="Search your lesson plans" autocomplete="off" value="${esc(view.dataset.q || '')}">
        <ul class="list" id="l-list">${rows}</ul>`
      : stateEmpty('No lesson plans yet', 'Pick a subject and a topic above, then write your first one.');
    const search = lower.querySelector('#l-search');
    if (search) {
      search.addEventListener('input', () => {
        view.dataset.q = search.value;
        applyFilter(docs);
        // Keep focus and caret through the re-render.
        const again = lower.querySelector('#l-search');
        again.value = view.dataset.q;
        again.focus();
      });
    }
    attachSwipe(lower);
    lower.addEventListener('click', e => {
      const row = e.target.closest('.list-row');
      if (row) navigate(`#/lessons/${row.dataset.id}`);
    });
  };
  view.dataset.count = String(docs.length);
  applyFilter.docs = docs;
  applyFilter.show = show;
  applyFilter(docs);
}

function applyFilter(docs) {
  const scope = document.getElementById('view');
  const q = (scope.dataset.q || '').toLowerCase();
  const rows = docs.filter(d =>
    !q || [d.title, d.topic, subjectLabel(d)].join(' ').toLowerCase().includes(q)).map(rowHtml).join('');
  applyFilter.show(rows, docs.length);
}

function attachSwipe(lower) {
  if (!window.unNative || !unNative.attachSwipeActions) return;
  lower.querySelectorAll('#l-list .list-row').forEach(row => {
    const id = Number(row.dataset.id);
    unNative.attachSwipeActions(row, {
      actions: [{
        label: 'Delete', destructive: true,
        handler: async () => {
          try {
            await api(`/api/documents/${id}`, { method: 'DELETE' });
            toast('Deleted');
          } catch (err) { toast('Could not delete'); }
          lessonsScreen(document.getElementById('view'));
        },
      }],
    });
  });
}

function bindForm(view) {
  const chips = view.querySelector('#l-subject-chips');
  if (!chips) return;
  // Keep the chosen subject in sight in the sideways row.
  const on = chips.querySelector('.is-on');
  if (on) {
    const row = chips.getBoundingClientRect();
    const r = on.getBoundingClientRect();
    if (r.right > row.right) chips.scrollLeft += r.left - row.left - 16;
  }
  chips.addEventListener('click', e => {
    const chip = e.target.closest('[data-subject]');
    if (!chip) return;
    const scrollLeft = chips.scrollLeft;
    prefs.subject = chip.dataset.subject;
    localStorage.setItem('tm.subject', prefs.subject);
    lessonsScreen(view);
    // The re-render draws the form at once; keep the row where it was.
    const again = view.querySelector('#l-subject-chips');
    if (again) again.scrollLeft = scrollLeft;
  });
  const grade = view.querySelector('#l-grade');
  grade.value = prefs.grade;
  grade.addEventListener('change', () => {
    prefs.grade = grade.value;
    localStorage.setItem('tm.grade', prefs.grade);
  });
  const curriculum = view.querySelector('#l-curriculum');
  curriculum.addEventListener('change', () => {
    prefs.curriculum = curriculum.value;
    localStorage.setItem('tm.curriculum', prefs.curriculum);
    lessonsScreen(view);
  });
  const stepper = view.querySelector('#l-duration');
  stepper.addEventListener('click', e => {
    const b = e.target.closest('[data-d]');
    if (!b) return;
    duration = Math.min(120, Math.max(15, duration + Number(b.dataset.d) * 5));
    stepper.querySelector('output').textContent = `${duration} min`;
  });
  view.querySelector('#l-topic').addEventListener('input', e => {
    topic = e.target.value;
    if (!detailsShown && topic.trim()) {
      detailsShown = true;
      view.querySelector('#l-step-details').hidden = false;
    }
  });
  const ctxToggle = view.querySelector('#l-ctx-toggle');
  ctxToggle.addEventListener('click', () => {
    contextOpen = !contextOpen;
    ctxToggle.setAttribute('aria-expanded', String(contextOpen));
    view.querySelector('#l-ctx-chev').classList.toggle('rotate-180', contextOpen);
    view.querySelector('#l-ctx').hidden = !contextOpen;
  });
  view.querySelector('#l-students').addEventListener('input', e => { studentCount = e.target.value; });
  const seg = view.querySelector('.seg-tall');
  seg.addEventListener('click', e => {
    const b = e.target.closest('[data-tools]');
    if (!b) return;
    tools = tools === b.dataset.tools ? null : b.dataset.tools;
    seg.querySelectorAll('[data-tools]').forEach(x => x.classList.toggle('is-on', x.dataset.tools === tools));
  });
  view.querySelector('#l-diff').addEventListener('change', e => { differentiate = e.target.checked; });
  view.querySelector('#l-write').addEventListener('click', writePlan);
}

async function writePlan() {
  const view = document.getElementById('view');
  const btn = view.querySelector('#l-write');
  const progress = view.querySelector('#l-progress');
  const errorBox = view.querySelector('#l-error');
  const subjectName = (view.querySelector('#l-subject-name') || {}).value;
  const curriculumName = (view.querySelector('#l-curriculum-name') || {}).value;
  topic = view.querySelector('#l-topic').value.trim();
  if (!prefs.subject) { errorBox.hidden = false; errorBox.innerHTML = '<p class="text-small text-muted">Pick a subject first.</p>'; return; }
  if (!topic) { errorBox.hidden = false; errorBox.innerHTML = '<p class="text-small text-muted">Type a topic first.</p>'; return; }
  const studentsInput = view.querySelector('#l-students');
  studentCount = studentsInput ? String(studentsInput.value).trim() : '';
  let students;
  if (studentCount !== '') {
    students = Number(studentCount);
    if (!Number.isInteger(students) || students < 1 || students > 99) {
      errorBox.hidden = false;
      errorBox.innerHTML = '<p class="text-small text-muted">Number of students is a whole number from 1 to 99.</p>';
      return;
    }
  }
  if (prefs.curriculum === 'other' && !(curriculumName || '').trim()) {
    errorBox.hidden = false;
    errorBox.innerHTML = '<p class="text-small text-muted">Type a curriculum name first.</p>';
    return;
  }
  errorBox.hidden = true;
  btn.disabled = true;
  progress.classList.remove('hidden');
  const body = {
    kind: 'lesson', subject: prefs.subject, subjectName: prefs.subject === 'other' ? subjectName : undefined,
    grade: prefs.grade, topic, durationMin: duration,
    curriculum: prefs.curriculum === 'general' ? undefined : prefs.curriculum,
    curriculumName: prefs.curriculum === 'other' ? curriculumName.trim() : undefined,
  };
  if (students !== undefined) body.studentCount = students;
  if (tools) body.tools = tools;
  if (differentiate) body.differentiate = true;
  try {
    const doc = await withAi(() => api('/api/documents/generate', { method: 'POST', body }));
    toast('Lesson plan saved');
    navigate(`#/lessons/${doc.id}`);
  } catch (err) {
    progress.classList.add('hidden');
    btn.disabled = false;
    const message = AI_MESSAGES[err.code] || "TeachMate couldn't finish writing that. Try again.";
    const offerBlank = ['ai_unavailable', 'grant_required'].includes(err.code);
    errorBox.hidden = false;
    errorBox.innerHTML = `
      <div class="rounded-lg border border-line bg-surface p-3 text-small text-muted">
        <p class="text-fg">${esc(message)}</p>
        ${offerBlank ? '<button id="l-blank" class="btn-secondary mt-2">Start from a blank outline</button>' : ''}
      </div>`;
    const blank = errorBox.querySelector('#l-blank');
    if (blank) blank.addEventListener('click', async () => {
      try {
        const doc = await api('/api/documents', { method: 'POST', body });
        pendingEditId = doc.id;
        navigate(`#/lessons/${doc.id}`);
      } catch { toast('Could not create the outline'); }
    });
  }
}

// ── Detail ─────────────────────────────────────────────────────────────────
let editing = false;
// Set by writePlan's blank-outline fallback: open the saved plan in edit mode.
let pendingEditId = null;

async function lessonDetail(view, id) {
  let doc;
  try {
    doc = await api(`/api/documents/${id}`);
  } catch {
    view.innerHTML = stateError("Couldn't load that lesson plan. Nothing you saved is lost.");
    view.querySelector('#retry').addEventListener('click', () => lessonDetail(view, id));
    return;
  }
  editing = editing || pendingEditId === Number(id) || pendingEditId === id;
  pendingEditId = null;
  const s = SUBJECTS[doc.subject] || SUBJECTS.other;
  // Differentiate was on but the tracks didn't come out: say so, and how to retry.
  const main = (doc.body.activities || [])[1];
  const tracksNote = doc.body.context && doc.body.context.differentiate && !(main && main.tracks)
    ? `<p class="mx-4 mt-3 text-small text-muted" data-noprint>Differentiate was on, but the tracks didn't come out right, so this plan has one main activity. Use Write again to try for tracks.</p>`
    : '';
  const tools = editing
    ? `<button class="btn-secondary" id="d-cancel">Cancel</button><button class="btn-primary" id="d-save">Save changes</button>`
    : `<button class="btn-secondary" id="d-pdf">${ICONS.print}Export PDF</button>
       <button class="btn-secondary" id="d-quiz">${ICONS.list}Make a quiz</button>`;
  view.innerHTML = `
    <div class="flex items-center justify-between px-2 pt-2" data-noprint>
      <button class="flex min-h-11 items-center gap-1 px-2 font-medium" data-nav="#/lessons">${ICONS.back}Lessons</button>
      <div class="flex items-center gap-1">
        ${editing ? '' : `<button id="d-more" class="flex h-11 w-11 items-center justify-center rounded-lg text-fg" aria-label="More">${ICONS.more}</button>`}
      </div>
    </div>
    <div class="flex gap-2 px-3 pb-3 pt-1" data-noprint>${tools}</div>
    <div><span class="sheet-flag ${s.cls}">${s.icon}${esc(subjectLabel(doc))}</span></div>
    <div id="d-sheet">${editing ? lessonEditHtml(doc) : lessonSheetHtml(doc)}</div>
    ${tracksNote}
    <p class="mx-4 mt-3 text-small text-muted" data-noprint>${esc((doc.source === 'ai'
      ? `Written with AI on ${fmtWhen(doc.created_at)}. Read it through before you teach it.`
      : 'Written by hand. Read it through before you teach it.')
      + (doc.body.standards && doc.body.standards.some(s => s && String(s).trim())
        ? ' Check the standard codes against your official curriculum.' : ''))}</p>`;

  view.querySelector('[data-nav]').addEventListener('click', () => { history.back(); });
  if (editing) {
    view.querySelector('#d-save').addEventListener('click', async () => {
      try {
        const payload = readLessonEdit(view.querySelector('#d-sheet'));
        await api(`/api/documents/${doc.id}`, { method: 'PATCH', body: payload });
        toast('Lesson plan saved');
        editing = false;
        lessonDetail(view, id);
      } catch (err) {
        toast(err.code === 'bad body' ? 'Check the sheet: every section needs content' : 'Could not save');
      }
    });
    view.querySelector('#d-cancel').addEventListener('click', () => { editing = false; lessonDetail(view, id); });
  } else {
    view.querySelector('#d-pdf').addEventListener('click', exportPdf);
    view.querySelector('#d-quiz').addEventListener('click', () => navigate(`#/quizzes?from=${doc.id}`));
    view.querySelector('#d-more').addEventListener('click', e => openMenu(e.currentTarget, doc, view, id));
  }
}

function openMenu(anchor, doc, view, id) {
  if (!window.unNative || !unNative.menu) return openMenuFallback(doc, view, id);
  unNative.menu({
    anchorEl: anchor,
    items: [
      { label: 'Edit', handler: () => { editing = true; lessonDetail(view, id); } },
      { label: 'Write again', handler: () => writeAgain(doc, view) },
      { label: 'Delete', destructive: true, handler: () => deleteDoc(doc, view) },
    ],
  });
}

function openMenuFallback(doc, view, id) {
  const pick = window.prompt('Type edit, again or delete');
  if (pick === 'edit') { editing = true; lessonDetail(view, id); }
  if (pick === 'again') writeAgain(doc, view);
  if (pick === 'delete') deleteDoc(doc, view);
}

async function writeAgain(doc, view) {
  const ok = await confirmDialog({
    title: 'Write again?',
    message: 'This replaces the whole sheet with a fresh version.',
    confirmLabel: 'Write again',
  });
  if (!ok) return;
  try {
    const ctx = doc.body.context || {};
    const context = {};
    if (ctx.studentCount != null) context.studentCount = ctx.studentCount;
    if (ctx.tools) context.tools = ctx.tools;
    if (ctx.differentiate) context.differentiate = true;
    await withAi(() => api('/api/documents/generate', {
      method: 'POST',
      body: {
        kind: 'lesson', subject: doc.subject, subjectName: doc.subject_name,
        grade: doc.grade, topic: doc.topic, durationMin: doc.body.durationMin,
        curriculum: doc.curriculum || undefined,
        curriculumName: doc.curriculum === 'other' ? doc.curriculum_name : undefined,
        replaceId: doc.id,
        ...context,
      },
    }));
    toast('Lesson plan saved');
    lessonDetail(view, id2(doc));
  } catch (err) {
    toast(AI_MESSAGES[err.code] || "TeachMate couldn't finish writing that. Try again.");
  }
}

const id2 = d => d.id;

async function deleteDoc(doc, view) {
  const ok = await confirmDialog({
    title: 'Delete this lesson plan?',
    destructive: true, confirmLabel: 'Delete',
  });
  if (!ok) return;
  try {
    await api(`/api/documents/${doc.id}`, { method: 'DELETE' });
    toast('Deleted');
    navigate('#/lessons');
  } catch { toast('Could not delete'); }
}

register([
  { pattern: /^\/lessons\/(\d+)$/, render: lessonDetail, detail: true, transition: 'push' },
  { pattern: /^\/lessons$/, render: lessonsScreen },
]);
