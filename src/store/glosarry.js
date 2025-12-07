const fs = require("fs").promises;
const path = require("path");

/**
 * Glossary Manager
 * Manages brand names, technical terms, and terms that should not be translated
 */
class GlossaryManager {
  constructor(glossaryPath = "./.polyglot/glossary.json") {
    this.glossaryPath = glossaryPath;
    this.terms = new Map();
    this.categories = new Set(["brand", "technical", "legal", "custom"]);
  }

  /**
   * Initialize glossary
   */
  async initialize() {
    try {
      await this.loadFromDisk();
      console.log("[Glossary] Initialized with", this.terms.size, "terms");
    } catch (error) {
      console.error("[Glossary] Initialization error:", error.message);
    }
  }

  /**
   * Add term to glossary
   */
  async addTerm(term, translations, options = {}) {
    const {
      category = "custom",
      description = "",
      caseSensitive = true,
      doNotTranslate = false,
    } = options;

    const termData = {
      term: term.trim(),
      translations: translations || {},
      category,
      description,
      caseSensitive,
      doNotTranslate,
      addedAt: Date.now(),
    };

    this.terms.set(term.toLowerCase(), termData);
    await this.saveToDisk();
    return termData;
  }

  /**
   * Get term translation for specific language
   */
  getTranslation(term, targetLang) {
    const termData = this.terms.get(term.toLowerCase());

    if (!termData) {
      return null;
    }

    // If term should not be translated, return original
    if (termData.doNotTranslate) {
      return termData.term;
    }

    // Return translation for target language
    return termData.translations[targetLang] || null;
  }

  /**
   * Check if text contains glossary terms
   */
  findTermsInText(text) {
    const found = [];

    this.terms.forEach((termData, key) => {
      const term = termData.term;
      const regex = termData.caseSensitive
        ? new RegExp(`\\b${this.escapeRegex(term)}\\b`, "g")
        : new RegExp(`\\b${this.escapeRegex(term)}\\b`, "gi");

      if (regex.test(text)) {
        found.push({
          term: term,
          data: termData,
        });
      }
    });

    return found;
  }

  /**
   * Replace glossary terms in text with translations
   */
  replaceTerms(text, targetLang) {
    let replacedText = text;
    const replacements = [];

    this.terms.forEach((termData) => {
      const term = termData.term;
      const translation = this.getTranslation(term, targetLang);

      if (translation) {
        const regex = termData.caseSensitive
          ? new RegExp(`\\b${this.escapeRegex(term)}\\b`, "g")
          : new RegExp(`\\b${this.escapeRegex(term)}\\b`, "gi");

        if (regex.test(replacedText)) {
          replacedText = replacedText.replace(regex, translation);
          replacements.push({ term, translation });
        }
      }
    });

    return { text: replacedText, replacements };
  }

  /**
   * Generate glossary prompt for AI
   */
  generatePrompt(targetLang) {
    const terms = Array.from(this.terms.values());

    if (terms.length === 0) {
      return "";
    }

    const glossaryLines = [];

    terms.forEach((termData) => {
      const translation = termData.translations[targetLang];

      if (termData.doNotTranslate) {
        glossaryLines.push(
          `- "${termData.term}": DO NOT TRANSLATE (keep as is)`
        );
      } else if (translation) {
        glossaryLines.push(
          `- "${termData.term}": translate as "${translation}"`
        );
      }
    });

    if (glossaryLines.length === 0) {
      return "";
    }

    return `\n\nGlossary (follow these translations exactly):\n${glossaryLines.join(
      "\n"
    )}`;
  }

  /**
   * Remove term from glossary
   */
  async removeTerm(term) {
    const deleted = this.terms.delete(term.toLowerCase());
    if (deleted) {
      await this.saveToDisk();
    }
    return deleted;
  }

  /**
   * Update term
   */
  async updateTerm(term, updates) {
    const termData = this.terms.get(term.toLowerCase());

    if (!termData) {
      return false;
    }

    Object.assign(termData, updates, { updatedAt: Date.now() });
    await this.saveToDisk();
    return true;
  }

  /**
   * Get all terms by category
   */
  getTermsByCategory(category) {
    const terms = [];

    this.terms.forEach((termData) => {
      if (termData.category === category) {
        terms.push(termData);
      }
    });

    return terms;
  }

  /**
   * Import glossary from JSON
   */
  async import(inputPath) {
    const content = await fs.readFile(inputPath, "utf-8");
    const data = JSON.parse(content);

    let imported = 0;

    if (Array.isArray(data.terms)) {
      for (const term of data.terms) {
        await this.addTerm(term.term, term.translations, {
          category: term.category,
          description: term.description,
          caseSensitive: term.caseSensitive,
          doNotTranslate: term.doNotTranslate,
        });
        imported++;
      }
    }

    return imported;
  }

  /**
   * Export glossary to JSON
   */
  async export(outputPath) {
    const data = {
      version: "1.0",
      exportDate: new Date().toISOString(),
      terms: Array.from(this.terms.values()),
    };

    await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
    return data.terms.length;
  }

  /**
   * Save to disk
   */
  async saveToDisk() {
    try {
      const dir = path.dirname(this.glossaryPath);
      await fs.mkdir(dir, { recursive: true });

      const data = {
        version: "1.0",
        lastSaved: new Date().toISOString(),
        terms: Array.from(this.terms.values()),
      };

      await fs.writeFile(this.glossaryPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error("[Glossary] Save error:", error.message);
    }
  }

  /**
   * Load from disk
   */
  async loadFromDisk() {
    try {
      const content = await fs.readFile(this.glossaryPath, "utf-8");
      const data = JSON.parse(content);

      if (Array.isArray(data.terms)) {
        data.terms.forEach((term) => {
          this.terms.set(term.term.toLowerCase(), term);
        });
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.error("[Glossary] Load error:", error.message);
      }
    }
  }

  /**
   * Escape special regex characters
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Get statistics
   */
  getStats() {
    const stats = {
      total: this.terms.size,
      byCategory: {},
    };

    this.categories.forEach((category) => {
      stats.byCategory[category] = this.getTermsByCategory(category).length;
    });

    return stats;
  }
}

module.exports = { GlossaryManager };
