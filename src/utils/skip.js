/**
 * Filters strings using regex skip patterns
 * @param {string[]} strings
 * @param {string[]} patterns - array of regex strings
 */
function filterSkipPatterns(strings, patterns = []) {
  if (!patterns || patterns.length === 0) {
    return {
      translatableStrings: strings,
      skippedPatternStrings: [],
    };
  }

  const regexes = patterns.map((p) => new RegExp(p, "i"));
  const translatableStrings = [];
  const skippedPatternStrings = [];

  for (const str of strings) {
    if (regexes.some((regex) => regex.test(str))) {
      skippedPatternStrings.push(str);
    } else {
      translatableStrings.push(str);
    }
  }

  return {
    translatableStrings,
    skippedPatternStrings,
  };
}

module.exports = { filterSkipPatterns };
