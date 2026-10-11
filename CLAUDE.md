# TeachMate — notes for Claude Code

This app runs on **Homeroom**. If you're Claude Code
editing this repo, read the platform conventions before making
changes:

**Platform conventions (authoritative, always current):**
https://app.onhomeroom.com/claude.md

Fetch that URL at the start of each session — it's the single source
of truth for platform-wide behavior (auth model, `USERNODE_ENV`,
public/private tables, "don't `git push`", etc.). The hosted copy is
updated in place when platform rules change, so fetching it gives you
today's rules, not a stale snapshot.

When running inside Homeroom's dev-chat, those same conventions are
already injected into your system prompt, so the fetch is a no-op in
that path — but it's the right reflex when someone runs Claude Code
against this repo locally or from another harness.

## Connector permission prompts

This repo ships `.claude/settings.json`, which allows the **read-only**
Homeroom connector calls (`mcp__homeroom__get_*`,
`…__list_*`, `…__whoami`) so they stop prompting one at a time. Everything
that acts — filing a request, opening or advancing a proposal — still asks.
Claude Code applies those rules only after you accept the
workspace trust dialog, which lists them for review. See `.claude/README.md`
for the whole story, including what to do if you are still being prompted
(usually: your connector is registered under a different name than the rules
assume).

## Check that this checkout is current

You may be working in a fork of this app whose `main` is behind the app's
canonical repository, and nothing in the checkout says so: `git fetch origin`
compares the fork with itself. This matters before you **read** code to answer
a question about how the app behaves now, not only before you edit it.

The canonical repository is named in `.claude/homeroom-canonical-repo`. Check against
it, not against `origin`:

```sh
git fetch "$(cat .claude/homeroom-canonical-repo)" main
git merge-base --is-ancestor FETCH_HEAD HEAD && echo current || echo behind
```

`behind` means this checkout does not contain the canonical `main`. To answer
a question, read the canonical code instead (`git show FETCH_HEAD:<path>`,
`git grep <pattern> FETCH_HEAD`). To change code, start from the exact base
commit your Homeroom work order gives, and never merge or rebase onto the
canonical `main` yourself: which commit a change is diffed against decides
what the group votes on. With the Homeroom connector, `get_checkout_status`
answers the same question.

A session-start hook (`.claude/hooks/homeroom-freshness.sh`, see `.claude/README.md`) runs
this check for you and tells you when you are behind. It is silent offline, so
its silence is not proof the checkout is current. Inside Homeroom's dev-chat
the platform fixes the base commit, and none of this applies.

## Starter template

The screen this app currently ships — the "Starter template" hero with
the app's thumbnail tile and the plain-English note on how the app gets
built (by asking Homeroom bot) — is placeholder content from the
Homeroom starter template, not product intent.

When the user asks for their first real feature, REPLACE the template
screen rather than building alongside it:

- remove the `usernode-starter-notice@1` block in `public/index.html`
  (both sentinel comments and everything between them),
- rewrite `README.md` to describe the actual app.

Keep the `usernode-dev-console@1` forwarder `<script>` when rewriting the
HTML — that block is platform infrastructure, not template content. So is
the bridge `<script>`. The design kit is not placeholder either: build the
real app with it, and fill in "## Design" below.

