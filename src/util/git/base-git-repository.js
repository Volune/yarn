/* @flow */

import type Config from '../../config.js';
import type {GitRefResolvingInterface, ResolvedSha} from './git-ref-resolver.js';
import * as crypto from '../crypto.js';
import * as fs from '../fs.js';
import {spawn as spawnGit} from './git-spawn.js';

export default class BaseGitRepository implements GitRefResolvingInterface {
  constructor(config: Config, repository: string) {
    this.config = config;
    this.repository = repository;
    this.cwd = this.config.getTemp(crypto.hash(this.repository));
    this.fetched = false;
  }

  config: Config;
  cwd: string;
  repository: string;
  fetched: boolean;

  fetch(): Promise<void> {
    const {repository, cwd} = this;

    return fs.lockQueue.push(repository, async () => {
      if (await fs.exists(cwd)) {
        await spawnGit(['pull'], {cwd});
      } else {
        await spawnGit(['clone', repository, cwd]);
      }

      this.fetched = true;
    });
  }

  async fetchRefsListing(): Promise<Array<string>> {
    const stdout = await spawnGit(['ls-remote', '--tags', '--heads', this.repository]);
    return stdout.split('\n');
  }

  async resolveDefaultBranch(): Promise<ResolvedSha> {
    try {
      const stdout = await spawnGit(['ls-remote', '--symref', this.repository, 'HEAD']);
      const lines = stdout.split('\n');
      const [, ref] = lines[0].split(/\s+/);
      const [sha] = lines[1].split(/\s+/);
      return {sha, ref};
    } catch (err) {
      // older versions of git don't support "--symref"
      const stdout = await spawnGit(['ls-remote', this.repository, 'HEAD']);
      const [sha] = stdout.split(/\s+/);
      return {sha, ref: undefined};
    }
  }

  async resolveCommit(shaToResolve: string): Promise<?ResolvedSha> {
    try {
      await this.fetch();
      const revListArgs = ['rev-list', '-n', '1', '--no-abbrev-commit', '--format=oneline', shaToResolve];
      const stdout = await spawnGit(revListArgs, {cwd: this.cwd});
      const [sha] = stdout.split(/\s+/);
      return {sha, ref: undefined};
    } catch (err) {
      // assuming commit not found, let's try something else
      return null;
    }
  }

}
