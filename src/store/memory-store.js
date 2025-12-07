const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");

/**
 * Translation Memory Store
 * Stores previously translated strings to reduce API costs and ensure consistency
 */
class TranslationMemoryStore {
  constructor(storagePath = "./.polyglot/memory") {
    this.storagePath = storagePath;
    this.memory = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      saved: 0,
    };
  }

  /**
   * Initialize storage
   */
  async initialize() {
    try {
      await fs.mkdir(this.storagePath, { recursive: true });
      await this.loadFromDisk();
      console.log(
        "[TranslationMemory] Initialized with",
        this.memory.size,
        "entries"
      );
    } catch (error) {
      console.error("[TranslationMemory] Initialization error:", error.message);
    }
  }

  /**
   * Generate unique key for source-target pair
   */
  generateKey(sourceText, sourceLang, targetLang) {
    const normalized = sourceText.trim().toLowerCase();
    const hash = crypto
      .createHash("md5")
      .update(normalized)
      .digest("hex")
      .substring(0, 8);
    return `${sourceLang}-${targetLang}-${hash}`;
  }

  /**
   * Look up translation in memory
   */
  async lookup(sourceText, sourceLang, targetLang) {
    const key = this.generateKey(sourceText, sourceLang, targetLang);
    const entry = this.memory.get(key);

    if (entry) {
      // Check if entry matches exactly (not just hash)
      if (entry.source === sourceText.trim()) {
        this.stats.hits++;
        entry.lastUsed = Date.now();
        entry.useCount = (entry.useCount || 0) + 1;
        return entry;
      }
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Store translation in memory
   */
  async store(
    sourceText,
    translatedText,
    sourceLang,
    targetLang,
    metadata = {}
  ) {
    const key = this.generateKey(sourceText, sourceLang, targetLang);

    const entry = {
      source: sourceText.trim(),
      translation: translatedText,
      sourceLang,
      targetLang,
      timestamp: Date.now(),
      lastUsed: Date.now(),
      useCount: 1,
      verified: false,
      ...metadata,
    };

    this.memory.set(key, entry);
    this.stats.saved++;

    // Periodically save to disk
    if (this.stats.saved % 10 === 0) {
      await this.saveToDisk();
    }

    return entry;
  }

  /**
   * Batch lookup multiple strings
   */
  async batchLookup(strings, sourceLang, targetLang) {
    const results = new Map();
    const missing = [];

    for (const str of strings) {
      const entry = await this.lookup(str, sourceLang, targetLang);
      if (entry) {
        results.set(str, entry.translation);
      } else {
        missing.push(str);
      }
    }

    return { found: results, missing };
  }

  /**
   * Mark translation as verified
   */
  async verify(sourceText, sourceLang, targetLang) {
    const key = this.generateKey(sourceText, sourceLang, targetLang);
    const entry = this.memory.get(key);

    if (entry) {
      entry.verified = true;
      entry.verifiedAt = Date.now();
      await this.saveToDisk();
      return true;
    }

    return false;
  }

  /**
   * Update translation
   */
  async update(sourceText, newTranslation, sourceLang, targetLang) {
    const key = this.generateKey(sourceText, sourceLang, targetLang);
    const entry = this.memory.get(key);

    if (entry) {
      entry.translation = newTranslation;
      entry.updated = Date.now();
      await this.saveToDisk();
      return true;
    }

    return false;
  }

  /**
   * Get statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate =
      total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) : 0;

    return {
      totalEntries: this.memory.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: `${hitRate}%`,
      saved: this.stats.saved,
    };
  }

  /**
   * Clear all memory
   */
  async clear() {
    this.memory.clear();
    this.stats = { hits: 0, misses: 0, saved: 0 };
    await this.saveToDisk();
  }

  /**
   * Export memory to JSON
   */
  async export(outputPath) {
    const data = {
      version: "1.0",
      exportDate: new Date().toISOString(),
      entries: Array.from(this.memory.entries()).map(([key, value]) => ({
        key,
        ...value,
      })),
    };

    await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
    return data.entries.length;
  }

  /**
   * Import memory from JSON
   */
  async import(inputPath) {
    const content = await fs.readFile(inputPath, "utf-8");
    const data = JSON.parse(content);

    let imported = 0;
    for (const entry of data.entries) {
      const { key, ...value } = entry;
      this.memory.set(key, value);
      imported++;
    }

    await this.saveToDisk();
    return imported;
  }

  /**
   * Save memory to disk
   */
  async saveToDisk() {
    try {
      const filePath = path.join(this.storagePath, "memory.json");
      const data = {
        version: "1.0",
        lastSaved: new Date().toISOString(),
        stats: this.stats,
        entries: Array.from(this.memory.entries()),
      };

      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error("[TranslationMemory] Save error:", error.message);
    }
  }

  /**
   * Load memory from disk
   */
  async loadFromDisk() {
    try {
      const filePath = path.join(this.storagePath, "memory.json");
      const content = await fs.readFile(filePath, "utf-8");
      const data = JSON.parse(content);

      this.memory = new Map(data.entries);
      this.stats = data.stats || { hits: 0, misses: 0, saved: 0 };
    } catch (error) {
      // File doesn't exist yet, start fresh
      if (error.code !== "ENOENT") {
        console.error("[TranslationMemory] Load error:", error.message);
      }
    }
  }
}

module.exports = { TranslationMemoryStore };
