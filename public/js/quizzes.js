// The Quizzes tab: the Write quiz form (with question counts and the
// from-a-lesson-plan picker), the saved list, and the quiz detail with its
// Student copy / Answer key switch.

import {
  api, esc, fmtWhen, navigate, register, skeletons, stateEmpty, stateError,
  toast, confirmDialog, AI_MESSAGES, withAi,
} from './app.js';
import { ICONS, SUBJECTS, gradeLabel, subjectTile, subjectLabel } from './icons.js';
import { quizSheetHtml, quizEditHtml, readQuizEdit, exportPdf } from './sheet.js';

const prefs = {
  subject: localStorage.getItem('tmq.subject') || '',
  grade: localStorage.getItem('tmq.grade') || '5',
};
let mcCount = 5;
let essayCount = 2;
let topic = '';

function chipsHtml() {
  return Object.entries(SUBJECTS).map(([k, s]) =>
    `<button type="button" class="chip ${s.cls} ${prefs.subject === k ? 'is-on' : ''}" data-subject="${k}"><i></i>${k === 'other' ? 'Other' : s.label}</button>`).join('');
}

function formHtml() {
  const gradeOptions = ['K', ...Array.from({ length: 12 }, (_, i) => String(i + 1))]
    .map(g => `<option value="${g}" ${prefs.grade === g ? 'selected' : ''}>${g === 'K' ? 'Kindergarten' : 'Grade ' + g}</option>`).join('');
  return `<section class="card mx-4 mt-3" data-noprint>
    <h2 class="mb-3 font-display text-heading font-semibold">New quiz</h2>
    <label class="section-label" for="q-subject-chips">Subject</label>
    <div class="mb-3 flex flex-wrap gap-2" id="q-subject-chips">${chipsHtml()}</div>
    ${prefs.subject === 'other' ? `<input class="field mb-3" id="q-subject-name" placeholder="e.g. Spanish" maxlength="40">` : ''}
    <div class="mb-3 grid grid-cols-2 gap-3">
      <div>
        <label class="section-label" for="q-grade">Grade</label>
        <select class="field" id="q-grade">${gradeOptions}</select>
      </div>
      <div>
        <label class="section-label" for="q-from">From a lesson plan</label>
        <select class="field" id="q-from"><option value="">None</option></select>
      </div>
    </div>
    <label class="section-label" for="q-topic">Topic</label>
    <input class="field mb-3" id="q-topic" placeholder="e.g. Fractions on a number line" maxlength="120" value="${esc(topic)}">
    <div class="mb-3 grid grid-cols-2 gap-3">
      <div>
        <label class="section-label" for="q-mc">Multiple choice</label>
        <div class="stepper" id="q-mc">
          <button type="button" data-k="mc" data-d="-1" aria-label="Fewer">${ICONS.minus}</button>
          <output id="q-mc-n">${mcCount}</output>
          <button type="button" data-k="mc" data-d="1" aria-label="More">${ICONS.plus}</button>
        </div>
      </div>
      <div>
        <label class="section-label" for="q-essay">Essay</label>
        <div class="stepper" id="q-essay">
          <button type="button" data-k="essay" data-d="-1" aria-label="Fewer">${ICONS.minus}</button>
          <output id="q-essay-n">${essayCount}</output>
          <button type="button" data-k="essay" data-d="1" aria-label="More">${ICONS.plus}</button>
        </div>
      </div>
    </div>
    <button id="q-write" class="btn-primary w-full">Write quiz</button>
    <p id="q-progress" class="mt-2 hidden text-center text-small text-muted">Writing your quiz…</p>
    <div id="q-error" class="mt-2" hidden></div>
  </section>`;
}

function rowHtml(d) {
  const sub = d.grade ? `${d.grade === 'K' ? 'Kindergarten' : 'Grade ' + d.grade} ${subjectLabel(d).toLowerCase()}` : subjectLabel(d);
  return `<li class="list-row" data-id="${d.id}">
    ${subjectTile(d)}
    <div class="min-w-0 flex-1">
      <div class="truncate font-semibold">${esc(d.title)}</div>
      <div class="text-small text-muted">${esc(sub)}, ${esc(d.mc_count)} multiple choice, ${esc(d.essay_count)} essay</div>
    </div>
    <span class="text-small text-muted">${fmtWhen(d.created_at)}</span>
  </li>`;
}

