// Blank outlines for the "Start from a blank outline" fallback, laid out with
// the same shapes the AI writes, so edit mode has something to fill in.

function round5(n) { return Math.round(n / 5) * 5; }

// Opening ~10%, closing ~20% of the duration, main the rest; every phase at
// least 5 minutes, and the three sum exactly to the duration.
function splitMinutes(duration) {
  let opening = Math.max(5, round5(duration * 0.1));
  if (opening > duration - 10) opening = duration - 10;
  let closing = Math.max(5, round5(duration * 0.2));
  if (closing > duration - opening - 5) closing = duration - opening - 5;
  const main = duration - opening - closing;
  return { opening, main, closing };
}

function blankLesson(input) {
  const duration = Math.min(120, Math.max(15, parseInt(input.durationMin, 10) || 45));
  const minutes = splitMinutes(duration);
  return {
    title: input.topic || 'New lesson plan',
    body: {
      objectives: ['', ''],
      materials: [''],
      activities: ['opening', 'main', 'closing'].map(phase => ({
        phase,
        title: { opening: 'Opening', main: 'Main activity', closing: 'Closing' }[phase],
        minutes: minutes[phase],
        steps: [''],
      })),
      assessment: { checks: [''] },
      durationMin: duration,
    },
  };
}

const RUBRIC_DEFAULTS = [
  { level: 'Excellent', desc: 'Complete and accurate, with clear reasoning' },
  { level: 'Good', desc: 'Mostly accurate with some reasoning' },
  { level: 'Developing', desc: 'Partly accurate or unclear' },
  { level: 'Beginning', desc: 'Attempted with little accuracy' },
];

function blankQuiz(input) {
  const mcCount = Math.min(20, Math.max(0, parseInt(input.mcCount, 10) || 0));
  const essayCount = Math.min(5, Math.max(0, parseInt(input.essayCount, 10) || 0));
  return {
    title: input.topic || 'New quiz',
    body: {
      mc: Array.from({ length: mcCount }, () => ({ q: '', choices: ['', '', '', ''], answer: 0 })),
      essay: Array.from({ length: essayCount }, () => ({
        q: '',
        points: 4,
        rubric: RUBRIC_DEFAULTS.map((d, i) => ({ ...d, points: 4 - i })),
      })),
    },
  };
}

module.exports = { blankLesson, blankQuiz, RUBRIC_DEFAULTS };
