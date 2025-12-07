/**
 * Supported languages with their names
 */
const SUPPORTED_LANGUAGES = {
  // European Languages
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  pl: "Polish",
  nl: "Dutch",
  sv: "Swedish",
  da: "Danish",
  no: "Norwegian",
  fi: "Finnish",
  el: "Greek",
  cs: "Czech",
  ro: "Romanian",
  hu: "Hungarian",
  tr: "Turkish",

  // Asian Languages
  zh: "Chinese (Simplified)",
  "zh-TW": "Chinese (Traditional)",
  ja: "Japanese",
  ko: "Korean",
  hi: "Hindi",
  th: "Thai",
  vi: "Vietnamese",
  id: "Indonesian",

  // Middle Eastern Languages
  ar: "Arabic",
  he: "Hebrew",
  fa: "Persian",

  // Other Major Languages
  uk: "Ukrainian",
  bn: "Bengali",
};

/**
 * Validates if a language code is supported
 *
 * @param {string} langCode - Language code to validate
 * @returns {boolean} True if language is supported
 */
function isLanguageSupported(langCode) {
  return langCode in SUPPORTED_LANGUAGES;
}

/**
 * Gets the language name from code
 *
 * @param {string} langCode - Language code
 * @returns {string|null} Language name or null if not found
 */
function getLanguageName(langCode) {
  return SUPPORTED_LANGUAGES[langCode] || null;
}

/**
 * Gets all supported language codes
 *
 * @returns {string[]} Array of language codes
 */
function getSupportedLanguageCodes() {
  return Object.keys(SUPPORTED_LANGUAGES);
}

module.exports = {
  SUPPORTED_LANGUAGES,
  isLanguageSupported,
  getLanguageName,
  getSupportedLanguageCodes,
};
