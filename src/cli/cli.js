#!/usr/bin/env node

const { Command } = require("commander");
const { chalk } = require("../utils/chalk");
const { ora } = require("../utils/ora");
const { parseAndExtract } = require("../workflow/parse-and-extract");
const { parseAndTranslate } = require("../workflow/parse-and-translate");
const packageJson = require("../../package.json");
const { GlossaryManager } = require("../translation-memory");

const program = new Command();

program
  .name("polygot")
  .description("CLI tool for extracting and translating UI strings")
  .version(packageJson.version);

/**
 * Extract command
 */
program
  .command("extract")
  .description("Extract UI strings from HTML/JSX/TSX files")
  .argument("<source>", "Source file or directory path")
  .argument("<language>", "Source language code (e.g., en, es, fr)")
  .argument("<output>", "Output directory for JSON files")
  .option(
    "-a, --attributes <attrs>",
    "Comma-separated list of attributes to extract (e.g., title,placeholder,aria*)",
    "title,alt,placeholder"
  )
  .option(
    "-e, --exclude <tags>",
    "Comma-separated list of tags/selectors to exclude (e.g., script,style,h1.container,div#header)",
    ""
  )
  .option("--no-progress", "Disable progress logging")
  .action(async (source, language, output, options) => {
    const spinner = ora("Extracting strings...").start();

    try {
      const attributes = options.attributes.split(",").map((a) => a.trim());
      const excludeTags = options.exclude
        ? options.exclude
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t.length > 0)
        : [];
      const result = await parseAndExtract(source, language, output, {
        visibleAttributes: attributes,
        logProgress: options.progress,
        excludeTags: excludeTags,
      });

      spinner.succeed(chalk.green("Extraction complete!"));

      console.log(chalk.cyan("\nResults:"));
      console.log(`  ${chalk.bold("File created:")} ${result.file}`);
      console.log(
        `  ${chalk.bold("Strings extracted:")} ${result.stringsExtracted}`
      );
      console.log(`  ${chalk.bold("Language:")} ${result.language}`);
      console.log(`  ${chalk.bold("Output directory:")} ${result.outputDir}`);
    } catch (error) {
      spinner.fail(chalk.red("Extraction failed"));
      console.error(chalk.red("\nError:"), error.message);
      process.exit(1);
    }
  });

// ... existing imports ...

/**
 * Translate command - UPDATED
 */
