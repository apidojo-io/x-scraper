import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('apify-client', () => {
  const listItemsMock = vi.fn();
  const callMock = vi.fn();
  const startMock = vi.fn();
  const waitForFinishMock = vi.fn();
  const userGetMock = vi.fn().mockResolvedValue({ isPaying: true });

  const datasetMock = vi.fn(() => ({ listItems: listItemsMock }));
  const actorMock = vi.fn(() => ({ call: callMock, start: startMock }));
  const runMock = vi.fn(() => ({ waitForFinish: waitForFinishMock }));
  const userMock = vi.fn(() => ({ get: userGetMock }));

  class ApifyClient {
    constructor() {}
    actor(...args) { return actorMock(...args); }
    dataset(...args) { return datasetMock(...args); }
    run(...args) { return runMock(...args); }
    user(...args) { return userMock(...args); }
  }

  return {
    ApifyClient,
    __mocks: { actorMock, callMock, startMock, datasetMock, listItemsMock, runMock, waitForFinishMock, userMock, userGetMock },
  };
});

import { XScraper, RunHandle } from '../src/index.js';
import { __mocks } from 'apify-client';

const { actorMock, callMock, startMock, datasetMock, listItemsMock, runMock, waitForFinishMock, userGetMock } = __mocks;

const ACTOR_ID = 'nfp1fpt5gUlBwPcor';

const FAKE_RUN = {
  id: 'run-123',
  defaultDatasetId: 'dataset-456',
  status: 'SUCCEEDED',
};

const FAKE_TWEETS = [
  { type: 'tweet', id: '1', text: 'Hello world', author: { userName: 'test' } },
  { type: 'tweet', id: '2', text: 'Another tweet', author: { userName: 'test2' } },
];

function setupMocks() {
  callMock.mockResolvedValue(FAKE_RUN);
  startMock.mockResolvedValue(FAKE_RUN);
  listItemsMock.mockResolvedValue({ items: FAKE_TWEETS });
  waitForFinishMock.mockResolvedValue(FAKE_RUN);
  userGetMock.mockResolvedValue({ isPaying: true });
}

