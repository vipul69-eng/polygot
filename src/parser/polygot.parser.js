/**
 * Extracts user-visible strings from JSX/TSX or HTML code.
 *
 * @param {string} code - The JSX/TSX or HTML code to parse
 * @param {string[]} [visibleAttributes=['title', 'alt', 'placeholder']] - Array of attribute names to extract strings from
 * @param {string[]} [excludeTags=[]] - Array of tags/selectors to exclude (e.g., ['script', 'style', 'h1.container', 'div#header'])
 * @returns {string[]} Array of unique, user-visible strings found in the code
 */
function polygotParser(
  code,
  visibleAttributes = ["title", "alt", "placeholder"],
  excludeTags = []
) {
  const strings = new Set();

  // Remove comments from code to avoid extracting strings from commented sections
  code = code
    .replace(/\/\*[\s\S]*?\*\//g, "") // Remove block comments
    .replace(/\/\/.*/g, ""); // Remove line comments

  // Parse exclude tags into structured format
  const excludeRules = parseExcludeRules(excludeTags);

  // Extract text content between JSX/HTML tags
  // FIXED: Allow newlines in text content by including \n in the character class
  const jsxTextRegex = />([^<>{}]+)</g;
  let match;

  while ((match = jsxTextRegex.exec(code)) !== null) {
    const rawText = match[1];

    // Split by self-closing tags like <br /> and process each segment
    const segments = rawText.split(/<[^>]+\/>/);

    segments.forEach((segment) => {
      const text = segment.trim();

      // Check if this text should be excluded
      if (
        text &&
        !text.match(/^\s*$/) &&
        !shouldExcludeText(code, match.index, excludeRules)
      ) {
        strings.add(text);
      }
    });
  }

  // Extract strings from JSX expressions (content within curly braces)
  const jsxExpressionRegex = /\{([^}]+)\}/g;

  while ((match = jsxExpressionRegex.exec(code)) !== null) {
    const expr = match[1];

    // Check if this expression is within excluded tag
    if (shouldExcludeText(code, match.index, excludeRules)) {
      continue;
    }

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

      // Check if this attribute is within excluded tag
      if (text && !shouldExcludeText(code, match.index, excludeRules)) {
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

/**
 * Parse exclude rules into structured format
 * Supports: 'div', 'h1.container', 'div#header', 'button.primary.large'
 */
function parseExcludeRules(excludeTags) {
  return excludeTags.map((selector) => {
    const rule = {
      tag: null,
      id: null,
      classes: [],
    };

    // Parse selector
    let remaining = selector.trim();

    // Extract tag name (everything before . or #)
    const tagMatch = remaining.match(/^([a-zA-Z0-9-]+)/);
    if (tagMatch) {
      rule.tag = tagMatch[1].toLowerCase();
      remaining = remaining.slice(tagMatch[0].length);
    }

    // Extract ID (if present)
    const idMatch = remaining.match(/#([a-zA-Z0-9-_]+)/);
    if (idMatch) {
      rule.id = idMatch[1];
      remaining = remaining.replace(idMatch[0], "");
    }

    // Extract classes (all remaining .classname)
    const classMatches = remaining.matchAll(/\.([a-zA-Z0-9-_]+)/g);
    for (const match of classMatches) {
      rule.classes.push(match[1]);
    }

    return rule;
  });
}

/**
 * Check if text at given position should be excluded based on rules
 */
function shouldExcludeText(code, position, excludeRules) {
  if (!excludeRules || excludeRules.length === 0) {
    return false;
  }

  // Build a stack of open tags up to the position
  const stack = [];
  const tagRegex = /<\/?([a-zA-Z0-9-]+)([^>]*)>/g;
  let match;

  // Reset regex
  tagRegex.lastIndex = 0;

  while ((match = tagRegex.exec(code)) !== null) {
    // Stop if we've passed the position we're checking
    if (match.index >= position) {
      break;
    }

    const fullTag = match[0];
    const tagName = match[1].toLowerCase();
    const attrsChunk = match[2] || "";
    const isClosing = fullTag.startsWith("</");
    const isSelfClosing = /\/\s*>$/.test(fullTag);

    if (isClosing) {
      // Pop the last matching tag from the stack
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tagName) {
          stack.splice(i, 1);
          break;
        }
      }
      continue;
    }

    // Skip self-closing tags - they don't create a context
    if (isSelfClosing) {
      continue;
    }

    // Opening tag - parse its attributes
    const tagInfo = {
      tag: tagName,
      id: null,
      classes: [],
      position: match.index,
    };

    // Extract id
    const idMatch = attrsChunk.match(/id\s*=\s*["']([^"']+)["']/i);
    if (idMatch) {
      tagInfo.id = idMatch[1];
    }

    // Extract class
    const classMatch = attrsChunk.match(/class\s*=\s*["']([^"']+)["']/i);
    if (classMatch) {
      tagInfo.classes = classMatch[1].split(/\s+/).filter((c) => c.length > 0);
    }

    // Extract className (JSX)
    const classNameMatch = attrsChunk.match(
      /className\s*=\s*["']([^"']+)["']/i
    );
    if (classNameMatch) {
      tagInfo.classes = [
        ...tagInfo.classes,
        ...classNameMatch[1].split(/\s+/).filter((c) => c.length > 0),
      ];
    }

    // Also handle className with curly braces (JSX dynamic)
    const classNameExprMatch = attrsChunk.match(
      /className\s*=\s*\{[^}]*["']([^"']+)["'][^}]*\}/i
    );
    if (classNameExprMatch) {
      tagInfo.classes = [
        ...tagInfo.classes,
        ...classNameExprMatch[1].split(/\s+/).filter((c) => c.length > 0),
      ];
    }

    stack.push(tagInfo);
  }

  // Check if any ancestor in the stack matches any exclude rule
  for (const ancestor of stack) {
    if (matchesExcludeRule(ancestor, excludeRules)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a tag info matches any exclude rule
 */
function matchesExcludeRule(tagInfo, excludeRules) {
  for (const rule of excludeRules) {
    // If rule has a tag, it must match
    if (rule.tag && rule.tag !== tagInfo.tag) {
      continue;
    }

    // If rule only specifies tag (no id or classes), match immediately
    if (rule.tag && !rule.id && rule.classes.length === 0) {
      return true;
    }

    // If rule specifies id, it must match
    if (rule.id && rule.id !== tagInfo.id) {
      continue;
    }

    // If rule specifies classes, tag must have ALL of them
    if (rule.classes.length > 0) {
      const hasAllClasses = rule.classes.every((cls) =>
        tagInfo.classes.includes(cls)
      );
      if (!hasAllClasses) {
        continue;
      }
    }

    // If we got here, all conditions matched
    return true;
  }

  return false;
}

module.exports = { polygotParser };