program
  .command("translate")
  .description("Extract and translate UI strings to target language(s)")
  .argument("<source>", "Source file or directory path")
  .argument(
    "<languages>",
    "Target language codes (comma-separated, e.g., es,fr,de)"
  )
  .argument("<output>", "Output directory for JSON files")
  .option(
    "-k, --api-key <key>",
    "OpenAI API key (or set OPENAI_API_KEY env variable)"
  )
  .option("-m, --model <model>", "OpenAI model to use", "gpt-4o-mini")
  .option("-c, --context <context>", "Translation context", "")
  .option(
    "-t, --tone <tone>",
    "Translation tone (formal, casual, neutral)",
    "neutral"
  )
  .option(
    "-a, --attributes <attrs>",
    "Comma-separated list of attributes to extract",
    "title,alt,placeholder,aria*"
  )
  .option(
    "-e, --exclude <tags>",
    "Comma-separated list of tags/selectors to exclude",
    ""
  )
  .option("--chunk-size <size>", "Maximum strings per API call", "50")
  .option("--no-formatting", "Do not preserve placeholders/variables")
  .option("--no-progress", "Disable progress logging")
  .option("--use-memory", "Use translation memory (default: true)", true)
  .option("--no-memory", "Disable translation memory")
  .option("--use-glossary", "Use glossary (default: true)", true)
  .option("--no-glossary", "Disable glossary")
  .option("--memory-path <path>", "Memory storage path", "./.polygot/memory")
  .option(
    "--glossary-path <path>",
    "Glossary file path",
    "./.polygot/glossary.json"
  )
  .option("--source-lang <lang>", "Source language code", "en")
  .action(async (source, languages, output, options) => {
    const spinner = ora("Starting translation...").start();

    try {
      const apiKey = options.apiKey || process.env.OPENAI_API_KEY;

      if (!apiKey) {
        spinner.fail(chalk.red("API key required"));
        console.error(chalk.red("\nError: OpenAI API key not provided"));
        console.log(
          chalk.yellow("\nProvide API key using one of these methods:")
        );
        console.log(
          "  1. --api-key flag: polygot translate <source> <langs> <output> --api-key YOUR_KEY"
        );
        console.log(
          "  2. Environment variable: export OPENAI_API_KEY=YOUR_KEY"
        );
        process.exit(1);
      }

      const langArray = languages.split(",").map((l) => l.trim());
      const attributes = options.attributes.split(",").map((a) => a.trim());
      const excludeTags = options.exclude
        ? options.exclude
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t.length > 0)
        : [];

      spinner.text = `Translating to ${langArray.length} language(s)...`;

      const result = await parseAndTranslate(
        source,
        langArray,
        apiKey,
        output,
        {
          visibleAttributes: attributes,
          model: options.model,
          context: options.context,
          tone: options.tone,
          maxChunkSize: parseInt(options.chunkSize),
          preserveFormatting: options.formatting,
          logProgress: options.progress,
          excludeTags: excludeTags,
          useMemory: options.memory,
          useGlossary: options.glossary,
          memoryPath: options.memoryPath,
          glossaryPath: options.glossaryPath,
          sourceLang: options.sourceLang,
        }
      );

      spinner.succeed(chalk.green("Translation complete!"));

      console.log(chalk.cyan("\nResults:"));
      console.log(`  ${chalk.bold("Files created:")} ${result.files.length}`);
      result.files.forEach((file) => {
        console.log(`    - ${file}`);
      });
      console.log(
        `  ${chalk.bold("Strings extracted:")} ${result.stringsExtracted}`
      );
      console.log(
        `  ${chalk.bold("Languages:")} ${result.languages.join(", ")}`
      );
      console.log(
        `  ${chalk.bold("Total tokens used:")} ${
          result.tokensUsed.total
        } (input: ${result.tokensUsed.input}, output: ${
          result.tokensUsed.output
        })`
      );

      if (result.optimizationStats) {
        const savings = (
          ((result.optimizationStats.fromMemory +
            result.optimizationStats.fromGlossary) /
            result.optimizationStats.totalStrings) *
          100
        ).toFixed(1);
        console.log(chalk.cyan("\nCost Optimization:"));
        console.log(
          `  ${chalk.bold("Memory cache hits:")} ${
            result.optimizationStats.fromMemory
          }`
        );
        console.log(
          `  ${chalk.bold("Glossary skips:")} ${
            result.optimizationStats.fromGlossary
          }`
        );
        console.log(
          `  ${chalk.bold("API calls:")} ${result.optimizationStats.fromAPI}`
        );
        console.log(`  ${chalk.bold("API savings:")} ~${savings}%`);
      }

      console.log(`  ${chalk.bold("Output directory:")} ${result.outputDir}`);
    } catch (error) {
      spinner.fail(chalk.red("Translation failed"));
      console.error(chalk.red("\nError:"), error.message);
      if (error.stack) {
        console.error(chalk.gray(error.stack));
      }
      process.exit(1);
    }
  });

