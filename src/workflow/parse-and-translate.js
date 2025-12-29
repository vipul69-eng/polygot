const path = require("path");
const fs = require("fs").promises;
const cliProgress = require("../utils/cli-progress");
const { polygotParser } = require("../parser");
const { translateStrings } = require("../translator");
const { readFile, readDir } = require("../file-handler/reader");
const { writeFile } = require("../file-handler/writer");
const { getCachedTranslations, updateGlobalStore } = require("../store");

/**
 * Parse a single file for UI strings
 */
async function parseFiles(
  filePath,
  visibleAttributes = undefined,
  excludeTags = []
) {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("filePath must be a non-empty string");
  }

  const normalized = path.normalize(filePath);
  const content = await readFile(normalized);
  const extracted = polygotParser(content, visibleAttributes, excludeTags);

  return Array.from(new Set(extracted));
}

/**
 * Parse directory for UI strings
 */
async function parseDir(
  dirPath,
  visibleAttributes = undefined,
  excludeTags = []
) {
  if (!dirPath || typeof dirPath !== "string") {
    throw new Error("dirPath must be a non-empty string");
  }

  const filePaths = await readDir(dirPath);
  const mergedSet = new Set();

  for (const fp of filePaths) {
    try {
      const content = await readFile(fp);
      const extracted = polygotParser(content, visibleAttributes, excludeTags);
      const uniqueExtracted = Array.from(new Set(extracted));
      uniqueExtracted.forEach((s) => mergedSet.add(s));
    } catch (err) {
      console.error(`Failed to process ${fp}: ${err.message}`);
    }
  }

  return Array.from(mergedSet);
}

/**
 * Load existing translations from a language file
 * @param {string} filePath - Path to the translation file
 * @returns {Promise<Set>} Set of existing string keys
 */
async function loadExistingStrings(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(content);
    return new Set(Object.keys(data));
  } catch (error) {
    // File doesn't exist or can't be read
    return new Set();
  }
}

/**
 * Load existing translations data from a language file
 * @param {string} filePath - Path to the translation file
 * @returns {Promise<Object>} Existing translations object
 */
async function loadExistingTranslations(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    // File doesn't exist or can't be read
    return {};
  }
}

/**
 * Filter strings based on glossary
 * Strings in glossary should not be translated
 * @param {string[]} strings - Array of strings to filter
 * @param {string[]} glossary - Array of terms that should not be translated
 * @returns {Object} Object with translatableStrings and glossaryStrings
 */
function filterGlossaryStrings(strings, glossary = []) {
  if (!glossary || glossary.length === 0) {
    return {
      translatableStrings: strings,
      glossaryStrings: [],
    };
  }

  const glossarySet = new Set(glossary.map((term) => term.trim()));
  const translatableStrings = [];
  const glossaryStrings = [];

  for (const str of strings) {
    if (glossarySet.has(str)) {
      glossaryStrings.push(str);
    } else {
      translatableStrings.push(str);
    }
  }

  return {
    translatableStrings,
    glossaryStrings,
  };
}

/**
 * Parses UI files and translates extracted strings to specified language(s),
 * then writes the translations to JSON files in the output directory.
 * Ignores strings that already exist in the output files for each language.
 * Glossary terms are not translated and are kept as-is.
 *
 * @param {string} sourcePath - Path to a single file or directory to scan
 * @param {string|string[]} targetLanguages - Single language code or array of language codes
 * @param {string} apiKey - OpenAI API key
 * @param {string} outputDir - Output directory path
 * @param {Object} [options={}] - Optional configuration
 * @param {string[]} [options.glossary] - Array of terms that should not be translated
 * @returns {Promise<Object>} Result object with file paths and metadata
 */
