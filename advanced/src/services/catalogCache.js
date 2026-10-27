'use strict';

/** Cache catalog bài học + skill trong bộ nhớ (TTL) để request không phải quét DB nặng. */
function createCatalogCache(repository, ttlMs) {
  let value = null;
  let expires = 0;
  let inflight = null;

  async function load() {
    const [catalog, skills] = await Promise.all([repository.getCatalog(), repository.getSkills()]);
    value = { catalog, skills };
    expires = Date.now() + ttlMs;
    return value;
  }

  return {
    async get() {
      if (value && Date.now() < expires) return value;
      if (!inflight) inflight = load().finally(() => { inflight = null; });
      return inflight;
    },
    invalidate() { value = null; expires = 0; }
  };
}

module.exports = { createCatalogCache };
