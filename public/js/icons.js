// SVG icon strings and the subject map. Class names are written as whole
// literals so Tailwind's extractor sees them.

const svg = (inner, cls = 'h-6 w-6') =>
  `<svg viewBox="0 0 24 24" class="${cls}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const ICONS = {
  search: svg('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>', 'h-5 w-5'),
  back: svg('<path d="M15 5l-7 7 7 7"/>', 'h-5 w-5'),
  more: svg('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'),
  print: svg('<path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="7" y="14" width="10" height="7"/>', 'h-5 w-5'),
  list: svg('<path d="M10 6h10M10 12h10M10 18h10M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17"/>', 'h-5 w-5'),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 'h-5 w-5'),
  minus: svg('<path d="M5 12h14"/>', 'h-5 w-5'),
  chevron: svg('<path d="M6 9l6 6 6-6"/>', 'h-5 w-5'),
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>', 'h-5 w-5'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>', 'h-5 w-5'),
  share: svg('<path d="M12 15V4M8 8l4-4 4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>', 'h-5 w-5'),
  pencil: svg('<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z"/>', 'h-5 w-5'),
};

const SUBJ_ICONS = {
  math: svg('<path d="M4 7h6M7 4v6M14 7h6M15 15l4 4M19 15l-4 4M4 17h6"/>', 'h-6 w-6'),
  ela: svg('<path d="M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3z"/><path d="M21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z"/>', 'h-6 w-6'),
  sci: svg('<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3M7.5 15h9"/>', 'h-6 w-6'),
  soc: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>', 'h-6 w-6'),
  art: svg('<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-2 0-1.6-1.5-2-1.5-3s.8-1.5 2-1.5H17a4 4 0 0 0 4-4c0-4.1-4-7.5-9-7.5z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>', 'h-6 w-6'),
  nat: svg('<path d="M20 4H4v11h5v4l4-4h7z"/>', 'h-6 w-6'),
  civ: svg('<path d="M5 21V4M5 4h12l-3 4 3 4H5"/>', 'h-6 w-6'),
  rel: svg('<path d="M12 2a2 2 0 0 1 2 2c0 1-1 2-2 2s-2-1-2-2a2 2 0 0 1 2-2zM9 21v-7a3 3 0 0 1 6 0v7M7 21h10"/>', 'h-6 w-6'),
  loc: svg('<rect x="9" y="3" width="12" height="8" rx="2"/><path d="M15 9H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2v3l3-3h6a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2z"/>', 'h-6 w-6'),
  other: svg('<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z"/>', 'h-6 w-6'),
};

// Each subject: its label, its icon and its colour class as a whole literal.
export const SUBJECTS = {
  math: { label: 'Math', cls: 's-math', icon: SUBJ_ICONS.math },
  ela: { label: 'English', cls: 's-ela', icon: SUBJ_ICONS.ela },
  sci: { label: 'Science', cls: 's-sci', icon: SUBJ_ICONS.sci },
  soc: { label: 'Social studies', cls: 's-soc', icon: SUBJ_ICONS.soc },
  art: { label: 'Arts', cls: 's-art', icon: SUBJ_ICONS.art },
  nat: { label: 'National language', cls: 's-other', icon: SUBJ_ICONS.nat },
  civ: { label: 'Civics', cls: 's-other', icon: SUBJ_ICONS.civ },
  rel: { label: 'Religion', cls: 's-other', icon: SUBJ_ICONS.rel },
  loc: { label: 'Local language', cls: 's-other', icon: SUBJ_ICONS.loc },
  other: { label: 'Other', cls: 's-other', icon: SUBJ_ICONS.other },
};

export const GRADE_OPTIONS = ['Kindergarten', ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`)];
export const gradeLabel = g => (g === 'K' ? 'Kindergarten' : `Grade ${g}`);

// What a row or sheet calls the subject: a typed name for Other.
export function subjectLabel(doc) {
  return doc.subject === 'other' && doc.subject_name ? doc.subject_name : (SUBJECTS[doc.subject] || SUBJECTS.other).label;
}

// The curriculum dropdown, in display order; 'general' writes plans the way
// the app always has and is stored as NULL.
export const CURRICULA = {
  general: 'General',
  merdeka: 'Kurikulum Merdeka',
  k13: 'K13 (Kurikulum 2013)',
  ccss: 'Common Core',
  cambridge: 'Cambridge',
  ib: 'IB',
  other: 'Other',
};

// What a sheet's meta line calls the curriculum: the typed name for Other,
// the label for a known key, and '' for General, NULL or an unknown value.
export function curriculumLabel(doc) {
  if (!doc.curriculum) return '';
  if (doc.curriculum === 'other') return doc.curriculum_name || '';
  return CURRICULA[doc.curriculum] || '';
}

// The subject tile: the coloured folder square with the subject's icon.
export function subjectTile(doc, cls = '') {
  const s = SUBJECTS[doc.subject] || SUBJECTS.other;
  return `<span class="subj ${s.cls} ${cls}">${s.icon}</span>`;
}
