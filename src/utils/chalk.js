/**
 * Simple color utility using ANSI escape codes
 */

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",

  // Foreground colors
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",

  // Background colors
  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
};

function colorize(color, text) {
  return `${colors[color]}${text}${colors.reset}`;
}

const chalk = {
  red: (text) => colorize("red", text),
  green: (text) => colorize("green", text),
  yellow: (text) => colorize("yellow", text),
  blue: (text) => colorize("blue", text),
  cyan: (text) => colorize("cyan", text),
  magenta: (text) => colorize("magenta", text),
  gray: (text) => colorize("gray", text),
  white: (text) => colorize("white", text),
  bold: (text) => `${colors.bright}${text}${colors.reset}`,
};

// Add nested style support
chalk.red.bold = (text) =>
  `${colors.bright}${colors.red}${text}${colors.reset}`;
chalk.green.bold = (text) =>
  `${colors.bright}${colors.green}${text}${colors.reset}`;
chalk.yellow.bold = (text) =>
  `${colors.bright}${colors.yellow}${text}${colors.reset}`;
chalk.blue.bold = (text) =>
  `${colors.bright}${colors.blue}${text}${colors.reset}`;
chalk.cyan.bold = (text) =>
  `${colors.bright}${colors.cyan}${text}${colors.reset}`;

module.exports = { chalk, colors };
