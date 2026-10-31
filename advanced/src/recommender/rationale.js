'use strict';
const { round } = require('../utils/math');

/** Always use skills.name as the human-readable label. */
function skillLabel(skill) {
  if (!skill) return '';
  return skill.name || skill.skillCode || String(skill.skillId ?? skill.id ?? '');
}

function buildRationale({ matchedSkills, threshold }) {
  const top = matchedSkills[0];
  if (!top) return '';
  return `Recommended because your mastery of '${top.name}' is ${round(top.mastery, 2)}, below ${threshold}.`;
}

module.exports = { skillLabel, buildRationale };