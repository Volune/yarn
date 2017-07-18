/* @flow */

import type Config from '../../config.js';
import BaseGitRepository from './base-git-repository.js';
import BlockingQueue from '../blocking-queue.js';

export const requestQueue: BlockingQueue = new BlockingQueue('hosted git request');

export default class HostedGitRepository extends BaseGitRepository {
  constructor(config: Config, repository: string) {
    super(config, repository);
    // TODO baseUrl
  }

  baseUrl: string;

  async fetchRefsListing(): Promise<Array<string>> {
    const out = await this.config.requestManager.request({
      url: `${this.baseUrl}/info/refs?service=git-upload-pack`,
      queue: requestQueue,
    });

    if (out) {
      // clean up output
      let lines = out.trim().split('\n');

      // remove first two lines which contains compatibility info etc
      // remove last line which contains the terminator "0000"
      lines = lines.slice(2, -1);

      // remove line lengths from start of each line
      lines = lines.map((line): string => line.slice(4));

      return lines;
    } else {
      return super.fetchRefsListing();
    }
  }
}
