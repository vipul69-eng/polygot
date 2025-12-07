const path = require("path");
const fs = require("fs").promises;
const cliProgress = require("../utils/cli-progress");
const { polygotParser } = require("../parser");
const { translateStrings } = require("../translator");
const { readFile, readDir } = require("../file-handler/reader");
const { writeFile } = require("../file-handler/writer");

/**
 * Parse a single file for UI strings
 */
async function parseFiles(filePath, visibleAttributes = undefined) {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("filePath must be a non-empty string");
  }

  const normalized = path.normalize(filePath);
  const content = await readFile(normalized);
  const extracted = polygotParser(content, visibleAttributes);

  return Array.from(new Set(extracted));
}

/**
 * Parse directory for UI strings
 */
async function parseDir(dirPath, visibleAttributes = undefined) {
  if (!dirPath || typeof dirPath !== "string") {
    throw new Error("dirPath must be a non-empty string");
  }

  const filePaths = await readDir(dirPath);
  const mergedSet = new Set();

  for (const fp of filePaths) {
    try {
      const content = await readFile(fp);
      const extracted = polygotParser(content, visibleAttributes);
      const uniqueExtracted = Array.from(new Set(extracted));
      uniqueExtracted.forEach((s) => mergedSet.add(s));
    } catch (err) {
      console.error(`Failed to process ${fp}: ${err.message}`);
    }
  }

  return Array.from(mergedSet);
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
  }

  // Step 1: Extract strings
  if (logProgress) {
    console.log("\nStep 1: Extracting strings from UI files...");
  }

  let extractedStrings;
  try {
    const stats = await fs.stat(sourcePath);

    if (stats.isDirectory()) {
      extractedStrings = await parseDir(sourcePath, visibleAttributes);
    } else if (stats.isFile()) {
      extractedStrings = await parseFiles(sourcePath, visibleAttributes);
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

  try {
    for (let i = 0; i < languages.length; i++) {
      const lang = languages[i];

      const result = await translateStrings(extractedStrings, lang, apiKey, {
        ...translationOptions,
        logProgress: false,
      });

      translationResults[lang] = result;

      totalTokens.input += result.tokensUsed.input;
      totalTokens.output += result.tokensUsed.output;
      totalTokens.total += result.tokensUsed.total;

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
    console.log(`Files created: ${writtenFiles.length}`);
    writtenFiles.forEach((file) => console.log(`  - ${file}`));
  }

  return {
    success: true,
    files: writtenFiles,
    stringsExtracted: extractedStrings.length,
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
