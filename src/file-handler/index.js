const { readFile, readDir, isUIFile } = require("./reader");
const { writeFile, writeMultipleFiles } = require("./writer");

module.exports = {
  readFile,
  readDir,
  isUIFile,
  writeFile,
  writeMultipleFiles,
};
