const { translateStrings, batchTranslateStrings } = require("./translator");
const {
  SUPPORTED_LANGUAGES,
  isLanguageSupported,
  getLanguageName,
  getSupportedLanguageCodes,
} = require("./languages");

module.exports = {
  translateStrings,
  SUPPORTED_LANGUAGES,
  isLanguageSupported,
  getLanguageName,
  getSupportedLanguageCodes,
};
