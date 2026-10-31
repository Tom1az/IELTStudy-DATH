'use strict';

function precisionAtK(recommendedIds, relevantIds, k = 3) {
  const topK = recommendedIds.slice(0, k);
  if (!topK.length) return 0;
  const relSet = new Set(relevantIds.map(String));
  let hits = 0;
  for (const id of topK) {
    if (relSet.has(String(id))) hits++;
  }
  return hits / topK.length;
}

function meanReciprocalRank(recommendedIds, relevantIds) {
  const relSet = new Set(relevantIds.map(String));
  for (let i = 0; i < recommendedIds.length; i++) {
    if (relSet.has(String(recommendedIds[i]))) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

function learningGain(preScore, postScore, maxScore = 30) {
  if (maxScore <= preScore) return 0;
  return (postScore - preScore) / (maxScore - preScore);
}

module.exports = { precisionAtK, meanReciprocalRank, learningGain };