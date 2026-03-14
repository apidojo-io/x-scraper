import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — defined inside vi.mock factories so hoisting works correctly
// ---------------------------------------------------------------------------

vi.mock('node:fs', () => {
  const readFileSync = vi.fn();
  const writeFileSync = vi.fn();
  const mkdirSync = vi.fn();
  return { readFileSync, writeFileSync, mkdirSync, __mocks: { readFileSync, writeFileSync, mkdirSync } };
});

vi.mock('node:readline', () => {
  const questionMock = vi.fn();
  const closeMock = vi.fn();
  const createInterface = vi.fn(() => ({ question: questionMock, close: closeMock }));
  return { createInterface, __mocks: { questionMock, closeMock } };
});

vi.mock('apify-client', () => {
  const userGetMock = vi.fn();
  const userMock = vi.fn(() => ({ get: userGetMock }));
  const ApifyClient = vi.fn(() => ({ user: userMock }));
  return { ApifyClient, __mocks: { userGetMock } };
});

const FAKE_ITEMS = [{ id: '1', text: 'hello' }, { id: '2', text: 'world' }];

const METHOD_NAMES = [
  'search', 'execute',
  'getTweetsByProfile', 'getTweetsByHandleInDateRange', 'getTweetsByHashtag',
  'getTweetsByKeyword', 'getTweetsByKeywords', 'getTweetsByConversationId',
  'getTweetByUrl', 'getTweetsByUrls', 'getTweetsByLocation',
  'getTweetsByMultipleProfiles', 'getTweetsByCashtag', 'getTweetsByMention',
  'getTweetsWithMediaByHandle', 'getTweetsWithImagesByHandle',
  'getTweetsWithVideosByHandle', 'getTweetsWithMinEngagement',
  'getTweetsByVerifiedUsers', 'getTweetsExcludingRetweetsByHandle',
  'getTweetsWithLinksByHandle',
];

const scraperInstance = {};
for (const name of METHOD_NAMES) {
  scraperInstance[name] = vi.fn().mockResolvedValue(FAKE_ITEMS);
}

vi.mock('../src/scraper.js', () => ({
  XScraper: vi.fn(() => ({ ...scraperInstance })),
}));

// ---------------------------------------------------------------------------
// Imports — after mocks are set up
// ---------------------------------------------------------------------------

import { __mocks as fsMocks } from 'node:fs';
import { __mocks as rlMocks } from 'node:readline';
import { __mocks as apifyMocks } from 'apify-client';
import { XScraper } from '../src/scraper.js';
import {
  loadConfig, saveConfig, resolveToken,
  formatOutput, writeOutput, buildOptions,
  runCommand, createProgram,
} from '../src/cli.js';

const { readFileSync, writeFileSync, mkdirSync } = fsMocks;
const { questionMock, closeMock } = rlMocks;
const { userGetMock } = apifyMocks;

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let exitSpy;
let logSpy;
let errorSpy;
const origEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();

  exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
  questionMock.mockImplementation((q, cb) => cb('test-token'));
  userGetMock.mockResolvedValue({ username: 'testuser' });

  for (const name of METHOD_NAMES) {
    scraperInstance[name].mockResolvedValue(FAKE_ITEMS);
  }

  delete process.env.APIFY_TOKEN;
});

afterEach(() => {
  exitSpy.mockRestore();
  logSpy.mockRestore();
  errorSpy.mockRestore();
  process.env = { ...origEnv };
});

// ---------------------------------------------------------------------------
// Helper to run CLI commands through commander
// ---------------------------------------------------------------------------

async function runCLI(...args) {
  const program = createProgram();
  program.exitOverride();
  await program.parseAsync(['node', 'x-scraper', ...args]);
}

// ---------------------------------------------------------------------------
// loadConfig / saveConfig
// ---------------------------------------------------------------------------

describe('loadConfig', () => {
  it('returns parsed JSON when config file exists', () => {
    readFileSync.mockReturnValue('{"token":"saved-tok"}');
    expect(loadConfig()).toEqual({ token: 'saved-tok' });
  });

  it('returns {} when config file does not exist', () => {
    readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
    expect(loadConfig()).toEqual({});
  });
});

describe('saveConfig', () => {
  it('creates directory and writes JSON file', () => {
    saveConfig({ token: 'abc' });
    expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining('.x-scraper'), { recursive: true });
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('config.json'),
      expect.stringContaining('"token": "abc"'),
      'utf8'
    );
  });
});

