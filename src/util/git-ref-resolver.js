/* @flow */

import type Config from '../config.js';
import {removeSuffix} from './misc.js';

const semver = require('semver');

export type GitRefs = {
  [name: string]: string,
};
export type DefaultBranch = {defaultBranch: true};
export type ResolvedSha = {sha: string, ref: ?string};
type Names = {tags: Array<string>, branches: Array<string>};

export const isCommitSha = (target: string): boolean => Boolean(target) && /^[a-f0-9]{5,40}$/.test(target);

const REF_TAG_PREFIX = 'refs/tags/';
const REF_BRANCH_PREFIX = 'refs/heads/';

// This regex is designed to match output from git of the style:
//   ebeb6eafceb61dd08441ffe086c77eb472842494  refs/tags/v0.21.0
// and extract the hash and ref name as capture groups
const gitRefLineRegex = /^([a-fA-F0-9]+)\s+(refs\/(?:tags|heads)\/.*)$/;

const refNameRegexp = /^refs\/(tags|heads)\/(.+)$/;

class GitRefResolver {
  constructor(config: Config, version: string, refs: GitRefs) {
    this.config = config;
    this.version = version;
    this.refs = refs;
  }

  config: Config;
  version: string;
  refs: GitRefs;
  names: ?Names;

  async resolve(): Promise<DefaultBranch | ResolvedSha | false> {
    const testFunctions = [
      () => this.tryVersionAsGitCommit(),
      () => (this.version === '' ? this.useDefaultBranch() : false),
      () => this.tryVersionAsFullRef(),
      () => this.tryVersionAsTagName(),
      () => this.tryVersionAsBranchName(),
      () => this.tryVersionAsTagSemver(),
      () => this.tryVersionAsBranchSemver(),
      () => (this.version === '*' ? this.useDefaultBranch() : false),
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

  tryVersionAsGitCommit(): ResolvedSha | false {
    if (isCommitSha(this.version)) {
      for (const ref in this.refs) {
        const sha = this.refs[ref];
        if (sha.startsWith(this.version)) {
          return {sha, ref};
        }
      }
      return {sha: this.version, ref: undefined};
    }
    return false;
  }

  tryRef(ref: string): ResolvedSha | false {
    if (this.refs[ref]) {
      return {
        sha: this.refs[ref],
        ref,
      };
    }
    return false;
  }

  tryVersionAsFullRef(): ResolvedSha | false {
    if (this.version.startsWith('refs/')) {
      return this.tryRef(this.version);
    }
    return false;
  }

  tryVersionAsTagName(): ResolvedSha | false {
    const ref = `${REF_TAG_PREFIX}${this.version}`;
    return this.tryRef(ref);
  }

  tryVersionAsBranchName(): ResolvedSha | false {
    const ref = `${REF_BRANCH_PREFIX}${this.version}`;
    return this.tryRef(ref);
  }

  getSemverNames(): Names {
    if (!this.names) {
      const names = (this.names = {
        tags: [],
        branches: [],
      });
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

  async tryVersionAsTagSemver(): Promise<ResolvedSha | false> {
    const result = await this.findSemver(this.getSemverNames().tags);
    if (result) {
      const ref = `${REF_TAG_PREFIX}${result}`;
      return {sha: this.refs[ref], ref};
    }
    return false;
  }

  async tryVersionAsBranchSemver(): Promise<ResolvedSha | false> {
    const result = await this.findSemver(this.getSemverNames().branches);
    if (result) {
      const ref = `${REF_BRANCH_PREFIX}${result}`;
      return {sha: this.refs[ref], ref};
    }
    return false;
  }
}

/**
 * Resolve a git-url hash (version) to a git commit sha and branch/tag ref
 */

export const resolveVersion = (
  config: Config,
  version: string,
  refs: GitRefs,
): Promise<DefaultBranch | ResolvedSha | false> => new GitRefResolver(config, version, refs).resolve();

/**
 * Parse Git ref lines into hash of ref names to SHA hashes
 */

export const parseRefs = (stdout: string): GitRefs => {
  // store references
  const refs = {};

  // line delimited
  const refLines = stdout.split('\n');

  for (const line of refLines) {
    const match = gitRefLineRegex.exec(line);

    if (match) {
      const [, sha, tagName] = match;

      // As documented in gitrevisions:
      //   https://www.kernel.org/pub/software/scm/git/docs/gitrevisions.html#_specifying_revisions
      // "A suffix ^ followed by an empty brace pair means the object could be a tag,
      //   and dereference the tag recursively until a non-tag object is found."
      // In other words, the hash without ^{} is the hash of the tag,
      //   and the hash with ^{} is the hash of the commit at which the tag was made.
      const name = removeSuffix(tagName, '^{}');

      refs[name] = sha;
    }
  }

  return refs;
};
