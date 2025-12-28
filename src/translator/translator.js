const OpenAI = require("openai");
const { SUPPORTED_LANGUAGES } = require("./languages");

/**
 * Translates an array of strings to a target language using OpenAI API
 * Now supports glossary filtering to reduce token usage
 *
 * @param {string[]} strings - Array of strings to translate
 * @param {string} targetLanguage - Target language code
 * @param {string} apiKey - OpenAI API key
 * @param {Object} [options={}] - Optional configuration
 * @returns {Promise<Object>} Translation result with metadata
 */
async function translateStrings(strings, targetLanguage, apiKey, options = {}) {
  const {
    model = "gpt-4o-mini",
    context = "",
    tone = "neutral",
    maxChunkSize = 50,
    preserveFormatting = true,
    logProgress = true,
    glossary = null, // GlossaryManager instance
    sourceLang = "en",
  } = options;

  // Validate target language
  if (!SUPPORTED_LANGUAGES[targetLanguage]) {
    throw new Error(
      `Unsupported language: ${targetLanguage}. Supported languages: ${Object.keys(
        SUPPORTED_LANGUAGES
      ).join(", ")}`
    );
  }

  if (!Array.isArray(strings) || strings.length === 0) {
    throw new Error("Strings must be a non-empty array");
  }

  if (!apiKey) {
    throw new Error("OpenAI API key is required");
  }

  // Initialize OpenAI client
  const openai = new OpenAI({ apiKey });

  // Remove duplicates and empty strings
  const uniqueStrings = [...new Set(strings.filter((s) => s && s.trim()))];

  if (logProgress) {
    console.log(
      `Starting translation to ${SUPPORTED_LANGUAGES[targetLanguage]}`
    );
    console.log(`Total unique strings: ${uniqueStrings.length}`);
    console.log(`Model: ${model}`);
  }

  // Apply glossary filtering if provided
  let stringsToTranslate = uniqueStrings;
  let glossaryData = null;
  const allTranslations = {};

  if (glossary) {
    if (logProgress) {
      console.log("Applying glossary filtering...");
    }

    glossaryData = glossary.prepareForTranslation(
      uniqueStrings,
      targetLanguage
    );

    // Add skipped translations directly to final result
    glossaryData.skipTranslation.forEach((translation, original) => {
      allTranslations[original] = translation;
    });

    if (logProgress) {
      console.log(
        `Glossary filtered: ${glossaryData.skipTranslation.size} strings don't need API`
      );
      console.log(
        `Glossary placeholders: ${glossaryData.glossaryMap.size} terms to protect`
      );
    }

    stringsToTranslate = glossaryData.stringsForAPI;
  }

  // If all strings were handled by glossary, return early
  if (stringsToTranslate.length === 0) {
    if (logProgress) {
      console.log("All strings handled by glossary - no API calls needed!");
    }

    return {
      translations: allTranslations,
      tokensUsed: { input: 0, output: 0, total: 0, chunks: [] },
      language: {
        code: targetLanguage,
        name: SUPPORTED_LANGUAGES[targetLanguage],
      },
      metadata: {
        totalStrings: uniqueStrings.length,
        fromGlossary: uniqueStrings.length,
        fromAPI: 0,
        chunks: 0,
        model: model,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Split strings into chunks
  const chunks = [];
  for (let i = 0; i < stringsToTranslate.length; i += maxChunkSize) {
    chunks.push(stringsToTranslate.slice(i, i + maxChunkSize));
  }

  if (logProgress && chunks.length > 1) {
    console.log(
      `Split into ${chunks.length} chunks (max ${maxChunkSize} strings per chunk)`
    );
  }

  // Track token usage
  const tokenUsage = {
    input: 0,
    output: 0,
    total: 0,
    chunks: [],
  };

  // Process each chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    if (logProgress) {
      console.log(
        `Processing chunk ${i + 1}/${chunks.length} (${
          chunk.length
        } strings)...`
      );
    }

    try {
      // Build system prompt
      let systemPrompt = `You are a professional translator. Translate the following strings to ${SUPPORTED_LANGUAGES[targetLanguage]}.

Requirements:
- Maintain the same tone and style as the original
- Keep the translation natural and idiomatic
- Return ONLY a JSON object where keys are original strings and values are translations`;

      if (preserveFormatting) {
        systemPrompt += `\n- Preserve all placeholders, variables, and special formatting (e.g., {name}, \${variable}, %s, __GLOSSARY_N__)`;
      }

      if (tone !== "neutral") {
        systemPrompt += `\n- Use a ${tone} tone`;
      }

      if (context) {
        systemPrompt += `\n- Context: ${context}`;
      }

      // Build user prompt
      const userPrompt = JSON.stringify(chunk, null, 2);

      // Make API call
      const response = await openai.chat.completions.create({
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      // Parse response
      const translationText = response.choices[0].message.content;
      const translations = JSON.parse(translationText);

      // Merge translations
      Object.assign(allTranslations, translations);

      // Track token usage
      const chunkUsage = {
        chunkNumber: i + 1,
        input: response.usage.prompt_tokens,
        output: response.usage.completion_tokens,
        total: response.usage.total_tokens,
      };

      tokenUsage.input += chunkUsage.input;
      tokenUsage.output += chunkUsage.output;
      tokenUsage.total += chunkUsage.total;
      tokenUsage.chunks.push(chunkUsage);

      if (logProgress) {
        console.log(`Chunk ${i + 1} complete`);
        console.log(
          `Tokens: ${chunkUsage.input} input + ${chunkUsage.output} output = ${chunkUsage.total} total`
        );
      }
    } catch (error) {
      console.error(`Error processing chunk ${i + 1}:`, error.message);

      // For failed chunks, keep original strings
      chunk.forEach((str) => {
        allTranslations[str] = str;
      });
    }

    // Delay between chunks
    if (i < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Post-process with glossary if used
  if (glossary && glossaryData) {
    if (logProgress) {
      console.log("Restoring glossary terms in translations...");
    }

    // Only process the API translations, not the ones we skipped
    const apiTranslations = {};
    Object.keys(allTranslations).forEach((key) => {
      if (!glossaryData.skipTranslation.has(key)) {
        apiTranslations[key] = allTranslations[key];
      }
    });

    const processed = glossary.postprocessTranslations(
      apiTranslations,
      glossaryData.glossaryMap
    );

    // Merge back
    Object.assign(allTranslations, processed);
  }

  if (logProgress) {
    console.log("Translation complete!");
    console.log(
      `Total tokens used: ${tokenUsage.total} (${tokenUsage.input} input + ${tokenUsage.output} output)`
    );
  }

  return {
    translations: allTranslations,
    tokensUsed: tokenUsage,
    language: {
      code: targetLanguage,
      name: SUPPORTED_LANGUAGES[targetLanguage],
    },
    metadata: {
      totalStrings: uniqueStrings.length,
      fromGlossary: glossaryData ? glossaryData.skipTranslation.size : 0,
      fromAPI: stringsToTranslate.length,
      chunks: chunks.length,
      model: model,
      timestamp: new Date().toISOString(),
    },
  };
}

module.exports = {
  translateStrings,
  SUPPORTED_LANGUAGES,
};
