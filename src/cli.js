#!/usr/bin/env node

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { Command } from 'commander';
import { ApifyClient } from 'apify-client';
import { XScraper } from './scraper.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const CONFIG_DIR = join(homedir(), '.x-scraper');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

// ---------------------------------------------------------------------------
// Config file helpers
// ---------------------------------------------------------------------------

export function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function saveConfig(config) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// Token resolution: --token flag > APIFY_TOKEN env > config file
// ---------------------------------------------------------------------------

export function resolveToken(opts) {
  const token =
    opts?.token ||
    process.env.APIFY_TOKEN ||
    loadConfig().token;

  if (!token) {
    console.error(
      'Error: No Apify token found.\n\n' +
      'Provide one via:\n' +
      '  1. --token <token> flag\n' +
      '  2. APIFY_TOKEN environment variable\n' +
      '  3. Run "x-scraper init" to store your token\n'
    );
    process.exit(1);
  }

  return token;
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

export function formatOutput(items, opts) {
  if (opts.jsonl) {
    return items.map((item) => JSON.stringify(item)).join('\n');
  }
  if (opts.json) {
    return JSON.stringify(items);
  }
  return JSON.stringify(items, null, 2);
}

export function writeOutput(formatted, opts) {
  if (opts.output) {
    writeFileSync(opts.output, formatted + '\n', 'utf8');
    console.error(`Wrote ${opts.output}`);
  } else {
    console.log(formatted);
  }
}

// ---------------------------------------------------------------------------
// Shared command runner
// ---------------------------------------------------------------------------

export function buildOptions(opts) {
  const options = {};
  if (opts.sort !== undefined) options.sort = opts.sort;
  if (opts.maxItems !== undefined) options.maxItems = Number(opts.maxItems);
  if (opts.lang !== undefined) options.lang = opts.lang;
  if (opts.timeout !== undefined) options.timeout = Number(opts.timeout);
  return options;
}

export async function runCommand(opts, fn) {
  try {
    const token = resolveToken(opts);
    const scraper = new XScraper({ token, debug: !!opts.debug });
    const searchOpts = buildOptions(opts);
    const items = await fn(scraper, searchOpts);
    const formatted = formatOutput(items, opts);
    writeOutput(formatted, opts);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Interactive init command
// ---------------------------------------------------------------------------

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function initCommand() {
  console.error('x-scraper init — configure your Apify API token\n');

  const token = await prompt('Enter your Apify API token: ');

  if (!token) {
    console.error('No token provided. Aborting.');
    process.exit(1);
  }

  console.error('Validating token...');

  try {
    const client = new ApifyClient({ token });
    const user = await client.user().get();
    console.error(`Authenticated as: ${user.username || user.email || 'unknown'}`);
  } catch {
    console.error('Error: Invalid token — could not authenticate with Apify.');
    process.exit(1);
  }

  const config = loadConfig();
  config.token = token;
  saveConfig(config);

  console.error(`\nToken saved to ${CONFIG_FILE}`);
  console.error('You can now use x-scraper commands without --token.');
}

// ---------------------------------------------------------------------------
// Global options applied to every scraping command
// ---------------------------------------------------------------------------

function addGlobalOptions(cmd) {
  return cmd
    .option('--token <token>', 'Apify API token')
    .option('--sort <order>', 'Sort order: Latest, Top, or "Latest + Top"')
    .option('--max-items <n>', 'Maximum number of items')
    .option('--lang <code>', 'Language filter (ISO 639-1)')
    .option('--timeout <secs>', 'Run timeout in seconds')
    .option('--output <file>', 'Save output to file instead of stdout')
    .option('--json', 'Compact JSON output')
    .option('--jsonl', 'JSONL output (one JSON object per line)')
    .option('--debug', 'Enable debug mode');
}

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

export function createProgram() {
  const program = new Command();

  program
    .name('x-scraper')
    .description('The fastest and cheapest way to scrape tweets from X (Twitter)')
    .version(pkg.version);

  // -- init ------------------------------------------------------------------

  program
    .command('init')
    .description('Interactively set up your Apify API token')
    .action(initCommand);

  // -- Core: search ----------------------------------------------------------

  addGlobalOptions(
    program
      .command('search')
      .description('Run the scraper with raw actor input (JSON)')
      .requiredOption('--input <json>', 'Actor input as JSON string')
  ).action(async (opts) => {
    await runCommand(opts, (scraper, searchOpts) => {
      const input = JSON.parse(opts.input);
      return scraper.search(input, searchOpts);
    });
  });

  // -- Core: execute ---------------------------------------------------------

  addGlobalOptions(
    program
      .command('execute')
      .description('Execute the scraper with raw actor input (no option merging)')
      .requiredOption('--input <json>', 'Actor input as JSON string')
  ).action(async (opts) => {
    await runCommand(opts, (scraper, searchOpts) => {
      const input = JSON.parse(opts.input);
      return scraper.execute(input, searchOpts);
    });
  });

  // -- Convenience: profile --------------------------------------------------

  addGlobalOptions(
    program
      .command('profile')
      .description('Fetch tweets from a Twitter/X profile')
      .argument('<handle>', 'Twitter handle (without @)')
  ).action(async (handle, opts) => {
    await runCommand(opts, (scraper, o) => scraper.getTweetsByProfile(handle, o));
  });

  // -- Convenience: profile-date-range ---------------------------------------

  addGlobalOptions(
    program
      .command('profile-date-range')
      .description('Fetch tweets from a handle within a date range')
      .argument('<handle>', 'Twitter handle (without @)')
      .requiredOption('--since <date>', 'Start date (YYYY-MM-DD)')
      .requiredOption('--until <date>', 'End date (YYYY-MM-DD)')
  ).action(async (handle, opts) => {
    await runCommand(opts, (scraper, o) =>
      scraper.getTweetsByHandleInDateRange(handle, opts.since, opts.until, o)
    );
  });

  // -- Convenience: hashtag --------------------------------------------------

  addGlobalOptions(
    program
      .command('hashtag')
      .description('Fetch tweets by hashtag(s)')
      .argument('<tags...>', 'One or more hashtags (# prefix optional)')
  ).action(async (tags, opts) => {
    await runCommand(opts, (scraper, o) => scraper.getTweetsByHashtag(tags, o));
  });

  // -- Convenience: keyword --------------------------------------------------

  addGlobalOptions(
    program
      .command('keyword')
      .description('Search tweets by a single keyword or phrase')
      .argument('<keyword>', 'Keyword or phrase')
  ).action(async (keyword, opts) => {
    await runCommand(opts, (scraper, o) => scraper.getTweetsByKeyword(keyword, o));
  });

  // -- Convenience: keywords -------------------------------------------------

  addGlobalOptions(
    program
      .command('keywords')
      .description('Search tweets by multiple keywords (joined with OR)')
      .argument('<keywords...>', 'Keywords to search for')
  ).action(async (keywords, opts) => {
    await runCommand(opts, (scraper, o) => scraper.getTweetsByKeywords(keywords, o));
  });

  // -- Convenience: conversation ---------------------------------------------

  addGlobalOptions(
    program
      .command('conversation')
      .description('Fetch replies in a conversation thread')
      .argument('<id>', 'Conversation/tweet ID')
  ).action(async (id, opts) => {
    await runCommand(opts, (scraper, o) => scraper.getTweetsByConversationId(id, o));
  });

  // -- Convenience: url ------------------------------------------------------

  addGlobalOptions(
    program
      .command('url')
      .description('Fetch a single tweet by URL')
      .argument('<url>', 'Tweet URL')
  ).action(async (url, opts) => {
    await runCommand(opts, (scraper, o) => scraper.getTweetByUrl(url, o));
  });

  // -- Convenience: urls -----------------------------------------------------

  addGlobalOptions(
    program
      .command('urls')
      .description('Fetch tweets from multiple URLs')
      .argument('<urls...>', 'Tweet/list/profile URLs')
  ).action(async (urls, opts) => {
    await runCommand(opts, (scraper, o) => scraper.getTweetsByUrls(urls, o));
  });

  // -- Convenience: location -------------------------------------------------

  addGlobalOptions(
    program
      .command('location')
      .description('Search tweets near a geographic location')
      .argument('<query>', 'Search query or keyword')
      .requiredOption('--location <name>', 'Location name (e.g. "San Francisco")')
      .requiredOption('--radius <distance>', 'Search radius (e.g. "10mi", "25km")')
  ).action(async (query, opts) => {
    await runCommand(opts, (scraper, o) =>
      scraper.getTweetsByLocation(query, opts.location, opts.radius, o)
    );
  });

  // -- Convenience: profiles -------------------------------------------------

  addGlobalOptions(
    program
      .command('profiles')
      .description('Fetch tweets from multiple profiles in one run')
      .argument('<handles...>', 'Twitter handles (without @)')
  ).action(async (handles, opts) => {
    await runCommand(opts, (scraper, o) => scraper.getTweetsByMultipleProfiles(handles, o));
  });

  // -- Convenience: cashtag --------------------------------------------------

  addGlobalOptions(
    program
      .command('cashtag')
      .description('Fetch tweets by cashtag(s) (e.g. $BTC)')
      .argument('<tags...>', 'One or more cashtags ($ prefix optional)')
  ).action(async (tags, opts) => {
    await runCommand(opts, (scraper, o) => scraper.getTweetsByCashtag(tags, o));
  });

  // -- Convenience: mention --------------------------------------------------

  addGlobalOptions(
    program
      .command('mention')
      .description('Fetch tweets mentioning a user')
      .argument('<handle>', 'Twitter handle (without @)')
  ).action(async (handle, opts) => {
    await runCommand(opts, (scraper, o) => scraper.getTweetsByMention(handle, o));
  });

  // -- Convenience: media ----------------------------------------------------

  addGlobalOptions(
    program
      .command('media')
      .description('Fetch tweets with media (images or videos) from a handle')
      .argument('<handle>', 'Twitter handle (without @)')
  ).action(async (handle, opts) => {
    await runCommand(opts, (scraper, o) => scraper.getTweetsWithMediaByHandle(handle, o));
  });

  // -- Convenience: images ---------------------------------------------------

  addGlobalOptions(
    program
      .command('images')
      .description('Fetch tweets with images from a handle')
      .argument('<handle>', 'Twitter handle (without @)')
  ).action(async (handle, opts) => {
    await runCommand(opts, (scraper, o) => scraper.getTweetsWithImagesByHandle(handle, o));
  });

  // -- Convenience: videos ---------------------------------------------------

  addGlobalOptions(
    program
      .command('videos')
      .description('Fetch tweets with videos from a handle')
      .argument('<handle>', 'Twitter handle (without @)')
  ).action(async (handle, opts) => {
    await runCommand(opts, (scraper, o) => scraper.getTweetsWithVideosByHandle(handle, o));
  });

  // -- Convenience: engagement -----------------------------------------------

  addGlobalOptions(
    program
      .command('engagement')
      .description('Fetch tweets with minimum engagement thresholds')
      .argument('<query>', 'Search query or keyword')
      .option('--min-likes <n>', 'Minimum likes')
      .option('--min-retweets <n>', 'Minimum retweets')
      .option('--min-replies <n>', 'Minimum replies')
  ).action(async (query, opts) => {
    await runCommand(opts, (scraper, o) => {
      const engagementOpts = { ...o };
      if (opts.minLikes !== undefined) engagementOpts.minLikes = Number(opts.minLikes);
      if (opts.minRetweets !== undefined) engagementOpts.minRetweets = Number(opts.minRetweets);
      if (opts.minReplies !== undefined) engagementOpts.minReplies = Number(opts.minReplies);
      return scraper.getTweetsWithMinEngagement(query, engagementOpts);
    });
  });

  // -- Convenience: verified -------------------------------------------------

  addGlobalOptions(
    program
      .command('verified')
      .description('Fetch tweets from verified users matching a query')
      .argument('<query>', 'Search query or keyword')
  ).action(async (query, opts) => {
    await runCommand(opts, (scraper, o) => scraper.getTweetsByVerifiedUsers(query, o));
  });

  // -- Convenience: no-retweets ----------------------------------------------

  addGlobalOptions(
    program
      .command('no-retweets')
      .description('Fetch tweets from a handle, excluding retweets')
      .argument('<handle>', 'Twitter handle (without @)')
  ).action(async (handle, opts) => {
    await runCommand(opts, (scraper, o) => scraper.getTweetsExcludingRetweetsByHandle(handle, o));
  });

  // -- Convenience: links ----------------------------------------------------

  addGlobalOptions(
    program
      .command('links')
      .description('Fetch tweets with links from a handle')
      .argument('<handle>', 'Twitter handle (without @)')
  ).action(async (handle, opts) => {
    await runCommand(opts, (scraper, o) => scraper.getTweetsWithLinksByHandle(handle, o));
  });

  return program;
}

// ---------------------------------------------------------------------------
// Entry point — only runs when executed directly, not when imported for tests
// ---------------------------------------------------------------------------

/* v8 ignore next 7 */
const isDirectRun =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isDirectRun) {
  createProgram().parseAsync(process.argv);
}
