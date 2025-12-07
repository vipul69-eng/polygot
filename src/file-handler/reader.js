const path = require("path");
const fs = require("fs").promises;

/**
 * Checks if a file has a valid UI file extension
 *
 * @param {string} filePath - Path to the file
 * @returns {boolean} True if file is .tsx, .jsx, or .html
 */
function isUIFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return [".tsx", ".jsx", ".html"].includes(ext);
}

/**
 * Reads a single UI file and returns its content
 *
 * @param {string} filePath - Path to the file
 * @returns {Promise<string>} File content as string
 * @throws {Error} If file is not a valid UI file or cannot be read
 */
async function readFile(filePath) {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("filePath must be a non-empty string");
  }

  // Check if file has valid extension
  if (!isUIFile(filePath)) {
    throw new Error(
      `File ${filePath} is not a valid UI file. Only .tsx, .jsx, and .html files are supported.`
    );
  }

  try {
    const content = await fs.readFile(filePath, "utf-8");
    return content;
  } catch (error) {
    throw new Error(`Error reading file ${filePath}: ${error.message}`);
  }
}

/**
 * Recursively scans a directory and returns all UI file paths
 *
 * @param {string} dirPath - Directory path to scan
 * @returns {Promise<string[]>} Array of file paths
 */
async function readDir(dirPath) {
  if (!dirPath || typeof dirPath !== "string") {
    throw new Error("dirPath must be a non-empty string");
  }

  const uiFiles = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (entry.name === "node_modules" || entry.name.startsWith(".")) {
          continue;
        }
        // Recursively scan subdirectories
        const subFiles = await readDir(fullPath);
        uiFiles.push(...subFiles);
      } else if (entry.isFile() && isUIFile(entry.name)) {
        uiFiles.push(fullPath);
      }
    }
  } catch (error) {
    throw new Error(`Error scanning directory ${dirPath}: ${error.message}`);
  }

  return uiFiles;
}

module.exports = {
  readFile,
  readDir,
  isUIFile,
};