describe('XScraper', () => {
  let scraper;

  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
    scraper = new XScraper({ token: 'test-token' });
  });

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  describe('constructor', () => {
    it('throws when token is missing', () => {
      expect(() => new XScraper({})).toThrow('APIFY_TOKEN is required');
    });

    it('throws when called with no arguments', () => {
      expect(() => new XScraper()).toThrow('APIFY_TOKEN is required');
    });

    it('creates instance with valid token', () => {
      expect(() => new XScraper({ token: 'abc' })).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Subscription check
  // ---------------------------------------------------------------------------

  describe('subscription check', () => {
    it('logs a warning when account is on the free plan', async () => {
      userGetMock.mockResolvedValue({ isPaying: false });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      new XScraper({ token: 'free-token' });
      await new Promise((r) => setTimeout(r, 10));

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('non-paying (free) account')
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('https://apify.com/pricing?fpr=yhdrb')
      );

      warnSpy.mockRestore();
    });

    it('does not log a warning when account is on a paid plan', async () => {
      userGetMock.mockResolvedValue({ isPaying: true });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      new XScraper({ token: 'paid-token' });
      await new Promise((r) => setTimeout(r, 10));

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('silently ignores errors from the user API', async () => {
      userGetMock.mockRejectedValue(new Error('network error'));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(() => new XScraper({ token: 'bad-network' })).not.toThrow();
      await new Promise((r) => setTimeout(r, 10));

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // Core: execute
  // ---------------------------------------------------------------------------

  describe('execute()', () => {
    it('passes raw input through and always injects clawhub:true', async () => {
      const input = { searchTerms: ['custom query'], sort: 'Top', maxItems: 10 };
      const result = await scraper.execute(input);

      expect(actorMock).toHaveBeenCalledWith(ACTOR_ID);
      const calledInput = callMock.mock.calls[0][0];
      expect(calledInput).toEqual({ ...input, clawhub: true });
      expect(result).toEqual(FAKE_TWEETS);
    });

    it('returns full response when requested', async () => {
      const result = await scraper.execute(
        { searchTerms: ['test'] },
        { fullResponse: true }
      );

      expect(result).toEqual({
        items: FAKE_TWEETS,
        runId: 'run-123',
        datasetId: 'dataset-456',
      });
    });

    it('does not merge sort/lang/maxItems from options into input', async () => {
      await scraper.execute(
        { searchTerms: ['raw'] },
        { sort: 'Latest', lang: 'en', maxItems: 5 }
      );

      const calledInput = callMock.mock.calls[0][0];
      expect(calledInput).toEqual({ searchTerms: ['raw'], clawhub: true });
    });
  });

  // ---------------------------------------------------------------------------
  // Core: search
  // ---------------------------------------------------------------------------

  describe('search()', () => {
    it('calls the actor with merged input and clawhub:true', async () => {
      const result = await scraper.search(
        { searchTerms: ['from:NASA'] },
        { sort: 'Latest', maxItems: 50 }
      );

      expect(actorMock).toHaveBeenCalledWith(ACTOR_ID);
      expect(callMock).toHaveBeenCalledWith(
        { searchTerms: ['from:NASA'], sort: 'Latest', maxItems: 50, clawhub: true },
        { waitSecs: 120, log: null }
      );
      expect(result).toEqual(FAKE_TWEETS);
    });

    it('merges lang option as tweetLanguage', async () => {
      await scraper.search({ searchTerms: ['test'] }, { lang: 'en' });

      const calledInput = callMock.mock.calls[0][0];
      expect(calledInput.tweetLanguage).toBe('en');
    });

    it('uses custom timeout', async () => {
      await scraper.search({ searchTerms: ['test'] }, { timeout: 60 });

      expect(callMock).toHaveBeenCalledWith(
        expect.any(Object),
        { waitSecs: 60, log: null }
      );
    });

    it('returns full response when requested', async () => {
      const result = await scraper.search(
        { searchTerms: ['test'] },
        { fullResponse: true }
      );

      expect(result.items).toEqual(FAKE_TWEETS);
      expect(result.runId).toBe('run-123');
      expect(result.datasetId).toBe('dataset-456');
    });

    it('auto-paginates when dataset has more items than page limit', async () => {
      const page1 = Array.from({ length: 10000 }, (_, i) => ({ id: `p1-${i}` }));
      const page2 = [{ id: 'p2-0' }, { id: 'p2-1' }];

      listItemsMock
        .mockResolvedValueOnce({ items: page1 })
        .mockResolvedValueOnce({ items: page2 });

      const result = await scraper.search({ searchTerms: ['big'] });

      expect(listItemsMock).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(10002);
    });
  });

  // ---------------------------------------------------------------------------
  // Core: searchAsync
  // ---------------------------------------------------------------------------

  describe('searchAsync()', () => {
    it('starts the actor and returns a RunHandle', async () => {
      const handle = await scraper.searchAsync({ searchTerms: ['from:NASA'] });

      expect(actorMock).toHaveBeenCalledWith(ACTOR_ID);
      expect(startMock).toHaveBeenCalledWith(
        expect.objectContaining({ searchTerms: ['from:NASA'], clawhub: true })
      );
      expect(handle).toBeInstanceOf(RunHandle);
      expect(handle.runId).toBe('run-123');
      expect(handle.datasetId).toBe('dataset-456');
      expect(handle.status).toBe('SUCCEEDED');
    });
  });

  // ---------------------------------------------------------------------------
  // Core: stream
  // ---------------------------------------------------------------------------

  describe('stream()', () => {
    it('yields items one by one', async () => {
      const collected = [];
      for await (const tweet of scraper.stream({ searchTerms: ['from:NASA'] })) {
        collected.push(tweet);
      }

      expect(collected).toEqual(FAKE_TWEETS);
      expect(callMock).toHaveBeenCalled();
    });

    it('auto-paginates through multiple pages', async () => {
      const page1 = Array.from({ length: 10000 }, (_, i) => ({ id: `p1-${i}` }));
      const page2 = [{ id: 'p2-0' }];

      listItemsMock
        .mockResolvedValueOnce({ items: page1 })
        .mockResolvedValueOnce({ items: page2 });

      const collected = [];
      for await (const tweet of scraper.stream({ searchTerms: ['big'] })) {
        collected.push(tweet);
      }

      expect(listItemsMock).toHaveBeenCalledTimes(2);
      expect(collected).toHaveLength(10001);
    });
  });

  // ---------------------------------------------------------------------------
  // clawhub injection
  // ---------------------------------------------------------------------------

  describe('clawhub:true injection', () => {
    it('is included in search()', async () => {
      await scraper.search({ searchTerms: ['test'] });
      expect(callMock.mock.calls[0][0].clawhub).toBe(true);
    });

    it('is included in execute()', async () => {
      await scraper.execute({ searchTerms: ['test'] });
      expect(callMock.mock.calls[0][0].clawhub).toBe(true);
    });

    it('is included in searchAsync()', async () => {
      await scraper.searchAsync({ searchTerms: ['test'] });
      expect(startMock.mock.calls[0][0].clawhub).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Debug mode
  // ---------------------------------------------------------------------------

  describe('debug mode', () => {
    it('logs internal messages when debug is true', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const debugScraper = new XScraper({ token: 'test', debug: true });

      await new Promise((r) => setTimeout(r, 10));

      expect(logSpy).toHaveBeenCalled();
      const messages = logSpy.mock.calls.map(([msg]) => msg);
      expect(messages.some((m) => typeof m === 'string' && m.includes('[x-scraper]'))).toBe(true);

      logSpy.mockRestore();
    });

    it('passes log:default to actor.call in search()', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const debugScraper = new XScraper({ token: 'test', debug: true });

      await debugScraper.search({ searchTerms: ['test'] });

      expect(callMock).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ log: 'default' })
      );

      logSpy.mockRestore();
    });

    it('passes log:default to actor.call in execute()', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const debugScraper = new XScraper({ token: 'test', debug: true });

      await debugScraper.execute({ searchTerms: ['test'] });

      expect(callMock).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ log: 'default' })
      );

      logSpy.mockRestore();
    });

    it('passes log:default to actor.call in stream()', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const debugScraper = new XScraper({ token: 'test', debug: true });

      for await (const _ of debugScraper.stream({ searchTerms: ['test'] })) { /* consume */ }

      expect(callMock).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ log: 'default' })
      );

      logSpy.mockRestore();
    });

    it('logs subscription check error when debug is enabled', async () => {
      userGetMock.mockRejectedValue(new Error('network'));
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      new XScraper({ token: 'test', debug: true });
      await new Promise((r) => setTimeout(r, 10));

      const messages = logSpy.mock.calls.map(([msg]) => msg);
      expect(messages.some((m) =>
        typeof m === 'string' && m.includes('Could not verify subscription status')
      )).toBe(true);

      logSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // Convenience methods: input construction
  // ---------------------------------------------------------------------------

  describe('getTweetsByProfile()', () => {
    it('builds from:{handle} search term', async () => {
      await scraper.getTweetsByProfile('NASA', { sort: 'Latest' });

      expect(callMock.mock.calls[0][0]).toEqual(
        expect.objectContaining({ searchTerms: ['from:NASA'], sort: 'Latest', clawhub: true })
      );
    });
  });

  describe('getTweetsByHandleInDateRange()', () => {
    it('builds from:{handle} since:{date} until:{date}', async () => {
      await scraper.getTweetsByHandleInDateRange('NASA', '2024-01-01', '2024-06-01');

      expect(callMock.mock.calls[0][0].searchTerms).toEqual([
        'from:NASA since:2024-01-01 until:2024-06-01',
      ]);
    });
  });

  describe('getTweetsByHashtag()', () => {
    it('builds hashtag query from array', async () => {
      await scraper.getTweetsByHashtag(['AI', 'MachineLearning']);

      expect(callMock.mock.calls[0][0].searchTerms).toEqual(['#AI #MachineLearning']);
    });

    it('accepts single string', async () => {
      await scraper.getTweetsByHashtag('AI');

      expect(callMock.mock.calls[0][0].searchTerms).toEqual(['#AI']);
    });

    it('does not double-prefix #', async () => {
      await scraper.getTweetsByHashtag('#AI');

      expect(callMock.mock.calls[0][0].searchTerms).toEqual(['#AI']);
    });
  });

  describe('getTweetsByKeyword()', () => {
    it('passes keyword as search term', async () => {
      await scraper.getTweetsByKeyword('artificial intelligence', { lang: 'en' });

      expect(callMock.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          searchTerms: ['artificial intelligence'],
          tweetLanguage: 'en',
          clawhub: true,
        })
      );
    });
  });

  describe('searchTweets()', () => {
    it('is an alias for getTweetsByKeyword', async () => {
      await scraper.searchTweets('AI', { sort: 'Latest' });

      expect(callMock.mock.calls[0][0].searchTerms).toEqual(['AI']);
    });
  });

  describe('getTweetsByKeywords()', () => {
    it('joins keywords with OR', async () => {
      await scraper.getTweetsByKeywords(['bitcoin', 'ethereum', 'solana']);

      expect(callMock.mock.calls[0][0].searchTerms).toEqual([
        'bitcoin OR ethereum OR solana',
      ]);
    });
  });

  describe('searchTweetsByMultipleKeywords()', () => {
    it('is an alias for getTweetsByKeywords', async () => {
      await scraper.searchTweetsByMultipleKeywords(['AI', 'ML']);

      expect(callMock.mock.calls[0][0].searchTerms).toEqual(['AI OR ML']);
    });
  });

  describe('getTweetsByConversationId()', () => {
    it('builds conversation_id query', async () => {
      await scraper.getTweetsByConversationId('1728108619189874825');

      expect(callMock.mock.calls[0][0].searchTerms).toEqual([
        'conversation_id:1728108619189874825',
      ]);
    });
  });

  describe('getTweetByUrl()', () => {
    it('passes URL as startUrls', async () => {
      const url = 'https://x.com/elonmusk/status/1728108619189874825';
      await scraper.getTweetByUrl(url);

      expect(callMock.mock.calls[0][0].startUrls).toEqual([url]);
    });
  });

  describe('getTweetsByUrls()', () => {
    it('passes multiple URLs as startUrls', async () => {
      const urls = [
        'https://x.com/elonmusk/status/123',
        'https://twitter.com/i/lists/456',
      ];
      await scraper.getTweetsByUrls(urls);

      expect(callMock.mock.calls[0][0].startUrls).toEqual(urls);
    });
  });

  describe('getTweetsByLocation()', () => {
    it('builds near/within query', async () => {
      await scraper.getTweetsByLocation('coffee', 'San Francisco', '10mi');

      expect(callMock.mock.calls[0][0].searchTerms).toEqual([
        'coffee near:"San Francisco" within:10mi',
      ]);
    });
  });

  describe('getTweetsByMultipleProfiles()', () => {
    it('builds from: for each handle', async () => {
      await scraper.getTweetsByMultipleProfiles(['elonmusk', 'naval', 'paulg']);

      expect(callMock.mock.calls[0][0].searchTerms).toEqual([
        'from:elonmusk',
        'from:naval',
        'from:paulg',
      ]);
    });
  });

  describe('getTweetsByCashtag()', () => {
    it('joins cashtags with OR', async () => {
      await scraper.getTweetsByCashtag(['BTC', 'ETH', 'SOL']);

      expect(callMock.mock.calls[0][0].searchTerms).toEqual([
        '$BTC OR $ETH OR $SOL',
      ]);
    });

    it('does not double-prefix $', async () => {
      await scraper.getTweetsByCashtag(['$BTC', 'ETH']);

      expect(callMock.mock.calls[0][0].searchTerms).toEqual(['$BTC OR $ETH']);
    });

    it('accepts single string', async () => {
      await scraper.getTweetsByCashtag('AAPL');

      expect(callMock.mock.calls[0][0].searchTerms).toEqual(['$AAPL']);
    });
  });

  describe('getTweetsByMention()', () => {
    it('builds @handle query', async () => {
      await scraper.getTweetsByMention('NASA');

      expect(callMock.mock.calls[0][0].searchTerms).toEqual(['@NASA']);
    });
  });

  describe('getTweetsWithMediaByHandle()', () => {
    it('builds from:{handle} filter:media', async () => {
      await scraper.getTweetsWithMediaByHandle('NASA');

      expect(callMock.mock.calls[0][0].searchTerms).toEqual([
        'from:NASA filter:media',
      ]);
    });
  });

  describe('getTweetsWithImagesByHandle()', () => {
    it('builds from:{handle} filter:images', async () => {
      await scraper.getTweetsWithImagesByHandle('NASA');

      expect(callMock.mock.calls[0][0].searchTerms).toEqual([
        'from:NASA filter:images',
      ]);
    });
  });

  describe('getTweetsWithVideosByHandle()', () => {
    it('builds from:{handle} filter:videos', async () => {
      await scraper.getTweetsWithVideosByHandle('NASA');

      expect(callMock.mock.calls[0][0].searchTerms).toEqual([
        'from:NASA filter:videos',
      ]);
    });
  });

  describe('getTweetsWithMinEngagement()', () => {
    it('builds min_faves and min_retweets query', async () => {
      await scraper.getTweetsWithMinEngagement('bitcoin', {
        minLikes: 1000,
        minRetweets: 100,
        sort: 'Top',
      });

      expect(callMock.mock.calls[0][0].searchTerms).toEqual([
        'bitcoin min_faves:1000 min_retweets:100',
      ]);
      expect(callMock.mock.calls[0][0].sort).toBe('Top');
    });

    it('builds min_replies query', async () => {
      await scraper.getTweetsWithMinEngagement('test', { minReplies: 50 });

      expect(callMock.mock.calls[0][0].searchTerms).toEqual([
        'test min_replies:50',
      ]);
    });
  });

  describe('getTweetsByVerifiedUsers()', () => {
    it('builds filter:verified query', async () => {
      await scraper.getTweetsByVerifiedUsers('cryptocurrency');

      expect(callMock.mock.calls[0][0].searchTerms).toEqual([
        'cryptocurrency filter:verified',
      ]);
    });
  });

  describe('getTweetsExcludingRetweetsByHandle()', () => {
    it('builds -filter:retweets query', async () => {
      await scraper.getTweetsExcludingRetweetsByHandle('elonmusk');

      expect(callMock.mock.calls[0][0].searchTerms).toEqual([
        'from:elonmusk -filter:retweets',
      ]);
    });
  });

  describe('getTweetsWithLinksByHandle()', () => {
    it('builds filter:links query', async () => {
      await scraper.getTweetsWithLinksByHandle('TechCrunch');

      expect(callMock.mock.calls[0][0].searchTerms).toEqual([
        'from:TechCrunch filter:links',
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // RunHandle
  // ---------------------------------------------------------------------------

  describe('RunHandle', () => {
    it('waitForFinish() polls and resolves on SUCCEEDED', async () => {
      const handle = await scraper.searchAsync({ searchTerms: ['test'] });
      const result = await handle.waitForFinish();

      expect(runMock).toHaveBeenCalledWith('run-123');
      expect(waitForFinishMock).toHaveBeenCalled();
      expect(result).toBe(handle);
    });

    it('waitForFinish() throws on FAILED status', async () => {
      waitForFinishMock.mockResolvedValue({ ...FAKE_RUN, status: 'FAILED' });

      const handle = await scraper.searchAsync({ searchTerms: ['test'] });

      await expect(handle.waitForFinish()).rejects.toThrow(
        'Run run-123 finished with status: FAILED'
      );
    });

    it('getItems() fetches dataset items', async () => {
      waitForFinishMock.mockResolvedValue(FAKE_RUN);

      const handle = await scraper.searchAsync({ searchTerms: ['test'] });
      await handle.waitForFinish();
      const items = await handle.getItems();

      expect(items).toEqual(FAKE_TWEETS);
      expect(datasetMock).toHaveBeenCalledWith('dataset-456');
    });

    it('getItems() with fullResponse', async () => {
      waitForFinishMock.mockResolvedValue(FAKE_RUN);

      const handle = await scraper.searchAsync({ searchTerms: ['test'] });
      await handle.waitForFinish();
      const result = await handle.getItems({ fullResponse: true });

      expect(result.items).toEqual(FAKE_TWEETS);
      expect(result.runId).toBe('run-123');
      expect(result.datasetId).toBe('dataset-456');
    });

    it('stream() yields items', async () => {
      waitForFinishMock.mockResolvedValue(FAKE_RUN);

      const handle = await scraper.searchAsync({ searchTerms: ['test'] });
      await handle.waitForFinish();

      const collected = [];
      for await (const tweet of handle.stream()) {
        collected.push(tweet);
      }

      expect(collected).toEqual(FAKE_TWEETS);
    });

    it('waitForFinish() polls multiple times before success', async () => {
      waitForFinishMock
        .mockResolvedValueOnce({ ...FAKE_RUN, status: 'RUNNING' })
        .mockResolvedValueOnce(FAKE_RUN);

      const handle = await scraper.searchAsync({ searchTerms: ['test'] });
      const result = await handle.waitForFinish();

      expect(waitForFinishMock).toHaveBeenCalledTimes(2);
      expect(result).toBe(handle);
    });

    it('waitForFinish() throws when wait budget expires', async () => {
      waitForFinishMock.mockResolvedValue({ ...FAKE_RUN, status: 'RUNNING' });

      const handle = await scraper.searchAsync({ searchTerms: ['test'] });

      await expect(handle.waitForFinish({ waitSecs: 0 })).rejects.toThrow(
        /did not finish within 0s/
      );
    });

    it('getItems() auto-waits when status is not terminal', async () => {
      startMock.mockResolvedValue({ ...FAKE_RUN, status: 'RUNNING' });
      waitForFinishMock.mockResolvedValue(FAKE_RUN);

      const handle = await scraper.searchAsync({ searchTerms: ['test'] });
      const items = await handle.getItems();

      expect(waitForFinishMock).toHaveBeenCalled();
      expect(items).toEqual(FAKE_TWEETS);
    });

    it('getItems() throws when run has non-SUCCEEDED terminal status', async () => {
      startMock.mockResolvedValue({ ...FAKE_RUN, status: 'FAILED' });

      const handle = await scraper.searchAsync({ searchTerms: ['test'] });

      await expect(handle.getItems()).rejects.toThrow(
        'Run run-123 finished with status: FAILED'
      );
    });

    it('getItems() auto-paginates through multiple dataset pages', async () => {
      const page1 = Array.from({ length: 10000 }, (_, i) => ({ id: `p1-${i}` }));
      const page2 = [{ id: 'p2-0' }];

      listItemsMock
        .mockResolvedValueOnce({ items: page1 })
        .mockResolvedValueOnce({ items: page2 });

      const handle = await scraper.searchAsync({ searchTerms: ['test'] });
      await handle.waitForFinish();
      const items = await handle.getItems();

      expect(listItemsMock).toHaveBeenCalledTimes(2);
      expect(items).toHaveLength(10001);
    });

    it('stream() auto-waits when status is not terminal', async () => {
      startMock.mockResolvedValue({ ...FAKE_RUN, status: 'RUNNING' });
      waitForFinishMock.mockResolvedValue(FAKE_RUN);

      const handle = await scraper.searchAsync({ searchTerms: ['test'] });

      const collected = [];
      for await (const tweet of handle.stream()) {
        collected.push(tweet);
      }

      expect(waitForFinishMock).toHaveBeenCalled();
      expect(collected).toEqual(FAKE_TWEETS);
    });

    it('stream() throws when run has non-SUCCEEDED terminal status', async () => {
      startMock.mockResolvedValue({ ...FAKE_RUN, status: 'FAILED' });

      const handle = await scraper.searchAsync({ searchTerms: ['test'] });

      const gen = handle.stream();
      await expect(gen.next()).rejects.toThrow(
        'Run run-123 finished with status: FAILED'
      );
    });

    it('stream() auto-paginates through multiple dataset pages', async () => {
      const page1 = Array.from({ length: 10000 }, (_, i) => ({ id: `p1-${i}` }));
      const page2 = [{ id: 'p2-0' }];

      listItemsMock
        .mockResolvedValueOnce({ items: page1 })
        .mockResolvedValueOnce({ items: page2 });

      const handle = await scraper.searchAsync({ searchTerms: ['test'] });
      await handle.waitForFinish();

      const collected = [];
      for await (const tweet of handle.stream()) {
        collected.push(tweet);
      }

      expect(listItemsMock).toHaveBeenCalledTimes(2);
      expect(collected).toHaveLength(10001);
    });
  });

  // ---------------------------------------------------------------------------
  // Error propagation
  // ---------------------------------------------------------------------------

  describe('error propagation', () => {
    it('propagates actor call errors', async () => {
      callMock.mockRejectedValue(new Error('401 Unauthorized'));

      await expect(
        scraper.search({ searchTerms: ['test'] })
      ).rejects.toThrow('401 Unauthorized');
    });

    it('propagates actor start errors', async () => {
      startMock.mockRejectedValue(new Error('Rate limit exceeded'));

      await expect(
        scraper.searchAsync({ searchTerms: ['test'] })
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('propagates dataset fetch errors', async () => {
      listItemsMock.mockRejectedValue(new Error('Dataset not found'));

      await expect(
        scraper.search({ searchTerms: ['test'] })
      ).rejects.toThrow('Dataset not found');
    });
  });
});
