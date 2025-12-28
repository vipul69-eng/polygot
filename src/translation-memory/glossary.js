const fs = require("fs").promises;
const path = require("path");

/**
 * Glossary Manager - Optimized Version
 * Pre-filters and replaces glossary terms to avoid bloating prompts
 */
class GlossaryManager {
  constructor(glossaryPath = "./.polygot/glossary.json") {
    this.glossaryPath = glossaryPath;
    this.terms = new Map();
    this.metadata = {
      version: "1.0.0",
      created: null,
      lastModified: null,
    };
  }

  async initialize() {
    try {
      const dir = path.dirname(this.glossaryPath);
      await fs.mkdir(dir, { recursive: true });
      await this.load();
      console.log(`[Glossary] Initialized with ${this.terms.size} terms`);
    } catch (error) {
      console.error("[Glossary] Initialization error:", error.message);
      throw error;
    }
  }

  /**
   * Add a term to the glossary
   */
  async add(term, translations = {}, options = {}) {
    const normalizedTerm = term.trim();
    const key = this._generateKey(normalizedTerm, options.caseSensitive);

    const entry = {
      term: normalizedTerm,
      translations: translations,
      category: options.category || "general",
      description: options.description || "",
      caseSensitive: options.caseSensitive !== false,
      doNotTranslate: options.doNotTranslate || false,
      context: options.context || "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.terms.set(key, entry);
    this.metadata.lastModified = Date.now();
    await this.save();

    return entry;
  }

  /**
   * Get a term from the glossary
   */
  get(term, caseSensitive = true) {
    const key = this._generateKey(term, caseSensitive);
    return this.terms.get(key) || null;
  }

  /**
   * Pre-process strings BEFORE sending to translation API
   * Replaces glossary terms with placeholders
   *
   * @param {string[]} strings - Array of strings to process
   * @param {string} targetLang - Target language code
   * @returns {Object} { processed: string[], glossaryMap: Map }
   */
  preprocessStrings(strings, targetLang) {
    const processed = [];
    const glossaryMap = new Map(); // Maps placeholder to original term and translation
    let placeholderIndex = 0;

    for (const str of strings) {
      let processedStr = str;
      const termsInString = [];

      // Find all glossary terms in this string
      const foundTerms = this.findInText(str);

      // Sort by position (reverse order) to replace from end to start
      foundTerms.sort((a, b) => b.position - a.position);

      for (const found of foundTerms) {
        const entry = found.entry;

        // Check if we should handle this term
        if (entry.doNotTranslate || entry.translations[targetLang]) {
          // Generate a unique placeholder
          const placeholder = `__GLOSSARY_${placeholderIndex}__`;
          placeholderIndex++;

          // Store the mapping
          glossaryMap.set(placeholder, {
            original: found.matchedText,
            term: entry.term,
            translation: entry.doNotTranslate
              ? entry.term
              : entry.translations[targetLang],
            position: found.position,
            caseSensitive: entry.caseSensitive,
          });

          // Replace term with placeholder
          processedStr =
            processedStr.slice(0, found.position) +
            placeholder +
            processedStr.slice(found.position + found.matchedText.length);

          termsInString.push({
            term: entry.term,
            placeholder,
          });
        }
      }

      processed.push(processedStr);
    }

    return { processed, glossaryMap };
  }

  /**
   * Post-process translations AFTER receiving from API
   * Replaces placeholders back with actual glossary translations
   *
   * @param {Object} translations - Object with translations from API
   * @param {Map} glossaryMap - Map from preprocessStrings
   * @returns {Object} Final translations with glossary terms applied
   */
  postprocessTranslations(translations, glossaryMap) {
    const final = {};

    for (const [originalStr, translatedStr] of Object.entries(translations)) {
      let finalStr = translatedStr;

      // Replace all placeholders with actual translations
      for (const [placeholder, info] of glossaryMap.entries()) {
        if (finalStr.includes(placeholder)) {
          finalStr = finalStr.replace(
            new RegExp(placeholder, "g"),
            info.translation
          );
        }
      }

      final[originalStr] = finalStr;
    }

    return final;
  }

  /**
   * Filter strings - Remove strings that are ONLY glossary terms
   * These don't need translation at all
   *
   * @param {string[]} strings - Array of strings
   * @returns {Object} { needTranslation: string[], skipTranslation: Map }
   */
  filterStrings(strings, targetLang) {
    const needTranslation = [];
    const skipTranslation = new Map(); // strings that don't need API call

    for (const str of strings) {
      const trimmed = str.trim();

      // Check if this entire string is a glossary term
      const entry = this.get(trimmed, true) || this.get(trimmed, false);

      if (entry) {
        // This is a glossary term
        if (entry.doNotTranslate) {
          skipTranslation.set(str, entry.term);
        } else if (entry.translations[targetLang]) {
          skipTranslation.set(str, entry.translations[targetLang]);
        } else {
          needTranslation.push(str);
        }
      } else {
        needTranslation.push(str);
      }
    }

    return { needTranslation, skipTranslation };
  }

  /**
   * Complete workflow: Filter, Preprocess, and prepare for API
   *
   * @param {string[]} strings - Original strings
   * @param {string} targetLang - Target language
   * @returns {Object} Everything needed for translation
   */
  prepareForTranslation(strings, targetLang) {
    // Step 1: Filter out strings that don't need API calls
    const { needTranslation, skipTranslation } = this.filterStrings(
      strings,
      targetLang
    );

    console.log(
      `[Glossary] Filtered: ${skipTranslation.size} strings don't need translation`
    );

    // Step 2: Preprocess remaining strings (replace terms with placeholders)
    const { processed, glossaryMap } = this.preprocessStrings(
      needTranslation,
      targetLang
    );

    console.log(
      `[Glossary] Preprocessed: ${glossaryMap.size} term replacements`
    );

    return {
      stringsForAPI: processed, // Send these to API
      glossaryMap, // Use this to post-process
      skipTranslation, // These already have translations
      originalStrings: needTranslation, // For reference
    };
  }

  /**
   * Complete workflow: Post-process API results
   *
   * @param {Object} apiTranslations - Translations from API
   * @param {Map} glossaryMap - From prepareForTranslation
   * @param {Map} skipTranslation - From prepareForTranslation
   * @param {string[]} originalStrings - Original strings sent to API
   * @returns {Object} Complete translations
   */
  finalizeTranslations(
    apiTranslations,
    glossaryMap,
    skipTranslation,
    originalStrings
  ) {
    // Step 1: Post-process API translations (replace placeholders)
    const processedFromAPI = this.postprocessTranslations(
      apiTranslations,
      glossaryMap
    );

    // Step 2: Merge with skipped translations
    const allTranslations = { ...processedFromAPI };

    for (const [original, translation] of skipTranslation.entries()) {
      allTranslations[original] = translation;
    }

    return allTranslations;
  }

  /**
   * Find all terms in a text
   */
  findInText(text) {
    const found = [];

    for (const entry of this.terms.values()) {
      const pattern = entry.caseSensitive
        ? new RegExp(`\\b${this._escapeRegex(entry.term)}\\b`, "g")
        : new RegExp(`\\b${this._escapeRegex(entry.term)}\\b`, "gi");

      let match;
      while ((match = pattern.exec(text)) !== null) {
        found.push({
          term: entry.term,
          position: match.index,
          matchedText: match[0],
          entry: entry,
        });
      }
    }

    return found.sort((a, b) => a.position - b.position);
  }

  /**
   * Update a term
   */
  async update(term, updates, caseSensitive = true) {
    const key = this._generateKey(term, caseSensitive);
    const entry = this.terms.get(key);

    if (!entry) {
      return false;
    }

    if (updates.translations) {
      entry.translations = { ...entry.translations, ...updates.translations };
    }
    if (updates.category) entry.category = updates.category;
    if (updates.description) entry.description = updates.description;
    if (updates.doNotTranslate !== undefined)
      entry.doNotTranslate = updates.doNotTranslate;
    if (updates.context) entry.context = updates.context;

    entry.updatedAt = Date.now();
    this.metadata.lastModified = Date.now();

    await this.save();
    return true;
  }

  /**
   * Delete a term
   */
  async delete(term, caseSensitive = true) {
    const key = this._generateKey(term, caseSensitive);
    const deleted = this.terms.delete(key);

    if (deleted) {
      this.metadata.lastModified = Date.now();
      await this.save();
    }

    return deleted;
  }

  /**
   * Get all terms by category
   */
  getByCategory(category) {
    const results = [];

    for (const entry of this.terms.values()) {
      if (entry.category === category) {
        results.push(entry);
      }
    }

    return results;
  }

  /**
   * Get statistics
   */
  getStats() {
    const stats = {
      total: this.terms.size,
      byCategory: {},
      doNotTranslate: 0,
      withTranslations: 0,
    };

    for (const entry of this.terms.values()) {
      stats.byCategory[entry.category] =
        (stats.byCategory[entry.category] || 0) + 1;

      if (entry.doNotTranslate) {
        stats.doNotTranslate++;
      }

      if (Object.keys(entry.translations).length > 0) {
        stats.withTranslations++;
      }
    }

    return stats;
  }

  /**
   * Save glossary to disk
   */
  async save() {
    try {
      const data = {
        metadata: {
          ...this.metadata,
          lastModified: Date.now(),
        },
        terms: Array.from(this.terms.values()),
      };

      await fs.writeFile(
        this.glossaryPath,
        JSON.stringify(data, null, 2),
        "utf-8"
      );
    } catch (error) {
      console.error("[Glossary] Save error:", error.message);
      throw error;
    }
  }

  /**
   * Load glossary from disk
   */
  async load() {
    try {
      const content = await fs.readFile(this.glossaryPath, "utf-8");
      const data = JSON.parse(content);

      this.metadata = data.metadata || this.metadata;

      if (data.terms && Array.isArray(data.terms)) {
        for (const term of data.terms) {
          const key = this._generateKey(term.term, term.caseSensitive);
          this.terms.set(key, term);
        }
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        this.metadata.created = Date.now();
        await this.save();
      } else {
        console.error("[Glossary] Load error:", error.message);
      }
    }
  }

  /**
   * Export glossary
   */
  async export(outputPath) {
    try {
      const data = {
        version: this.metadata.version,
        exportedAt: new Date().toISOString(),
        totalTerms: this.terms.size,
        terms: Array.from(this.terms.values()),
      };

      await fs.writeFile(outputPath, JSON.stringify(data, null, 2), "utf-8");
      return data.terms.length;
    } catch (error) {
      console.error("[Glossary] Export error:", error.message);
      throw error;
    }
  }

  /**
   * Import glossary
   */
  async import(inputPath) {
    try {
      const content = await fs.readFile(inputPath, "utf-8");
      const data = JSON.parse(content);

      let imported = 0;

      if (data.terms && Array.isArray(data.terms)) {
        for (const term of data.terms) {
          await this.add(term.term, term.translations, {
            category: term.category,
            description: term.description,
            caseSensitive: term.caseSensitive,
            doNotTranslate: term.doNotTranslate,
            context: term.context,
          });
          imported++;
        }
      }

      return imported;
    } catch (error) {
      console.error("[Glossary] Import error:", error.message);
      throw error;
    }
  }

  /**
   * Clear all terms
   */
  async clear() {
    this.terms.clear();
    this.metadata.lastModified = Date.now();
    await this.save();
  }

  _generateKey(term, caseSensitive = true) {
    return caseSensitive ? term : term.toLowerCase();
  }

  _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

module.exports = { GlossaryManager };
