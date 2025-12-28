const path = require("path");
const fs = require("fs").promises;
const cliProgress = require("../utils/cli-progress");
const { polygotParser } = require("../parser");
const { translateStrings } = require("../translator");
const { readFile, readDir } = require("../file-handler/reader");
const { writeFile } = require("../file-handler/writer");
const {
  GlossaryManager,
  TranslationMemoryStore,
} = require("../translation-memory");

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
 * Translate strings with memory and glossary support
 */
async function translateWithMemoryAndGlossary(
  strings,
  targetLang,
  apiKey,
  options = {}
) {
  const {
    memory,
    glossary,
    sourceLang = "en",
    ...translationOptions
  } = options;

  let stringsToTranslate = strings;
  let finalTranslations = {};
  let memoryHits = 0;
  let glossarySkips = 0;

  // Step 1: Check memory for cached translations
  if (memory) {
    const { found, missing } = await memory.batchGet(
      strings,
      sourceLang,
      targetLang
    );

    memoryHits = found.size;
    if (found.size > 0) {
      console.log(`[Memory] Found ${found.size} cached translations`);
      found.forEach((translation, original) => {
        finalTranslations[original] = translation;
      });
    }

    stringsToTranslate = missing;
  }

  // Step 2: Apply glossary filtering
  let glossaryData = null;
  if (glossary && stringsToTranslate.length > 0) {
    glossaryData = glossary.prepareForTranslation(
      stringsToTranslate,
      targetLang
    );

    glossarySkips = glossaryData.skipTranslation.size;
    if (glossaryData.skipTranslation.size > 0) {
      console.log(
        `[Glossary] ${glossaryData.skipTranslation.size} strings don't need API translation`
      );
      glossaryData.skipTranslation.forEach((translation, original) => {
        finalTranslations[original] = translation;
      });
    }

    stringsToTranslate = glossaryData.stringsForAPI;
  }

  // Step 3: Translate remaining strings via API
  let apiTranslations = {};
  let tokensUsed = { input: 0, output: 0, total: 0, chunks: [] };

  if (stringsToTranslate.length > 0) {
    console.log(
      `[API] Translating ${stringsToTranslate.length} strings via OpenAI`
    );

    const result = await translateStrings(
      stringsToTranslate,
      targetLang,
      apiKey,
      translationOptions
    );

    apiTranslations = result.translations;
    tokensUsed = result.tokensUsed;

    // Step 4: Post-process with glossary
    if (glossary && glossaryData) {
      apiTranslations = glossary.finalizeTranslations(
        apiTranslations,
        glossaryData.glossaryMap,
        new Map(), // Already merged skipTranslation above
        glossaryData.originalStrings
      );
    }

    // Step 5: Store in memory for future use
    if (memory) {
      await memory.batchSet(apiTranslations, sourceLang, targetLang, {
        model: translationOptions.model,
        context: translationOptions.context,
        tone: translationOptions.tone,
      });
      console.log(
        `[Memory] Cached ${
          Object.keys(apiTranslations).length
        } new translations`
      );
    }

    // Merge API translations
    Object.assign(finalTranslations, apiTranslations);
  }

  return {
    translations: finalTranslations,
    tokensUsed,
    stats: {
      total: strings.length,
      fromMemory: memoryHits,
      fromGlossary: glossarySkips,
      fromAPI: stringsToTranslate.length,
      apiSavings: (
        ((memoryHits + glossarySkips) / strings.length) *
        100
      ).toFixed(1),
    },
  };
}

