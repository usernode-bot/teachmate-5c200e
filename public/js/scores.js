// The Scores tab: the class sets you have graded, and one set's summary.

import {
  api, esc, navigate, register, skeletons, stateEmpty, stateError, TOKEN,
} from './app.js';
import { ICONS, SUBJECTS, subjectTile } from './icons.js';
import { exportPdf } from './sheet.js';

async function scoresScreen(view) {
  view.innerHTML = `<div class="mx-4 mt-3">${skeletons(3)}</div>`;
  let sets;
  try {
    sets = await api('/api/scores');
  } catch {
    view.innerHTML = stateError("Couldn't load your scores. Nothing you saved is lost.");
    view.querySelector('#retry').addEventListener('click', () => scoresScreen(view));
    return;
  }
  if (!sets.length) {
    view.innerHTML = `<div class="mx-4 mt-7">${stateEmpty('No scores yet', 'Grade an answer sheet on the Grade tab, and its class summary shows up here.')}</div>`;
    return;
  }
  view.innerHTML = `<div class="mx-4 mt-3">
    <ul class="list">${sets.map(s => `
      <li class="list-row" data-href="#/scores/${s.quiz_id}/${encodeURIComponent(s.class_name)}">
        ${subjectTile({ subject: s.subject, subject_name: s.subject_name })}
        <div class="min-w-0 flex-1">
          <div class="truncate font-semibold">${esc(s.quiz_title)}</div>
          <div class="text-small text-muted">${esc(s.class_name)}, ${s.n} student${s.n === 1 ? '' : 's'}</div>
        </div>
        <span class="font-display text-heading font-semibold">${esc(s.avg_pct)}%</span>
      </li>`).join('')}</ul>
  </div>`;
  view.querySelectorAll('[data-href]').forEach(row =>
    row.addEventListener('click', () => navigate(row.dataset.href)));
}

async function scoreDetail(view, quizId, className) {
  let data;
  try {
    data = await api(`/api/scores/${quizId}?class=${encodeURIComponent(className)}`);
  } catch {
    view.innerHTML = stateError("Couldn't load that class summary. Nothing you saved is lost.");
    view.querySelector('#retry').addEventListener('click', () => scoreDetail(view, quizId, className));
    return;
  }
  const { quiz, summary } = data;
  const avg = summary.average;
  const bar = (pct, weak) => {
    const fill = weak ? 'rgb(var(--mark))' : 'rgb(var(--accent))';
    return `<span class="flex h-1.5 flex-1 overflow-hidden rounded-full bg-raised"><span style="width:${Math.max(2, pct)}%;background:${fill}"></span></span>`;
  };
  view.innerHTML = `
    <div class="flex items-center justify-between px-2 pt-2" data-noprint>
      <button class="flex min-h-11 items-center gap-1 px-2 font-medium" data-nav="#/scores">${ICONS.back}Scores</button>
    </div>
    <div class="flex gap-2 px-3 pb-3 pt-1" data-noprint>
      <button class="btn-secondary" id="s-pdf">${ICONS.print}Export PDF</button>
    </div>
    <div><span class="sheet-flag ${(SUBJECTS[quiz.subject] || SUBJECTS.other).cls}">${(SUBJECTS[quiz.subject] || SUBJECTS.other).icon}${esc(quiz.subject === 'other' && quiz.subject_name ? quiz.subject_name : (SUBJECTS[quiz.subject] || SUBJECTS.other).label)}</span></div>
    <article class="sheet">
      <h2 class="sheet-title">${esc(quiz.title)}</h2>
      <p class="meta">${esc(className)} — class summary</p>
      <h3>Averages</h3>
      <p>Class average <b>${avg}%</b> — highest <b>${summary.max}%</b>, lowest <b>${summary.min}%</b>. ${summary.count} student${summary.count === 1 ? '' : 's'} graded.</p>
      <h3>Students</h3>
      ${summary.students.map(s => `
        <div class="flex items-center gap-3" data-href="#/grade/${s.id}">
          <span class="w-32 shrink-0 truncate">${esc(s.student)}</span>
          ${bar(s.pct, s.pct < 50)}
          <span class="shrink-0 text-small">${s.score} / ${s.max}</span>
          <span class="w-12 shrink-0 text-right text-small">${s.pct}%</span>
        </div>`).join('')}
      <h3>Questions</h3>
      ${summary.questions.map(q => `
        <div class="flex items-center gap-3">
          <span class="w-10 shrink-0 font-semibold ${q.right / q.of < 0.5 ? 'text-mark' : ''}">Q${q.q}</span>
          ${bar(q.right / q.of * 100, q.right / q.of < 0.5)}
          <span class="w-24 shrink-0 text-right text-small">${q.right} of ${q.of} right</span>
        </div>`).join('')}
    </article>
    <p class="mx-4 mt-3 text-small text-muted" data-noprint>Questions fewer than half the class got right are marked in red pen.</p>`;
  view.querySelector('[data-nav]').addEventListener('click', () => navigate('#/scores'));
  view.querySelector('#s-pdf').addEventListener('click', exportPdf);
  view.querySelectorAll('[data-href]').forEach(row =>
    row.addEventListener('click', () => navigate(row.dataset.href)));
}

register([
  { pattern: /^\/scores\/(\d+)\/([^/]+)$/, render: scoreDetail, detail: true, transition: 'push' },
  { pattern: /^\/scores$/, render: scoresScreen },
]);
