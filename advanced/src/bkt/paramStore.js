'use strict';
const fs = require('fs');

const KEYS = ['pInit', 'pLearn', 'pSlip', 'pGuess', 'pForget'];

function validate(params, label) {
  for (const k of KEYS) {
    const v = params[k];
    if (typeof v !== 'number' || Number.isNaN(v) || v < 0 || v > 1) {
      throw new Error(`BKT params "${label}": ${k} must be a number in [0,1], got ${v}`);
    }
  }
  if (params.pSlip + params.pGuess >= 1) {
    throw new Error(`BKT params "${label}": pSlip + pGuess must be < 1`);
  }
  return params;
}

class ParamStore {
  constructor(data) {
    this.load(data);
  }

  load(data) {
    this.defaults = validate({ ...data.defaults }, 'default');
    this.bySkillCode = new Map();
    for (const [code, p] of Object.entries(data.skills || {})) {
      this.bySkillCode.set(code, validate({ ...this.defaults, ...p }, code));
    }
  }

  getParams(skillCode) {
    return this.bySkillCode.get(skillCode) || this.defaults;
  }

  static fromFile(file, fallbackDefaults) {
    let raw = {};
    if (file && fs.existsSync(file)) raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return new ParamStore({
      defaults: { ...fallbackDefaults, ...(raw.default || {}) },
      skills: raw.skills || {}
    });
  }
}

module.exports = { ParamStore };