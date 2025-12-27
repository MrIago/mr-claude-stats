#!/usr/bin/env node
// mr-claude-stats - Accurate statusline for Claude Code CLI
// https://github.com/MrIago/mr-claude-stats

const fs = require('fs');
const readline = require('readline');

const VERSION = '1.1.0';

// Handle --help and --version
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`mr-claude-stats - The most accurate Claude Code statusline

INSTALL:
  npm install -g mr-claude-stats

SETUP:
  Add to ~/.claude/settings.json:

  {
    "statusLine": {
      "type": "command",
      "command": "mr-claude-stats"
    }
  }

WHAT IT SHOWS:
  ████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
  Opus 4.5                                     130k/200k (65%)

WORKS ON:
  Linux, macOS, Windows (native!)

MORE INFO:
  https://github.com/MrIago/mr-claude-stats`);
  process.exit(0);
}

if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log(`mr-claude-stats v${VERSION}`);
  process.exit(0);
}

// ANSI colors (pastel)
const BLUE = '\x1b[38;5;117m';
const GREEN = '\x1b[38;5;114m';
const YELLOW = '\x1b[38;5;186m';
const ORANGE = '\x1b[38;5;216m';
const RED = '\x1b[38;5;174m';
const GRAY = '\x1b[38;5;242m';
const RESET = '\x1b[0m';

function formatTokens(n) {
  return n >= 1000 ? Math.floor(n / 1000) + 'k' : String(n);
}

function getColorForPercent(percent) {
  if (percent < 25) return GREEN;
  if (percent < 50) return YELLOW;
  if (percent < 75) return ORANGE;
  return RED;
}

function buildProgressBar(percent, size = 60) {
  const filled = Math.floor(percent * size / 100);
  const empty = size - filled;

  const t1 = Math.floor(size * 0.25);
  const t2 = Math.floor(size * 0.50);
  const t3 = Math.floor(size * 0.75);

  let bar = '';
  for (let i = 0; i < filled; i++) {
    if (i < t1) bar += GREEN + '█';
    else if (i < t2) bar += YELLOW + '█';
    else if (i < t3) bar += ORANGE + '█';
    else bar += RED + '█';
  }
  bar += GRAY + '░'.repeat(empty) + RESET;
  return bar;
}

function getCacheFile(sessionId) {
  const os = require('os');
  return require('path').join(os.tmpdir(), `statusline_cache_${sessionId || 'default'}`);
}

function readCache(sessionId) {
  try {
    const cacheFile = getCacheFile(sessionId);
    if (fs.existsSync(cacheFile)) {
      return parseInt(fs.readFileSync(cacheFile, 'utf8').trim()) || 0;
    }
  } catch (e) {}
  return 0;
}

function writeCache(sessionId, value) {
  try {
    fs.writeFileSync(getCacheFile(sessionId), String(value));
  } catch (e) {}
}

function findLastUsage(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;

  try {
    const content = fs.readFileSync(transcriptPath, 'utf8');
    const lines = content.trim().split('\n').reverse();

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const usage = entry.usage || (entry.message && entry.message.usage);
        if (usage && usage.input_tokens !== undefined) {
          return usage;
        }
      } catch (e) {}
    }
  } catch (e) {}
  return null;
}

async function main() {
  // Read JSON from stdin
  const rl = readline.createInterface({ input: process.stdin });
  let inputData = '';

  for await (const line of rl) {
    inputData += line;
  }

  let input;
  try {
    input = JSON.parse(inputData);
  } catch (e) {
    input = {};
  }

  const model = input.model?.display_name || 'Claude';
  const contextSize = input.context_window?.context_window_size || 200000;
  const transcriptPath = input.transcript_path || '';
  const sessionId = input.session_id || 'default';

  // Calculate total tokens
  let total = 0;
  const usage = findLastUsage(transcriptPath);

  if (usage) {
    const inputTokens = usage.input_tokens || 0;
    const cacheCreate = usage.cache_creation_input_tokens || 0;
    const cacheRead = usage.cache_read_input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const autocompactBuffer = 45000;

    total = inputTokens + cacheCreate + cacheRead + outputTokens + autocompactBuffer;
    writeCache(sessionId, total);
  } else {
    total = readCache(sessionId);
  }

  // If no data, show only model
  if (total === 0) {
    console.log(`${BLUE}${model}${RESET}`);
    return;
  }

  const percent = Math.floor(total * 100 / contextSize);
  const textColor = getColorForPercent(percent);

  // Format output
  const totalFmt = formatTokens(total);
  const contextFmt = formatTokens(contextSize);
  const info = `${totalFmt}/${contextFmt} (${percent}%)`.padStart(18);

  // Row 1: Progress bar
  console.log(buildProgressBar(percent));
  // Row 2: Model (left) + tokens (right)
  console.log(`${BLUE}${model.padEnd(42)}${RESET}${textColor}${info}${RESET}`);
}

main().catch(() => process.exit(1));
