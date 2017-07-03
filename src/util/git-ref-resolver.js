/* @flow */

import type Config from '../config.js';
import type {GitRefs} from './git';

const semver = require('semver');

export type DefaultBranch = { defaultBranch: boolean };
export type ResolvedHash = { hash: string, ref: ?string };
type Names = { tags: Array<string>, branches: Array<string> };

export const isCommitHash = (target: string): boolean =>
  (Boolean(target) && /^[a-f0-9]{5,40}$/.test(target));

const REF_TAG_PREFIX = 'refs/tags/';
const REF_BRANCH_PREFIX = 'refs/heads/';

const refNameRegexp = /^refs\/(tags|heads)\/(.+)$/;

export default class GitRefResolver {
  constructor(config: Config, version: string, refs: GitRefs) {
    this.config = config;
    this.version = version;
    this.refs = refs;
  }

  config: Config;
  version: string;
  refs: GitRefs;
  names: ?Names;

  async resolve(): Promise<DefaultBranch | ResolvedHash | false> {
    const testFunctions = [
      () => this.tryVersionAsGitCommit(),
      () => this.version === '' ? this.useDefaultBranch() : false,
      () => this.tryVersionAsFullRef(),
      () => this.tryVersionAsTagName(),
      () => this.tryVersionAsBranchName(),
      () => this.tryVersionAsTagSemver(),
      () => this.tryVersionAsBranchSemver(),
      () => this.version === '*' ? this.useDefaultBranch() : false,
    ];
    for (const testFunction of testFunctions) {
      const result = await testFunction();
      if (result !== false) {
        return result;
      }
    }
    return false;
  }

  useDefaultBranch(): DefaultBranch {
    return {defaultBranch: true};
  }

  tryVersionAsGitCommit(): ResolvedHash | false {
    if (isCommitHash(this.version)) {
      for (const ref in this.refs) {
        const hash = this.refs[ref];
        if (hash.startsWith(this.version)) {
          return {hash, ref};
        }
      }
      return {hash: this.version, ref: undefined};
    }
    return false;
  }

  tryRef(ref: string): ResolvedHash | false {
    if (this.refs[ref]) {
      return {
        hash: this.refs[ref],
        ref,
      };
    }
    return false;
  }

  tryVersionAsFullRef(): ResolvedHash | false {
    if (this.version.startsWith('refs/')) {
      return this.tryRef(this.version);
    }
    return false;
  }

  tryVersionAsTagName(): ResolvedHash | false {
    const ref = `${REF_TAG_PREFIX}${this.version}`;
    return this.tryRef(ref);
  }

  tryVersionAsBranchName(): ResolvedHash | false {
    const ref = `${REF_BRANCH_PREFIX}${this.version}`;
    return this.tryRef(ref);
  }

  getSemverNames(): Names {
    if (!this.names) {
      const names = this.names = {
        tags: [],
        branches: [],
      };
      for (const ref in this.refs) {
        const match = refNameRegexp.exec(ref);
        if (match) {
          const [, type, name] = match;
          if (semver.valid(name, this.config.looseSemver)) {
            switch (type) {
              case 'tags':
                names.tags.push(name);
                break;
              case 'heads':
                names.branches.push(name);
                break;
            }
          }
        }
      }
    }
    return this.names;
  }

  findSemver(names: Array<string>): Promise<?string> {
    return this.config.resolveConstraints(names, this.version);
  }

  async tryVersionAsTagSemver(): Promise<ResolvedHash | false> {
    const result = await this.findSemver(this.getSemverNames().tags);
    if (result) {
      const ref = `${REF_TAG_PREFIX}${result}`;
      return {hash: this.refs[ref], ref};
    }
    return false;
  }

  async tryVersionAsBranchSemver(): Promise<ResolvedHash | false> {
    const result = await this.findSemver(this.getSemverNames().branches);
    if (result) {
      const ref = `${REF_BRANCH_PREFIX}${result}`;
      return {hash: this.refs[ref], ref};
    }
    return false;
  }
}