// Update init command to include memory and glossary settings
program
  .command("init")
  .description("Initialize polygot configuration file")
  .option("-d, --dir <directory>", "Target directory", ".")
  .action((options) => {
    const fs = require("fs");
    const path = require("path");

    const configPath = path.join(options.dir, "polygot.config.json");

    if (fs.existsSync(configPath)) {
      console.log(chalk.yellow("Configuration file already exists!"));
      return;
    }

    const config = {
      source: "./src",
      output: "./public/locales",
      languages: ["es", "fr", "de"],
      sourceLang: "en",
      attributes: ["title", "alt", "placeholder", "aria*"],
      excludeTags: ["script", "style"],
      model: "gpt-4o-mini",
      context: "Web application UI",
      tone: "neutral",
      chunkSize: 50,
      useMemory: true,
      useGlossary: true,
      memoryPath: "./.polygot/memory",
      glossaryPath: "./.polygot/glossary.json",
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(chalk.green("✓ Created polygot.config.json"));
    console.log(chalk.cyan("\nNext steps:"));
    console.log("  1. Edit polygot.config.json with your settings");
    console.log("  2. Set your API key: export OPENAI_API_KEY=your_key");
    console.log(
      "  3. (Optional) Add glossary terms: polygot glossary add <term>"
    );
    console.log("  4. Run: polygot translate-config");
  });

// Update translate-config to use memory and glossary
program
  .command("translate-config")
  .description("Translate using polygot.config.json")
  .option("-c, --config <path>", "Path to config file", "./polygot.config.json")
  .option("-k, --api-key <key>", "OpenAI API key (overrides env variable)")
  .action(async (options) => {
    const fs = require("fs");
    const path = require("path");

    const spinner = ora("Loading configuration...").start();

    try {
      const configPath = path.resolve(options.config);

      if (!fs.existsSync(configPath)) {
        spinner.fail(chalk.red("Config file not found"));
        console.error(chalk.red(`\nError: ${configPath} does not exist`));
        console.log(
          chalk.yellow('\nRun "polygot init" to create a config file')
        );
        process.exit(1);
      }

      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      const apiKey = options.apiKey || process.env.OPENAI_API_KEY;

      if (!apiKey) {
        spinner.fail(chalk.red("API key required"));
        console.error(chalk.red("\nError: OpenAI API key not provided"));
        console.log(
          chalk.yellow(
            "\nSet environment variable: export OPENAI_API_KEY=your_key"
          )
        );
        process.exit(1);
      }

      spinner.text = "Translating...";

      const result = await parseAndTranslate(
        config.source,
        config.languages,
        apiKey,
        config.output,
        {
          visibleAttributes: config.attributes || [
            "title",
            "alt",
            "placeholder",
          ],
          model: config.model || "gpt-4o-mini",
          context: config.context || "",
          tone: config.tone || "neutral",
          maxChunkSize: config.chunkSize || 50,
          preserveFormatting: config.preserveFormatting !== false,
          logProgress: true,
          excludeTags: config.excludeTags || [],
          useMemory: config.useMemory !== false,
          useGlossary: config.useGlossary !== false,
          memoryPath: config.memoryPath || "./.polygot/memory",
          glossaryPath: config.glossaryPath || "./.polygot/glossary.json",
          sourceLang: config.sourceLang || "en",
        }
      );

      spinner.succeed(chalk.green("Translation complete!"));

      console.log(chalk.cyan("\nResults:"));
      console.log(`  ${chalk.bold("Files created:")} ${result.files.length}`);
      result.files.forEach((file) => {
        console.log(`    - ${file}`);
      });
      console.log(
        `  ${chalk.bold("Strings extracted:")} ${result.stringsExtracted}`
      );
      console.log(
        `  ${chalk.bold("Total tokens:")} ${result.tokensUsed.total}`
      );

      if (result.optimizationStats) {
        const savings = (
          ((result.optimizationStats.fromMemory +
            result.optimizationStats.fromGlossary) /
            result.optimizationStats.totalStrings) *
          100
        ).toFixed(1);
        console.log(chalk.cyan("\nOptimization:"));
        console.log(`  API savings: ~${savings}%`);
      }
    } catch (error) {
      spinner.fail(chalk.red("Translation failed"));
      console.error(chalk.red("\nError:"), error.message);
      process.exit(1);
    }
  });

/**
 * List supported languages
 */
program
  .command("languages")
  .description("List all supported language codes")
  .action(() => {
    const { SUPPORTED_LANGUAGES } = require("../src/translator/languages");

    console.log(chalk.cyan.bold("\nSupported Languages:\n"));

    Object.entries(SUPPORTED_LANGUAGES).forEach(([code, name]) => {
      console.log(`  ${chalk.green(code.padEnd(8))} ${name}`);
    });

    console.log(
      chalk.gray(
        `\nTotal: ${Object.keys(SUPPORTED_LANGUAGES).length} languages`
      )
    );
  });

program
  .command("glossary")
  .description("Add a term to the glossary")
  .argument("<term>", 'Term to add (e.g., "OpenAI", "API", "Dashboard")')
  .option(
    "-t, --translations <json>",
    'Translations as JSON object (e.g., \'{"es":"Hola","fr":"Bonjour"}\')'
  )
  .option(
    "-c, --category <category>",
    "Category: brand, technical, legal, ui, general",
    "general"
  )
  .option("-d, --description <desc>", "Term description or notes")
  .option("--no-translate", 'Mark term as "do not translate" (keep as-is)')
  .option("--case-sensitive", "Enable case-sensitive matching", true)
  .option("--no-case-sensitive", "Disable case-sensitive matching")
  .option("--context <context>", "Context or usage notes")
  .option("-p, --path <path>", "Glossary file path", "./.polygot/glossary.json")
  .action(async (term, options) => {
    try {
      const glossary = new GlossaryManager(options.path);
      await glossary.initialize();

      let translations = {};
      if (options.translations) {
        try {
          translations = JSON.parse(options.translations);
        } catch (e) {
          console.error(
            chalk.red("Error: Invalid JSON format for translations")
          );
          console.log(
            chalk.yellow('Example: \'{"es":"término","fr":"terme"}\'')
          );
          process.exit(1);
        }
      }

      await glossary.add(term, translations, {
        category: options.category,
        description: options.description,
        doNotTranslate: !options.translate,
        caseSensitive: options.caseSensitive,
        context: options.context,
      });

      console.log(chalk.green(`\n✓ Added term "${term}" to glossary`));
      console.log(`  Category: ${options.category}`);

      if (!options.translate) {
        console.log(
          chalk.yellow("  Mode: DO NOT TRANSLATE (will be kept as-is)")
        );
      } else if (Object.keys(translations).length > 0) {
        console.log("  Translations:");
        Object.entries(translations).forEach(([lang, trans]) => {
          console.log(`    ${lang}: "${trans}"`);
        });
      } else {
        console.log(chalk.gray("  No translations provided yet"));
        console.log(
          chalk.gray('  Use "polygot glossary update" to add translations')
        );
      }

      if (options.description) {
        console.log(`  Description: ${options.description}`);
      }
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// List terms
program
  .command("glossary-list")
  .description("List all glossary terms")
  .option("-c, --category <category>", "Filter by category")
  .option("--format <format>", "Output format: table, json, simple", "table")
  .option("-p, --path <path>", "Glossary file path", "./.polygot/glossary.json")
  .action(async (options) => {
    try {
      const glossary = new GlossaryManager(options.path);
      await glossary.initialize();

      const terms = options.category
        ? glossary.getByCategory(options.category)
        : Array.from(glossary.terms.values());

      if (terms.length === 0) {
        console.log(chalk.yellow("\nNo terms found in glossary."));
        console.log(chalk.gray("\nAdd terms with:"));
        console.log(chalk.gray('  polygot glossary add "YourTerm"'));
        console.log(chalk.gray('  polygot glossary add "API" --no-translate'));
        console.log(
          chalk.gray('  polygot glossary add "Dashboard" -t \'{"es":"Panel"}\'')
        );
        return;
      }

      if (options.format === "json") {
        console.log(JSON.stringify(terms, null, 2));
        return;
      }

      console.log(chalk.cyan.bold("\nGlossary Terms:\n"));

      if (options.format === "table") {
        // Table format
        terms.forEach((term, index) => {
          console.log(
            chalk.bold(`${index + 1}. ${term.term}`) +
              chalk.gray(` [${term.category}]`)
          );

          if (term.description) {
            console.log(`   ${chalk.gray(term.description)}`);
          }

          if (term.doNotTranslate) {
            console.log(`   ${chalk.yellow("⚠ DO NOT TRANSLATE")}`);
          } else if (Object.keys(term.translations).length > 0) {
            const translationStr = Object.entries(term.translations)
              .map(([lang, trans]) => `${lang}: "${trans}"`)
              .join(", ");
            console.log(`   Translations: ${translationStr}`);
          } else {
            console.log(chalk.gray("   No translations"));
          }

          if (term.context) {
            console.log(chalk.gray(`   Context: ${term.context}`));
          }

          console.log("");
        });
      } else {
        // Simple format
        terms.forEach((term) => {
          const flag = term.doNotTranslate ? chalk.yellow("[NO TRANS]") : "";
          console.log(
            `  ${term.term} ${flag} ${chalk.gray(`[${term.category}]`)}`
          );
        });
      }

      const stats = glossary.getStats();
      console.log(chalk.gray(`Total: ${stats.total} terms`));
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// Update term
program
  .command("glossary-update")
  .description("Update an existing term")
  .argument("<term>", "Term to update")
  .option(
    "-t, --add-translation <json>",
    'Add/update translations (e.g., \'{"es":"nuevo"}\')'
  )
  .option("-c, --category <category>", "Update category")
  .option("-d, --description <desc>", "Update description")
  .option("--translate", "Allow translation")
  .option("--no-translate", "Mark as do not translate")
  .option("--context <context>", "Update context")
  .option("-p, --path <path>", "Glossary file path", "./.polygot/glossary.json")
  .action(async (term, options) => {
    try {
      const glossary = new GlossaryManager(options.path);
      await glossary.initialize();

      const existing = glossary.get(term);
      if (!existing) {
        console.error(
          chalk.red(`\nError: Term "${term}" not found in glossary`)
        );
        console.log(
          chalk.gray('\nUse "polygot glossary list" to see all terms')
        );
        process.exit(1);
      }

      const updates = {};

      if (options.addTranslation) {
        try {
          const newTranslations = JSON.parse(options.addTranslation);
          updates.translations = {
            ...existing.translations,
            ...newTranslations,
          };
        } catch (e) {
          console.error(chalk.red("Error: Invalid JSON format"));
          process.exit(1);
        }
      }

      if (options.category) updates.category = options.category;
      if (options.description) updates.description = options.description;
      if (options.context) updates.context = options.context;
      if (options.translate !== undefined)
        updates.doNotTranslate = !options.translate;

      await glossary.update(term, updates);

      console.log(chalk.green(`\n✓ Updated term "${term}"`));

      if (updates.translations) {
        console.log("  Updated translations:");
        Object.entries(updates.translations).forEach(([lang, trans]) => {
          console.log(`    ${lang}: "${trans}"`);
        });
      }
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// Remove term
program
  .command("glossary-remove")
  .alias("delete")
  .description("Remove a term from glossary")
  .argument("<term>", "Term to remove")
  .option("-p, --path <path>", "Glossary file path", "./.polygot/glossary.json")
  .option("--confirm", "Skip confirmation prompt")
  .action(async (term, options) => {
    try {
      const glossary = new GlossaryManager(options.path);
      await glossary.initialize();

      const existing = glossary.get(term);
      if (!existing) {
        console.error(chalk.red(`\nError: Term "${term}" not found`));
        process.exit(1);
      }

      if (!options.confirm) {
        console.log(
          chalk.yellow(`\nAre you sure you want to remove "${term}"?`)
        );
        console.log(chalk.gray("Use --confirm flag to skip this prompt"));
        console.log(
          chalk.gray(
            'Command: polygot glossary remove "' + term + '" --confirm'
          )
        );
        return;
      }

      await glossary.delete(term);
      console.log(chalk.green(`\n✓ Removed term "${term}" from glossary`));
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });
// Parse arguments
program.parse();
