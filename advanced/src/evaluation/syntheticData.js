'use strict';

/**
 * Generates synthetic skill taxonomy, catalog, and learners for simulation and testing.
 * Uses integer IDs for skills and lessons.
 */
function makeRng(seed = 42) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function generateSkills() {
  const categories = ['listening', 'reading', 'writing', 'speaking'];
  const skills = [];
  let id = 1;
  for (const cat of categories) {
    for (let i = 1; i <= 5; i++) {
      skills.push({
        skillId: id,
        id: id,
        skillCode: `${cat.toUpperCase()}_SKILL_${i}`,
        name: `${cat.charAt(0).toUpperCase() + cat.slice(1)} Skill ${i}`,
        category: cat,
        skillCategory: cat,
        description: `Synthetic skill ${i} in ${cat}`
      });
      id++;
    }
  }
  return skills;
}

function generateCatalog(skills, rng) {
  const catalog = [];
  let lessonId = 1;
  const levels = ['beginner', 'intermediate', 'advanced'];

  for (let c = 1; c <= 3; c++) {
    const courseId = c;
    const targetLevel = levels[c - 1];
    const courseSkills = skills.slice((c - 1) * 5, c * 5);

    // Core lessons
    for (let i = 0; i < 4; i++) {
      const assignedSkill = courseSkills[i % courseSkills.length];
      catalog.push({
        lessonId: lessonId++,
        courseId: courseId,
        courseTitle: `Course ${c} (${targetLevel})`,
        targetLevel: targetLevel,
        title: `Core Lesson ${i + 1}`,
        kind: 'core',
        isRemedial: false,
        orderIndex: i,
        skills: [{ skillId: assignedSkill.skillId, weight: 1.0 }]
      });
    }

    // Remedial lessons (targeting weak skills specifically)
    for (let i = 0; i < courseSkills.length; i++) {
      const assignedSkill = courseSkills[i];
      catalog.push({
        lessonId: lessonId++,
        courseId: courseId,
        courseTitle: `Course ${c} (${targetLevel})`,
        targetLevel: targetLevel,
        title: `Remedial Module: ${assignedSkill.name}`,
        kind: 'remedial',
        isRemedial: true,
        orderIndex: 10 + i,
        skills: [{ skillId: assignedSkill.skillId, weight: 1.0 }]
      });
    }
  }
  return catalog;
}

function generateLearners(skills, rng, count = 10) {
  const learners = [];
  for (let i = 1; i <= count; i++) {
    const trueMastery = new Map();
    for (const s of skills) {
      // Initial synthetic true mastery between 0.2 and 0.8
      trueMastery.set(s.skillId, 0.2 + rng() * 0.6);
    }
    learners.push({
      userId: i,
      targetBand: 5.5 + Math.floor(rng() * 3) * 0.5,
      trueMastery
    });
  }
  return learners;
}

module.exports = { makeRng, generateSkills, generateCatalog, generateLearners };