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
 * Parse directory recursively for UI strings
 *
 * @param {string} dirPath - Path to the directory
 * @param {string[]} [visibleAttributes] - Optional visible attributes
 * @returns {Promise<string[]>} Array of extracted strings
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
 * Parses UI files, extracts strings, and writes them to a source language JSON file
 * without translation. Useful for creating a base translation file or auditing extracted strings.
 * Ignores strings that already exist in the output file.
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
  const { visibleAttributes, excludeTags, logProgress = true } = options;

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
    progressBar.start(4, 0);
  }

  // Step 1: Check for existing output file and load existing strings
  if (progressBar) progressBar.update(1);

  const filePath = path.join(outputDir, `${sourceLanguageCode}.json`);
  let existingStrings = new Set();

  try {
    const existingContent = await fs.readFile(filePath, "utf8");
    const existingData = JSON.parse(existingContent);
    existingStrings = new Set(Object.keys(existingData));

    if (logProgress) {
      console.log(
        `Found ${existingStrings.size} existing strings in output file`
      );
    }
  } catch (error) {
    // File doesn't exist or can't be read - this is fine for first run
    if (logProgress && error.code !== "ENOENT") {
      console.log(
        "No existing file found or unable to read it - will create new file"
      );
    }
  }

  // Step 2: Parse UI files to extract strings
  if (progressBar) progressBar.update(2);

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
      if (progressBar) progressBar.stop();
      throw new Error(`Invalid source path: ${sourcePath}`);
    }
  } catch (error) {
    if (progressBar) progressBar.stop();
    throw new Error(`Failed to parse source path: ${error.message}`);
  }

  // Filter out existing strings
  const newStrings = extractedStrings.filter(
    (str) => !existingStrings.has(str)
  );

  if (logProgress) {
    console.log(`\nTotal strings extracted: ${extractedStrings.length}`);
    console.log(`New strings (not in existing file): ${newStrings.length}`);
    console.log(
      `Skipped (already exist): ${extractedStrings.length - newStrings.length}`
    );
  }

  if (newStrings.length === 0) {
    if (progressBar) progressBar.stop();
    console.log("No new strings to add");
    return {
      success: true,
      message: "No new strings found - all strings already exist",
      file: filePath,
      stringsExtracted: 0,
      stringsSkipped: extractedStrings.length,
      language: sourceLanguageCode,
      outputDir: outputDir,
    };
  }

  // Step 3: Create output object (original strings as both keys and values)
  if (progressBar) progressBar.update(3);

  const outputData = {};
  newStrings.forEach((str) => {
    outputData[str] = str;
  });

  // Step 4: Merge with existing data and write file
  try {
    // Load existing data again to merge
    let finalData = {};
    try {
      const existingContent = await fs.readFile(filePath, "utf8");
      finalData = JSON.parse(existingContent);
    } catch (error) {
      // File doesn't exist - start fresh
    }

    // Merge new strings with existing
    Object.assign(finalData, outputData);

    await writeFile(filePath, finalData);
    if (progressBar) progressBar.update(4);
    if (progressBar) progressBar.stop();

    if (logProgress) {
      console.log(`\nExtraction complete!`);
      console.log(`File updated: ${filePath}`);
      console.log(`New strings added: ${newStrings.length}`);
      console.log(`Total strings in file: ${Object.keys(finalData).length}`);
    }

    return {
      success: true,
      file: filePath,
      stringsExtracted: newStrings.length,
      stringsSkipped: extractedStrings.length - newStrings.length,
      totalStrings: Object.keys(finalData).length,
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
