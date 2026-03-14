/**
 * Manual test script for x-scraper.
 *
 * Usage:
 *   1. npm run build
 *   2. APIFY_TOKEN=apify_api_xxx node test.js
 *
 * Set the APIFY_TOKEN environment variable before running.
 * Uncomment whichever section you want to test.
 */

import { XScraper } from './dist/index.mjs';

const TOKEN = process.env.APIFY_TOKEN;

if (!TOKEN) {
  console.error('Missing APIFY_TOKEN. Run as: APIFY_TOKEN=apify_api_xxx node test.js');
  process.exit(1);
}

const scraper = new XScraper({ token: TOKEN, debug: false });

async function main() {
  // ── Pick a test by uncommenting one of the sections below ──

  // 1. getTweetsByProfile
  const tweets = await scraper.getTweetsByProfile('NASA', { sort: 'Latest', maxItems: 5 });
  console.log('getTweetsByProfile:', tweets);

  // 2. getTweetsByHandleInDateRange
  // const tweets = await scraper.getTweetsByHandleInDateRange('NASA', '2024-01-01', '2024-06-01', { sort: 'Latest', maxItems: 5 });
  // console.log('getTweetsByHandleInDateRange:', tweets);

  // 3. getTweetsByKeyword
  // const tweets = await scraper.getTweetsByKeyword('artificial intelligence', { lang: 'en', sort: 'Latest', maxItems: 5 });
  // console.log('getTweetsByKeyword:', tweets);

  // 4. searchTweets (alias for getTweetsByKeyword)
  // const tweets = await scraper.searchTweets('artificial intelligence', { maxItems: 5 });
  // console.log('searchTweets:', tweets);

  // 5. getTweetsByKeywords (multiple keywords joined with OR)
  // const tweets = await scraper.getTweetsByKeywords(['bitcoin', 'ethereum', 'solana'], { lang: 'en', maxItems: 5 });
  // console.log('getTweetsByKeywords:', tweets);

  // 6. searchTweetsByMultipleKeywords (alias for getTweetsByKeywords)
  // const tweets = await scraper.searchTweetsByMultipleKeywords(['AI', 'ML'], { maxItems: 5 });
  // console.log('searchTweetsByMultipleKeywords:', tweets);

  // 7. getTweetsByHashtag
  // const tweets = await scraper.getTweetsByHashtag(['AI', 'MachineLearning'], { sort: 'Latest', maxItems: 5 });
  // console.log('getTweetsByHashtag:', tweets);

  // 8. getTweetsByConversationId
  // const tweets = await scraper.getTweetsByConversationId('1728108619189874825', { sort: 'Latest', maxItems: 5 });
  // console.log('getTweetsByConversationId:', tweets);

  // 9. getTweetByUrl
  // const tweets = await scraper.getTweetByUrl('https://x.com/elonmusk/status/1728108619189874825');
  // console.log('getTweetByUrl:', tweets);

  // 10. getTweetsByUrls
  // const tweets = await scraper.getTweetsByUrls([
  //   'https://x.com/elonmusk/status/1728108619189874825',
  //   'https://twitter.com/i/lists/1234567890',
  // ]);
  // console.log('getTweetsByUrls:', tweets);

  // 11. getTweetsByLocation
  // const tweets = await scraper.getTweetsByLocation('coffee', 'San Francisco', '10mi', { sort: 'Latest', maxItems: 5 });
  // console.log('getTweetsByLocation:', tweets);

  // 12. getTweetsByMultipleProfiles
  // const tweets = await scraper.getTweetsByMultipleProfiles(['elonmusk', 'naval', 'paulg'], { sort: 'Latest', maxItems: 5 });
  // console.log('getTweetsByMultipleProfiles:', tweets);

  // 13. getTweetsByCashtag
  // const tweets = await scraper.getTweetsByCashtag(['BTC', 'ETH', 'SOL'], { lang: 'en', maxItems: 5 });
  // console.log('getTweetsByCashtag:', tweets);

  // 14. getTweetsByMention
  // const tweets = await scraper.getTweetsByMention('NASA', { sort: 'Latest', maxItems: 5 });
  // console.log('getTweetsByMention:', tweets);

  // 15. getTweetsWithMediaByHandle
  // const tweets = await scraper.getTweetsWithMediaByHandle('NASA', { maxItems: 5 });
  // console.log('getTweetsWithMediaByHandle:', tweets);

  // 16. getTweetsWithImagesByHandle
  // const tweets = await scraper.getTweetsWithImagesByHandle('NASA', { maxItems: 5 });
  // console.log('getTweetsWithImagesByHandle:', tweets);

  // 17. getTweetsWithVideosByHandle
  // const tweets = await scraper.getTweetsWithVideosByHandle('NASA', { maxItems: 5 });
  // console.log('getTweetsWithVideosByHandle:', tweets);

  // 18. getTweetsWithMinEngagement
  // const tweets = await scraper.getTweetsWithMinEngagement('bitcoin', { minLikes: 1000, minRetweets: 100, sort: 'Top', maxItems: 5 });
  // console.log('getTweetsWithMinEngagement:', tweets);

  // 19. getTweetsByVerifiedUsers
  // const tweets = await scraper.getTweetsByVerifiedUsers('cryptocurrency', { sort: 'Top', maxItems: 5 });
  // console.log('getTweetsByVerifiedUsers:', tweets);

  // 20. getTweetsExcludingRetweetsByHandle
  // const tweets = await scraper.getTweetsExcludingRetweetsByHandle('elonmusk', { sort: 'Latest', maxItems: 5 });
  // console.log('getTweetsExcludingRetweetsByHandle:', tweets);

  // 21. getTweetsWithLinksByHandle
  // const tweets = await scraper.getTweetsWithLinksByHandle('TechCrunch', { sort: 'Latest', maxItems: 5 });
  // console.log('getTweetsWithLinksByHandle:', tweets);

  // 22. execute (raw input passthrough)
  // const tweets = await scraper.execute({ searchTerms: ['from:NASA filter:media'], sort: 'Latest', maxItems: 5 });
  // console.log('execute:', tweets);

  // 23. search (core method with option merging)
  // const tweets = await scraper.search({ searchTerms: ['from:NASA'] }, { sort: 'Latest', maxItems: 5 });
  // console.log('search:', tweets);

  // 24. searchAsync + RunHandle
  // const run = await scraper.searchAsync({ searchTerms: ['from:NASA'] }, { sort: 'Latest', maxItems: 5 });
  // console.log('Run started:', run.runId);
  // await run.waitForFinish();
  // console.log('Run status:', run.status);
  // const tweets = await run.getItems();
  // console.log('searchAsync items:', tweets);

  // 25. stream (async iterator)
  // let count = 0;
  // for await (const tweet of scraper.stream({ searchTerms: ['from:NASA'] }, { sort: 'Latest', maxItems: 10 })) {
  //   console.log(`Tweet ${++count}:`, tweet.text?.slice(0, 80));
  // }
  // console.log(`Streamed ${count} tweets`);

  // 26. fullResponse mode
  // const result = await scraper.getTweetsByProfile('NASA', { sort: 'Latest', maxItems: 5, fullResponse: true });
  // console.log('Full response runId:', result.runId);
  // console.log('Full response datasetId:', result.datasetId);
  // console.log('Full response items count:', result.items.length);

  // 27. Error handling test (bad token)
  // try {
  //   const bad = new XScraper({ token: 'invalid_token' });
  //   await bad.getTweetsByProfile('NASA', { maxItems: 1 });
  // } catch (err) {
  //   console.log('Expected error:', err.message);
  // }

  console.log('Done. Uncomment a test section in test.js to run it.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
