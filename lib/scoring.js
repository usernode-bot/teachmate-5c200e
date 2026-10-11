// The one place scores are computed, server side. The server never trusts a
// client or model total.

const LETTERS = ['A', 'B', 'C', 'D'];

// scoreSheet(quiz, mcAnswers, essayLevels) -> { results, score, max }.
// Multiple choice is 1 point for the letter matching the key; an essay scores
// the rubric points for its level, 0 for No answer or an unreadable level.
function scoreSheet(quiz, mcAnswers, essayLevels) {
  const results = [];
  let score = 0;
  let max = 0;
  (quiz.body.mc || []).forEach((q, i) => {
    const given = mcAnswers && mcAnswers[i];
    const correct = given != null && given === LETTERS[q.answer];
    results.push({ q: i + 1, kind: 'mc', given: given || null, correct, points: correct ? 1 : 0, max: 1 });
    score += correct ? 1 : 0;
    max += 1;
  });
  const mcCount = (quiz.body.mc || []).length;
  (quiz.body.essay || []).forEach((q, i) => {
    const n = essayLevels && Number.isInteger(essayLevels[i]) && essayLevels[i] >= 0 && essayLevels[i] <= 4
      ? essayLevels[i] : 4;
    const pts = n <= 3 ? (q.rubric[n] ? q.rubric[n].points : 0) : 0;
    results.push({ q: mcCount + i + 1, kind: 'essay', level: n, points: pts, max: q.points });
    score += pts;
    max += q.points;
  });
  return { results, score, max };
}

// summarize(gradings, quiz) -> class summary: average, min, max percent and
// how many students got each question right.
function summarize(gradings, quiz) {
  const students = gradings.map(g => {
    const score = Number(g.score);
    const maxScore = Number(g.max_score);
    return {
      id: g.id,
      student: g.student_name,
      score,
      max: maxScore,
      pct: maxScore ? Math.round(score / maxScore * 100) : 0,
      method: g.method,
      photoUrl: g.photo_url || null,
    };
  });
  const pcts = students.map(s => s.pct);
  const mcCount = (quiz.body.mc || []).length;
  const questions = [];
  const total = mcCount + (quiz.body.essay || []).length;
  for (let i = 1; i <= total; i++) {
    const right = gradings.filter(g => (g.results || []).some(r => r.q === i && r.points === r.max)).length;
    questions.push({ q: i, kind: i <= mcCount ? 'mc' : 'essay', right, of: gradings.length });
  }
  return {
    count: students.length,
    average: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0,
    min: pcts.length ? Math.min(...pcts) : 0,
    max: pcts.length ? Math.max(...pcts) : 0,
    students,
    questions,
  };
}

module.exports = { scoreSheet, summarize };
