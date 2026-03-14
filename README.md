# x-scraper

The fastest and cheapest way to scrape tweets from X (Twitter). Battle-tested infrastructure used by tens of thousands of customers including enterprise teams.

Wraps the [Apify Twitter Scraper Lite](https://apify.com/apidojo/twitter-scraper-lite?fpr=yhdrb) actor with a developer-friendly, class-based API. Every method creates an Apify actor run under the hood.

## Prerequisites

- **Node.js 16+**
- An **Apify account on a paid plan** — [sign up here](https://apify.com/?fpr=yhdrb)
- An **Apify API token** — [get it here](https://console.apify.com/account/integrations)

## Installation

```bash
npm install @apidojo/x-scraper
```

## CLI Usage

Install globally to use from the command line:

```bash
npm install -g @apidojo/x-scraper
```

### Setup

```bash
# Store your Apify token (saved to ~/.x-scraper/config.json)
x-scraper init

# Or pass it per-command
x-scraper profile NASA --token apify_api_xxx

# Or set as environment variable
export APIFY_TOKEN=apify_api_xxx
```

### Commands

```bash
# Fetch tweets from a profile
x-scraper profile NASA --sort Latest --max-items 50

# Search by keyword
x-scraper keyword "artificial intelligence" --lang en --sort Latest

# Search by multiple keywords (joined with OR)
x-scraper keywords bitcoin ethereum solana

# Search by hashtag
x-scraper hashtag AI MachineLearning --sort Latest

# Fetch a single tweet by URL
x-scraper url https://x.com/elonmusk/status/1728108619189874825

# Fetch from multiple URLs
x-scraper urls https://x.com/a/status/1 https://x.com/b/status/2

# Tweets from a handle within a date range
x-scraper profile-date-range NASA --since 2024-01-01 --until 2024-06-01

# Tweets near a location
x-scraper location coffee --location "San Francisco" --radius 10mi

# Tweets with minimum engagement
x-scraper engagement bitcoin --min-likes 1000 --min-retweets 100

# Multiple profiles in one run
x-scraper profiles elonmusk naval paulg

# Mentions, media filters, cashtags, verified users, and more
x-scraper mention NASA
x-scraper media NASA
x-scraper images NASA
x-scraper videos NASA
x-scraper cashtag BTC ETH SOL
x-scraper verified cryptocurrency
x-scraper no-retweets elonmusk
x-scraper links TechCrunch
x-scraper conversation 1728108619189874825

# Raw actor input (full control)
x-scraper search --input '{"searchTerms":["from:NASA filter:media"]}'
x-scraper execute --input '{"searchTerms":["test"],"maxItems":10}'
```

### Output Options

```bash
# Pretty JSON (default)
x-scraper profile NASA

# Compact JSON (pipe-friendly)
x-scraper profile NASA --json

# JSONL (one object per line)
x-scraper profile NASA --jsonl

# Save to file
x-scraper profile NASA --output tweets.json

# Debug mode (shows internal logs)
x-scraper profile NASA --debug
```

### Global Flags

| Flag | Description |
|---|---|
| `--token <token>` | Apify API token (overrides env/config) |
| `--sort <order>` | `Latest`, `Top`, or `"Latest + Top"` |
| `--max-items <n>` | Maximum number of items |
| `--lang <code>` | Language filter (ISO 639-1) |
| `--timeout <secs>` | Run timeout in seconds |
| `--output <file>` | Save output to file |
| `--json` | Compact JSON output |
| `--jsonl` | JSONL output (one JSON per line) |
| `--debug` | Enable debug mode |

## Quick Start (Library)

```javascript
// ESM
import { XScraper } from '@apidojo/x-scraper';

// CommonJS
const { XScraper } = require('@apidojo/x-scraper');

const scraper = new XScraper({ token: 'apify_api_xxxxxxxxxxxx' });

// Fetch latest tweets from NASA
const tweets = await scraper.getTweetsByProfile('NASA', { sort: 'Latest', maxItems: 50 });
console.log(tweets);
```

## Core Methods

### `execute(input, options?)`

Raw passthrough — pass any valid actor input object directly. Use this when you know exactly what input the actor expects.

```javascript
const tweets = await scraper.execute({
  searchTerms: ['from:NASA filter:media'],
  sort: 'Latest',
  maxItems: 100,
});
```

### `search(input, options?)`

Run the scraper synchronously — waits for the run to finish and returns all items. Options like `sort`, `maxItems`, and `lang` are merged into the input automatically.

```javascript
const tweets = await scraper.search(
  { searchTerms: ['from:NASA'] },
  { sort: 'Latest', maxItems: 50, lang: 'en' }
);
```

### `searchAsync(input, options?)`

Start a run without waiting. Returns a `RunHandle` for polling and fetching results later. Use this for large runs that may exceed the sync timeout.

```javascript
const run = await scraper.searchAsync(
  { searchTerms: ['from:NASA'] },
  { sort: 'Latest' }
);

await run.waitForFinish();
const tweets = await run.getItems();
```

### `stream(input, options?)`

Run the scraper and stream results as an async iterator. Items are yielded one by one, with auto-pagination.

```javascript
for await (const tweet of scraper.stream({ searchTerms: ['from:NASA'] })) {
  console.log(tweet.text);
}
```

## Convenience Methods

All convenience methods accept an `options` object:

| Option | Type | Description |
|---|---|---|
| `sort` | `string` | `'Latest'`, `'Top'`, or `'Latest + Top'` |
| `maxItems` | `number` | Maximum number of items to return |
| `lang` | `string` | ISO 639-1 language code (e.g. `'en'`) |
| `timeout` | `number` | Timeout in seconds (default: 120) |
| `fullResponse` | `boolean` | Return `{ items, runId, datasetId }` instead of just items |

### Profiles

```javascript
// Tweets from a single profile
const tweets = await scraper.getTweetsByProfile('NASA', { sort: 'Latest' });

// Tweets from multiple profiles in one run
const tweets = await scraper.getTweetsByMultipleProfiles(
  ['elonmusk', 'naval', 'paulg'],
  { sort: 'Latest' }
);

// Tweets from a handle within a date range
const tweets = await scraper.getTweetsByHandleInDateRange(
  'NASA', '2024-01-01', '2024-06-01',
  { sort: 'Latest' }
);

// Exclude retweets from a handle
const tweets = await scraper.getTweetsExcludingRetweetsByHandle('elonmusk', {
  sort: 'Latest',
});
```

### Search

```javascript
// Search by keyword
const tweets = await scraper.getTweetsByKeyword('artificial intelligence', {
  lang: 'en',
  sort: 'Latest',
});

// searchTweets is an alias for getTweetsByKeyword
const tweets = await scraper.searchTweets('artificial intelligence');

// Search by multiple keywords (joined with OR)
const tweets = await scraper.getTweetsByKeywords(
  ['bitcoin', 'ethereum', 'solana'],
  { lang: 'en', sort: 'Latest' }
);

// searchTweetsByMultipleKeywords is an alias for getTweetsByKeywords
const tweets = await scraper.searchTweetsByMultipleKeywords(['AI', 'ML', 'deep learning']);

// Search by hashtag
const tweets = await scraper.getTweetsByHashtag(['AI', 'MachineLearning'], {
  sort: 'Latest',
});

// Search by cashtag
const tweets = await scraper.getTweetsByCashtag(['BTC', 'ETH', 'SOL'], {
  lang: 'en',
  sort: 'Latest',
});
```

### Single Tweet & URLs

```javascript
// Fetch a single tweet by URL
const tweets = await scraper.getTweetByUrl(
  'https://x.com/elonmusk/status/1728108619189874825'
);

// Fetch from multiple URLs (tweets, lists, profiles)
const tweets = await scraper.getTweetsByUrls([
  'https://x.com/elonmusk/status/1728108619189874825',
  'https://twitter.com/i/lists/1234567890',
]);
```

### Conversations

```javascript
// Fetch replies in a conversation thread
const replies = await scraper.getTweetsByConversationId('1728108619189874825', {
  sort: 'Latest',
});
```

### Mentions

```javascript
// Tweets mentioning a user
const tweets = await scraper.getTweetsByMention('NASA', { sort: 'Latest' });
```

### Media Filters

```javascript
// Tweets with any media (images or videos)
const tweets = await scraper.getTweetsWithMediaByHandle('NASA');

// Tweets with images only
const tweets = await scraper.getTweetsWithImagesByHandle('NASA');

// Tweets with videos only
const tweets = await scraper.getTweetsWithVideosByHandle('NASA');

// Tweets with links
const tweets = await scraper.getTweetsWithLinksByHandle('TechCrunch');
```

### Engagement & Filters

```javascript
// Tweets with minimum engagement
const tweets = await scraper.getTweetsWithMinEngagement('bitcoin', {
  minLikes: 1000,
  minRetweets: 100,
  sort: 'Top',
});

// Tweets from verified users only
const tweets = await scraper.getTweetsByVerifiedUsers('cryptocurrency', {
  sort: 'Top',
});
```

### Location

```javascript
// Tweets near a location
const tweets = await scraper.getTweetsByLocation('coffee', 'San Francisco', '10mi', {
  sort: 'Latest',
});
```

## Full Response Mode

By default, methods return just the items array. Pass `{ fullResponse: true }` to get run metadata:

```javascript
const result = await scraper.getTweetsByProfile('NASA', {
  sort: 'Latest',
  fullResponse: true,
});

console.log(result.items);     // Array of tweet objects
console.log(result.runId);     // Apify run ID
console.log(result.datasetId); // Apify dataset ID
```

## Async Runs with RunHandle

For large runs that may take longer than the sync timeout:

```javascript
const run = await scraper.searchAsync({ searchTerms: ['from:NASA'], sort: 'Latest' });

// Poll until the run finishes
await run.waitForFinish();

// Get all items
const tweets = await run.getItems();

// Or stream items
for await (const tweet of run.stream()) {
  console.log(tweet.text);
}

// Access run metadata
console.log(run.runId);
console.log(run.datasetId);
console.log(run.status);
```

## Error Handling

All errors from Apify are thrown directly. Wrap calls in try/catch:

```javascript
try {
  const tweets = await scraper.getTweetsByProfile('NASA');
} catch (error) {
  // Apify errors: 401 unauthorized, 404 not found, 429 rate limit, run failures
  console.error('Scraper error:', error.message);
}
```

The constructor throws immediately if no token is provided:

```javascript
try {
  const scraper = new XScraper({});
} catch (error) {
  // "APIFY_TOKEN is required. Pass it as: new XScraper({ token: "apify_api_xxx" })"
}
```

## Tweet Object Shape

Each item returned is a tweet object:

```json
{
  "type": "tweet",
  "id": "1728108619189874825",
  "url": "https://x.com/elonmusk/status/1728108619189874825",
  "text": "More than 10 per human on average",
  "retweetCount": 11311,
  "replyCount": 6526,
  "likeCount": 104121,
  "quoteCount": 2915,
  "createdAt": "Fri Nov 24 17:49:36 +0000 2023",
  "lang": "en",
  "isReply": false,
  "isRetweet": false,
  "isQuote": true,
  "author": {
    "userName": "elonmusk",
    "name": "Elon Musk",
    "id": "44196397",
    "followers": 172669889,
    "isVerified": true,
    "isBlueVerified": true
  }
}
```

## API Reference

### Constructor

| Parameter | Type | Default | Description |
|---|---|---|---|
| `token` | `string` | *required* | Apify API token |
| `timeout` | `number` | `120` | Default timeout in seconds for sync runs |

### Core Methods

| Method | Returns | Description |
|---|---|---|
| `execute(input, options?)` | `Promise<items\|FullResponse>` | Raw input passthrough |
| `search(input, options?)` | `Promise<items\|FullResponse>` | Sync run with option merging |
| `searchAsync(input, options?)` | `Promise<RunHandle>` | Async run, returns handle |
| `stream(input, options?)` | `AsyncGenerator<tweet>` | Async iterator over items |

### Convenience Methods

| Method | Parameters | Builds Query |
|---|---|---|
| `getTweetsByProfile` | `(handle, opts?)` | `from:{handle}` |
| `getTweetsByHandleInDateRange` | `(handle, since, until, opts?)` | `from:{handle} since:... until:...` |
| `getTweetsByHashtag` | `(hashtags, opts?)` | `#tag1 #tag2` |
| `getTweetsByKeyword` | `(keyword, opts?)` | `{keyword}` |
| `searchTweets` | `(keyword, opts?)` | Alias for `getTweetsByKeyword` |
| `getTweetsByKeywords` | `(keywords[], opts?)` | `kw1 OR kw2 OR kw3` |
| `searchTweetsByMultipleKeywords` | `(keywords[], opts?)` | Alias for `getTweetsByKeywords` |
| `getTweetsByConversationId` | `(id, opts?)` | `conversation_id:{id}` |
| `getTweetByUrl` | `(url, opts?)` | `startUrls: [url]` |
| `getTweetsByUrls` | `(urls[], opts?)` | `startUrls: [...urls]` |
| `getTweetsByLocation` | `(query, location, radius, opts?)` | `{q} near:"{loc}" within:{r}` |
| `getTweetsByMultipleProfiles` | `(handles[], opts?)` | `["from:a","from:b"]` |
| `getTweetsByCashtag` | `(cashtags, opts?)` | `$X OR $Y` |
| `getTweetsByMention` | `(handle, opts?)` | `@{handle}` |
| `getTweetsWithMediaByHandle` | `(handle, opts?)` | `from:{handle} filter:media` |
| `getTweetsWithImagesByHandle` | `(handle, opts?)` | `from:{handle} filter:images` |
| `getTweetsWithVideosByHandle` | `(handle, opts?)` | `from:{handle} filter:videos` |
| `getTweetsWithMinEngagement` | `(query, opts?)` | `{q} min_faves:{n} min_retweets:{n}` |
| `getTweetsByVerifiedUsers` | `(query, opts?)` | `{q} filter:verified` |
| `getTweetsExcludingRetweetsByHandle` | `(handle, opts?)` | `from:{handle} -filter:retweets` |
| `getTweetsWithLinksByHandle` | `(handle, opts?)` | `from:{handle} filter:links` |

### RunHandle

| Property/Method | Type | Description |
|---|---|---|
| `runId` | `string` | The Apify run ID |
| `datasetId` | `string` | The default dataset ID |
| `status` | `string` | Last known run status |
| `waitForFinish(opts?)` | `Promise<RunHandle>` | Poll until terminal status |
| `getItems(opts?)` | `Promise<items\|FullResponse>` | Fetch all dataset items |
| `stream()` | `AsyncGenerator<tweet>` | Async iterator over items |

## Pricing

This package uses the [Apify Twitter Scraper Lite](https://apify.com/apidojo/twitter-scraper-lite) actor with event-based pricing. You only pay for what you use. See the [actor pricing page](https://apify.com/apidojo/twitter-scraper-lite#pricing) for current rates.

## License

MIT
