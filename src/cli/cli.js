#!/usr/bin/env node

const { Command } = require("commander");
const { chalk } = require("../utils/chalk");
const { ora } = require("../utils/ora");
const { parseAndExtract } = require("../workflow/parse-and-extract");
const { parseAndTranslate } = require("../workflow/parse-and-translate");
const packageJson = require("../../package.json");

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
  .option("--no-progress", "Disable progress logging")
  .action(async (source, language, output, options) => {
    const spinner = ora("Extracting strings...").start();

    try {
      const attributes = options.attributes.split(",").map((a) => a.trim());

      const result = await parseAndExtract(source, language, output, {
        visibleAttributes: attributes,
        logProgress: options.progress,
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

/**
 * Translate command
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
  .option("--chunk-size <size>", "Maximum strings per API call", "50")
  .option("--no-formatting", "Do not preserve placeholders/variables")
  .option("--no-progress", "Disable progress logging")
  .action(async (source, languages, output, options) => {
    const spinner = ora("Starting translation...").start();

    try {
      // Get API key
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

/**
 * Init command - Create example config
 */
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
      attributes: ["title", "alt", "placeholder", "aria*"],
      model: "gpt-4o-mini",
      context: "Web application UI",
      tone: "neutral",
      chunkSize: 50,
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(chalk.green("✓ Created polygot.config.json"));
    console.log(chalk.cyan("\nNext steps:"));
    console.log("  1. Edit polygot.config.json with your settings");
    console.log("  2. Set your API key: export OPENAI_API_KEY=your_key");
    console.log("  3. Run: polygot translate-config");
  });

/**
 * Translate using config file
 */
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
          visibleAttributes: config.attributes,
          model: config.model,
          context: config.context,
          tone: config.tone,
          maxChunkSize: config.chunkSize,
          preserveFormatting: config.preserveFormatting !== false,
          logProgress: true,
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

// Parse arguments
program.parse();
