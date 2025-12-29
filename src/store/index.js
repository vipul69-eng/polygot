const fs = require("fs");
const path = require("path");

const POLYGOT_DIR = path.join(process.cwd(), ".polygot");
const STORE_PATH = path.join(POLYGOT_DIR, "store.json");

/**
 * Ensure .polygot/store.json exists
 */
function ensureStore() {
  if (!fs.existsSync(POLYGOT_DIR)) {
    fs.mkdirSync(POLYGOT_DIR);
  }

  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify({}, null, 2));
  }
}

/**
 * Load global store
 */
function loadGlobalStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

/**
 * Save global store
 */
function saveGlobalStore(store) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

/**
 * Get cached translations
 */
function getCachedTranslations(language, strings) {
  const store = loadGlobalStore();
  const langStore = store[language] || {};

  const cached = {};
  const missing = [];

  for (const str of strings) {
    if (langStore[str]) {
      cached[str] = langStore[str];
    } else {
      missing.push(str);
    }
  }

  return { cached, missing };
}

/**
 * Update store with new translations
 */
function updateGlobalStore(language, translations) {
  const store = loadGlobalStore();

  store[language] = {
    ...(store[language] || {}),
    ...translations,
  };

  saveGlobalStore(store);
}

module.exports = {
  getCachedTranslations,
  updateGlobalStore,
};