async function quizzesScreen(view, _unused, fromLesson) {
  view.innerHTML = `${formHtml()}<div class="mx-4 mt-7" id="q-lower">${skeletons(3)}</div>`;
  bindForm(view, fromLesson);
  let docs;
  try {
    docs = await api('/api/documents?kind=quiz');
  } catch {
    view.querySelector('#q-lower').innerHTML =
      stateError("Couldn't load your quizzes. Nothing you saved is lost.");
    view.querySelector('#retry').addEventListener('click', () => quizzesScreen(view));
    return;
  }
  // Prefill the topic from the lesson "Make a quiz" came from.
  if (fromLesson && !topic) {
    try {
      const lesson = await api(`/api/documents/${fromLesson}`);
      topic = lesson.topic || '';
      const input = view.querySelector('#q-topic');
      if (input) input.value = topic;
      if (lesson.subject) {
        prefs.subject = lesson.subject;
        localStorage.setItem('tmq.subject', prefs.subject);
        if (lesson.grade) {
          prefs.grade = lesson.grade;
          localStorage.setItem('tmq.grade', prefs.grade);
        }
        quizzesScreen(view, null, fromLesson);
        return;
      }
    } catch {}
  }
  renderList(view, docs);
}

function renderList(view, docs) {
  const lower = view.querySelector('#q-lower');
  if (!lower) return;
  applyFilter.show = (rows, count) => {
    lower.innerHTML = count
      ? `<div class="mb-2 flex items-baseline justify-between px-1">
          <h2 class="font-display text-heading font-semibold">Your quizzes</h2>
          <span class="text-small text-muted">${count} quiz${count === 1 ? '' : 'zes'}</span>
        </div>
        <input class="field mb-2" id="q-search" placeholder="Search your quizzes" autocomplete="off" value="${esc(document.getElementById('view').dataset.q || '')}">
        <ul class="list" id="q-list">${rows}</ul>`
      : stateEmpty('No quizzes yet', 'Pick a subject and a topic above, then write your first one.');
    const search = lower.querySelector('#q-search');
    if (search) {
      search.addEventListener('input', () => {
        document.getElementById('view').dataset.q = search.value;
        applyFilter(docs);
        const again = lower.querySelector('#q-search');
        again.value = search.value;
        again.focus();
      });
    }
    attachSwipe(lower, docs);
  lower.addEventListener('click', e => {
    const row = e.target.closest('.list-row');
    if (row) navigate(`#/quizzes/${row.dataset.id}`);
  });
  };
  applyFilter(docs);
}

function applyFilter(docs) {
  const scope = document.getElementById('view');
  const q = (scope.dataset.q || '').toLowerCase();
  const rows = docs.filter(d =>
    !q || [d.title, d.topic, subjectLabel(d)].join(' ').toLowerCase().includes(q)).map(rowHtml).join('');
  applyFilter.show(rows, docs.length);
}

function attachSwipe(lower, docs) {
  if (!window.unNative || !unNative.attachSwipeActions) return;
  lower.querySelectorAll('#q-list .list-row').forEach(row => {
    const id = Number(row.dataset.id);
    unNative.attachSwipeActions(row, {
      actions: [{
        label: 'Delete', destructive: true,
        handler: async () => {
          try {
            await api(`/api/documents/${id}`, { method: 'DELETE' });
            toast('Deleted');
          } catch { toast('Could not delete'); }
          quizzesScreen(document.getElementById('view'));
        },
      }],
    });
  });
}

function bindForm(view, fromLesson) {
  const chips = view.querySelector('#q-subject-chips');
  if (!chips) return;
  chips.addEventListener('click', e => {
    const chip = e.target.closest('[data-subject]');
    if (!chip) return;
    prefs.subject = chip.dataset.subject;
    localStorage.setItem('tmq.subject', prefs.subject);
    quizzesScreen(view);
  });
  const grade = view.querySelector('#q-grade');
  grade.value = prefs.grade;
  grade.addEventListener('change', () => {
    prefs.grade = grade.value;
    localStorage.setItem('tmq.grade', prefs.grade);
  });
  // The from-a-lesson-plan picker: your newest lessons.
  api('/api/documents?kind=lesson&limit=20').then(lessons => {
    const from = view.querySelector('#q-from');
    if (!from) return;
    from.innerHTML = '<option value="">None</option>' + lessons.map(l =>
      `<option value="${l.id}" ${String(fromLesson) === String(l.id) ? 'selected' : ''}>${esc(l.title)}</option>`).join('');
  }).catch(() => {});
  view.querySelectorAll('.stepper button').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.k === 'mc') mcCount = Math.min(20, Math.max(0, mcCount + Number(b.dataset.d)));
    else essayCount = Math.min(5, Math.max(0, essayCount + Number(b.dataset.d)));
    if (mcCount + essayCount === 0) return showCountError(view);
    view.querySelector('#q-mc-n').textContent = mcCount;
    view.querySelector('#q-essay-n').textContent = essayCount;
  }));
  view.querySelector('#q-topic').addEventListener('input', e => { topic = e.target.value; });
  view.querySelector('#q-write').addEventListener('click', () => writeQuiz(view));
}