// ---------------------------------------------------------------------------
// resolveToken
// ---------------------------------------------------------------------------

describe('resolveToken', () => {
  it('returns token from opts (highest priority)', () => {
    process.env.APIFY_TOKEN = 'env-tok';
    readFileSync.mockReturnValue('{"token":"file-tok"}');
    expect(resolveToken({ token: 'flag-tok' })).toBe('flag-tok');
  });

  it('returns token from APIFY_TOKEN env var', () => {
    process.env.APIFY_TOKEN = 'env-tok';
    expect(resolveToken({})).toBe('env-tok');
  });

  it('returns token from config file', () => {
    readFileSync.mockReturnValue('{"token":"file-tok"}');
    expect(resolveToken({})).toBe('file-tok');
  });

  it('exits with error when no token is found', () => {
    resolveToken({});
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('No Apify token found'));
  });
});

// ---------------------------------------------------------------------------
// formatOutput
// ---------------------------------------------------------------------------

describe('formatOutput', () => {
  const items = [{ a: 1 }, { b: 2 }];

  it('returns pretty-printed JSON by default', () => {
    const out = formatOutput(items, {});
    expect(out).toBe(JSON.stringify(items, null, 2));
  });

  it('returns compact JSON with --json', () => {
    const out = formatOutput(items, { json: true });
    expect(out).toBe(JSON.stringify(items));
  });

  it('returns JSONL with --jsonl', () => {
    const out = formatOutput(items, { jsonl: true });
    expect(out).toBe('{"a":1}\n{"b":2}');
  });
});

// ---------------------------------------------------------------------------
// writeOutput
// ---------------------------------------------------------------------------

describe('writeOutput', () => {
  it('writes to stdout when no --output', () => {
    writeOutput('hello', {});
    expect(logSpy).toHaveBeenCalledWith('hello');
  });

  it('writes to file when --output is set', () => {
    writeOutput('hello', { output: 'out.json' });
    expect(writeFileSync).toHaveBeenCalledWith('out.json', 'hello\n', 'utf8');
    expect(errorSpy).toHaveBeenCalledWith('Wrote out.json');
  });
});

// ---------------------------------------------------------------------------
// buildOptions
// ---------------------------------------------------------------------------

