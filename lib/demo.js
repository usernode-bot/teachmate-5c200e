// The staging demo, written to the viewing account once, on its first
// ?demo=1 visit, and only ever in staging. Runs through the same normalizers
// the AI path uses, and the gradings' scores come from scoreSheet, so the
// summary maths is real.
const { normalizeLesson, normalizeQuiz } = require('./normalize');
const { scoreSheet } = require('./scoring');

const LESSONS = [
  {
    key: 'lesson-water-cycle', days: 1, subject: 'sci', grade: '4', topic: 'The water cycle', dur: 45, mins: [5, 30, 10],
    ctx: { studentCount: 24, tools: 'handouts', differentiate: true },
    obj: ['Describe the four stages of the water cycle: evaporation, condensation, precipitation and collection.', "Explain how the sun's heat drives evaporation.", 'Draw and label a water cycle diagram.'],
    mat: ['Clear cups, plastic wrap, ice cubes, warm water', 'Water cycle diagram handout', 'Colored pencils'],
    open: ['Show a photo of a puddle in the morning and again at noon. Ask: where did the water go?', 'Write three or four guesses on the board.'],
    main: ['Show the cup set-up: warm water, plastic wrap on top, ice on the wrap.'],
    tracks: [
      { level: 'support', title: 'Build it with a picture guide', steps: ['Follow the picture card to build the cup.', 'Match the four stage cards to what you see in the cup.'] },
      { level: 'core', title: 'Build and sketch', steps: ['Pairs build the cup and sketch what they see every 5 minutes.', 'Label the four stages on the handout.'] },
      { level: 'challenge', title: 'Change one thing', steps: ['Predict what colder water would change, then test it.', 'Write one sentence explaining the difference.'] },
    ],
    close: ['Exit ticket: in two sentences, explain why the plastic wrap got wet.', 'Read two exit tickets aloud and connect them to rain clouds.'],
    checks: ['Exit ticket: names evaporation and condensation correctly.', 'Diagram: all four stages labeled in order.'],
  },
  {
    key: 'lesson-equivalent-fractions', days: 3, subject: 'math', grade: '3', topic: 'Equivalent fractions', dur: 40, mins: [5, 25, 10],
    cur: 'ccss',
    std: ['CCSS.MATH.CONTENT.3.NF.A.3: Explain equivalence of fractions in special cases, and compare fractions by reasoning about their size.'],
    aligned: 'Students show 1/2 = 2/4 and 2/3 = 4/6 on a number line and explain in one sentence why they are equal.',
    obj: ['Recognize that 1/2 and 2/4 name the same amount.', 'Find equivalent fractions with fraction strips.', 'Explain why the bottom number matters.'],
    mat: ['Fraction strips, one set per pair', 'Dot paper'],
    open: ['Hold up one half strip and two quarter strips. Ask: are these the same amount?', 'Collect answers, then test with the strips.'],
    main: ['Pairs build equivalent fractions with strips and record each pair they find.', 'Pairs sort their pairs into two columns: same amount, different amount.', 'Class makes one list of the pairs that worked and looks for a pattern.'],
    close: ['Exit ticket: write one fraction equivalent to 1/2 and show why.'],
    checks: ['Exit ticket names a correct equivalent fraction with a picture or strip sketch.'],
  },
  {
    key: 'lesson-strong-opening-line', days: 5, subject: 'ela', grade: '7', topic: 'Writing a strong opening line', dur: 50, mins: [10, 30, 10],
    obj: ['Name what a strong opening line does for a reader.', 'Revise a flat opening line into a specific one.', "Give useful feedback on a partner's revision."],
    mat: ['Handout with six flat opening lines', 'Writing notebooks'],
    open: ['Read three openings from class novels aloud without titles. Students vote which makes them want to read on.'],
    main: ['Students revise two flat lines from the handout, making each one specific.', 'Partners swap revisions and mark the line that gives the clearest picture.', 'Four volunteers read their best line; class names what made it work.'],
    close: ['Each student picks their own best line and copies it onto a class chart.'],
    checks: ['Revised line is specific and shows rather than tells.'],
  },
  {
    key: 'lesson-life-along-the-nile', days: 8, subject: 'soc', grade: '6', topic: 'Life along the Nile', dur: 45, mins: [5, 30, 10],
    obj: ["Locate ancient Egypt on a map and describe the Nile's path.", 'Explain how the yearly flood made farming possible.', 'Connect one daily life activity to the river.'],
    mat: ['Map of ancient Egypt', 'Flood season diagram handout'],
    open: ['Show the map. Ask: why would people settle right here, in the middle of a desert?'],
    main: ['Read the flood diagram together and label the three farming seasons.', 'Groups each get one job (farmer, fisher, trader, builder) and list how the river helps them.', 'Each group reports one way their job depends on the river.'],
    close: ['Exit ticket: one sentence on how the flood helped farmers.'],
    checks: ['Exit ticket names the flood and one benefit: water or rich soil.'],
  },
  {
    key: 'lesson-plants-make-food', days: 12, subject: 'sci', grade: '8', topic: 'How plants make food', dur: 55, mins: [10, 35, 10],
    obj: ['State that plants make their own food using light, water and carbon dioxide.', 'Identify where photosynthesis happens in a leaf.', 'Write the photosynthesis equation in words.'],
    mat: ['Leaf cross-section diagram', 'Elodea sprigs, beakers, lamp'],
    open: ['Ask: what does a plant eat for breakfast? Collect ideas, park them on the board.'],
    main: ['Demo: elodea in water under a lamp. Count the bubbles of oxygen over two minutes.', 'Move the lamp away and count again. What changed?', 'Build the word equation together on the board from what the demo showed.', 'Label the leaf cross-section: cuticle, epidermis, palisade cells, stomata.'],
    close: ['Exit ticket: write the word equation and one thing the demo proved.'],
    checks: ['Word equation has light, water, carbon dioxide, oxygen and glucose in a sensible arrangement.'],
  },
  {
    key: 'lesson-color-wheel', days: 16, subject: 'art', grade: '2', topic: 'Mixing colors with the color wheel', dur: 30, mins: [5, 20, 5],
    obj: ['Name the primary colors.', 'Mix two primaries to make a new color.', 'Place colors in the right spot on a color wheel.'],
    mat: ['Red, yellow and blue paint', 'Brushes and paper plates', 'Blank color wheel handout'],
    open: ['Show two paint puddles (red, yellow). Ask what happens if they mix, then try it.'],
    main: ['Students mix each pair of primaries and paint the result on their wheel.', 'Walk the room asking students to name the new color they made.'],
    close: ['Hold up wheels; class names the secondary colors together.'],
    checks: ['Wheel has six colors in the right order.'],
  },
  {
    key: 'lesson-two-step-equations', days: 19, subject: 'math', grade: '8', topic: 'Solving two-step equations', dur: 50, mins: [10, 30, 10],
    obj: ['Solve two-step equations with one variable.', 'Undo addition or subtraction before multiplication or division.', 'Check a solution by substituting it back.'],
    mat: ['Whiteboards and markers', 'Practice problem set'],
    open: ['Warm-up: undo this machine: start with x, add 3, double it, get 14. What was x?'],
    main: ['Model two examples, naming each undo step aloud.', 'Pairs work the practice set on whiteboards, checking each answer by substitution.', 'Collect the two problems most pairs got wrong and solve them together.'],
    close: ['Exit ticket: solve 2x + 5 = 13 and show the check.'],
    checks: ['Exit ticket shows both undo steps and a correct check.'],
  },
  {
    key: 'lesson-lat-long', days: 23, subject: 'soc', grade: '5', topic: 'Finding places with latitude and longitude', dur: 45, mins: [5, 30, 10],
    obj: ['Explain what latitude and longitude lines measure.', 'Find a place on a map from its coordinates.', 'Write the coordinates of a named city.'],
    mat: ['World map with grid overlay', 'Coordinates practice sheet'],
    open: ['Ask: how would you describe the exact spot of your desk to someone who has never seen the room?'],
    main: ['Model finding a coordinate pair on the map, one step at a time.', 'Pairs find five places from coordinates on the practice sheet.', 'Partners write the coordinates of a mystery city for each other to find.'],
    close: ['Share two mystery cities and solve them together.'],
    checks: ['Practice sheet has at least four of five places correct.'],
  },
];

