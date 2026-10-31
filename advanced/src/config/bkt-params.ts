export type BktSkillParams = {
  pInit: number;
  pLearn: number;
  pSlip: number;
  pGuess: number;
  pForget: number;
};

export const MASTERY_THRESHOLD = 0.65;
export const PROB_MIN = 0.01;
export const PROB_MAX = 0.99;

export const DEFAULT_BKT_PARAMS: BktSkillParams = {
  pInit: 0.30,
  pLearn: 0.15,
  pSlip: 0.10,
  pGuess: 0.25,
  pForget: 0.0,
};

export const SEED_SKILL_CODES: Array<{ code: string; name: string; category: "listening" | "reading" | "writing" | "speaking" }> = [
  { code: "L_FORM_COMPLETION", name: "Form and note completion", category: "listening" },
  { code: "L_SPECIFIC_DETAIL", name: "Listening for specific detail", category: "listening" },
  { code: "L_MAP_LABELLING", name: "Map and plan labelling", category: "listening" },
  { code: "L_GIST", name: "Main idea and speaker purpose", category: "listening" },
  { code: "L_DISTRACTORS", name: "Handling distractors", category: "listening" },
  { code: "R_SKIM_HEADINGS", name: "Skimming for headings", category: "reading" },
  { code: "R_SCAN_DETAIL", name: "Scanning for detail", category: "reading" },
  { code: "R_TFNG", name: "True / False / Not Given", category: "reading" },
  { code: "R_INFERENCE", name: "Inference and writer's view", category: "reading" },
  { code: "R_VOCAB_CONTEXT", name: "Vocabulary in context", category: "reading" },
  { code: "W_TENSES", name: "Grammar: tenses and agreement", category: "writing" },
  { code: "W_CONDITIONALS", name: "Grammar: conditionals", category: "writing" },
  { code: "W_INVERSION", name: "Grammar: inversion", category: "writing" },
  { code: "W_COHESION", name: "Cohesion and linking devices", category: "writing" },
  { code: "W_COLLOCATIONS", name: "Vocabulary: collocations", category: "writing" },
  { code: "S_WORD_STRESS", name: "Pronunciation: word stress", category: "speaking" },
  { code: "S_SOUNDS", name: "Pronunciation: individual sounds", category: "speaking" },
  { code: "S_INTONATION", name: "Intonation and sentence stress", category: "speaking" },
  { code: "S_DISCOURSE_MARKERS", name: "Fluency: discourse markers", category: "speaking" },
  { code: "S_LEXICAL_RANGE", name: "Lexical resource", category: "speaking" },
];

export const SKILL_BKT_OVERRIDES: Record<string, Partial<BktSkillParams>> = {
  L_FORM_COMPLETION: { pInit: 0.35, pLearn: 0.18, pSlip: 0.08, pGuess: 0.20 },
  L_SPECIFIC_DETAIL: { pInit: 0.32, pLearn: 0.16, pSlip: 0.10, pGuess: 0.25 },
  L_MAP_LABELLING: { pInit: 0.30, pLearn: 0.15, pSlip: 0.10, pGuess: 0.25 },
  L_GIST: { pInit: 0.33, pLearn: 0.15, pSlip: 0.09, pGuess: 0.25 },
  L_DISTRACTORS: { pInit: 0.25, pLearn: 0.14, pSlip: 0.12, pGuess: 0.25 },

  R_SKIM_HEADINGS: { pInit: 0.30, pLearn: 0.15, pSlip: 0.10, pGuess: 0.20 },
  R_SCAN_DETAIL: { pInit: 0.35, pLearn: 0.18, pSlip: 0.08, pGuess: 0.25 },
  R_TFNG: { pInit: 0.28, pLearn: 0.14, pSlip: 0.11, pGuess: 0.33 },
  R_INFERENCE: { pInit: 0.25, pLearn: 0.12, pSlip: 0.12, pGuess: 0.25 },
  R_VOCAB_CONTEXT: { pInit: 0.30, pLearn: 0.15, pSlip: 0.10, pGuess: 0.25 },

  W_TENSES: { pInit: 0.32, pLearn: 0.16, pSlip: 0.10, pGuess: 0.25 },
  W_CONDITIONALS: { pInit: 0.28, pLearn: 0.15, pSlip: 0.10, pGuess: 0.25 },
  W_INVERSION: { pInit: 0.22, pLearn: 0.12, pSlip: 0.12, pGuess: 0.25 },
  W_COHESION: { pInit: 0.30, pLearn: 0.16, pSlip: 0.09, pGuess: 0.25 },
  W_COLLOCATIONS: { pInit: 0.28, pLearn: 0.15, pSlip: 0.10, pGuess: 0.25 },

  S_WORD_STRESS: { pInit: 0.32, pLearn: 0.16, pSlip: 0.10, pGuess: 0.25 },
  S_SOUNDS: { pInit: 0.30, pLearn: 0.15, pSlip: 0.10, pGuess: 0.25 },
  S_INTONATION: { pInit: 0.28, pLearn: 0.14, pSlip: 0.10, pGuess: 0.25 },
  S_DISCOURSE_MARKERS: { pInit: 0.30, pLearn: 0.16, pSlip: 0.09, pGuess: 0.25 },
  S_LEXICAL_RANGE: { pInit: 0.25, pLearn: 0.13, pSlip: 0.11, pGuess: 0.25 },
};

export const getBktParams = (skillCode: string): BktSkillParams => {
  const override = SKILL_BKT_OVERRIDES[skillCode];
  if (!override) return DEFAULT_BKT_PARAMS;
  return { ...DEFAULT_BKT_PARAMS, ...override };
};