describe('buildOptions', () => {
  it('builds options from CLI flags', () => {
    const opts = buildOptions({ sort: 'Latest', maxItems: '50', lang: 'en', timeout: '60' });
    expect(opts).toEqual({ sort: 'Latest', maxItems: 50, lang: 'en', timeout: 60 });
  });

  it('returns empty object when no flags', () => {
    expect(buildOptions({})).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// runCommand
// ---------------------------------------------------------------------------

describe('runCommand', () => {
  it('resolves token, calls fn, formats, and outputs', async () => {
    process.env.APIFY_TOKEN = 'tok';
    await runCommand({}, (scraper, o) => scraper.getTweetsByProfile('NASA', o));
    expect(XScraper).toHaveBeenCalledWith({ token: 'tok', debug: false });
    expect(logSpy).toHaveBeenCalled();
  });

  it('catches errors and exits', async () => {
    process.env.APIFY_TOKEN = 'tok';
    scraperInstance.getTweetsByProfile.mockRejectedValueOnce(new Error('boom'));
    await runCommand({}, (scraper, o) => scraper.getTweetsByProfile('x', o));
    expect(errorSpy).toHaveBeenCalledWith('Error: boom');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// init command
// ---------------------------------------------------------------------------

describe('init command', () => {
  it('validates and saves a valid token', async () => {
    questionMock.mockImplementation((q, cb) => cb('valid-tok'));
    userGetMock.mockResolvedValue({ username: 'john' });

    await runCLI('init');

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Authenticated as: john'));
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('config.json'),
      expect.stringContaining('valid-tok'),
      'utf8'
    );
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Token saved'));
  });

  it('exits when no token is entered', async () => {
    questionMock.mockImplementation((q, cb) => cb(''));
    await runCLI('init');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith('No token provided. Aborting.');
  });

  it('exits when token validation fails', async () => {
    questionMock.mockImplementation((q, cb) => cb('bad-tok'));
    userGetMock.mockRejectedValue(new Error('unauthorized'));
    await runCLI('init');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(
      'Error: Invalid token — could not authenticate with Apify.'
    );
  });

  it('shows user email when username is absent', async () => {
    questionMock.mockImplementation((q, cb) => cb('tok'));
    userGetMock.mockResolvedValue({ email: 'a@b.com' });
    await runCLI('init');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Authenticated as: a@b.com'));
  });

  it('shows "unknown" when neither username nor email', async () => {
    questionMock.mockImplementation((q, cb) => cb('tok'));
    userGetMock.mockResolvedValue({});
    await runCLI('init');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Authenticated as: unknown'));
  });
});

// ---------------------------------------------------------------------------
// Global options: --debug, --json, --jsonl, --output
// ---------------------------------------------------------------------------

describe('global options', () => {
  it('--debug passes debug:true to XScraper', async () => {
    await runCLI('profile', 'NASA', '--token', 'tok', '--debug');
    expect(XScraper).toHaveBeenCalledWith({ token: 'tok', debug: true });
  });

  it('--json outputs compact JSON', async () => {
    await runCLI('profile', 'NASA', '--token', 'tok', '--json');
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(FAKE_ITEMS));
  });

  it('--jsonl outputs one object per line', async () => {
    await runCLI('profile', 'NASA', '--token', 'tok', '--jsonl');
    const expected = FAKE_ITEMS.map((i) => JSON.stringify(i)).join('\n');
    expect(logSpy).toHaveBeenCalledWith(expected);
  });

  it('--output writes to file', async () => {
    await runCLI('profile', 'NASA', '--token', 'tok', '--output', 'tweets.json');
    expect(writeFileSync).toHaveBeenCalledWith('tweets.json', expect.any(String), 'utf8');
    expect(errorSpy).toHaveBeenCalledWith('Wrote tweets.json');
  });

  it('--sort, --max-items, --lang, --timeout are forwarded', async () => {
    await runCLI(
      'profile', 'NASA', '--token', 'tok',
      '--sort', 'Top', '--max-items', '10', '--lang', 'en', '--timeout', '30'
    );
    expect(scraperInstance.getTweetsByProfile).toHaveBeenCalledWith('NASA', {
      sort: 'Top', maxItems: 10, lang: 'en', timeout: 30,
    });
  });
});

// ---------------------------------------------------------------------------
// Core commands
// ---------------------------------------------------------------------------

describe('search command', () => {
  it('parses JSON --input and calls scraper.search', async () => {
    const input = '{"searchTerms":["from:NASA"]}';
    await runCLI('search', '--input', input, '--token', 'tok');
    expect(scraperInstance.search).toHaveBeenCalledWith(
      { searchTerms: ['from:NASA'] }, {}
    );
    expect(logSpy).toHaveBeenCalled();
  });
});

describe('execute command', () => {
  it('parses JSON --input and calls scraper.execute', async () => {
    const input = '{"searchTerms":["test"]}';
    await runCLI('execute', '--input', input, '--token', 'tok');
    expect(scraperInstance.execute).toHaveBeenCalledWith(
      { searchTerms: ['test'] }, {}
    );
  });
});

// ---------------------------------------------------------------------------
// Convenience commands
// ---------------------------------------------------------------------------

describe('convenience commands', () => {
  it('profile → getTweetsByProfile', async () => {
    await runCLI('profile', 'NASA', '--token', 'tok');
    expect(scraperInstance.getTweetsByProfile).toHaveBeenCalledWith('NASA', {});
  });

  it('profile-date-range → getTweetsByHandleInDateRange', async () => {
    await runCLI(
      'profile-date-range', 'NASA', '--token', 'tok',
      '--since', '2024-01-01', '--until', '2024-06-01'
    );
    expect(scraperInstance.getTweetsByHandleInDateRange).toHaveBeenCalledWith(
      'NASA', '2024-01-01', '2024-06-01', {}
    );
  });

  it('hashtag → getTweetsByHashtag', async () => {
    await runCLI('hashtag', 'AI', 'ML', '--token', 'tok');
    expect(scraperInstance.getTweetsByHashtag).toHaveBeenCalledWith(['AI', 'ML'], {});
  });

  it('keyword → getTweetsByKeyword', async () => {
    await runCLI('keyword', 'artificial intelligence', '--token', 'tok');
    expect(scraperInstance.getTweetsByKeyword).toHaveBeenCalledWith('artificial intelligence', {});
  });

  it('keywords → getTweetsByKeywords', async () => {
    await runCLI('keywords', 'bitcoin', 'ethereum', '--token', 'tok');
    expect(scraperInstance.getTweetsByKeywords).toHaveBeenCalledWith(['bitcoin', 'ethereum'], {});
  });

  it('conversation → getTweetsByConversationId', async () => {
    await runCLI('conversation', '123456789', '--token', 'tok');
    expect(scraperInstance.getTweetsByConversationId).toHaveBeenCalledWith('123456789', {});
  });

  it('url → getTweetByUrl', async () => {
    const u = 'https://x.com/elonmusk/status/123';
    await runCLI('url', u, '--token', 'tok');
    expect(scraperInstance.getTweetByUrl).toHaveBeenCalledWith(u, {});
  });

  it('urls → getTweetsByUrls', async () => {
    const u1 = 'https://x.com/a/status/1';
    const u2 = 'https://x.com/b/status/2';
    await runCLI('urls', u1, u2, '--token', 'tok');
    expect(scraperInstance.getTweetsByUrls).toHaveBeenCalledWith([u1, u2], {});
  });

  it('location → getTweetsByLocation', async () => {
    await runCLI(
      'location', 'coffee', '--token', 'tok',
      '--location', 'San Francisco', '--radius', '10mi'
    );
    expect(scraperInstance.getTweetsByLocation).toHaveBeenCalledWith(
      'coffee', 'San Francisco', '10mi', {}
    );
  });

  it('profiles → getTweetsByMultipleProfiles', async () => {
    await runCLI('profiles', 'elonmusk', 'naval', '--token', 'tok');
    expect(scraperInstance.getTweetsByMultipleProfiles).toHaveBeenCalledWith(
      ['elonmusk', 'naval'], {}
    );
  });

  it('cashtag → getTweetsByCashtag', async () => {
    await runCLI('cashtag', 'BTC', 'ETH', '--token', 'tok');
    expect(scraperInstance.getTweetsByCashtag).toHaveBeenCalledWith(['BTC', 'ETH'], {});
  });

  it('mention → getTweetsByMention', async () => {
    await runCLI('mention', 'NASA', '--token', 'tok');
    expect(scraperInstance.getTweetsByMention).toHaveBeenCalledWith('NASA', {});
  });

  it('media → getTweetsWithMediaByHandle', async () => {
    await runCLI('media', 'NASA', '--token', 'tok');
    expect(scraperInstance.getTweetsWithMediaByHandle).toHaveBeenCalledWith('NASA', {});
  });

  it('images → getTweetsWithImagesByHandle', async () => {
    await runCLI('images', 'NASA', '--token', 'tok');
    expect(scraperInstance.getTweetsWithImagesByHandle).toHaveBeenCalledWith('NASA', {});
  });

  it('videos → getTweetsWithVideosByHandle', async () => {
    await runCLI('videos', 'NASA', '--token', 'tok');
    expect(scraperInstance.getTweetsWithVideosByHandle).toHaveBeenCalledWith('NASA', {});
  });

  it('engagement → getTweetsWithMinEngagement (with thresholds)', async () => {
    await runCLI(
      'engagement', 'bitcoin', '--token', 'tok',
      '--min-likes', '1000', '--min-retweets', '100', '--min-replies', '50'
    );
    expect(scraperInstance.getTweetsWithMinEngagement).toHaveBeenCalledWith('bitcoin', {
      minLikes: 1000, minRetweets: 100, minReplies: 50,
    });
  });

  it('engagement → getTweetsWithMinEngagement (no thresholds)', async () => {
    await runCLI('engagement', 'bitcoin', '--token', 'tok');
    expect(scraperInstance.getTweetsWithMinEngagement).toHaveBeenCalledWith('bitcoin', {});
  });

  it('verified → getTweetsByVerifiedUsers', async () => {
    await runCLI('verified', 'crypto', '--token', 'tok');
    expect(scraperInstance.getTweetsByVerifiedUsers).toHaveBeenCalledWith('crypto', {});
  });

  it('no-retweets → getTweetsExcludingRetweetsByHandle', async () => {
    await runCLI('no-retweets', 'elonmusk', '--token', 'tok');
    expect(scraperInstance.getTweetsExcludingRetweetsByHandle).toHaveBeenCalledWith('elonmusk', {});
  });

  it('links → getTweetsWithLinksByHandle', async () => {
    await runCLI('links', 'TechCrunch', '--token', 'tok');
    expect(scraperInstance.getTweetsWithLinksByHandle).toHaveBeenCalledWith('TechCrunch', {});
  });
});

// ---------------------------------------------------------------------------
// createProgram basics
// ---------------------------------------------------------------------------

describe('createProgram', () => {
  it('returns a commander program with version', () => {
    const program = createProgram();
    expect(program.name()).toBe('x-scraper');
    expect(program.version()).toBeDefined();
  });
});
