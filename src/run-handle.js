import { DATASET_PAGE_LIMIT, TERMINAL_STATUSES } from './constants.js';

/**
 * Handle for an asynchronous actor run. Returned by {@link XScraper#searchAsync}.
 * Provides methods to poll for completion, fetch results, and stream items.
 */
export class RunHandle {
  /** @type {import('apify-client').ApifyClient} */
  #client;

  /** @type {object} */
  #runData;

  /**
   * @param {object} runData - The run data object returned by `actor.start()`.
   * @param {import('apify-client').ApifyClient} client - The ApifyClient instance.
   */
  constructor(runData, client) {
    this.#runData = runData;
    this.#client = client;
  }

  /**
   * The Apify run ID.
   * @returns {string}
   */
  get runId() {
    return this.#runData.id;
  }

  /**
   * The default dataset ID for this run.
   * @returns {string}
   */
  get datasetId() {
    return this.#runData.defaultDatasetId;
  }

  /**
   * The last known status of the run.
   * @returns {string} One of: READY, RUNNING, SUCCEEDED, FAILED, ABORTING, ABORTED, TIMED-OUT.
   */
  get status() {
    return this.#runData.status;
  }

  /**
   * Poll until the run reaches a terminal status (SUCCEEDED, FAILED, ABORTED, TIMED-OUT).
   *
   * Internally uses the Apify API's long-polling mechanism: each request blocks
   * server-side for up to 60 seconds. If the run hasn't finished by then, we
   * re-issue the request until it does or the overall `waitSecs` budget expires.
   *
   * @param {object} [options]
   * @param {number} [options.waitSecs=999999] - Maximum total time to wait in seconds.
   * @returns {Promise<RunHandle>} This instance with updated status.
   * @throws {Error} If the run finishes with a non-SUCCEEDED status.
   * @throws {Error} If the wait budget expires while the run is still going.
   */
  async waitForFinish(options = {}) {
    const { waitSecs = 999999 } = options;
    const deadline = Date.now() + waitSecs * 1000;
    const POLL_INTERVAL_SECS = 60;

    while (true) {
      const remainingSecs = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      const pollSecs = Math.min(POLL_INTERVAL_SECS, remainingSecs);

      const updated = await this.#client
        .run(this.runId)
        .waitForFinish({ waitSecs: pollSecs });

      this.#runData = updated;

      if (TERMINAL_STATUSES.has(updated.status)) {
        if (updated.status !== 'SUCCEEDED') {
          throw new Error(
            `Run ${this.runId} finished with status: ${updated.status}`
          );
        }
        return this;
      }

      if (Date.now() >= deadline) {
        throw new Error(
          `Run ${this.runId} did not finish within ${waitSecs}s (current status: ${updated.status})`
        );
      }
    }
  }

  /**
   * Fetch all items from the run's dataset. Auto-paginates through all pages.
   * The run must have finished successfully before calling this method.
   * @param {object} [options]
   * @param {boolean} [options.fullResponse=false] - If true, returns `{ items, runId, datasetId }` instead of just items.
   * @returns {Promise<Array<object>|{items: Array<object>, runId: string, datasetId: string}>}
   * @throws {Error} If the run has not reached a terminal status yet.
   */
  async getItems(options = {}) {
    const { fullResponse = false } = options;

    if (!TERMINAL_STATUSES.has(this.#runData.status)) {
      await this.waitForFinish();
    }

    if (this.#runData.status !== 'SUCCEEDED') {
      throw new Error(
        `Run ${this.runId} finished with status: ${this.#runData.status}`
      );
    }

    const allItems = [];
    let offset = 0;

    while (true) {
      const { items } = await this.#client
        .dataset(this.datasetId)
        .listItems({ offset, limit: DATASET_PAGE_LIMIT, clean: true });

      allItems.push(...items);

      if (items.length < DATASET_PAGE_LIMIT) break;
      offset += items.length;
    }

    if (fullResponse) {
      return { items: allItems, runId: this.runId, datasetId: this.datasetId };
    }

    return allItems;
  }

  /**
   * Async iterator that yields tweet items one by one from the run's dataset.
   * Auto-paginates through pages internally. The run must finish before iterating.
   * @yields {object} A single tweet item.
   * @example
   * const run = await scraper.searchAsync({ searchTerms: ['from:NASA'] });
   * await run.waitForFinish();
   * for await (const tweet of run.stream()) {
   *   console.log(tweet.text);
   * }
   */
  async *stream() {
    if (!TERMINAL_STATUSES.has(this.#runData.status)) {
      await this.waitForFinish();
    }

    if (this.#runData.status !== 'SUCCEEDED') {
      throw new Error(
        `Run ${this.runId} finished with status: ${this.#runData.status}`
      );
    }

    let offset = 0;

    while (true) {
      const { items } = await this.#client
        .dataset(this.datasetId)
        .listItems({ offset, limit: DATASET_PAGE_LIMIT, clean: true });

      for (const item of items) {
        yield item;
      }

      if (items.length < DATASET_PAGE_LIMIT) break;
      offset += items.length;
    }
  }
}
