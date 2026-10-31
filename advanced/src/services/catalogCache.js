'use strict';

/**
 * In-memory TTL cache for the approved course/lesson catalog and skill taxonomy.
 * Set `ttlMs <= 0` in config to disable caching so newly approved courses appear immediately.
 */
function createCatalogCache(repository, ttlMs = 0) {
  let value = null;
  let expires = 0;
  let inflight = null;

  async function load() {
    const [catalog, skills] = await Promise.all([repository.getCatalog(), repository.getSkills()]);
    value = { catalog, skills };
    expires = ttlMs > 0 ? Date.now() + ttlMs : 0;
    return value;
  }

  return {
    async get() {
      if (ttlMs <= 0) {
        const [catalog, skills] = await Promise.all([repository.getCatalog(), repository.getSkills()]);
        return { catalog, skills };
      }
      if (value && Date.now() < expires) return value;
      if (!inflight) {
        inflight = load().finally(() => {
          inflight = null;
        });
      }
      return inflight;
    },
    invalidate() {
      value = null;
      expires = 0;
    }
  };
}

module.exports = { createCatalogCache };