const QUIZZES = [
  {
    key: 'quiz-water-cycle', days: 2, subject: 'sci', grade: '4', topic: 'The water cycle', fromLesson: 'lesson-water-cycle', title: 'Water cycle quiz', mcCount: 5, essayCount: 2,
    mc: [
      { q: 'What heats the water in oceans and lakes so it evaporates?', choices: ['The moon', 'The sun', 'Wind', 'Rain'], answer: 1 },
      { q: 'What is it called when water vapor turns into clouds?', choices: ['Evaporation', 'Collection', 'Condensation', 'Precipitation'], answer: 2 },
      { q: 'What falls from clouds as rain or snow?', choices: ['Precipitation', 'Evaporation', 'Fog', 'Runoff'], answer: 0 },
      { q: 'Where does most rainwater eventually collect?', choices: ['In the sky', 'In oceans, lakes and rivers', 'Inside clouds', 'In the sun'], answer: 1 },
      { q: 'What drives the whole water cycle?', choices: ['Cars', 'The wind', "The sun's heat", 'The moon'], answer: 2 },
    ],
    essay: [
      { q: 'Explain what happens to a puddle on a sunny day. Use the word evaporation.' },
      { q: 'Describe the four stages of the water cycle in order.' },
    ],
  },
  {
    key: 'quiz-equivalent-fractions', days: 3, subject: 'math', grade: '3', topic: 'Equivalent fractions', fromLesson: 'lesson-equivalent-fractions', title: 'Equivalent fractions quiz', mcCount: 4, essayCount: 2,
    mc: [
      { q: 'Which fraction is equivalent to 1/2?', choices: ['2/4', '1/3', '3/5', '2/5'], answer: 0 },
      { q: 'Which pair shows equivalent fractions?', choices: ['1/3 and 2/3', '2/4 and 3/6', '1/2 and 2/3', '3/4 and 3/5'], answer: 1 },
      { q: 'How many eighths equal one half?', choices: ['2', '3', '4', '6'], answer: 2 },
      { q: 'Which fraction is NOT equivalent to 1/2?', choices: ['2/4', '3/6', '4/8', '3/5'], answer: 3 },
    ],
    essay: [
      { q: 'Draw a number line from 0 to 1. Mark 1/2 and 2/4. What do you notice?' },
      { q: 'Explain why 2/4 and 1/3 are not equivalent fractions.' },
    ],
  },
  {
    key: 'quiz-two-step-equations', days: 4, subject: 'math', grade: '8', topic: 'Solving two-step equations', fromLesson: 'lesson-two-step-equations', title: 'Two-step equations quiz', mcCount: 5, essayCount: 2,
    mc: [
      { q: 'Solve: 2x + 3 = 11', choices: ['x = 4', 'x = 7', 'x = 5', 'x = 3'], answer: 0 },
      { q: 'Solve: 3x - 4 = 14', choices: ['x = 4', 'x = 6', 'x = 5', 'x = 10'], answer: 1 },
      { q: 'What is the first step to solve x/2 + 5 = 9?', choices: ['Subtract 5 from both sides', 'Multiply both sides by 2', 'Add 5 to both sides', 'Divide both sides by 2'], answer: 0 },
      { q: 'Solve: 5x - 10 = 0', choices: ['x = 0', 'x = 5', 'x = 2', 'x = -2'], answer: 2 },
      { q: 'If 4x + 7 = 19, what is x?', choices: ['x = 3', 'x = 12', 'x = 6', 'x = 5'], answer: 0 },
    ],
    essay: [
      { q: 'A phone plan costs $20 plus $2 per gigabyte. Write and solve an equation for the cost of 6 gigabytes.' },
      { q: 'Explain, in steps, how you would solve 3x + 5 = 20, and check your answer.' },
    ],
  },
  {
    key: 'quiz-life-along-the-nile', days: 8, subject: 'soc', grade: '6', topic: 'Life along the Nile', fromLesson: 'lesson-life-along-the-nile', title: 'Life along the Nile quiz', mcCount: 5, essayCount: 2,
    mc: [
      { q: "Why did farmers value the Nile's yearly flood?", choices: ['It brought fresh water and rich soil', 'It washed away their houses', 'It brought fish only', 'It froze the river'], answer: 0 },
      { q: 'What is the fertile land along a river called?', choices: ['A delta only', 'Floodplain', 'A desert', 'An oasis'], answer: 1 },
      { q: 'What did Egyptians use papyrus reeds for?', choices: ['Food only', 'Building pyramids', 'Paper and boats', 'Making glass'], answer: 2 },
      { q: 'Which season came right after the flood?', choices: ['Harvest', 'Planting', 'Inundation', 'Dry season'], answer: 1 },
      { q: 'Which direction does the Nile flow?', choices: ['South to north', 'North to south', 'East to west', 'West to east'], answer: 0 },
    ],
    essay: [
      { q: 'How did the yearly flood make farming possible in Egypt? Give two ways.' },
      { q: 'Describe one way the Nile was used besides farming.' },
    ],
  },
];