async function parseAndTranslate(
  sourcePath,
  targetLanguages,
  apiKey,
  outputDir,
  options = {}
) {
  const {
    visibleAttributes,
    includeSourceStrings = false,
    logProgress = true,
    excludeTags,
    glossary = [],
    ...translationOptions
  } = options;

  const languages = Array.isArray(targetLanguages)
    ? targetLanguages
    : [targetLanguages];

  if (logProgress) {
    console.log("\nStarting parse and translate workflow");
    console.log(`Source: ${sourcePath}`);
    console.log(`Target languages: ${languages.join(", ")}`);
    console.log(`Output directory: ${outputDir}`);
    if (glossary && glossary.length > 0) {
      console.log(
        `Glossary terms: ${glossary.length} (will not be translated)`
      );
    }
  }

  // Step 1: Extract strings
  if (logProgress) {
    console.log("\nStep 1: Extracting strings from UI files...");
  }

  let extractedStrings;
  try {
    const stats = await fs.stat(sourcePath);

    if (stats.isDirectory()) {
      extractedStrings = await parseDir(
        sourcePath,
        visibleAttributes,
        excludeTags
      );
    } else if (stats.isFile()) {
      extractedStrings = await parseFiles(
        sourcePath,
        visibleAttributes,
        excludeTags
      );
    } else {
      throw new Error(`Invalid source path: ${sourcePath}`);
    }
  } catch (error) {
    throw new Error(`Failed to parse source path: ${error.message}`);
  }

  if (extractedStrings.length === 0) {
    console.warn("Warning: No strings found to translate");
    return {
      success: false,
      message: "No strings extracted",
      files: [],
    };
  }

  if (logProgress) {
    console.log(`Extracted ${extractedStrings.length} unique strings`);
  }

  // Step 1.5: Filter glossary terms
  const { translatableStrings, glossaryStrings } = filterGlossaryStrings(
    extractedStrings,
    glossary
  );

  if (logProgress && glossaryStrings.length > 0) {
    console.log(
      `Found ${glossaryStrings.length} glossary terms (will not be translated)`
    );
    console.log(`Strings to translate: ${translatableStrings.length}`);
  }

  // Step 2: Check existing translations for each language
  if (logProgress) {
    console.log("\nStep 2: Checking for existing translations...");
  }

  const languageStringsMap = {};
  const existingTranslationsMap = {};
  let totalSkipped = 0;
  let totalGlossaryTerms = 0;

  for (const lang of languages) {
    const filePath = path.join(outputDir, `${lang}.json`);
    const existingStrings = await loadExistingStrings(filePath);
    const existingTranslations = await loadExistingTranslations(filePath);

    // Filter out strings that already exist for this language
    const newStrings = translatableStrings.filter(
      (str) => !existingStrings.has(str)
    );
    const skipped = translatableStrings.length - newStrings.length;

    languageStringsMap[lang] = newStrings;
    existingTranslationsMap[lang] = existingTranslations;
    totalSkipped += skipped;
    totalGlossaryTerms += glossaryStrings.length;

    if (logProgress && existingStrings.size > 0) {
      console.log(
        `  ${lang}: ${existingStrings.size} existing, ${newStrings.length} new, ${skipped} skipped, ${glossaryStrings.length} glossary`
      );
    } else if (logProgress) {
      console.log(
        `  ${lang}: ${newStrings.length} new, ${glossaryStrings.length} glossary`
      );
    }
  }

  // Check if there are any new strings to translate
  const hasNewStrings = Object.values(languageStringsMap).some(
    (strings) => strings.length > 0
  );

  if (!hasNewStrings && glossaryStrings.length === 0) {
    if (logProgress) {
      console.log(
        "\nNo new strings to translate - all strings already exist in all target languages"
      );
    }
    return {
      success: true,
      message: "No new strings to translate",
      files: languages.map((lang) => path.join(outputDir, `${lang}.json`)),
      stringsExtracted: extractedStrings.length,
      stringsSkipped: extractedStrings.length,
      glossaryTerms: 0,
      languages: languages,
      tokensUsed: { input: 0, output: 0, total: 0 },
      outputDir: outputDir,
    };
  }

  // Step 3: Translate
  if (logProgress) {
    console.log("\nStep 3: Translating strings...");
  }

  let progressBar;
  if (logProgress) {
    progressBar = new cliProgress.SingleBar({
      format:
        "Translation Progress |{bar}| {percentage}% | {value}/{total} Languages",
      barCompleteChar: "\u2588",
      barIncompleteChar: "\u2591",
      hideCursor: true,
    });
    progressBar.start(languages.length, 0);
  }

  let translationResults = {};
  const totalTokens = { input: 0, output: 0, total: 0 };

  try {
    for (let i = 0; i < languages.length; i++) {
      const lang = languages[i];
      const { cached, missing } = getCachedTranslations(
        lang,
        languageStringsMap[lang]
      );
      if (missing.length === 0) {
        translationResults[lang] = {
          translations: cached,
          tokensUsed: { input: 0, output: 0, total: 0 },
        };
      } else {
        const result = await translateStrings(missing, lang, apiKey, {
          ...translationOptions,
          logProgress: false,
        });

        // Merge cached + new
        translationResults[lang] = {
          translations: {
            ...cached,
            ...result.translations,
          },
          tokensUsed: result.tokensUsed,
        };

        // 🔥 Save new translations globally
        updateGlobalStore(lang, result.translations);

        totalTokens.input += result.tokensUsed.input;
        totalTokens.output += result.tokensUsed.output;
        totalTokens.total += result.tokensUsed.total;
      }

      if (progressBar) {
        progressBar.update(i + 1);
      }
    }
  } catch (error) {
    if (progressBar) progressBar.stop();
    throw new Error(`Translation failed: ${error.message}`);
  } finally {
    if (progressBar) progressBar.stop();
  }

  // Step 4: Write files (merge with existing translations and add glossary terms)
  if (logProgress) {
    console.log("\nStep 4: Writing translation files...");
  }

  const writtenFiles = [];

  for (const [langCode, result] of Object.entries(translationResults)) {
    const filePath = path.join(outputDir, `${langCode}.json`);

    // Create glossary entries (keep original string as value)
    const glossaryEntries = {};
    glossaryStrings.forEach((term) => {
      glossaryEntries[term] = term;
    });

    // Merge: existing translations + new translations + glossary terms
    const mergedTranslations = {
      ...existingTranslationsMap[langCode],
      ...result.translations,
      ...glossaryEntries,
    };

    try {
      await writeFile(filePath, mergedTranslations);
      writtenFiles.push(filePath);

      if (logProgress) {
        const newCount = Object.keys(result.translations).length;
        const glossaryCount = glossaryStrings.length;
        const totalCount = Object.keys(mergedTranslations).length;
        console.log(
          `  Written ${langCode}.json (${newCount} translated, ${glossaryCount} glossary, ${totalCount} total)`
        );
      }
    } catch (error) {
      console.error(`  Failed to write ${langCode}.json: ${error.message}`);
    }
  }

  if (logProgress) {
    console.log("\nTranslation workflow complete!");
    console.log(`Total strings extracted: ${extractedStrings.length}`);
    console.log(`Glossary terms (not translated): ${glossaryStrings.length}`);
    console.log(`Strings translated: ${translatableStrings.length}`);
    console.log(
      `Total strings skipped (already exist): ${
        totalSkipped / languages.length
      }`
    );
    console.log(`Total tokens used: ${totalTokens.total}`);
    console.log(`Files created/updated: ${writtenFiles.length}`);
    writtenFiles.forEach((file) => console.log(`  - ${file}`));
  }

  return {
    success: true,
    files: writtenFiles,
    stringsExtracted: extractedStrings.length,
    stringsTranslated: translatableStrings.length,
    stringsSkipped: totalSkipped / languages.length,
    glossaryTerms: glossaryStrings.length,
    languages: languages,
    tokensUsed: totalTokens,
    outputDir: outputDir,
  };
}

module.exports = {
  parseAndTranslate,
  parseFiles,
  parseDir,
};
