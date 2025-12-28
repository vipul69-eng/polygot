/**
 * PolygotTranslator Web Component
 * Automatically translates HTML content based on locale JSON files
 * Features:
 * - Global language persistence across pages
 * - Fallback to original content when translations missing
 * - Cross-page language synchronization
 */

class PolygotTranslator extends HTMLElement {
  constructor() {
    super();
    this.translations = {};
    this.originalContent = new Map();
    this.currentLang = "en";
    this.localesPath = "";
    this.observer = null;
    this.isInitialized = false;
    this.storageKey = "polygot_language"; // Key for localStorage
  }

  static get observedAttributes() {
    return ["loc", "lang"];
  }

  async connectedCallback() {
    // Get attributes
    this.localesPath = this.getAttribute("loc") || "locales";

    // Check for saved language preference (global state)
    const savedLang = this.getSavedLanguage();

    // Priority: saved language > attribute > default
    this.currentLang = savedLang || this.getAttribute("lang") || "en";

    // Update attribute to reflect current language
    if (savedLang) {
      this.setAttribute("lang", savedLang);
    }

    // Listen for language changes from other tabs/windows
    window.addEventListener("storage", (e) => this.handleStorageChange(e));

    // Listen for custom language change events from same page
    window.addEventListener("polygot-language-change", (e) =>
      this.handleLanguageChangeEvent(e)
    );

    // Wait for DOM to be ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.initialize());
    } else {
      // Small delay to ensure DOM is fully rendered
      setTimeout(() => this.initialize(), 100);
    }
  }

  async initialize() {
    try {
      // First, store all original content
      this.storeOriginalContent();

      // Load translations
      await this.loadTranslations(this.currentLang);

      // Apply translations (will fallback to original if translations empty)
      this.translatePage();

      // Setup observer for dynamic content
      this.setupMutationObserver();

      this.isInitialized = true;

      // Dispatch ready event
      this.dispatchEvent(
        new CustomEvent("polygot-ready", {
          detail: {
            lang: this.currentLang,
            translationCount: Object.keys(this.translations).length,
          },
        })
      );
    } catch (error) {
      console.error("[PolygotTranslator] Initialization failed:", error);
    }
  }

  disconnectedCallback() {
    if (this.observer) {
      this.observer.disconnect();
    }
    window.removeEventListener("storage", this.handleStorageChange);
    window.removeEventListener(
      "polygot-language-change",
      this.handleLanguageChangeEvent
    );
  }

  async attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || !this.isInitialized) return;

    if (name === "lang" && newValue) {
      this.currentLang = newValue;
      await this.loadTranslations(this.currentLang);
      this.translatePage();
    } else if (name === "loc" && newValue) {
      this.localesPath = newValue;
      await this.loadTranslations(this.currentLang);
      this.translatePage();
    }
  }

  /**
   * Get saved language from localStorage
   */
  getSavedLanguage() {
    try {
      return localStorage.getItem(this.storageKey);
    } catch (e) {
      console.warn("[PolygotTranslator] localStorage not available:", e);
      return null;
    }
  }

  /**
   * Save language to localStorage
   */
  saveLanguage(lang) {
    try {
      localStorage.setItem(this.storageKey, lang);

      // Dispatch custom event for same-page components
      window.dispatchEvent(
        new CustomEvent("polygot-language-change", {
          detail: { lang },
        })
      );
    } catch (e) {
      console.warn("[PolygotTranslator] Failed to save language:", e);
    }
  }

  /**
   * Handle storage changes from other tabs/windows
   */
  handleStorageChange(e) {
    if (
      e.key === this.storageKey &&
      e.newValue &&
      e.newValue !== this.currentLang
    ) {
      this.changeLanguage(e.newValue);
    }
  }

  /**
   * Handle language change events from same page
   */
  handleLanguageChangeEvent(e) {
    const newLang = e.detail?.lang;
    if (newLang && newLang !== this.currentLang) {
      this.changeLanguage(newLang);
    }
  }

  /**
   * Store original content from DOM elements
   */
  storeOriginalContent() {
    // Get all text nodes
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip script, style, and this component
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          const tagName = parent.tagName.toLowerCase();
          if (
            tagName === "script" ||
            tagName === "style" ||
            tagName === "polygot-translator" ||
            tagName === "polygot-language-switcher"
          ) {
            return NodeFilter.FILTER_REJECT;
          }

          // Only accept nodes with actual text content
          const text = node.textContent.trim();
          if (text.length === 0) return NodeFilter.FILTER_REJECT;

          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    let textNodeCount = 0;
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (text) {
        if (!this.originalContent.has(node)) {
          this.originalContent.set(node, {
            type: "text",
            original: node.textContent, // Store with whitespace
          });
          textNodeCount++;
        }
      }
    }

    // Store original attributes
    const elements = document.querySelectorAll(
      "body *:not(script):not(style):not(polygot-translator):not(polygot-language-switcher)"
    );
    const attributes = [
      "title",
      "placeholder",
      "alt",
      "aria-label",
      "aria-describedby",
    ];

    let attrCount = 0;
    elements.forEach((element) => {
      attributes.forEach((attr) => {
        if (element.hasAttribute(attr)) {
          const value = element.getAttribute(attr);
          if (value && value.trim()) {
            const key = `${this.getUniqueId(element)}_${attr}`;
            if (!this.originalContent.has(key)) {
              this.originalContent.set(key, {
                type: "attribute",
                element: element,
                attribute: attr,
                original: value,
              });
              attrCount++;
            }
          }
        }
      });
    });
  }

  /**
   * Load translation JSON file
   */
  async loadTranslations(lang) {
    // If trying to load default language, don't fetch (use original content)
    if (lang === "en") {
      this.translations = {};
      console.log(
        "[PolygotTranslator] Using original content for default language"
      );
      return;
    }

    const url = `${this.localesPath}/${lang}.json`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.translations = await response.json();
      const count = Object.keys(this.translations).length;

      console.log(
        `[PolygotTranslator] Loaded ${count} translations for "${lang}"`
      );
    } catch (error) {
      console.warn(
        `[PolygotTranslator] Failed to load translations from ${url}:`,
        error.message,
        "\nFalling back to original content"
      );
      this.translations = {};
    }
  }

  /**
   * Translate all content on the page
   * Falls back to original content when translations are missing
   */
  translatePage() {
    let translated = 0;
    let fallbackUsed = 0;
    let notFound = [];

    this.originalContent.forEach((data, key) => {
      if (data.type === "text") {
        // It's a text node
        const textNode = key;
        const originalText = data.original;
        const trimmed = originalText.trim();

        if (this.translations[trimmed]) {
          // Preserve original whitespace
          const leadingSpace = originalText.match(/^\s*/)[0];
          const trailingSpace = originalText.match(/\s*$/)[0];
          textNode.textContent =
            leadingSpace + this.translations[trimmed] + trailingSpace;
          translated++;
        } else {
          // Fallback to original content
          if (textNode.textContent !== originalText) {
            textNode.textContent = originalText;
            fallbackUsed++;
          }
          if (trimmed.length > 0 && this.currentLang !== "en") {
            notFound.push(trimmed);
          }
        }
      } else if (data.type === "attribute") {
        // It's an attribute
        const element = data.element;
        const attr = data.attribute;
        const originalValue = data.original;

        if (this.translations[originalValue]) {
          element.setAttribute(attr, this.translations[originalValue]);
          translated++;
        } else {
          // Fallback to original content
          if (element.getAttribute(attr) !== originalValue) {
            element.setAttribute(attr, originalValue);
            fallbackUsed++;
          }
          if (this.currentLang !== "en") {
            notFound.push(originalValue);
          }
        }
      }
    });

    if (translated > 0) {
      console.log(
        `[PolygotTranslator] Translated ${translated} items to "${this.currentLang}"`
      );
    }
    if (fallbackUsed > 0) {
      console.log(
        `[PolygotTranslator] Used fallback for ${fallbackUsed} items`
      );
    }
    if (notFound.length > 0 && this.currentLang !== "en") {
      console.warn(
        `[PolygotTranslator] Missing translations (${notFound.length} items):`,
        notFound.slice(0, 5)
      );
    }
  }

  /**
   * Get unique ID for an element
   */
  getUniqueId(element) {
    if (element.id) return element.id;

    // Generate path-based ID
    let path = [];
    let current = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      if (current.className) {
        selector += "." + current.className.split(" ").join(".");
      }

      // Add nth-child
      let nth = 1;
      let sibling = current;
      while (sibling.previousElementSibling) {
        sibling = sibling.previousElementSibling;
        nth++;
      }
      selector += `:nth-child(${nth})`;

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(">");
  }

  /**
   * Setup mutation observer
   */
  setupMutationObserver() {
    this.observer = new MutationObserver((mutations) => {
      let hasChanges = false;

      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (
              node.nodeType === Node.ELEMENT_NODE &&
              node.tagName !== "POLYGOT-TRANSLATOR" &&
              node.tagName !== "POLYGOT-LANGUAGE-SWITCHER"
            ) {
              hasChanges = true;
            }
          });
        }
      });

      if (hasChanges) {
        this.storeOriginalContent();
        this.translatePage();
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Public API - Change language globally
   */
  async changeLanguage(lang) {
    if (lang === this.currentLang) return;

    this.currentLang = lang;
    this.saveLanguage(lang); // Save to localStorage for global persistence
    this.setAttribute("lang", lang);
    await this.loadTranslations(lang);
    this.translatePage();

    console.log(`[PolygotTranslator] Language changed to "${lang}" globally`);
  }

  getCurrentLanguage() {
    return this.currentLang;
  }

  getTranslations() {
    return this.translations;
  }

  isReady() {
    return this.isInitialized;
  }

  /**
   * Clear saved language preference
   */
  clearSavedLanguage() {
    try {
      localStorage.removeItem(this.storageKey);
      console.log("[PolygotTranslator] Cleared saved language preference");
    } catch (e) {
      console.warn("[PolygotTranslator] Failed to clear saved language:", e);
    }
  }
}

// Register custom element
if (!customElements.get("polygot-translator")) {
  customElements.define("polygot-translator", PolygotTranslator);
}
