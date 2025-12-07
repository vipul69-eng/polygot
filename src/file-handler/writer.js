const path = require("path");
const fs = require("fs").promises;

/**
 * Writes content to a file, creating the directory structure if it doesn't exist
 *
 * @param {string} filePath - Full path to the file to write
 * @param {string|Object} content - Content to write (will be JSON stringified if object)
 * @param {Object} [options={}] - Write options
 * @param {string} [options.encoding='utf-8'] - File encoding
 * @param {number} [options.indent=2] - JSON indentation (if content is object)
 * @returns {Promise<void>}
 */
async function writeFile(filePath, content, options = {}) {
  const { encoding = "utf-8", indent = 2 } = options;

  if (!filePath || typeof filePath !== "string") {
    throw new Error("filePath must be a non-empty string");
  }

  // Get directory path from file path
  const dirPath = path.dirname(filePath);

  // Create directory structure if it doesn't exist
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    throw new Error(`Failed to create directory ${dirPath}: ${error.message}`);
  }

  // Convert object to JSON string if needed
  const fileContent =
    typeof content === "object"
      ? JSON.stringify(content, null, indent)
      : content;

  // Write file
  try {
    await fs.writeFile(filePath, fileContent, encoding);
  } catch (error) {
    throw new Error(`Failed to write file ${filePath}: ${error.message}`);
  }
}

/**
 * Writes multiple files to disk
 *
 * @param {Object} files - Object where keys are file paths and values are content
 * @param {Object} [options={}] - Write options
 * @returns {Promise<string[]>} Array of written file paths
 */
async function writeMultipleFiles(files, options = {}) {
  const writtenFiles = [];

  for (const [filePath, content] of Object.entries(files)) {
    try {
      await writeFile(filePath, content, options);
      writtenFiles.push(filePath);
    } catch (error) {
      console.error(`Failed to write ${filePath}: ${error.message}`);
    }
  }

  return writtenFiles;
}

module.exports = {
  writeFile,
  writeMultipleFiles,
};
