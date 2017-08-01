/* @flow */

import type {Reporter} from '../../reporters/index.js';
import type {Manifest} from '../../types.js';
import type PackageRequest from '../../package-request.js';
import {MessageError} from '../../errors.js';
import {registries} from '../../registries/index.js';
import GitResolver from './git-resolver.js';
import ExoticResolver from './exotic-resolver.js';
import Git from '../../util/git.js';
import guessName from '../../util/guess-name.js';

export type ExplodedFragment = {
  user: string,
  repo: string,
  hash: string,
};

export function explodeHostedGitFragment(fragment: string, reporter: Reporter): ExplodedFragment {
  const preParts = fragment.split('@');
  if (preParts.length > 2) {
    fragment = preParts[1] + '@' + preParts[2];
  }

  const parts = fragment.split(':');

  if (parts.length == 3) {
    // protocol + host + folder
    parts[1] = parts[1].indexOf('//') >= 0 ? parts[1].substr(2) : parts[1];
    fragment = parts[1] + '/' + parts[2];
  } else if (parts.length == 2) {
    if (parts[0].indexOf('@') == -1) {
      // protocol + host
      fragment = parts[1];
    } else {
      // host + folder
      fragment = parts[0] + '/' + parts[1];
    }
  } else if (parts.length == 1) {
    fragment = parts[0];
  } else {
    throw new MessageError(reporter.lang('invalidHostedGitFragment', fragment));
  }

  const userParts = fragment.split('/');

  if (userParts.length >= 2) {
    if (userParts[0].indexOf('@') >= 0) {
      userParts.shift();
    }

    const user = userParts.shift();
    const repoParts = userParts.join('/').split(/(?:[.]git)?#(.*)/);

    if (repoParts.length <= 3) {
      return {
        user,
        repo: repoParts[0].replace('.git', ''),
        hash: repoParts[1] || '',
      };
    }
  }

  throw new MessageError(reporter.lang('invalidHostedGitFragment', fragment));
}

export default class HostedGitResolver extends ExoticResolver {
  constructor(request: PackageRequest, fragment: string) {
    super(request, fragment);

    const exploded = (this.exploded = explodeHostedGitFragment(fragment, this.reporter));
    const {user, repo, hash} = exploded;
    this.user = user;
    this.repo = repo;
    this.hash = hash;
  }

  exploded: ExplodedFragment;
  url: string;
  user: string;
  repo: string;
  hash: string;

  static getTarballUrl(exploded: ExplodedFragment, commit: string): string {
    exploded;
    commit;
    throw new Error('Not implemented');
  }

  static getGitHTTPUrl(exploded: ExplodedFragment): string {
    exploded;
    throw new Error('Not implemented');
  }

  static getGitHTTPBaseUrl(exploded: ExplodedFragment): string {
    exploded;
    throw new Error('Not implemented');
  }

  static getGitSSHUrl(exploded: ExplodedFragment): string {
    exploded;
    throw new Error('Not implemented');
  }

  static getHTTPFileUrl(exploded: ExplodedFragment, filename: string, commit: string) {
    exploded;
    filename;
    commit;
    throw new Error('Not implemented');
  }

  async hasHTTPCapability(url: string): Promise<boolean> {
    return (
      (await this.config.requestManager.request({
        url,
        method: 'HEAD',
        queue: this.resolver.fetchingQueue,
        followRedirect: false,
      })) !== false
    );
  }

  async resolve(): Promise<Manifest> {
    const httpUrl = this.constructor.getGitHTTPUrl(this.exploded);
    const httpBaseUrl = this.constructor.getGitHTTPBaseUrl(this.exploded);
    const sshUrl = this.constructor.getGitSSHUrl(this.exploded);

    // If the url is accessible over git archive then we should immediately delegate to
    // the git resolver.
    //
    // NOTE: Here we use a different url than when we delegate to the git resolver later on.
    // This is because `git archive` requires access over ssh and github only allows that
    // if you have write permissions
    const sshGitUrl = Git.npmUrlToGitUrl(sshUrl);
    if (await Git.hasArchiveCapability(sshGitUrl)) {
      const archiveClient = new Git(this.config, sshGitUrl, this.hash);
      const commit = await archiveClient.init();
      return this.fork(GitResolver, true, `${sshUrl}#${commit}`);
    }

    // fallback to the plain git resolver
    return this.fork(GitResolver, true, sshUrl);
  }
}
