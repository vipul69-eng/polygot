const path = require("path");
const fs = require("fs").promises;
const cliProgress = require("../utils/cli-progress");
const { polygotParser } = require("../parser");
const { readFile, readDir } = require("../file-handler/reader");
const { writeFile } = require("../file-handler/writer");

/**
 * Parse a single file for UI strings
 *
 * @param {string} filePath - Path to the file
 * @param {string[]} [visibleAttributes] - Optional visible attributes
 * @returns {Promise<string[]>} Array of extracted strings
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
 * Parse directory recursively for UI strings
 *
 * @param {string} dirPath - Path to the directory
 * @param {string[]} [visibleAttributes] - Optional visible attributes
 * @returns {Promise<string[]>} Array of extracted strings
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
 * Parses UI files, extracts strings, and writes them to a source language JSON file
 * without translation. Useful for creating a base translation file or auditing extracted strings.
 *
 * @param {string} sourcePath - Path to a single file or directory to scan
 * @param {string} sourceLanguageCode - Source language code (e.g., 'en')
 * @param {string} outputDir - Output directory path (e.g., 'public/locales')
 * @param {Object} [options={}] - Optional configuration
 * @param {string[]} [options.visibleAttributes] - Attributes to extract from UI files
 * @param {boolean} [options.logProgress=true] - Log progress
 * @returns {Promise<Object>} Result object with file path and metadata
 *
 * @example
 * // Extract English strings without translation
 * await parseAndExtract('./src', 'en', 'public/locales');
 * // Creates: public/locales/en.json with original strings
 */
async function parseAndExtract(
  sourcePath,
  sourceLanguageCode,
  outputDir,
  options = {}
) {
  const { visibleAttributes, logProgress = true } = options;

  if (logProgress) {
    console.log("\nStarting parse and extract workflow");
    console.log(`Source: ${sourcePath}`);
    console.log(`Source language: ${sourceLanguageCode}`);
    console.log(`Output directory: ${outputDir}`);
  }

  // Create progress bar
  let progressBar;
  if (logProgress) {
    progressBar = new cliProgress.SingleBar({
      format:
        "Extraction Progress |{bar}| {percentage}% | {value}/{total} Steps",
      barCompleteChar: "\u2588",
      barIncompleteChar: "\u2591",
      hideCursor: true,
    });
    progressBar.start(3, 0);
  }

  // Step 1: Parse UI files to extract strings
  if (progressBar) progressBar.update(1);

  let extractedStrings;
  try {
    const stats = await fs.stat(sourcePath);

    if (stats.isDirectory()) {
      extractedStrings = await parseDir(sourcePath, visibleAttributes);
    } else if (stats.isFile()) {
      extractedStrings = await parseFiles(sourcePath, visibleAttributes);
    } else {
      if (progressBar) progressBar.stop();
      throw new Error(`Invalid source path: ${sourcePath}`);
    }
  } catch (error) {
    if (progressBar) progressBar.stop();
    throw new Error(`Failed to parse source path: ${error.message}`);
  }

  if (extractedStrings.length === 0) {
    if (progressBar) progressBar.stop();
    console.warn("Warning: No strings found");
    return {
      success: false,
      message: "No strings extracted",
      file: null,
    };
  }

  // Step 2: Create output object (original strings as both keys and values)
  if (progressBar) progressBar.update(2);

  const outputData = {};
  extractedStrings.forEach((str) => {
    outputData[str] = str;
  });

  // Step 3: Write file
  const filePath = path.join(outputDir, `${sourceLanguageCode}.json`);

  try {
    await writeFile(filePath, outputData);
    if (progressBar) progressBar.update(3);
    if (progressBar) progressBar.stop();

    if (logProgress) {
      console.log(`\nExtraction complete!`);
      console.log(`File created: ${filePath}`);
      console.log(`Total strings: ${extractedStrings.length}`);
    }

    return {
      success: true,
      file: filePath,
      stringsExtracted: extractedStrings.length,
      language: sourceLanguageCode,
      outputDir: outputDir,
    };
  } catch (error) {
    if (progressBar) progressBar.stop();
    throw new Error(`Failed to write output file: ${error.message}`);
  }
}

module.exports = {
  parseAndExtract,
  parseFiles,
  parseDir,
};
