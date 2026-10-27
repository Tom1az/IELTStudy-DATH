'use strict';

/**
 * Câu giải thích hiển thị cho người học (Dashboard & Post-Quiz).
 * Sửa câu chữ ở đây, không ảnh hưởng thuật toán.
 */
function skillLabel(skill) {
  return skill.description || skill.skillCode || skill.id;
}

function buildRationale({ kind, matchedSkills, threshold, lesson }) {
  if (kind === 'remedial' && matchedSkills.length) {
    const top = matchedSkills[0];
    const extra = matchedSkills.length > 1 ? ` (+${matchedSkills.length - 1} related skill${matchedSkills.length > 2 ? 's' : ''})` : '';
    return `Recommended because latent mastery on '${top.label}' is below ${threshold}${extra}`;
  }
  return `Next step in your course '${lesson.courseTitle}'`;
}

module.exports = { skillLabel, buildRationale };
