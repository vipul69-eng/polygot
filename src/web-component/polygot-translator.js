/**
 * PolygotTranslator Web Component
 * Automatically translates HTML content based on locale JSON files
 */

class PolygotTranslator extends HTMLElement {
  constructor() {
    super();
    this.translations = {};
    this.originalContent = new Map(); // Store original content
    this.currentLang = "en";
    this.localesPath = "";
    this.observer = null;
    this.isInitialized = false;
  }

  static get observedAttributes() {
    return ["loc", "lang"];
  }

  async connectedCallback() {
    // Get attributes
    this.localesPath = this.getAttribute("loc") || "locales";
    this.currentLang = this.getAttribute("lang") || "en";

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

      // Apply translations
      if (Object.keys(this.translations).length > 0) {
        this.translatePage();
      } else {
        console.warn("[PolygotTranslator] No translations loaded");
      }

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
    const url = `${this.localesPath}/${lang}.json`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.translations = await response.json();
      const count = Object.keys(this.translations).length;

      // Show sample
      if (count > 0) {
        const sampleKey = Object.keys(this.translations)[0];
      }
    } catch (error) {
      console.error(
        `[PolygotTranslator] Failed to load translations from ${url}:`,
        error.message
      );
      this.translations = {};
    }
  }

  /**
   * Translate all content on the page
   */
  translatePage() {
    let translated = 0;
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
        } else if (trimmed.length > 0) {
          notFound.push(trimmed);
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
          notFound.push(originalValue);
        }
      }
    });
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
   * Public API
   */
  async changeLanguage(lang) {
    this.setAttribute("lang", lang);
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
}

// Register custom element
if (!customElements.get("polygot")) {
  customElements.define("polygot", PolygotTranslator);
}
