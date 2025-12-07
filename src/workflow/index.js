const { parseAndTranslate } = require("./parse-and-translate");
const {
  parseAndExtract,
  parseFiles,
  parseDir,
} = require("./parse-and-extract");

module.exports = {
  parseAndTranslate,
  parseAndExtract,

  parseFiles,
  parseDir,
};
