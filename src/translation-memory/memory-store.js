const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");

/**
 * Translation Memory Store
 * Caches translations to reduce API costs and ensure consistency
 */
class TranslationMemoryStore {
  constructor(storagePath = "./.polygot/memory") {
    this.storagePath = storagePath;
    this.cache = new Map(); // Map<string, TranslationEntry>
    this.metadata = {
      version: "1.0.0",
      created: null,
      lastModified: null,
      totalEntries: 0,
    };
    this.stats = {
      hits: 0,
      misses: 0,
      additions: 0,
    };
  }

  /**
   * Initialize the memory store
   */
  async initialize() {
    try {
      // Create storage directory
      await fs.mkdir(this.storagePath, { recursive: true });

      // Load existing memory
      await this.load();

      console.log(
        `[Memory] Initialized with ${this.cache.size} cached translations`
      );
    } catch (error) {
      console.error("[Memory] Initialization error:", error.message);
      throw error;
    }
  }

  /**
   * Generate cache key from source text and language pair
   */
  _generateKey(sourceText, sourceLang, targetLang) {
    // Normalize text (trim, lowercase for comparison)
    const normalized = sourceText.trim();

    // Create a unique key: sourceLang-targetLang-hash
    const hash = crypto
      .createHash("sha256")
      .update(normalized)
      .digest("hex")
      .substring(0, 16);

    return `${sourceLang}:${targetLang}:${hash}`;
  }

