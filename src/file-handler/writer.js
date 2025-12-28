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

  let fileContent = content;

  // If content is an object and file exists, merge with existing JSON
  if (typeof content === "object") {
    try {
      const existingContent = await fs.readFile(filePath, encoding);
      const existingJson = JSON.parse(existingContent);

      // Merge existing JSON with new content
      fileContent = { ...existingJson, ...content };
    } catch (error) {
      // File doesn't exist or isn't valid JSON, use new content as-is
      fileContent = content;
    }

    fileContent = JSON.stringify(fileContent, null, indent);
  }

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
