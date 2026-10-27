'use strict';
const { createConfig } = require('../src/config');
const { ParamStore } = require('../src/bkt/paramStore');

const config = createConfig();
const paramStore = new ParamStore({ defaults: config.bkt.defaults });

const skills = [
  { id: 's1', skillCode: 'GRAM_COND3', skillCategory: 'Writing', description: 'Conditionals Type 3' },
  { id: 's2', skillCode: 'VOCAB_COLL', skillCategory: 'Writing', description: 'Collocations' },
  { id: 's3', skillCode: 'LIS_MAIN', skillCategory: 'Listening', description: 'Main Idea' }
];
const skillsById = new Map(skills.map((s) => [s.id, s]));

const lesson = (id, order, skillIds, extra = {}) => ({
  id, courseId: 'c1', courseTitle: 'Intermediate', targetLevel: 'intermediate',
  title: `Lesson ${id}`, orderIndex: order, isRemedial: false,
  skills: skillIds.map((s) => ({ skillId: s, weight: 1 })), ...extra
});

module.exports = { config, paramStore, skills, skillsById, lesson };
