'use strict';

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round = (x, digits = 4) => {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
};

/** Cosine similarity giữa hai Map<key, number>. Trả 0 nếu một vector rỗng. */
function cosine(a, b) {
  if (!a.size || !b.size) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, va] of a) {
    na += va * va;
    const vb = b.get(k);
    if (vb !== undefined) dot += va * vb;
  }
  for (const vb of b.values()) nb += vb * vb;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

module.exports = { clamp, round, cosine, mean };