function showCountError(view) {
  const errorBox = view.querySelector('#q-error');
  errorBox.hidden = false;
  errorBox.innerHTML = '<p class="text-small text-muted">At least one question is needed.</p>';
}

async function writeQuiz(view) {
  const btn = view.querySelector('#q-write');
  const progress = view.querySelector('#q-progress');
  const errorBox = view.querySelector('#q-error');
  const subjectName = (view.querySelector('#q-subject-name') || {}).value;
  const from = (view.querySelector('#q-from') || {}).value;
  topic = view.querySelector('#q-topic').value.trim();
  if (!prefs.subject) { errorBox.hidden = false; errorBox.innerHTML = '<p class="text-small text-muted">Pick a subject first.</p>'; return; }
  if (!topic) { errorBox.hidden = false; errorBox.innerHTML = '<p class="text-small text-muted">Type a topic first.</p>'; return; }
  if (mcCount + essayCount === 0) return showCountError(view);
  errorBox.hidden = true;
  btn.disabled = true;
  progress.classList.remove('hidden');
  const body = {
    kind: 'quiz', subject: prefs.subject, subjectName: prefs.subject === 'other' ? subjectName : undefined,
    grade: prefs.grade, topic, mcCount, essayCount, lessonId: from || undefined,
  };
  try {
    const doc = await withAi(() => api('/api/documents/generate', { method: 'POST', body }));
    toast('Quiz saved');
    navigate(`#/quizzes/${doc.id}`);
  } catch (err) {
    progress.classList.add('hidden');
    btn.disabled = false;
    const message = AI_MESSAGES[err.code] || "TeachMate couldn't finish writing that. Try again.";
    const offerBlank = ['ai_unavailable', 'grant_required'].includes(err.code);
    errorBox.hidden = false;
    errorBox.innerHTML = `
      <div class="rounded-lg border border-line bg-surface p-3 text-small text-muted">
        <p class="text-fg">${esc(message)}</p>
        ${offerBlank ? '<button id="q-blank" class="btn-secondary mt-2">Start from a blank outline</button>' : ''}
      </div>`;
    const blank = errorBox.querySelector('#q-blank');
    if (blank) blank.addEventListener('click', async () => {
      try {
        const doc = await api('/api/documents', { method: 'POST', body });
        pendingEditId = doc.id;
        navigate(`#/quizzes/${doc.id}`);
      } catch { toast('Could not create the outline'); }
    });
  }
}

// ── Detail ─────────────────────────────────────────────────────────────────
let editing = false;
let mode = 'student'; // student copy | answer key
let pendingEditId = null;