The screen has a light and a dark look and follows the viewer's Homeroom
theme, switching live when they change it: the theme `<script>` right after
the bridge tag sets a `dark` class on `<html>`. Keep that script, and give
everything you build both looks (the design kit's colour tokens carry both), unless one
fixed look is the point of this app, like a game's own scene; then say so
under "## Design" below. Unless a request asks for one, add
no theme picker: the viewer's Homeroom setting is the control. "The
platform's light/dark theme inside the app frame" in the platform
conventions has the details.

If a rule below this line conflicts with the hosted conventions, the
hosted conventions win. This file is **app-specific** — write down
things about *this* app that belong in the repo: product intent,
data-model quirks, style preferences, opt-in policies (e.g. which
tables you've marked private), etc.

---

## About TeachMate

AI lesson plans, quizzes and grading for K-12 teachers. A teacher writes a
full lesson plan from subject, grade, topic and class length; writes quizzes
with an answer key and rubric; photographs a student's answer sheet and gets
AI-suggested marks with feedback (always teacher-confirmed before saving); and
sees class score summaries. Plans, quizzes and scores export as PDFs through
the browser's print dialog.

## Design

This app's look. Every change follows it, and updates it when a request
changes the look on purpose.

- **Palette:** warm grey neutrals; the one action colour is pencil yellow
  (`accent` 247 193 41, dark 250 204 21), always with graphite text on it,
  used only for the primary button and the selected tab. Red (`mark`) is the
  teacher's red pen: margin minutes, ticks and crosses, "Check this", circled
  answers on the answer key. Subject folder colours: math blue, English red,
  science green, social studies orange, arts purple, other grey (`subj-*`).
  The notebook sheet has its own paper/rule/redline tokens. Full table in the
  spec of the first build; values live in `styles/tailwind-input.css`.
- **Signature element:** the notebook sheet. Every lesson plan and quiz is
  shown on ruled paper: blue lines every 28 px, text sitting on the lines, a
  red margin line on the left, a coloured folder tab naming the subject above
  the sheet's top-left corner, and lesson timings written in red in the
  margin. The subject tiles carry the same clipped folder-tab corner.
- **Type scale:** `text-title`, `text-heading`, `text-body`, `text-small`.
  Headings and titles use the rounded system face (`fontFamily.display`,
  SF Pro Rounded on Apple devices); everything else the system sans. On the
  sheet, body text sits on the 28 px rules.
- **Logo:** the TeachMate mark (an orange graduation cap over a white open
  book on a deep blue rounded square: `brand/icon.svg`, flat version at
  `public/logo.svg`) is the favicon and sits in the header. The warm orange
  `secondary` token (`#C2410C` light / `#FB923C` dark) comes from its cap.
- Both looks follow the viewer's Homeroom theme and switch live; there is no
  theme picker. Printed PDFs always use the light look (the `@media print`
  block forces the light token values).

The kit is in `styles/tailwind-input.css`: colour tokens with a light and
a dark value (named in `tailwind.config.js`), and components (`btn-primary`,
`btn-secondary`, `field`, `list`/`list-row`, `card`, `section-label`,
`skeleton`, `state-empty`, `state-error`, plus this app's `tabs`/`tab`,
`chip`, `stepper`, `subj`, `sheet`, `sheet-flag`, `seg`).
Re-theme by changing the token values there, keeping every text pair at
4.5:1 or more in both looks.

- Colour comes only from the tokens: never a raw hex value or a stock
  palette class. The subject colours are set through the `s-*` classes'
  `--c` variable, never inline.
- Tap targets are at least 44 px; the buttons and fields already are.
- A field's label says what it is; its placeholder, if any, is an example
  that says so ("e.g. Period 3"), never a bare value that could pass for one
  already entered.
- Every screen that loads data has honest loading, empty and error states.
  Never show the empty state while loading or after a failure; an error says
  what failed, what still works, and offers Retry.
- Seed obviously fake staging demo data so the populated screen can be seen
  ("Staging mock data" in the platform conventions).
- No cards in cards, no uppercase eyebrows, no emoji as icons.

## App-specific conventions

- All three tables (`documents`, `gradings`, `demo_seeds`) are private
  (`COMMENT ON TABLE … IS 'staging:private'`). One teacher per account; every
  query is scoped to `user_id`.
- Scores are computed only by `lib/scoring.js`, server side. The server never
  trusts a client or model total.
- The demo rows (`is_demo = true`) are written once per account, only in
  staging and only on a `?demo=1` visit, and are never read by logic without
  it: every route filters `NOT is_demo` unless the request carries `demo=1`.
- AI output is stored only after it passes `lib/normalize.js`. A shape it
  can't repair is `ai_failed`, never a half-written plan.
- Essay questions are worth 4 points by default on a four-level rubric
  (Excellent 4, Good 3, Developing 2, Beginning 1, No answer 0). Multiple
  choice is 1 point each, four choices A to D.
- Changing a quiz's answer key later does not re-grade scores already saved;
  the editor says so.
- The AI suggests marks and the teacher confirms them; nothing is a score
  until Save score. Grading the same student twice for one quiz and class
  asks to replace.
- No class roster: classes and student names are typed, earlier class names
  suggested. All sample students are made-up alliterative names.
- Avoid adding new dependencies.
