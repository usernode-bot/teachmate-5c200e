// Entry point: the shell first, then the tab modules (which register their
// routes), then the first render.

import { render } from './app.js';
import './lessons.js';
import './quizzes.js';
import './grade.js';
import './scores.js';

window.addEventListener('hashchange', render);
render();