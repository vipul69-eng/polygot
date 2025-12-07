const OpenAI = require("openai");
const { SUPPORTED_LANGUAGES } = require("./languages");

/**
 * Translates an array of strings to a target language using OpenAI API
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
  } = options;

  // Validate target language
  if (!SUPPORTED_LANGUAGES[targetLanguage]) {
    throw new Error(
      `Unsupported language: ${targetLanguage}. Supported languages: ${Object.keys(
        SUPPORTED_LANGUAGES
      ).join(", ")}`
    );
  }

  // Validate inputs
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
      `\nStarting translation to ${SUPPORTED_LANGUAGES[targetLanguage]}`
    );
    console.log(`Total unique strings: ${uniqueStrings.length}`);
    console.log(`Model: ${model}`);
  }

  // Split strings into chunks
  const chunks = [];
  for (let i = 0; i < uniqueStrings.length; i += maxChunkSize) {
    chunks.push(uniqueStrings.slice(i, i + maxChunkSize));
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

  // Store all translations
  const allTranslations = {};

  // Process each chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    if (logProgress) {
      console.log(
        `\nProcessing chunk ${i + 1}/${chunks.length} (${
          chunk.length
        } strings)...`
      );
    }

    try {
      // Build the system prompt
      let systemPrompt = `You are a professional translator. Translate the following strings to ${SUPPORTED_LANGUAGES[targetLanguage]}.

Requirements:
- Maintain the same tone and style as the original
- Keep the translation natural and idiomatic
- Return ONLY a JSON object where keys are original strings and values are translations`;

      if (preserveFormatting) {
        systemPrompt += `\n- Preserve all placeholders, variables, and special formatting (e.g., {name}, \${variable}, %s, etc.)`;
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

    // Add delay between chunks
    if (i < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  if (logProgress) {
    console.log(`\nTranslation complete!`);
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
      chunks: chunks.length,
      model: model,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Batch translates strings to multiple languages
 *
 * @param {string[]} strings - Array of strings to translate
 * @param {string[]} targetLanguages - Array of target language codes
 * @param {string} apiKey - OpenAI API key
 * @param {Object} [options={}] - Translation options
 * @returns {Promise<Object>} Results for all languages
 */
async function batchTranslateStrings(
  strings,
  targetLanguages,
  apiKey,
  options = {}
) {
  const results = {};
  const totalTokens = { input: 0, output: 0, total: 0 };

  console.log(
    `\nStarting batch translation to ${targetLanguages.length} languages`
  );

  for (const language of targetLanguages) {
    const result = await translateStrings(strings, language, apiKey, {
      ...options,
      logProgress: false,
    });
    results[language] = result;

    totalTokens.input += result.tokensUsed.input;
    totalTokens.output += result.tokensUsed.output;
    totalTokens.total += result.tokensUsed.total;
  }

  return {
    results,
    totalTokens,
    languages: targetLanguages,
  };
}

module.exports = {
  translateStrings,
  batchTranslateStrings,
};