// Made-up, alliterative, so nobody mistakes them for real pupils.
// mc: answers for the 5 multiple-choice questions (null = blank);
// essay: rubric levels 0-4 (4 = No answer); method: ai or hand.
const SETS = [
  {
    quizKey: 'quiz-water-cycle', className: 'Room 12', days: 2,
    students: [
      { name: 'Avery Applegate', mc: ['B', 'C', 'A', 'B', 'C'], essay: [0, 0], method: 'ai' },
      { name: 'Ben Bramble', mc: ['B', 'C', 'A', 'B', 'A'], essay: [1, 2], method: 'ai' },
      { name: 'Cora Cobble', mc: ['B', null, 'A', 'B', 'C'], essay: [0, 3], method: 'hand' },
      { name: 'Dev Dandelion', mc: ['B', 'C', 'C', 'B', 'C'], essay: [2, 2], method: 'ai' },
      { name: 'Ellie Everhart', mc: ['A', 'C', 'A', 'B', 'C'], essay: [1, 1], method: 'ai' },
      { name: 'Finn Fletcher', mc: ['B', 'C', 'A', null, 'B'], essay: [3, 4], method: 'hand' },
      { name: 'Grace Gilroy', mc: ['B', 'C', 'A', 'B', 'C'], essay: [2, 0], method: 'ai' },
      { name: 'Hugo Hollis', mc: [null, 'C', 'A', 'B', 'C'], essay: [2, 2], method: 'ai' },
      { name: 'Iris Iverson', mc: ['C', 'A', 'A', 'B', 'B'], essay: [3, 3], method: 'hand' },
    ],
  },
  {
    quizKey: 'quiz-two-step-equations', className: 'Period 3', days: 4,
    students: [
      { name: 'Jada Jarrell', mc: ['A', 'B', 'A', 'C', 'A'], essay: [0, 1], method: 'ai' },
      { name: 'Kai Kimball', mc: ['A', 'B', 'A', null, 'A'], essay: [1, 1], method: 'hand' },
      { name: 'Lena Lopez', mc: ['B', 'B', 'A', 'C', 'A'], essay: [0, 0], method: 'ai' },
      { name: 'Milo Mercer', mc: ['A', 'A', 'A', 'C', 'A'], essay: [2, 2], method: 'ai' },
      { name: 'Nora Nesbit', mc: ['A', 'B', 'B', 'C', 'A'], essay: [1, 3], method: 'hand' },
      { name: 'Omar Ortega', mc: ['A', 'B', 'A', 'C', 'B'], essay: [2, 1], method: 'ai' },
      { name: 'Piper Pruitt', mc: [null, 'B', 'A', 'A', 'A'], essay: [2, 4], method: 'hand' },
      { name: 'Quinn Quill', mc: ['A', 'B', 'A', 'C', 'A'], essay: [0, 0], method: 'ai' },
    ],
  },
];

