// Per-skill BKT parameters, fitted offline with pyBKT (ml/fit_bkt.py) and copied to
// config/bkt-params.json. A skill missing from the file uses the file's defaults.
import fitted from "../config/bkt-params.json" with { type: "json" };

export type BktSkillParams = {
  pInit: number;
  pLearn: number;
  pSlip: number;
  pGuess: number;
  pForget: number;
};

// A skill below this mastery is "weak": it gets recommendations and doesn't open the next lesson
export const MASTERY_THRESHOLD = 0.65;
// Mastery never reaches 0 or 1, so one answer can always move it
export const PROB_MIN = 0.01;
export const PROB_MAX = 0.99;

type FittedFile = {
  defaults: Partial<BktSkillParams>;
  skills: Record<string, Partial<BktSkillParams>>;
};

const file = fitted as FittedFile;

export const DEFAULT_BKT_PARAMS: BktSkillParams = {
  pInit: 0.3,
  pLearn: 0.15,
  pSlip: 0.1,
  pGuess: 0.25,
  pForget: 0,
  ...file.defaults,
};

export const getBktParams = (skillCode: string): BktSkillParams => ({
  ...DEFAULT_BKT_PARAMS,
  ...file.skills[skillCode],
});

// The skill codes the parameters were fitted for, in file order (used by the evaluation)
export const FITTED_SKILL_CODES = Object.keys(file.skills);
