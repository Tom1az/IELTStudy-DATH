'use strict';
const { clamp } = require('../utils/math');

/** PRNG có seed (mulberry32) -> kết quả mô phỏng tái lập được. */
function makeRng(seed) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.normal = () => {
    const u = Math.max(rng(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  };
  return rng;
}

// Micro-skill mẫu cho 4 kỹ năng IELTS (đổi/thêm tuỳ ý)
const SKILL_NAMES = {
  Listening: ['Listening: Main Idea', 'Listening: Detail Capture', 'Listening: Map Labelling', 'Listening: Distractors', 'Listening: Note Completion'],
  Reading: ['Reading: Skimming', 'Reading: True/False/Not Given', 'Reading: Matching Headings', 'Reading: Inference', 'Reading: Summary Completion'],
  Writing: ['Grammar: Inversion', 'Grammar: Conditionals Type 3', 'Vocab: Collocations', 'Cohesion: Linking Devices', 'Grammar: Passive Voice'],
  Speaking: ['Pronunciation: Word Stress', 'Fluency: Discourse Markers', 'Pronunciation: Intonation', 'Fluency: Self-correction', 'Vocab: Idiomatic Expressions']
};
const LEVELS = ['beginner', 'intermediate', 'advanced'];

function generateSkills() {
  const skills = [];
  let n = 1;
  for (const [category, names] of Object.entries(SKILL_NAMES)) {
    for (const description of names) {
      skills.push({
        id: `s${n++}`,
        skillCode: description.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, ''),
        skillCategory: category,
        description
      });
    }
  }
  return skills;
}

/** Mỗi level: 1 khoá; mỗi skill: 1 bài chính + 1 micro-lesson remedial. */
function generateCatalog(skills, rng) {
  const catalog = [];
  LEVELS.forEach((level, li) => {
    const courseId = `c${li + 1}`;
    const courseTitle = `IELTS ${level[0].toUpperCase()}${level.slice(1)}`;
    skills.forEach((skill, si) => {
      const make = (isRemedial) => {
        const links = [{ skillId: skill.id, weight: 1 }];
        const peers = skills.filter((s) => s.skillCategory === skill.skillCategory && s.id !== skill.id);
        if (rng() < 0.5) links.push({ skillId: peers[Math.floor(rng() * peers.length)].id, weight: 0.4 });
        return {
          id: `${isRemedial ? 'r' : 'l'}-${li + 1}-${si + 1}`,
          courseId, courseTitle, targetLevel: level,
          title: `${isRemedial ? 'Quick review' : 'Lesson'}: ${skill.description}`,
          orderIndex: isRemedial ? 1000 + si : si + 1,
          isRemedial, skills: links
        };
      };
      catalog.push(make(false), make(true));
    });
  });
  return catalog;
}

function generateLearners(skills, rng, count) {
  const learners = [];
  for (let i = 0; i < count; i++) {
    const ability = 0.3 + rng() * 0.5; // quần thể trung bình ~0.55 -> khoảng nửa số skill yếu
    const trueMastery = new Map(skills.map((s) => [s.id, clamp(ability + rng.normal() * 0.2, 0.03, 0.97)]));
    const targetBand = Math.round((5 + rng() * 3) * 2) / 2;
    learners.push({ id: `u${i + 1}`, targetBand, trueMastery });
  }
  return learners;
}

module.exports = { makeRng, generateSkills, generateCatalog, generateLearners, LEVELS };