async function quizDetail(view, id) {
  let doc;
  try {
    doc = await api(`/api/documents/${id}`);
  } catch {
    view.innerHTML = stateError("Couldn't load that quiz. Nothing you saved is lost.");
    view.querySelector('#retry').addEventListener('click', () => quizDetail(view, id));
    return;
  }
  editing = editing || pendingEditId === Number(id) || pendingEditId === id;
  pendingEditId = null;
  const s = SUBJECTS[doc.subject] || SUBJECTS.other;
  const tools = editing
    ? `<button class="btn-secondary" id="d-cancel">Cancel</button><button class="btn-primary" id="d-save">Save changes</button>`
    : `<button class="btn-secondary" id="d-pdf">${ICONS.print}Export PDF</button>`;
  view.innerHTML = `
    <div class="flex items-center justify-between px-2 pt-2" data-noprint>
      <button class="flex min-h-11 items-center gap-1 px-2 font-medium" data-nav="#/quizzes">${ICONS.back}Quizzes</button>
      <div class="flex items-center gap-1">
        ${editing ? '' : `<button id="d-more" class="flex h-11 w-11 items-center justify-center rounded-lg text-fg" aria-label="More">${ICONS.more}</button>`}
      </div>
    </div>
    <div class="flex gap-2 px-3 pb-3 pt-1" data-noprint>${tools}</div>
    ${editing ? '' : `<div class="mx-4 mb-3 flex seg" data-noprint>
      <button data-mode="student" class="${mode === 'student' ? 'is-on' : ''}">Student copy</button>
      <button data-mode="key" class="${mode === 'key' ? 'is-on' : ''}">Answer key</button>
    </div>`}
    <div><span class="sheet-flag ${s.cls}">${s.icon}${esc(subjectLabel(doc))}</span></div>
    <div id="d-sheet">${editing ? quizEditHtml(doc) : quizSheetHtml(doc, mode)}</div>
    <p class="mx-4 mt-3 text-small text-muted" data-noprint>${esc(doc.source === 'ai'
      ? `Written with AI on ${fmtWhen(doc.created_at)}. Read it through before you use it.`
      : 'Written by hand. Read it through before you use it.')}</p>
    ${(await gradingNote(doc))}`;

  view.querySelector('[data-nav]').addEventListener('click', () => { history.back(); });
  if (editing) {
    view.querySelector('#d-save').addEventListener('click', async () => {
      try {
        const payload = readQuizEdit(view.querySelector('#d-sheet'));
        if (!payload.body.mc.length && !payload.body.essay.length) return toast('At least one question is needed');
        await api(`/api/documents/${doc.id}`, { method: 'PATCH', body: payload });
        toast('Quiz saved');
        editing = false;
        quizDetail(view, id);
      } catch (err) {
        toast(err.code === 'bad body' ? 'Check the sheet: every question needs its parts' : 'Could not save');
      }
    });
    view.querySelector('#d-cancel').addEventListener('click', () => { editing = false; quizDetail(view, id); });
  } else {
    view.querySelector('#d-pdf').addEventListener('click', exportPdf);
    view.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
      mode = b.dataset.mode;
      const sheet = view.querySelector('#d-sheet');
      sheet.innerHTML = quizSheetHtml(doc, mode);
      view.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('is-on', x.dataset.mode === mode));
    }));
    const more = view.querySelector('#d-more');
    if (more) more.addEventListener('click', e => {
      if (!window.unNative || !unNative.menu) return;
      unNative.menu({
        anchorEl: e.currentTarget,
        items: [
          { label: 'Edit', handler: () => { editing = true; quizDetail(view, id); } },
          { label: 'Write again', handler: () => writeAgain(doc, view) },
          { label: 'Delete', destructive: true, handler: () => deleteDoc(doc, view) },
        ],
      });
    });
  }
}

// "Saved scores won't change." when a quiz with gradings is edited.
async function gradingNote(doc) {
  try {
    const gs = await api(`/api/gradings?quizId=${doc.id}&limit=1`);
    return gs.length ? '<p class="mx-4 mt-1 text-small text-muted" data-noprint>Saved scores won\'t change.</p>' : '';
  } catch { return ''; }
}

async function writeAgain(doc, view) {
  const ok = await confirmDialog({
    title: 'Write again?',
    message: 'This replaces the whole quiz with a fresh version.',
    confirmLabel: 'Write again',
  });
  if (!ok) return;
  try {
    await withAi(() => api('/api/documents/generate', {
      method: 'POST',
      body: {
        kind: 'quiz', subject: doc.subject, subjectName: doc.subject_name,
        grade: doc.grade, topic: doc.topic,
        mcCount: (doc.body.mc || []).length, essayCount: (doc.body.essay || []).length, replaceId: doc.id,
      },
    }));
    toast('Quiz saved');
    quizDetail(view, doc.id);
  } catch (err) {
    toast(AI_MESSAGES[err.code] || "TeachMate couldn't finish writing that. Try again.");
  }
}

async function deleteDoc(doc, view) {
  const ok = await confirmDialog({ title: 'Delete this quiz?', message: 'Its saved scores go with it.', destructive: true, confirmLabel: 'Delete' });
  if (!ok) return;
  try {
    await api(`/api/documents/${doc.id}`, { method: 'DELETE' });
    toast('Deleted');
    navigate('#/quizzes');
  } catch { toast('Could not delete'); }
}

register([
  { pattern: /^\/quizzes\/(\d+)$/, render: (view, id) => quizDetail(view, id), detail: true, transition: 'push' },
  { pattern: /^\/quizzes$/, render: (view, query) => quizzesScreen(view, null, query && query.get('from')) },
]);