  /**
   * Look up a translation in the cache
   *
   * @param {string} sourceText - Original text
   * @param {string} sourceLang - Source language code
   * @param {string} targetLang - Target language code
   * @returns {string|null} Cached translation or null
   */
  async get(sourceText, sourceLang, targetLang) {
    const key = this._generateKey(sourceText, sourceLang, targetLang);
    const entry = this.cache.get(key);

    if (entry && entry.sourceText === sourceText.trim()) {
      // Update usage statistics
      entry.lastUsed = Date.now();
      entry.useCount++;
      this.stats.hits++;

      return entry.translation;
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Store a translation in the cache
   *
   * @param {string} sourceText - Original text
   * @param {string} translation - Translated text
   * @param {string} sourceLang - Source language code
   * @param {string} targetLang - Target language code
   * @param {Object} options - Additional metadata
   */
  async set(sourceText, translation, sourceLang, targetLang, options = {}) {
    const key = this._generateKey(sourceText, sourceLang, targetLang);

    const entry = {
      sourceText: sourceText.trim(),
      translation: translation.trim(),
      sourceLang,
      targetLang,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      useCount: 1,
      metadata: {
        model: options.model || null,
        context: options.context || null,
        tone: options.tone || null,
        verified: options.verified || false,
      },
    };

    this.cache.set(key, entry);
    this.stats.additions++;
    this.metadata.lastModified = Date.now();
    this.metadata.totalEntries = this.cache.size;

    // Auto-save every 50 additions
    if (this.stats.additions % 50 === 0) {
      await this.save();
    }
  }

  /**
   * Batch lookup multiple strings
   *
   * @param {string[]} sourceTexts - Array of source texts
   * @param {string} sourceLang - Source language code
   * @param {string} targetLang - Target language code
   * @returns {Object} { found: Map<string, string>, missing: string[] }
   */
  async batchGet(sourceTexts, sourceLang, targetLang) {
    const found = new Map();
    const missing = [];

    for (const text of sourceTexts) {
      const translation = await this.get(text, sourceLang, targetLang);

      if (translation) {
        found.set(text, translation);
      } else {
        missing.push(text);
      }
    }

    return { found, missing };
  }

  /**
   * Batch store multiple translations
   *
   * @param {Object} translations - Map of source text to translation
   * @param {string} sourceLang - Source language code
   * @param {string} targetLang - Target language code
   * @param {Object} options - Additional metadata
   */
  async batchSet(translations, sourceLang, targetLang, options = {}) {
    const promises = Object.entries(translations).map(([source, target]) =>
      this.set(source, target, sourceLang, targetLang, options)
    );

    await Promise.all(promises);
  }

  /**
   * Mark a translation as verified
   */
  async verify(sourceText, sourceLang, targetLang) {
    const key = this._generateKey(sourceText, sourceLang, targetLang);
    const entry = this.cache.get(key);

    if (entry) {
      entry.metadata.verified = true;
      entry.metadata.verifiedAt = Date.now();
      await this.save();
      return true;
    }

    return false;
  }

  /**
   * Update an existing translation
   */
  async update(sourceText, newTranslation, sourceLang, targetLang) {
    const key = this._generateKey(sourceText, sourceLang, targetLang);
    const entry = this.cache.get(key);

    if (entry) {
      entry.translation = newTranslation.trim();
      entry.metadata.updated = true;
      entry.metadata.updatedAt = Date.now();
      await this.save();
      return true;
    }

    return false;
  }

  /**
   * Delete a translation
   */
  async delete(sourceText, sourceLang, targetLang) {
    const key = this._generateKey(sourceText, sourceLang, targetLang);
    const deleted = this.cache.delete(key);

    if (deleted) {
      this.metadata.totalEntries = this.cache.size;
      await this.save();
    }

    return deleted;
  }

  /**
   * Clear all cached translations
   */
  async clear() {
    this.cache.clear();
    this.metadata.totalEntries = 0;
    this.metadata.lastModified = Date.now();
    this.stats = { hits: 0, misses: 0, additions: 0 };
    await this.save();
  }

  /**
   * Get statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate =
      total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) : "0.00";

    return {
      totalEntries: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: `${hitRate}%`,
      additions: this.stats.additions,
      estimatedSavings: this.stats.hits, // Each hit = 1 API call saved
    };
  }

  /**
   * Save memory to disk
   */
  async save() {
    try {
      const filePath = path.join(this.storagePath, "memory.json");

      const data = {
        metadata: {
          ...this.metadata,
          lastModified: Date.now(),
          totalEntries: this.cache.size,
        },
        stats: this.stats,
        entries: Array.from(this.cache.entries()).map(([key, value]) => ({
          key,
          ...value,
        })),
      };

      await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
      console.error("[Memory] Save error:", error.message);
      throw error;
    }
  }

  /**
   * Load memory from disk
   */
  async load() {
    try {
      const filePath = path.join(this.storagePath, "memory.json");
      const content = await fs.readFile(filePath, "utf-8");
      const data = JSON.parse(content);

      // Restore metadata
      this.metadata = data.metadata || this.metadata;
      this.stats = data.stats || this.stats;

      // Restore cache entries
      if (data.entries && Array.isArray(data.entries)) {
        for (const entry of data.entries) {
          const { key, ...value } = entry;
          this.cache.set(key, value);
        }
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        // File doesn't exist - first run
        this.metadata.created = Date.now();
        await this.save();
      } else {
        console.error("[Memory] Load error:", error.message);
      }
    }
  }

  /**
   * Export memory to JSON file
   */
  async export(outputPath) {
    try {
      const data = {
        version: this.metadata.version,
        exportedAt: new Date().toISOString(),
        totalEntries: this.cache.size,
        entries: Array.from(this.cache.values()).map((entry) => ({
          source: entry.sourceText,
          translation: entry.translation,
          sourceLang: entry.sourceLang,
          targetLang: entry.targetLang,
          useCount: entry.useCount,
          verified: entry.metadata.verified,
        })),
      };

      await fs.writeFile(outputPath, JSON.stringify(data, null, 2), "utf-8");
      return data.entries.length;
    } catch (error) {
      console.error("[Memory] Export error:", error.message);
      throw error;
    }
  }

  /**
   * Import memory from JSON file
   */
  async import(inputPath) {
    try {
      const content = await fs.readFile(inputPath, "utf-8");
      const data = JSON.parse(content);

      let imported = 0;

      if (data.entries && Array.isArray(data.entries)) {
        for (const entry of data.entries) {
          await this.set(
            entry.source,
            entry.translation,
            entry.sourceLang,
            entry.targetLang,
            { verified: entry.verified || false }
          );
          imported++;
        }
      }

      await this.save();
      return imported;
    } catch (error) {
      console.error("[Memory] Import error:", error.message);
      throw error;
    }
  }

  /**
   * Get all translations for a language pair
   */
  getByLanguagePair(sourceLang, targetLang) {
    const results = [];

    for (const entry of this.cache.values()) {
      if (entry.sourceLang === sourceLang && entry.targetLang === targetLang) {
        results.push({
          source: entry.sourceText,
          translation: entry.translation,
          useCount: entry.useCount,
          verified: entry.metadata.verified,
        });
      }
    }

    return results;
  }

  /**
   * Get most frequently used translations
   */
  getMostUsed(limit = 10) {
    const entries = Array.from(this.cache.values())
      .sort((a, b) => b.useCount - a.useCount)
      .slice(0, limit);

    return entries.map((entry) => ({
      source: entry.sourceText,
      translation: entry.translation,
      useCount: entry.useCount,
      languages: `${entry.sourceLang} → ${entry.targetLang}`,
    }));
  }
}

module.exports = { TranslationMemoryStore };