function demoLesson(l) {
  const main = { phase: 'main', title: 'Main activity', minutes: l.mins[1], steps: l.main };
  if (l.tracks) main.tracks = l.tracks;
  const raw = {
    title: l.topic,
    objectives: l.obj,
    materials: l.mat,
    activities: [
      { phase: 'opening', title: 'Opening', minutes: l.mins[0], steps: l.open },
      main,
      { phase: 'closing', title: 'Closing', minutes: l.mins[2], steps: l.close },
    ],
    assessment: { checks: l.checks, aligned: l.aligned },
    standards: l.std,
  };
  const { title, body } = normalizeLesson(raw, {
    topic: l.topic, durationMin: l.dur, ...(l.ctx || {}),
    curriculum: l.cur || null, requireStandards: !!l.cur,
  });
  return { title, body };
}

function demoQuiz(q) {
  const raw = {
    title: q.title,
    mc: q.mc,
    essay: q.essay.map(e => ({ ...e, points: 4, rubric: undefined })),
  };
  const { title, body } = normalizeQuiz(raw, { topic: q.title, mcCount: q.mcCount, essayCount: q.essayCount });
  return { title, body };
}

// Writes the demo rows once per account. The INSERT ... ON CONFLICT DO
// NOTHING RETURNING on demo_seeds is the gate: a reload changes nothing, and
// what the viewer edits or deletes stays.
async function ensureDemo(pool, userId, now) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // A ?demo=1 screen can ask for two lists at once (the quizzes tab loads
    // its quizzes and its lesson picker together). Take a per-teacher lock so
    // the second request waits for the seed to commit instead of reading a
    // half-written set, and keep the gate in the same transaction so a failed
    // seed leaves nothing behind.
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [userId]);
    const gate = await client.query(
      'INSERT INTO demo_seeds (user_id, seeded_at) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING user_id',
      [userId, now]);
    if (gate.rowCount === 0) {
      await client.query('COMMIT');
      return;
    }
    const lessonIds = {};
    for (const l of LESSONS) {
      const { title, body } = demoLesson(l);
      const r = await client.query(
        `INSERT INTO documents (user_id, kind, subject, grade, topic, title, body, source, curriculum, is_demo, demo_key, created_at, updated_at)
         VALUES ($1, 'lesson', $2, $3, $4, $5, $6, 'ai', $7, true, $8, $9, $9)
         ON CONFLICT (user_id, demo_key) DO NOTHING RETURNING id`,
        [userId, l.subject, l.grade, l.topic, title, JSON.stringify(body), l.cur || null, l.key, new Date(now - l.days * 86400000)]);
      if (r.rows[0]) lessonIds[l.key] = r.rows[0].id;
    }
    const quizIds = {};
    for (const q of QUIZZES) {
      const { title, body } = demoQuiz(q);
      const r = await client.query(
        `INSERT INTO documents (user_id, kind, subject, grade, topic, title, body, source, lesson_id, is_demo, demo_key, created_at, updated_at)
         VALUES ($1, 'quiz', $2, $3, $4, $5, $6, 'ai', $7, true, $8, $9, $9)
         ON CONFLICT (user_id, demo_key) DO NOTHING RETURNING id`,
        [userId, q.subject, q.grade, q.topic, title, JSON.stringify(body), lessonIds[q.fromLesson] || null, q.key, new Date(now - q.days * 86400000)]);
      if (r.rows[0]) quizIds[q.key] = r.rows[0].id;
    }
    for (const set of SETS) {
      const quizId = quizIds[set.quizKey];
      const quizRow = quizId
        ? (await client.query('SELECT body FROM documents WHERE id = $1 AND user_id = $2', [quizId, userId])).rows[0]
        : null;
      if (!quizRow) continue;
      const quiz = { body: quizRow.body };
      for (const s of set.students) {
        const { results, score, max } = scoreSheet(quiz, s.mc, s.essay);
        const at = new Date(now - set.days * 86400000);
        await client.query(
          `INSERT INTO gradings (user_id, quiz_id, class_name, student_name, method, mc_answers, essay_levels, results, score, max_score, feedback, is_demo, demo_key, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12, $13, $13)
           ON CONFLICT (user_id, demo_key) DO NOTHING`,
          [userId, quizId, set.className, s.name, s.method, JSON.stringify(s.mc), JSON.stringify(s.essay),
           JSON.stringify(results), score, max,
           `${s.name.split(' ')[0]} worked through every question and gave clear answers.`,
           `${set.quizKey}:${set.className}:${s.name}`, at]);
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { ensureDemo, demoLesson, LESSONS, QUIZZES, SETS };
