import { ApifyClient } from 'apify-client';
import { ACTOR_ID, DEFAULT_TIMEOUT_SECS, DATASET_PAGE_LIMIT } from './constants.js';
import { RunHandle } from './run-handle.js';

/**
 * @typedef {object} SearchOptions
 * @property {string} [sort] - Sort order: 'Latest', 'Top', or 'Latest + Top'.
 * @property {number} [maxItems] - Maximum number of tweet items to return.
 * @property {string} [lang] - Restrict tweets to this language (ISO 639-1 code, e.g. 'en').
 * @property {number} [timeout] - Timeout in seconds for the actor run (overrides constructor default).
 * @property {boolean} [fullResponse=false] - If true, returns `{ items, runId, datasetId }` instead of just the items array.
 */

/**
 * @typedef {object} FullResponse
 * @property {Array<object>} items - The tweet items.
 * @property {string} runId - The Apify run ID.
 * @property {string} datasetId - The Apify dataset ID.
 */

/**
 * XScraper — the fastest and cheapest way to scrape tweets from X (Twitter).
 *
 * Wraps the Apify Twitter Scraper Lite actor with a developer-friendly,
 * class-based API. Every getter method creates a new Apify actor run.
 *
 * @example
 * import { XScraper } from '@apidojo/x-scraper';
 *
 * const scraper = new XScraper({ token: 'apify_api_xxx' });
 * const tweets = await scraper.getTweetsByProfile('NASA');
 * console.log(tweets);
 */
export class XScraper {
  /** @type {import('apify-client').ApifyClient} */
  #client;

  /** @type {number} */
  #timeout;

  /** @type {boolean} */
  #debug;

  /**
   * Create a new XScraper instance.
   *
   * On initialization, the account subscription is checked in the background.
   * If the token belongs to a non-paying (free) account, a warning is logged
   * to the console — the actor has limited functionality on free plans.
   *
   * @param {object} options
   * @param {string} options.token - Your Apify API token. Get it from https://console.apify.com/account/integrations
   * @param {number} [options.timeout=120] - Default timeout in seconds for sync actor runs.
   * @param {boolean} [options.debug=false] - Enable debug mode to log internal operations (input, run lifecycle, pagination).
   * @throws {Error} If token is not provided.
   */
  constructor(options) {
    const { token, timeout = DEFAULT_TIMEOUT_SECS, debug = false } = options || {};
    if (!token) {
      throw new Error(
        'APIFY_TOKEN is required. Pass it as: new XScraper({ token: "apify_api_xxx" })'
      );
    }

    this.#client = new ApifyClient({ token });
    this.#timeout = timeout;
    this.#debug = debug;

    this.#log('Initialized with timeout=%ds debug=%s', this.#timeout, this.#debug);
    this.#checkSubscription();
  }

  /**
   * Log a debug message to the console. Only prints when `debug: true`.
   * @param {string} message
   * @param {...any} args
   */
  #log(message, ...args) {
    if (!this.#debug) return;
    console.log(`[x-scraper] ${message}`, ...args);
  }

