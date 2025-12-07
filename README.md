# Polygot CLI

Command-line interface for extracting and translating UI strings.

## Installation

### Global Installation

```bash
npm install -g polygot
```

### Local Installation

```bash
npm install polygot
npx polygot --help
```

## Commands

### Extract Strings

Extract UI strings from source files without translation:

```bash
polygot extract <source> <language> <output> [options]
```

**Arguments:**

- `source` - Source file or directory path
- `language` - Source language code (e.g., en, es, fr)
- `output` - Output directory for JSON files

**Options:**

- `-a, --attributes <attrs>` - Comma-separated attributes (default: title,alt,placeholder)
- `--no-progress` - Disable progress logging

**Examples:**

```bash
# Extract from single file
polygot extract ./src/App.tsx en ./locales

# Extract from directory
polygot extract ./src en ./public/locales

# Extract with custom attributes
polygot extract ./src en ./locales --attributes "title,placeholder,aria*,data-*"

# Extract without progress
polygot extract ./src en ./locales --no-progress
```

### Translate Strings

Extract and translate strings to target language(s):

```bash
polygot translate <source> <languages> <output> [options]
```

**Arguments:**

- `source` - Source file or directory path
- `languages` - Target language codes (comma-separated)
- `output` - Output directory for JSON files

**Options:**

- `-k, --api-key <key>` - OpenAI API key
- `-m, --model <model>` - OpenAI model (default: gpt-4o-mini)
- `-c, --context <context>` - Translation context
- `-t, --tone <tone>` - Translation tone: formal, casual, neutral (default: neutral)
- `-a, --attributes <attrs>` - Attributes to extract (default: title,alt,placeholder,aria\*)
- `--chunk-size <size>` - Max strings per API call (default: 50)
- `--no-formatting` - Don't preserve placeholders
- `--no-progress` - Disable progress logging

**Examples:**

```bash
# Basic translation to Spanish
polygot translate ./src es ./locales --api-key sk-...

# Translate to multiple languages
polygot translate ./src es,fr,de ./locales --api-key sk-...

# Using environment variable for API key
export OPENAI_API_KEY=sk-...
polygot translate ./src es,fr,de ./locales

# With context and tone
polygot translate ./src es,fr ./locales \
  --api-key sk-... \
  --context "E-commerce website" \
  --tone casual

# With custom model and attributes
polygot translate ./src es ./locales \
  --api-key sk-... \
  --model gpt-4 \
  --attributes "title,placeholder,aria*" \
  --chunk-size 30
```

### Initialize Config

Create a configuration file:

```bash
polygot init [options]
```

**Options:**

- `-d, --dir <directory>` - Target directory (default: current)

**Example:**

```bash
polygot init
```

Creates `polygot.config.json`:

```json
{
  "source": "./src",
  "output": "./public/locales",
  "languages": ["es", "fr", "de"],
  "attributes": ["title", "alt", "placeholder", "aria*"],
  "model": "gpt-4o-mini",
  "context": "Web application UI",
  "tone": "neutral",
  "chunkSize": 50
}
```

### Translate Using Config

Translate using config file:

```bash
polygot translate-config [options]
```

**Options:**

- `-c, --config <path>` - Path to config file (default: ./polygot.config.json)
- `-k, --api-key <key>` - OpenAI API key (overrides env)

**Examples:**

```bash
# Use default config
export OPENAI_API_KEY=sk-...
polygot translate-config

# Use custom config
polygot translate-config --config ./my-config.json --api-key sk-...
```

### List Languages

Show all supported language codes:

```bash
polygot languages
```

## Workflow Examples

### Workflow 1: Quick Start

```bash
# 1. Extract English strings
polygot extract ./src en ./locales

# 2. Translate to Spanish and French
export OPENAI_API_KEY=sk-...
polygot translate ./src es,fr ./locales
```

### Workflow 2: Using Config File

```bash
# 1. Initialize config
polygot init

# 2. Edit polygot.config.json with your settings

# 3. Run translation
export OPENAI_API_KEY=sk-...
polygot translate-config
```

### Workflow 3: CI/CD Pipeline

```bash
#!/bin/bash
set -e

echo "Extracting strings..."
polygot extract ./src en ./public/locales

echo "Translating to target languages..."
polygot translate ./src es,fr,de,ja ./public/locales \
  --api-key $OPENAI_API_KEY \
  --context "SaaS application" \
  --tone professional \
  --no-progress

echo "Translation complete!"
```

### Workflow 4: Pre-commit Hook

**.git/hooks/pre-commit**

```bash
#!/bin/bash

# Check if source files changed
if git diff --cached --name-only | grep -E '\.(tsx?|jsx?|html)$'; then
  echo "UI files changed, updating translations..."

  # Extract English strings
  polygot extract ./src en ./public/locales --no-progress

  # Add updated locales to commit
  git add ./public/locales/en.json

  echo "✓ Translations updated"
fi
```

## Environment Variables

- `OPENAI_API_KEY` - Your OpenAI API key (required for translation)

## Configuration File

Example `polygot.config.json`:

```json
{
  "source": "./src",
  "output": "./public/locales",
  "languages": ["es", "fr", "de", "ja", "zh"],
  "attributes": [
    "title",
    "alt",
    "placeholder",
    "aria-label",
    "aria-describedby",
    "aria*"
  ],
  "model": "gpt-4o-mini",
  "context": "E-commerce platform for selling electronics",
  "tone": "friendly",
  "chunkSize": 50,
  "preserveFormatting": true
}
```

## Tips

1. **API Key Security**: Never commit your API key. Use environment variables.

2. **Cost Optimization**: Use `--chunk-size` to control API costs. Smaller chunks = more API calls.

3. **Context Matters**: Provide good context with `--context` for better translations.

4. **Wildcard Attributes**: Use patterns like `aria*` or `data-*` to match multiple attributes.

5. **Progress Logging**: Use `--no-progress` in CI/CD to reduce output noise.

## Troubleshooting

**Command not found**

```bash
npm link  # Re-link the package
```

**API key errors**

```bash
export OPENAI_API_KEY=your_key
polygot translate ./src es ./locales  # Try again
```

**Permission errors**

```bash
chmod +x cli/polygot.js
chmod +x cli/index.js
```
