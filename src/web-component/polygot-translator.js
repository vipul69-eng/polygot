/**
 * PolygotTranslator Web Component with Advanced URL Detection
 * Features:
 * - Multi-pattern URL detection (subdomain, path, query param)
 * - Automatic SEO meta tags (hreflang, lang attributes)
 * - Language persistence across pages
 * - Dynamic sitemap support
 * - Canonical URL management
 */

class PolygotTranslator extends HTMLElement {
  constructor() {
    super();
    this.translations = {};
    this.originalContent = new Map();
    this.currentLang = "en";
    this.defaultLang = "en";
    this.localesPath = "";
    this.observer = null;
    this.isInitialized = false;
    this.storageKey = "polygot_language";
    this.supportedLanguages = ["en"];
    this.urlPattern = "path"; // path, subdomain, query, or custom
    this.seoConfig = {
      updateTitle: true,
      updateMeta: true,
      updateHreflang: true,
      updateCanonical: true,
      baseUrl: window.location.origin,
    };
  }

  static get observedAttributes() {
    return [
      "loc",
      "lang",
      "languages",
      "seo-base-url",
      "default-lang",
      "url-pattern",
    ];
  }

  async connectedCallback() {
    // Get attributes
    this.localesPath = this.getAttribute("loc") || "locales";
    this.defaultLang = this.getAttribute("default-lang") || "en";
    this.urlPattern = this.getAttribute("url-pattern") || "path";

    // Parse supported languages
    const languagesAttr = this.getAttribute("languages");
    if (languagesAttr) {
      this.supportedLanguages = languagesAttr.split(",").map((l) => l.trim());
    }

    // SEO base URL configuration
    const seoBaseUrl = this.getAttribute("seo-base-url");
    if (seoBaseUrl) {
      this.seoConfig.baseUrl = seoBaseUrl;
    }

    // Advanced language detection from URL
    const urlLang = this.detectLanguageFromURL();

    // Get saved language preference
    const savedLang = this.getSavedLanguage();

    // Priority: URL detection > saved language > attribute > default
    this.currentLang =
      urlLang || savedLang || this.getAttribute("lang") || this.defaultLang;

    // Update attribute to reflect current language
    this.setAttribute("lang", this.currentLang);

    // Listen for language changes
    window.addEventListener("storage", (e) => this.handleStorageChange(e));
    window.addEventListener("polygot-language-change", (e) =>
      this.handleLanguageChangeEvent(e)
    );

    // Listen for popstate (browser back/forward)
    window.addEventListener("popstate", () => this.handlePopState());

    // Wait for DOM to be ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.initialize());
    } else {
      setTimeout(() => this.initialize(), 100);
    }
  }

  async initialize() {
    try {
      // Store all original content
      this.storeOriginalContent();

      // Load translations
      await this.loadTranslations(this.currentLang);

      // Apply translations
      this.translatePage();

      // Apply SEO enhancements
      // this.applySEOEnhancements();

      // Setup observer for dynamic content
      this.setupMutationObserver();

      this.isInitialized = true;

      // Dispatch ready event
      this.dispatchEvent(
        new CustomEvent("polygot-ready", {
          detail: {
            lang: this.currentLang,
            translationCount: Object.keys(this.translations).length,
            detectionMethod: this.urlPattern,
          },
          bubbles: true,
        })
      );
    } catch (error) {
      console.error("[Polygot] Initialization failed:", error);
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
    window.removeEventListener("popstate", this.handlePopState);
  }

  async attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || !this.isInitialized) return;

    if (name === "lang" && newValue) {
      this.currentLang = newValue;
      await this.loadTranslations(this.currentLang);
      this.translatePage();
      // this.applySEOEnhancements();
    } else if (name === "loc" && newValue) {
      this.localesPath = newValue;
      await this.loadTranslations(this.currentLang);
      this.translatePage();
    } else if (name === "languages" && newValue) {
      this.supportedLanguages = newValue.split(",").map((l) => l.trim());
      // this.applySEOEnhancements();
    } else if (name === "seo-base-url" && newValue) {
      this.seoConfig.baseUrl = newValue;
      // this.applySEOEnhancements();
    } else if (name === "default-lang" && newValue) {
      this.defaultLang = newValue;
    } else if (name === "url-pattern" && newValue) {
      this.urlPattern = newValue;
    }
  }

  /**
   * Advanced URL language detection - supports multiple patterns
   */
  detectLanguageFromURL() {
    let detectedLang = null;

    switch (this.urlPattern) {
      case "path":
        detectedLang = this.detectFromPath();
        break;
      case "subdomain":
        detectedLang = this.detectFromSubdomain();
        break;
      case "query":
        detectedLang = this.detectFromQuery();
        break;
      case "hash":
        detectedLang = this.detectFromHash();
        break;
      case "auto":
        // Try all methods in order of priority
        detectedLang =
          this.detectFromPath() ||
          this.detectFromSubdomain() ||
          this.detectFromQuery() ||
          this.detectFromHash();
        break;
      default:
        detectedLang = this.detectFromPath();
    }

    return detectedLang;
  }

  /**
   * Detect language from URL path
   * Patterns: /en/, /es/about, /fr/contact, /en-US/page
   */
  detectFromPath() {
    const path = window.location.pathname;
    const pathParts = path.split("/").filter((p) => p);

    if (pathParts.length === 0) return null;

    const firstSegment = pathParts[0].toLowerCase();

    // Check for exact match (e.g., "en", "es", "fr")
    if (this.supportedLanguages.includes(firstSegment)) {
      return firstSegment;
    }

    // Check for region code (e.g., "en-US" -> "en")
    if (firstSegment.includes("-")) {
      const langCode = firstSegment.split("-")[0];
      if (this.supportedLanguages.includes(langCode)) {
        return langCode;
      }
    }

    // Check for underscore format (e.g., "en_US" -> "en")
    if (firstSegment.includes("_")) {
      const langCode = firstSegment.split("_")[0];
      if (this.supportedLanguages.includes(langCode)) {
        return langCode;
      }
    }

    // Check if it's a 2-3 letter code
    if (firstSegment.length === 2 || firstSegment.length === 3) {
      if (this.supportedLanguages.includes(firstSegment)) {
        return firstSegment;
      }
    }

    return null;
  }

  /**
   * Detect language from subdomain
   * Patterns: en.example.com, es.example.com, fr.example.com
   */
  detectFromSubdomain() {
    const hostname = window.location.hostname;
    const parts = hostname.split(".");

    // Need at least 3 parts for subdomain (e.g., en.example.com)
    if (parts.length < 3) return null;

    const subdomain = parts[0].toLowerCase();

    // Check if subdomain is a supported language
    if (this.supportedLanguages.includes(subdomain)) {
      return subdomain;
    }

    // Check for region code (e.g., "en-us" subdomain)
    if (subdomain.includes("-")) {
      const langCode = subdomain.split("-")[0];
      if (this.supportedLanguages.includes(langCode)) {
        return langCode;
      }
    }

    return null;
  }

  /**
   * Detect language from query parameter
   * Patterns: ?lang=en, ?language=es, ?locale=fr
   */
  detectFromQuery() {
    const params = new URLSearchParams(window.location.search);

    // Check common parameter names
    const paramNames = ["lang", "language", "locale", "hl", "l"];

    for (const param of paramNames) {
      const value = params.get(param);
      if (value) {
        const langCode = value.toLowerCase();

        // Direct match
        if (this.supportedLanguages.includes(langCode)) {
          return langCode;
        }

        // Extract from region code (e.g., "en-US" -> "en")
        if (langCode.includes("-") || langCode.includes("_")) {
          const extracted = langCode.split(/[-_]/)[0];
          if (this.supportedLanguages.includes(extracted)) {
            return extracted;
          }
        }
      }
    }

    return null;
  }

  /**
   * Detect language from URL hash
   * Patterns: #en, #lang=es, #/fr/page
   */
  detectFromHash() {
    const hash = window.location.hash;
    if (!hash) return null;

    // Remove the # symbol
    const hashContent = hash.substring(1);

    // Check if hash is just a language code (#en)
    if (this.supportedLanguages.includes(hashContent.toLowerCase())) {
      return hashContent.toLowerCase();
    }

    // Check for key=value format (#lang=es)
    if (hashContent.includes("=")) {
      const parts = hashContent.split("&");
      for (const part of parts) {
        const [key, value] = part.split("=");
        if (
          key &&
          value &&
          (key === "lang" || key === "language" || key === "locale")
        ) {
          const langCode = value.toLowerCase();
          if (this.supportedLanguages.includes(langCode)) {
            return langCode;
          }
        }
      }
    }

    // Check for path-like hash (#/en/page)
    if (hashContent.startsWith("/")) {
      const hashParts = hashContent.split("/").filter((p) => p);
      if (hashParts.length > 0) {
        const firstSegment = hashParts[0].toLowerCase();
        if (this.supportedLanguages.includes(firstSegment)) {
          return firstSegment;
        }
      }
    }

    return null;
  }

  /**
   * Get clean path without language prefix
   */
  getCleanPath() {
    const path = window.location.pathname;
    const pathParts = path.split("/").filter((p) => p);

    // Remove language code if present at start
    if (pathParts.length > 0) {
      const firstPart = pathParts[0].toLowerCase();

      // Check exact match or region code
      if (
        this.supportedLanguages.includes(firstPart) ||
        this.supportedLanguages.includes(firstPart.split(/[-_]/)[0])
      ) {
        pathParts.shift();
      }
    }

    const cleanPath = "/" + pathParts.join("/");
    return cleanPath === "/" ? "/" : cleanPath;
  }

  /**
   * Apply SEO enhancements
   */
  applySEOEnhancements() {
    this.updateHtmlLangAttribute();
    this.updateHreflangLinks();
    this.updateCanonicalLink();
    this.updateMetaDescription();
    this.updateOpenGraphTags();
  }

  /**
   * Update <html> lang attribute
   */
  updateHtmlLangAttribute() {
    document.documentElement.setAttribute("lang", this.currentLang);
  }

  /**
   * Update hreflang links for all supported languages
   */
  updateHreflangLinks() {
    // Remove existing hreflang links
    document
      .querySelectorAll('link[rel="alternate"][hreflang]')
      .forEach((link) => link.remove());

    const cleanPath = this.getCleanPath();
    const head = document.head;

    // Add hreflang for each supported language
    this.supportedLanguages.forEach((lang) => {
      const link = document.createElement("link");
      link.rel = "alternate";
      link.hreflang = lang;

      const langPath = lang === this.defaultLang ? "" : `/${lang}`;
      link.href = `${this.seoConfig.baseUrl}${langPath}${cleanPath}`;

      head.appendChild(link);
    });

    // Add x-default hreflang (points to default language)
    const defaultLink = document.createElement("link");
    defaultLink.rel = "alternate";
    defaultLink.hreflang = "x-default";
    defaultLink.href = `${this.seoConfig.baseUrl}${cleanPath}`;
    head.appendChild(defaultLink);
  }

  /**
   * Update canonical URL
   */
  updateCanonicalLink() {
    let canonical = document.querySelector('link[rel="canonical"]');

    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }

    const cleanPath = this.getCleanPath();
    const langPath =
      this.currentLang === this.defaultLang ? "" : `/${this.currentLang}`;
    canonical.href = `${this.seoConfig.baseUrl}${langPath}${cleanPath}`;
  }

  /**
   * Update meta description if translation exists
   */
  updateMetaDescription() {
    const metaDesc = document.querySelector('meta[name="description"]');

    if (metaDesc && this.translations["meta.description"]) {
      metaDesc.setAttribute("content", this.translations["meta.description"]);
    }
  }

  /**
   * Update Open Graph tags
   */
  updateOpenGraphTags() {
    // Update og:locale
    let ogLocale = document.querySelector('meta[property="og:locale"]');
    if (!ogLocale) {
      ogLocale = document.createElement("meta");
      ogLocale.setAttribute("property", "og:locale");
      document.head.appendChild(ogLocale);
    }

    // Format: en_US, es_ES, fr_FR
    const localeCode = `${this.currentLang}_${this.currentLang.toUpperCase()}`;
    ogLocale.setAttribute("content", localeCode);

    // Update og:url
    let ogUrl = document.querySelector('meta[property="og:url"]');
    if (!ogUrl) {
      ogUrl = document.createElement("meta");
      ogUrl.setAttribute("property", "og:url");
      document.head.appendChild(ogUrl);
    }
    const cleanPath = this.getCleanPath();
    const langPath =
      this.currentLang === this.defaultLang ? "" : `/${this.currentLang}`;
    ogUrl.setAttribute(
      "content",
      `${this.seoConfig.baseUrl}${langPath}${cleanPath}`
    );

    // Update og:title if translation exists
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && this.translations["meta.og:title"]) {
      ogTitle.setAttribute("content", this.translations["meta.og:title"]);
    }

    // Update og:description if translation exists
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc && this.translations["meta.og:description"]) {
      ogDesc.setAttribute("content", this.translations["meta.og:description"]);
    }
  }

  /**
   * Handle browser back/forward navigation
   */
  handlePopState() {
    const urlLang = this.detectLanguageFromURL();
    if (urlLang && urlLang !== this.currentLang) {
      this.changeLanguage(urlLang);
    }
  }

  getSavedLanguage() {
    try {
      return localStorage.getItem(this.storageKey);
    } catch (e) {
      console.warn("[Polygot] localStorage not available:", e);
      return null;
    }
  }

  saveLanguage(lang) {
    try {
      localStorage.setItem(this.storageKey, lang);
      window.dispatchEvent(
        new CustomEvent("polygot-language-change", {
          detail: { lang },
        })
      );
    } catch (e) {
      console.warn("[Polygot] Failed to save language:", e);
    }
  }

  handleStorageChange(e) {
    if (
      e.key === this.storageKey &&
      e.newValue &&
      e.newValue !== this.currentLang
    ) {
      this.changeLanguage(e.newValue);
    }
  }

  handleLanguageChangeEvent(e) {
    const newLang = e.detail?.lang;
    if (newLang && newLang !== this.currentLang) {
      this.changeLanguage(newLang);
    }
  }

  storeOriginalContent() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
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

          const text = node.textContent.trim();
          if (text.length === 0) return NodeFilter.FILTER_REJECT;

          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (text) {
        if (!this.originalContent.has(node)) {
          this.originalContent.set(node, {
            type: "text",
            original: node.textContent,
          });
        }
      }
    }

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
            }
          }
        }
      });
    });
  }

  async loadTranslations(lang) {
    if (lang === this.defaultLang) {
      this.translations = {};

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
    } catch (error) {
      console.warn(
        `[Polygot] Failed to load translations from ${url}:`,
        error.message,
        "\nFalling back to original content"
      );
      this.translations = {};
    }
  }

  translatePage() {
    let translated = 0;
    let fallbackUsed = 0;

    this.originalContent.forEach((data, key) => {
      if (data.type === "text") {
        const textNode = key;
        const originalText = data.original;
        const trimmed = originalText.trim();

        if (this.translations[trimmed]) {
          const leadingSpace = originalText.match(/^\s*/)[0];
          const trailingSpace = originalText.match(/\s*$/)[0];
          textNode.textContent =
            leadingSpace + this.translations[trimmed] + trailingSpace;
          translated++;
        } else {
          if (textNode.textContent !== originalText) {
            textNode.textContent = originalText;
            fallbackUsed++;
          }
        }
      } else if (data.type === "attribute") {
        const element = data.element;
        const attr = data.attribute;
        const originalValue = data.original;

        if (this.translations[originalValue]) {
          element.setAttribute(attr, this.translations[originalValue]);
          translated++;
        } else {
          if (element.getAttribute(attr) !== originalValue) {
            element.setAttribute(attr, originalValue);
            fallbackUsed++;
          }
        }
      }
    });

    // Update page title if translation exists
    if (this.translations["meta.title"]) {
      document.title = this.translations["meta.title"];
    }

    if (translated > 0) {
    }
    if (fallbackUsed > 0) {
      console.log(`[Polygot] Used fallback for ${fallbackUsed} items`);
    }
  }

  getUniqueId(element) {
    if (element.id) return element.id;

    let path = [];
    let current = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      if (current.className) {
        selector += "." + current.className.split(" ").join(".");
      }

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
   * Change language with SEO enhancements
   * Note: Does not modify URL - user must handle routing separately
   */
  async changeLanguage(lang) {
    if (lang === this.currentLang) return;

    const previousLang = this.currentLang;
    this.currentLang = lang;
    this.saveLanguage(lang);
    this.setAttribute("lang", lang);
    await this.loadTranslations(lang);
    this.translatePage();
    // this.applySEOEnhancements();

    // Dispatch language change event
    this.dispatchEvent(
      new CustomEvent("language-change", {
        detail: {
          previousLang,
          currentLang: lang,
          translations: this.translations,
          timestamp: Date.now(),
        },
        bubbles: true,
        composed: true,
      })
    );
  }

  /**
   * Generate sitemap data for all languages
   */
  generateSitemapData() {
    const cleanPath = this.getCleanPath();
    const urls = [];

    this.supportedLanguages.forEach((lang) => {
      const langPath = lang === this.defaultLang ? "" : `/${lang}`;
      const url = `${this.seoConfig.baseUrl}${langPath}${cleanPath}`;

      urls.push({
        loc: url,
        lang: lang,
        alternates: this.supportedLanguages.map((altLang) => ({
          lang: altLang,
          href: `${this.seoConfig.baseUrl}${
            altLang === this.defaultLang ? "" : `/${altLang}`
          }${cleanPath}`,
        })),
      });
    });

    return urls;
  }

  // Public API
  getCurrentLanguage() {
    return this.currentLang;
  }

  getTranslations() {
    return this.translations;
  }

  isReady() {
    return this.isInitialized;
  }

  getSupportedLanguages() {
    return this.supportedLanguages;
  }

  clearSavedLanguage() {
    try {
      localStorage.removeItem(this.storageKey);
    } catch (e) {
      console.warn("[Polygot] Failed to clear saved language:", e);
    }
  }

  /**
   * Get detected URL pattern info for debugging
   */
  getDetectionInfo() {
    return {
      pattern: this.urlPattern,
      detectedLang: this.detectLanguageFromURL(),
      currentLang: this.currentLang,
      url: window.location.href,
      methods: {
        path: this.detectFromPath(),
        subdomain: this.detectFromSubdomain(),
        query: this.detectFromQuery(),
        hash: this.detectFromHash(),
      },
    };
  }
}

// Register custom element
if (!customElements.get("polygot-translator")) {
  customElements.define("polygot-translator", PolygotTranslator);
}
