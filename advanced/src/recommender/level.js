'use strict';

const LEVEL_ORDER = ['beginner', 'intermediate', 'advanced'];

/** target_band -> tên level (theo config.levels). Không có band -> intermediate. */
function levelFromBand(targetBand, levels) {
  if (targetBand == null) return 'intermediate';
  const band = Number(targetBand);
  for (const l of levels) if (band < l.maxBandExclusive) return l.name;
  return levels[levels.length - 1].name;
}

/** 1 nếu cùng level, 0.5 nếu lệch 1 bậc, 0 nếu lệch xa hơn. */
function levelFit(lessonLevel, userLevel) {
  const a = LEVEL_ORDER.indexOf(String(lessonLevel || '').toLowerCase());
  const b = LEVEL_ORDER.indexOf(userLevel);
  if (a < 0 || b < 0) return 0.5;
  const d = Math.abs(a - b);
  return d === 0 ? 1 : d === 1 ? 0.5 : 0;
}

module.exports = { LEVEL_ORDER, levelFromBand, levelFit };