  /**
   * Non-blocking background check of the account's subscription status.
   * Logs a warning if the token belongs to a free (non-paying) account.
   */
  #checkSubscription() {
    this.#log('Checking account subscription status...');
    this.#client
      .user()
      .get()
      .then((user) => {
        if (user && user.isPaying === false) {
          console.warn(
            '\n⚠️  [x-scraper] WARNING: This Apify token belongs to a non-paying (free) account.\n' +
            '   The Twitter Scraper actor has limited functionality on free plans (max 10 items, higher pricing).\n' +
            '   Subscribe to a paid plan to unlock full access: https://apify.com/pricing?fpr=yhdrb\n'
          );
        } else {
          this.#log('Account is on a paid plan.');
        }
      })
      .catch(() => {
        this.#log('Could not verify subscription status (will fail on run if token is invalid).');
      });
  }

  /**
   * Build the final actor input by merging user options into the raw input.
   * Always injects `clawhub: true`.
   * @param {object} input - The actor input object.
   * @param {SearchOptions} [options={}]
   * @returns {object} Merged input ready for the actor.
   */
  #buildInput(input, options = {}) {
    const merged = { ...input, clawhub: true };

    if (options.sort !== undefined) merged.sort = options.sort;
    if (options.maxItems !== undefined) merged.maxItems = options.maxItems;
    if (options.lang !== undefined) merged.tweetLanguage = options.lang;

    return merged;
  }

  /**
   * Auto-paginate all items from a dataset.
   * @param {string} datasetId
   * @returns {Promise<Array<object>>}
   */
  async #fetchAllItems(datasetId) {
    const allItems = [];
    let offset = 0;
    let page = 0;

    while (true) {
      const { items } = await this.#client
        .dataset(datasetId)
        .listItems({ offset, limit: DATASET_PAGE_LIMIT, clean: true });

      page++;
      allItems.push(...items);
      this.#log('fetchAllItems() page=%d fetched=%d totalSoFar=%d', page, items.length, allItems.length);

      if (items.length < DATASET_PAGE_LIMIT) break;
      offset += items.length;
    }

    return allItems;
  }

  // ---------------------------------------------------------------------------
  // CORE METHODS
  // ---------------------------------------------------------------------------

  /**
   * Execute the Twitter scraper with a raw actor input object.
   * This is the "I know what I'm doing" escape hatch — pass any valid actor
   * input and get items back. `clawhub: true` is still injected automatically.
   *
   * @param {object} input - Raw actor input (searchTerms, startUrls, twitterHandles, etc.).
   * @param {SearchOptions} [options={}]
   * @returns {Promise<Array<object>|FullResponse>} Tweet items, or full response if `options.fullResponse` is true.
   * @throws {Error} If the actor run fails or cannot be created.
   *
   * @example
   * const tweets = await scraper.execute({
   *   searchTerms: ['from:NASA filter:media'],
   *   sort: 'Latest',
   *   maxItems: 100
   * });
   */
  async execute(input, options = {}) {
    const finalInput = { ...input, clawhub: true };
    const timeout = options.timeout ?? this.#timeout;

    this.#log('execute() input=%o timeout=%ds', finalInput, timeout);

    const run = await this.#client
      .actor(ACTOR_ID)
      .call(finalInput, { waitSecs: timeout, log: this.#debug ? 'default' : null });

    this.#log('execute() run started id=%s status=%s datasetId=%s', run.id, run.status, run.defaultDatasetId);

    const items = await this.#fetchAllItems(run.defaultDatasetId);

    this.#log('execute() completed totalItems=%d', items.length);

    if (options.fullResponse) {
      return { items, runId: run.id, datasetId: run.defaultDatasetId };
    }

    return items;
  }

  /**
   * Run the Twitter scraper synchronously — waits for the run to finish and
   * returns all dataset items. Auto-paginates through the full dataset.
   *
   * @param {object} input - Actor input (searchTerms, startUrls, etc.).
   * @param {SearchOptions} [options={}]
   * @returns {Promise<Array<object>|FullResponse>} Tweet items, or full response if `options.fullResponse` is true.
   * @throws {Error} If the actor run fails or cannot be created.
   *
   * @example
   * const tweets = await scraper.search({
   *   searchTerms: ['from:NASA'],
   *   sort: 'Latest',
   *   maxItems: 50
   * });
   */
  async search(input, options = {}) {
    const finalInput = this.#buildInput(input, options);
    const timeout = options.timeout ?? this.#timeout;

    this.#log('search() input=%o timeout=%ds', finalInput, timeout);

    const run = await this.#client
      .actor(ACTOR_ID)
      .call(finalInput, { waitSecs: timeout, log: this.#debug ? 'default' : null });

    this.#log('search() run started id=%s status=%s datasetId=%s', run.id, run.status, run.defaultDatasetId);

    const items = await this.#fetchAllItems(run.defaultDatasetId);

    this.#log('search() completed totalItems=%d', items.length);

    if (options.fullResponse) {
      return { items, runId: run.id, datasetId: run.defaultDatasetId };
    }

    return items;
  }

  /**
   * Start the Twitter scraper asynchronously without waiting for completion.
   * Returns a {@link RunHandle} that you can poll and fetch results from.
   *
   * @param {object} input - Actor input (searchTerms, startUrls, etc.).
   * @param {SearchOptions} [options={}] - Only `sort`, `maxItems`, and `lang` are applied from options.
   * @returns {Promise<RunHandle>} A handle to the started run.
   * @throws {Error} If the run cannot be created.
   *
   * @example
   * const run = await scraper.searchAsync({ searchTerms: ['from:NASA'], sort: 'Latest' });
   * await run.waitForFinish();
   * const tweets = await run.getItems();
   */
  async searchAsync(input, options = {}) {
    const finalInput = this.#buildInput(input, options);

    this.#log('searchAsync() input=%o', finalInput);

    const runData = await this.#client.actor(ACTOR_ID).start(finalInput);

    this.#log('searchAsync() run started id=%s status=%s', runData.id, runData.status);

    return new RunHandle(runData, this.#client);
  }

  /**
   * Run the Twitter scraper and stream results as an async iterator.
   * Yields tweet items one by one, auto-paginating through the dataset.
   *
   * @param {object} input - Actor input (searchTerms, startUrls, etc.).
   * @param {SearchOptions} [options={}]
   * @yields {object} A single tweet item.
   * @throws {Error} If the actor run fails or cannot be created.
   *
   * @example
   * for await (const tweet of scraper.stream({ searchTerms: ['from:NASA'] })) {
   *   console.log(tweet.text);
   * }
   */
  async *stream(input, options = {}) {
    const finalInput = this.#buildInput(input, options);
    const timeout = options.timeout ?? this.#timeout;

    this.#log('stream() input=%o timeout=%ds', finalInput, timeout);

    const run = await this.#client
      .actor(ACTOR_ID)
      .call(finalInput, { waitSecs: timeout, log: this.#debug ? 'default' : null });

    this.#log('stream() run completed id=%s, fetching dataset pages...', run.id);

    let offset = 0;
    let page = 0;
    let total = 0;

    while (true) {
      const { items } = await this.#client
        .dataset(run.defaultDatasetId)
        .listItems({ offset, limit: DATASET_PAGE_LIMIT, clean: true });

      page++;
      total += items.length;
      this.#log('stream() page=%d fetched=%d totalSoFar=%d', page, items.length, total);

      for (const item of items) {
        yield item;
      }

      if (items.length < DATASET_PAGE_LIMIT) break;
      offset += items.length;
    }

    this.#log('stream() done totalYielded=%d', total);
  }

  // ---------------------------------------------------------------------------
  // CONVENIENCE METHODS
  // ---------------------------------------------------------------------------

  /**
   * Fetch tweets posted by a specific Twitter/X profile.
   *
   * @param {string} handle - Twitter handle without the @ prefix (e.g. 'NASA').
   * @param {SearchOptions} [options={}]
   * @returns {Promise<Array<object>|FullResponse>} Tweet items.
   * @throws {Error} If the actor run fails.
   *
   * @example
   * const tweets = await scraper.getTweetsByProfile('NASA', { sort: 'Latest', maxItems: 50 });
   */
  async getTweetsByProfile(handle, options = {}) {
    return this.search({ searchTerms: [`from:${handle}`] }, options);
  }

  /**
   * Fetch tweets from a specific handle within a date range.
   *
   * @param {string} handle - Twitter handle without the @ prefix.
   * @param {string} since - Start date in YYYY-MM-DD format.
   * @param {string} until - End date in YYYY-MM-DD format.
   * @param {SearchOptions} [options={}]
   * @returns {Promise<Array<object>|FullResponse>} Tweet items.
   * @throws {Error} If the actor run fails.
   *
   * @example
   * const tweets = await scraper.getTweetsByHandleInDateRange(
   *   'NASA', '2024-01-01', '2024-06-01', { sort: 'Latest' }
   * );
   */
  async getTweetsByHandleInDateRange(handle, since, until, options = {}) {
    return this.search(
      { searchTerms: [`from:${handle} since:${since} until:${until}`] },
      options
    );
  }

  /**
   * Fetch tweets containing specific hashtags.
   *
   * @param {string|string[]} hashtags - One or more hashtags. The '#' prefix is added automatically if missing.
   * @param {SearchOptions} [options={}]
   * @returns {Promise<Array<object>|FullResponse>} Tweet items.
   * @throws {Error} If the actor run fails.
   *
   * @example
   * const tweets = await scraper.getTweetsByHashtag(['AI', 'MachineLearning'], { sort: 'Latest' });
   */
  async getTweetsByHashtag(hashtags, options = {}) {
    const tags = Array.isArray(hashtags) ? hashtags : [hashtags];
    const query = tags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
    return this.search({ searchTerms: [query] }, options);
  }

  /**
   * Search tweets by a single keyword or phrase.
   *
   * @param {string} keyword - The keyword or phrase to search for.
   * @param {SearchOptions} [options={}]
   * @returns {Promise<Array<object>|FullResponse>} Tweet items.
   * @throws {Error} If the actor run fails.
   *
   * @example
   * const tweets = await scraper.getTweetsByKeyword('artificial intelligence', {
   *   lang: 'en', sort: 'Latest'
   * });
   */
  async getTweetsByKeyword(keyword, options = {}) {
    return this.search({ searchTerms: [keyword] }, options);
  }

  /**
   * Search tweets by a single keyword or phrase.
   * Alias for {@link XScraper#getTweetsByKeyword}.
   *
   * @param {string} keyword - The keyword or phrase to search for.
   * @param {SearchOptions} [options={}]
   * @returns {Promise<Array<object>|FullResponse>} Tweet items.
   * @throws {Error} If the actor run fails.
   *
   * @example
   * const tweets = await scraper.searchTweets('artificial intelligence', { sort: 'Latest' });
   */
  async searchTweets(keyword, options = {}) {
    return this.getTweetsByKeyword(keyword, options);
  }

  /**
   * Search tweets by multiple keywords, joined with OR.
   *
   * @param {string[]} keywords - Array of keywords to search for.
   * @param {SearchOptions} [options={}]
   * @returns {Promise<Array<object>|FullResponse>} Tweet items.
   * @throws {Error} If the actor run fails.
   *
   * @example
   * const tweets = await scraper.getTweetsByKeywords(
   *   ['bitcoin', 'ethereum', 'solana'],
   *   { lang: 'en', sort: 'Latest' }
   * );
   */
  async getTweetsByKeywords(keywords, options = {}) {
    const query = keywords.join(' OR ');
    return this.search({ searchTerms: [query] }, options);
  }

  /**
   * Search tweets by multiple keywords, joined with OR.
   * Alias for {@link XScraper#getTweetsByKeywords}.
   *
   * @param {string[]} keywords - Array of keywords to search for.
   * @param {SearchOptions} [options={}]
   * @returns {Promise<Array<object>|FullResponse>} Tweet items.
   * @throws {Error} If the actor run fails.
   *
   * @example
   * const tweets = await scraper.searchTweetsByMultipleKeywords(
   *   ['AI', 'machine learning', 'deep learning'],
   *   { sort: 'Top' }
   * );
   */
  async searchTweetsByMultipleKeywords(keywords, options = {}) {
    return this.getTweetsByKeywords(keywords, options);
  }

  /**
   * Fetch replies/tweets from a conversation thread by its conversation ID.
   *
   * @param {string} conversationId - The tweet ID that started the conversation thread.
   * @param {SearchOptions} [options={}]
   * @returns {Promise<Array<object>|FullResponse>} Tweet items.
   * @throws {Error} If the actor run fails.
   *
   * @example
   * const replies = await scraper.getTweetsByConversationId('1728108619189874825', {
   *   sort: 'Latest'
   * });
   */
  async getTweetsByConversationId(conversationId, options = {}) {
    return this.search(
      { searchTerms: [`conversation_id:${conversationId}`] },
      options
    );
  }

  /**
   * Fetch a single tweet by its URL.
   *
   * @param {string} tweetUrl - Full URL of the tweet (e.g. 'https://x.com/elonmusk/status/123').
   * @param {SearchOptions} [options={}]
   * @returns {Promise<Array<object>|FullResponse>} Tweet items (typically a single-element array).
   * @throws {Error} If the actor run fails.
   *
   * @example
   * const tweets = await scraper.getTweetByUrl('https://x.com/elonmusk/status/1728108619189874825');
   */
  async getTweetByUrl(tweetUrl, options = {}) {
    return this.search({ startUrls: [tweetUrl] }, options);
  }

  /**
   * Fetch tweets from multiple URLs (tweet URLs, list URLs, profile URLs, or search URLs).
   *
   * @param {string[]} urls - Array of Twitter/X URLs.
   * @param {SearchOptions} [options={}]
   * @returns {Promise<Array<object>|FullResponse>} Tweet items.
   * @throws {Error} If the actor run fails.
   *
   * @example
   * const tweets = await scraper.getTweetsByUrls([
   *   'https://x.com/elonmusk/status/1728108619189874825',
   *   'https://twitter.com/i/lists/1234567890'
   * ]);
   */
  async getTweetsByUrls(urls, options = {}) {
    return this.search({ startUrls: urls }, options);
  }

  /**
   * Search tweets near a geographic location.
   *
   * @param {string} query - Search query or keyword.
   * @param {string} location - Location name (e.g. 'San Francisco', 'New York').
   * @param {string} radius - Search radius with unit (e.g. '10mi', '25km').
   * @param {SearchOptions} [options={}]
   * @returns {Promise<Array<object>|FullResponse>} Tweet items.
   * @throws {Error} If the actor run fails.
   *
   * @example
   * const tweets = await scraper.getTweetsByLocation('coffee', 'San Francisco', '10mi', {
   *   sort: 'Latest'
   * });
   */
  async getTweetsByLocation(query, location, radius, options = {}) {
    return this.search(
      { searchTerms: [`${query} near:"${location}" within:${radius}`] },
      options
    );
  }

  /**
   * Fetch tweets from multiple Twitter/X profiles in a single run.
   *
   * @param {string[]} handles - Array of Twitter handles without the @ prefix.
   * @param {SearchOptions} [options={}]
   * @returns {Promise<Array<object>|FullResponse>} Tweet items from all profiles.
   * @throws {Error} If the actor run fails.
   *
   * @example
   * const tweets = await scraper.getTweetsByMultipleProfiles(
   *   ['elonmusk', 'naval', 'paulg'],
   *   { sort: 'Latest' }
   * );
   */
  async getTweetsByMultipleProfiles(handles, options = {}) {
    const searchTerms = handles.map((h) => `from:${h}`);
    return this.search({ searchTerms }, options);
  }

  /**
   * Fetch tweets containing specific cashtags (e.g. $BTC, $AAPL).
   *
   * @param {string|string[]} cashtags - One or more cashtags. The '$' prefix is added automatically if missing.
   * @param {SearchOptions} [options={}]
   * @returns {Promise<Array<object>|FullResponse>} Tweet items.
   * @throws {Error} If the actor run fails.
   *
   * @example
   * const tweets = await scraper.getTweetsByCashtag(['BTC', 'ETH', 'SOL'], {
   *   lang: 'en', sort: 'Latest'
   * });
   */
  async getTweetsByCashtag(cashtags, options = {}) {
    const tags = Array.isArray(cashtags) ? cashtags : [cashtags];
    const query = tags
      .map((t) => (t.startsWith('$') ? t : `$${t}`))
      .join(' OR ');
    return this.search({ searchTerms: [query] }, options);
  }

  /**
   * Fetch tweets that mention a specific user.
   *
   * @param {string} handle - Twitter handle without the @ prefix.
   * @param {SearchOptions} [options={}]
   * @returns {Promise<Array<object>|FullResponse>} Tweet items.
   * @throws {Error} If the actor run fails.
   *
   * @example
   * const tweets = await scraper.getTweetsByMention('NASA', { sort: 'Latest' });
   */
  async getTweetsByMention(handle, options = {}) {
    return this.search({ searchTerms: [`@${handle}`] }, options);
  }

  /**
   * Fetch tweets with media (images or videos) from a specific handle.
   *
   * @param {string} handle - Twitter handle without the @ prefix.
   * @param {SearchOptions} [options={}]
   * @returns {Promise<Array<object>|FullResponse>} Tweet items.
   * @throws {Error} If the actor run fails.
   *
   * @example
   * const tweets = await scraper.getTweetsWithMediaByHandle('NASA', { sort: 'Latest' });
   */
  async getTweetsWithMediaByHandle(handle, options = {}) {
    return this.search(
      { searchTerms: [`from:${handle} filter:media`] },
      options
    );
  }

  /**
   * Fetch tweets with images from a specific handle.
   *
   * @param {string} handle - Twitter handle without the @ prefix.
   * @param {SearchOptions} [options={}]
   * @returns {Promise<Array<object>|FullResponse>} Tweet items.
   * @throws {Error} If the actor run fails.
   *
   * @example
   * const tweets = await scraper.getTweetsWithImagesByHandle('NASA', { sort: 'Latest' });
   */
  async getTweetsWithImagesByHandle(handle, options = {}) {
    return this.search(
      { searchTerms: [`from:${handle} filter:images`] },
      options
    );
  }

  /**
   * Fetch tweets with videos from a specific handle.
   *
   * @param {string} handle - Twitter handle without the @ prefix.
   * @param {SearchOptions} [options={}]
   * @returns {Promise<Array<object>|FullResponse>} Tweet items.
   * @throws {Error} If the actor run fails.
   *
   * @example
   * const tweets = await scraper.getTweetsWithVideosByHandle('NASA', { sort: 'Latest' });
   */
  async getTweetsWithVideosByHandle(handle, options = {}) {
    return this.search(
      { searchTerms: [`from:${handle} filter:videos`] },
      options
    );
  }

  /**
   * Fetch tweets matching a query with minimum engagement thresholds.
   *
   * @param {string} query - Search query or keyword.
   * @param {object} [options={}]
   * @param {number} [options.minLikes] - Minimum number of likes (favorites).
   * @param {number} [options.minRetweets] - Minimum number of retweets.
   * @param {number} [options.minReplies] - Minimum number of replies.
   * @param {string} [options.sort] - Sort order.
   * @param {number} [options.maxItems] - Maximum items.
   * @param {string} [options.lang] - Tweet language.
   * @param {number} [options.timeout] - Timeout in seconds.
   * @param {boolean} [options.fullResponse=false] - Return full response with metadata.
   * @returns {Promise<Array<object>|FullResponse>} Tweet items.
   * @throws {Error} If the actor run fails.
   *
   * @example
   * const tweets = await scraper.getTweetsWithMinEngagement('bitcoin', {
   *   minLikes: 1000, minRetweets: 100, sort: 'Top'
   * });
   */
  async getTweetsWithMinEngagement(query, options = {}) {
    const { minLikes, minRetweets, minReplies, ...searchOptions } = options;
    const parts = [query];
    if (minLikes !== undefined) parts.push(`min_faves:${minLikes}`);
    if (minRetweets !== undefined) parts.push(`min_retweets:${minRetweets}`);
    if (minReplies !== undefined) parts.push(`min_replies:${minReplies}`);
    return this.search({ searchTerms: [parts.join(' ')] }, searchOptions);
  }

  /**
   * Fetch tweets from verified users only, matching a query.
   *
   * @param {string} query - Search query or keyword.
   * @param {SearchOptions} [options={}]
   * @returns {Promise<Array<object>|FullResponse>} Tweet items.
   * @throws {Error} If the actor run fails.
   *
   * @example
   * const tweets = await scraper.getTweetsByVerifiedUsers('cryptocurrency', { sort: 'Top' });
   */
  async getTweetsByVerifiedUsers(query, options = {}) {
    return this.search(
      { searchTerms: [`${query} filter:verified`] },
      options
    );
  }

  /**
   * Fetch tweets from a specific handle, excluding retweets.
   *
   * @param {string} handle - Twitter handle without the @ prefix.
   * @param {SearchOptions} [options={}]
   * @returns {Promise<Array<object>|FullResponse>} Tweet items.
   * @throws {Error} If the actor run fails.
   *
   * @example
   * const tweets = await scraper.getTweetsExcludingRetweetsByHandle('elonmusk', {
   *   sort: 'Latest'
   * });
   */
  async getTweetsExcludingRetweetsByHandle(handle, options = {}) {
    return this.search(
      { searchTerms: [`from:${handle} -filter:retweets`] },
      options
    );
  }

  /**
   * Fetch tweets containing links from a specific handle.
   *
   * @param {string} handle - Twitter handle without the @ prefix.
   * @param {SearchOptions} [options={}]
   * @returns {Promise<Array<object>|FullResponse>} Tweet items.
   * @throws {Error} If the actor run fails.
   *
   * @example
   * const tweets = await scraper.getTweetsWithLinksByHandle('TechCrunch', { sort: 'Latest' });
   */
  async getTweetsWithLinksByHandle(handle, options = {}) {
    return this.search(
      { searchTerms: [`from:${handle} filter:links`] },
      options
    );
  }
}
