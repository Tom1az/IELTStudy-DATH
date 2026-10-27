const test = require('node:test');
const assert = require('node:assert');
const bkt = require('../src/services/bkt');
const { recommend, evaluateGate, needVector } = require('../src/services/recommender');
const { buildProgress } = require('../src/services/progressService');

const P = bkt.getParams('x');

test('BKT: đúng -> tăng, sai -> giảm, luôn trong (0,1)', () => {
  assert.ok(bkt.update(0.5, true, P) > 0.5);
  assert.ok(bkt.update(0.5, false, P) < bkt.update(0.5, true, P));
  for (const c of [true, false]) { const v = bkt.update(0.999, c, P); assert.ok(v > 0 && v < 1); }
});

test('BKT: chuỗi trả lời đúng hội tụ vượt 0.65', () => {
  let m = 0.3, n = 0;
  while (m < 0.65 && n < 50) { m = bkt.update(m, true, P); n++; }
  assert.ok(n <= 6, `cần ${n} câu`);
});

test('Multi-skill: skill phụ (weight thấp) thay đổi ít hơn skill chính', () => {
  const m = { a: 0.4, b: 0.4 };
  bkt.applyResponse(m, true, [{ skillId: 'a', weight: 1, params: P }, { skillId: 'b', weight: 0.3, params: P }]);
  assert.ok(m.a - 0.4 > m.b - 0.4 && m.b > 0.4);
});

test('Placement: cold-start tách được skill mạnh/yếu', () => {
  const sk = (id) => [{ skillId: id, weight: 1, params: P }];
  const rs = [];
  for (let i = 0; i < 4; i++) { rs.push({ correct: true, skills: sk('strong') }); rs.push({ correct: false, skills: sk('weak') }); }
  const m = bkt.initFromPlacement(rs);
  assert.ok(m.strong > 0.8 && m.weak < 0.2, JSON.stringify(m));
});

const lessons = [
  { id: 1, title: 'Cond type 3', level: 2, orderIndex: 1, completed: false, skills: [{ skillId: 'cond', code: 'Grammar: Conditionals', weight: 1 }] },
  { id: 2, title: 'Cond + Inversion', level: 2, orderIndex: 2, completed: false, skills: [{ skillId: 'cond', code: 'c', weight: 1 }, { skillId: 'inv', code: 'i', weight: 0.5 }] },
  { id: 3, title: 'Collocations', level: 2, orderIndex: 3, completed: false, skills: [{ skillId: 'col', code: 'Vocab: Collocations', weight: 1 }] },
  { id: 4, title: 'Skimming', level: 1, orderIndex: 4, completed: false, skills: [{ skillId: 'skim', code: 's', weight: 1 }] },
];

test('Recommender: ưu tiên lesson đúng skill yếu, rationale nêu ngưỡng 0.65', () => {
  const r = recommend({ mastery: { cond: 0.2, inv: 0.8, col: 0.9, skim: 0.9 }, lessons, k: 3 });
  assert.strictEqual(r.items[0].lessonId, 1);
  assert.match(r.items[0].rationale, /below 0\.65/);
  assert.ok(r.items.every((i) => i.type !== 'remedial' || i.targetSkills.length));
});

test('Recommender: không còn skill yếu -> next_module theo thứ tự', () => {
  const r = recommend({ mastery: { cond: 0.9, inv: 0.9, col: 0.9, skim: 0.9 }, lessons, k: 2 });
  assert.deepStrictEqual(r.items.map((i) => i.lessonId), [1, 2]);
  assert.ok(r.items.every((i) => i.type === 'next_module'));
});

test('Recommender: lesson đã học xong bị hạ hạng (review)', () => {
  const ls = lessons.map((l) => (l.id === 1 ? { ...l, completed: true } : l));
  const r = recommend({ mastery: { cond: 0.2, inv: 0.8, col: 0.9, skim: 0.9 }, lessons: ls, k: 2 });
  assert.strictEqual(r.items[0].lessonId, 2);
});

test('Gate: khoá khi còn skill < 0.65', () => {
  assert.deepStrictEqual(evaluateGate({ a: 0.5, b: 0.9 }, ['a', 'b']).blockingSkills, ['a']);
  assert.strictEqual(evaluateGate({ a: 0.7 }, ['a']).locked, false);
});

test('Latency: 5000 lesson x 60 skill < 300ms', () => {
  const skills = Array.from({ length: 60 }, (_, i) => 's' + i);
  const mastery = Object.fromEntries(skills.map((s, i) => [s, (i % 10) / 10]));
  const big = Array.from({ length: 5000 }, (_, i) => ({ id: i, title: 't', level: 1 + (i % 3), orderIndex: i, completed: false,
    skills: [{ skillId: skills[i % 60], weight: 1 }, { skillId: skills[(i * 7) % 60], weight: 0.5 }] }));
  const r = recommend({ mastery, lessons: big, k: 3 });
  assert.ok(r.latencyMs < 300, `latency ${r.latencyMs}ms`);
});

test('Progress: radar 4 kỹ năng + trend + weak list', () => {
  const now = new Date('2026-10-27');
  const p = buildProgress({
    skills: [
      { skillId: '1', code: 'a', category: 'Reading', mastery: 0.8 },
      { skillId: '2', code: 'b', category: 'Writing', mastery: 0.4 },
    ],
    history: [{ skillId: '2', mastery: 0.3, at: new Date('2026-10-25') }],
    lessons: { total: 10, completed: 4 }, now,
  });
  assert.strictEqual(p.radar.length, 4);
  assert.strictEqual(p.weakSkills[0].code, 'b');
  assert.strictEqual(p.skills[1].trend, 0.1);
  assert.strictEqual(p.completion.pct, 40);
});
