// Calls to the platform's Claude proxy. Staging containers and standalone
// deploys have no proxy: LLM_ENABLED is false and every AI route answers
// ai_unavailable, which the frontend turns into the blank-outline fallback.
const LLM_ENABLED = !!process.env.USERNODE_LLM_PROXY_TOKEN;

const MODEL = 'claude-sonnet-5-5';

class AiError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

// The content-rules clause every prompt carries: the model declines off-limits
// topics itself, and the app answers with a fixed neutral message, never the
// model's own words.
const RULES = 'You help K-12 teachers. Decline any request involving sexual or mature themes, violence or weapons, gambling, drugs or alcohol, or self-harm, by replying {"declined": true}. For historical conflict, cover causes, people and consequences without describing violence or weapons. Keep everything age-appropriate for the grade given. Reply with one JSON object only, no markdown fences or commentary.';

const LESSON_SHAPE = `Write a lesson plan as one JSON object:
{"title": string, "objectives": [2 to 5 strings], "materials": [0 to 8 strings],
"activities": [
  {"phase": "opening", "title": string, "minutes": integer, "steps": [1 to 8 strings]},
  {"phase": "main", "title": string, "minutes": integer, "steps": [1 to 8 strings]},
  {"phase": "closing", "title": string, "minutes": integer, "steps": [1 to 8 strings]}],
"assessment": {"checks": [1 to 5 strings]}}
The three minutes must sum to the class duration exactly. Steps are concrete teacher actions.`;

const QUIZ_SHAPE = `Write a quiz as one JSON object:
{"title": string,
"mc": [N objects {"q": string, "choices": [exactly 4 strings], "answer": 0|1|2|3}],
"essay": [M objects {"q": string, "points": integer (4 unless told otherwise),
"rubric": [exactly 4 objects {"level": string, "points": integer, "desc": string},
from full marks down to the lowest]}]}
The answer index is 0 for choice A, 1 for B, 2 for C, 3 for D. Exactly one choice is correct, the distractors are plausible.`;

// How the prompts name each subject, so the model sees "civics" not "civ".
const SUBJECT_NAMES = {
  math: 'math', ela: 'English', sci: 'science', soc: 'social studies', art: 'arts',
  nat: 'national language', civ: 'civics', rel: 'religion', loc: 'local language',
};

// How the prompt names each curriculum; 'other' uses the typed name.
const CURRICULUM_NAMES = {
  merdeka: "Indonesia's Kurikulum Merdeka, using the Capaian Pembelajaran of the fase that fits the grade",
  ccss: 'the US Common Core State Standards',
  cambridge: 'the Cambridge curriculum (Primary, Lower Secondary or IGCSE as fits the grade)',
  ib: 'the International Baccalaureate (PYP, MYP or DP as fits the grade)',
};

function lessonPrompt(input) {
  const subject = input.subject === 'other' && input.subjectName
    ? input.subjectName
    : (SUBJECT_NAMES[input.subject] || input.subject);
  let text = `Write a ${input.durationMin}-minute lesson plan for grade ${input.grade} ${subject}, on the topic: ${input.topic}.
${LESSON_SHAPE}`;
  if (input.curriculum) {
    const name = input.curriculum === 'other' && input.curriculumName
      ? input.curriculumName
      : CURRICULUM_NAMES[input.curriculum];
    if (name) {
      text += `\nAlign the plan to ${name}. Add "standards": [1 to 3 strings], each the official code followed by a colon and the learning outcome it names, and add "aligned": string inside "assessment": one assessment idea that checks those standards. Use an official code only when you are sure it exists and matches; otherwise give the outcome wording without a code. Never invent a code.`;
    }
  }
  if (input.lessonBody) {
    text += `\nBuild on this existing lesson plan's objectives where they help:\n${JSON.stringify(input.lessonBody.objectives)}`;
  }
  return text;
}

function quizPrompt(input) {
  const subject = input.subject === 'other' && input.subjectName
    ? input.subjectName
    : (SUBJECT_NAMES[input.subject] || input.subject);
  let text = `Write a quiz for grade ${input.grade} ${subject} on the topic: ${input.topic}. ${input.mcCount} multiple-choice questions and ${input.essayCount} essay questions.
${QUIZ_SHAPE}`.replace('[N objects', `[${input.mcCount} objects`).replace('[M objects', `[${input.essayCount} objects`);
  if (input.lessonBody) {
    text += `\nBase it on this lesson plan's objectives and assessment:\n${JSON.stringify({ objectives: input.lessonBody.objectives, assessment: input.lessonBody.assessment })}`;
  }
  return text;
}

const READ_SYSTEM = `${RULES}
You read a photographed answer sheet for the quiz you are given. Read only what is written on the sheet: give null for a question left unanswered or too unclear to read, and set "clear": false whenever you are unsure of a mark. Place each essay answer on the given rubric with a one-line reason. Write two encouraging feedback sentences addressed to the student by name. Do not compute totals.`;

// Extracts the first top-level JSON object from a model reply.
function extractJson(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  // Fast path: a clean object with nothing after it.
  try { return JSON.parse(text.slice(start)); } catch {}
  // Slow path: balanced scan that skips string literals, then trailing prose.
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

// One Claude call through the proxy. Errors map to AiError codes the API
// surfaces as { code }.
async function callClaude(req, { system, content, image, maxTokens }) {
  if (!LLM_ENABLED) throw new AiError('ai_unavailable', 503);
  const messages = [{
    role: 'user',
    content: image
      ? [{ type: 'image', source: image }, { type: 'text', text: content }]
      : content,
  }];
  let resp;
  try {
    resp = await fetch(`${process.env.USERNODE_LLM_PROXY_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-usernode-app-token': process.env.USERNODE_LLM_PROXY_TOKEN,
        'x-usernode-user-token': req.headers['x-usernode-token'] || '',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages }),
      signal: AbortSignal.timeout(90000),
    });
  } catch {
    throw new AiError('ai_failed', 502);
  }
  if (resp.status === 403) throw new AiError('grant_required', 403);
  if (resp.status === 429) {
    let code = 'app_cap_exceeded';
    try {
      const body = await resp.json();
      if (body && (body.code === 'app_cap_exceeded' || body.code === 'budget_exceeded')) code = body.code;
    } catch {}
    throw new AiError(code, 429);
  }
  if (!resp.ok) throw new AiError('ai_failed', 502);
  const data = await resp.json().catch(() => { throw new AiError('ai_failed', 502); });
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  const json = extractJson(text);
  if (!json) throw new AiError('ai_failed', 502);
  if (json.declined === true) throw new AiError('declined', 422);
  return json;
}

module.exports = {
  LLM_ENABLED,
  AiError,
  RULES,
  callClaude,
  lessonPrompt,
  quizPrompt,
  READ_SYSTEM,
};
