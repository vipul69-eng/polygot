/**
 * Extracts user-visible strings from JSX/TSX or HTML code.
 *
 * @param {string} code - The JSX/TSX or HTML code to parse
 * @param {string[]} [visibleAttributes=['title', 'alt', 'placeholder']] - Array of attribute names to extract strings from
 * @returns {string[]} Array of unique, user-visible strings found in the code
 */
function polygotParser(
  code,
  visibleAttributes = ["title", "alt", "placeholder"]
) {
  const strings = new Set();

  // Remove comments from code to avoid extracting strings from commented sections
  code = code
    .replace(/\/\*[\s\S]*?\*\//g, "") // Remove block comments
    .replace(/\/\/.*/g, ""); // Remove line comments

  // Extract text content between JSX/HTML tags
  const jsxTextRegex = />([^<>{}\n]+)</g;
  let match;

  while ((match = jsxTextRegex.exec(code)) !== null) {
    const text = match[1].trim();
    if (text && !text.match(/^\s*$/)) {
      strings.add(text);
    }
  }

  // Extract strings from JSX expressions (content within curly braces)
  const jsxExpressionRegex = /\{([^}]+)\}/g;

  while ((match = jsxExpressionRegex.exec(code)) !== null) {
    const expr = match[1];

    // Find all string literals (double quotes, single quotes, and backticks)
    const stringLiterals = [
      ...expr.matchAll(/"([^"\\]*(\\.[^"\\]*)*)"/g), // Double-quoted strings
      ...expr.matchAll(/'([^'\\]*(\\.[^'\\]*)*)'/g), // Single-quoted strings
      ...expr.matchAll(/`([^`\\]*(\\.[^`\\]*)*)`/g), // Template literals
    ];

    stringLiterals.forEach((m) => {
      const str = m[1].trim();
      if (str) {
        strings.add(str);
      }
    });

    // Extract static parts from template literals (ignoring interpolated expressions)
    const templateParts = expr.match(/`([^`]*)`/g);

    if (templateParts) {
      templateParts.forEach((template) => {
        // Split by interpolation expressions and extract static text
        const parts = template.slice(1, -1).split(/\$\{[^}]+\}/);
        parts.forEach((part) => {
          const cleaned = part.trim();
          if (cleaned) {
            strings.add(cleaned);
          }
        });
      });
    }
  }

  // Extract visible attribute values based on user-provided attributes
  if (visibleAttributes && visibleAttributes.length > 0) {
    // Convert attribute patterns to regex patterns
    const attrPatterns = visibleAttributes.map((attr) => {
      // Escape special regex characters except asterisk
      const escaped = attr.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
      // Convert asterisk wildcards to regex pattern
      return escaped.replace(/\*/g, "[a-zA-Z0-9\\-]*");
    });

    // Create regex pattern with user-specified attributes
    const attrPattern = `(?:${attrPatterns.join("|")})`;
    const visibleAttrRegex = new RegExp(
      `(${attrPattern})\\s*=\\s*["']([^"']+)["']`,
      "gi"
    );

    while ((match = visibleAttrRegex.exec(code)) !== null) {
      const text = match[2].trim();
      if (text) {
        strings.add(text);
      }
    }
  }

  // Map of common HTML entities to their decoded characters
  const entityMap = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
  };

  // Decode HTML entities and filter out invalid strings
  const finalStrings = Array.from(strings)
    .map((str) => {
      let decoded = str;
      // Replace each HTML entity with its corresponding character
      for (const [entity, char] of Object.entries(entityMap)) {
        decoded = decoded.replace(new RegExp(entity, "g"), char);
      }
      return decoded;
    })
    .filter((str) => {
      // Filter out empty strings, whitespace-only strings, and punctuation-only strings
      return (
        str.length > 0 && !str.match(/^\s*$/) && !str.match(/^[{}()\[\];,]+$/)
      );
    });

  // Return deduplicated array of strings
  return [...new Set(finalStrings)];
}

module.exports = { polygotParser };