/**
 * Parses UI files and translates extracted strings to specified language(s),
 * then writes the translations to JSON files in the output directory.
 *
 * @param {string} sourcePath - Path to a single file or directory to scan
 * @param {string|string[]} targetLanguages - Single language code or array of language codes
 * @param {string} apiKey - OpenAI API key
 * @param {string} outputDir - Output directory path
 * @param {Object} [options={}] - Optional configuration
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
    excludeTags = [],
    useMemory = true,
    useGlossary = true,
    memoryPath = "./.polygot/memory",
    glossaryPath = "./.polygot/glossary.json",
    sourceLang = "en",
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
    console.log(`Memory: ${useMemory ? "ENABLED" : "DISABLED"}`);
    console.log(`Glossary: ${useGlossary ? "ENABLED" : "DISABLED"}`);
  }

  // Initialize memory and glossary
  let memory = null;
  let glossary = null;

  if (useMemory) {
    memory = new TranslationMemoryStore(memoryPath);
    await memory.initialize();
  }

  if (useGlossary) {
    glossary = new GlossaryManager(glossaryPath);
    await glossary.initialize();
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

  // Step 2: Translate
  if (logProgress) {
    console.log("\nStep 2: Translating strings...");
  }

  let progressBar;
  if (logProgress) {
    progressBar = new cliProgress.SingleBar({
      format:
        "Translation Progress |{bar}| {percentage}% | {value}/{total} Languages | ETA: {eta}s",
      barCompleteChar: "\u2588",
      barIncompleteChar: "\u2591",
      hideCursor: true,
    });
    progressBar.start(languages.length, 0);
  }

  let translationResults = {};
  const totalTokens = { input: 0, output: 0, total: 0 };
  const aggregateStats = {
    totalStrings: extractedStrings.length,
    fromMemory: 0,
    fromGlossary: 0,
    fromAPI: 0,
  };

  try {
    for (let i = 0; i < languages.length; i++) {
      const lang = languages[i];

      const result = await translateWithMemoryAndGlossary(
        extractedStrings,
        lang,
        apiKey,
        {
          ...translationOptions,
          memory,
          glossary,
          sourceLang,
          logProgress: false,
        }
      );

      translationResults[lang] = result;

      totalTokens.input += result.tokensUsed.input;
      totalTokens.output += result.tokensUsed.output;
      totalTokens.total += result.tokensUsed.total;

      aggregateStats.fromMemory += result.stats.fromMemory;
      aggregateStats.fromGlossary += result.stats.fromGlossary;
      aggregateStats.fromAPI += result.stats.fromAPI;

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

  // Save memory if used
  if (memory) {
    await memory.save();
  }

  // Step 3: Write files
  if (logProgress) {
    console.log("\nStep 3: Writing translation files...");
  }

  const writtenFiles = [];

  for (const [langCode, result] of Object.entries(translationResults)) {
    const filePath = path.join(outputDir, `${langCode}.json`);
    const outputData = result.translations;

    try {
      await writeFile(filePath, outputData);
      writtenFiles.push(filePath);

      if (logProgress) {
        console.log(
          `  Written ${langCode}.json (${
            Object.keys(outputData).length
          } translations)`
        );
      }
    } catch (error) {
      console.error(`  Failed to write ${langCode}.json: ${error.message}`);
    }
  }

  if (logProgress) {
    console.log("\nTranslation workflow complete!");
    console.log(`Total tokens used: ${totalTokens.total}`);

    if (useMemory || useGlossary) {
      const avgSavings =
        aggregateStats.totalStrings > 0
          ? (
              ((aggregateStats.fromMemory + aggregateStats.fromGlossary) /
                aggregateStats.totalStrings) *
              100
            ).toFixed(1)
          : 0;

      console.log("\nCost Optimization:");
      console.log(
        `  From memory cache: ${aggregateStats.fromMemory} translations`
      );
      console.log(
        `  From glossary: ${aggregateStats.fromGlossary} translations`
      );
      console.log(`  From API: ${aggregateStats.fromAPI} translations`);
      console.log(`  API savings: ~${avgSavings}%`);
    }

    console.log(`\nFiles created: ${writtenFiles.length}`);
    writtenFiles.forEach((file) => console.log(`  - ${file}`));
  }

  // Get memory stats if available
  const memoryStats = memory ? memory.getStats() : null;
  const glossaryStats = glossary ? glossary.getStats() : null;

  return {
    success: true,
    files: writtenFiles,
    stringsExtracted: extractedStrings.length,
    languages: languages,
    tokensUsed: totalTokens,
    optimizationStats: aggregateStats,
    memoryStats,
    glossaryStats,
    outputDir: outputDir,
  };
}

module.exports = {
  parseAndTranslate,
  parseFiles,
  parseDir,
};
