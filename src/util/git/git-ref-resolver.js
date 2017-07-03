/* @flow */

import type Config from '../../config.js';
import {removeSuffix} from '../misc.js';

const semver = require('semver');

export type ResolvedSha = {sha: string, ref: ?string};
export interface GitRefResolvingInterface {
  resolveDefaultBranch(): Promise<ResolvedSha>,
  resolveCommit(sha: string): Promise<?ResolvedSha>,
}
export type GitRefs = {
  [name: string]: string,
};
export type ResolveVersionOptions = {
  version: string,
  config: Config,
  git: GitRefResolvingInterface,
  refs: GitRefs,
};
type Names = {tags: Array<string>, branches: Array<string>};

export const isCommitSha = (target: string): boolean => Boolean(target) && /^[a-f0-9]{5,40}$/.test(target);

const REF_TAG_PREFIX = 'refs/tags/';
const REF_BRANCH_PREFIX = 'refs/heads/';

// This regex is designed to match output from git of the style:
//   ebeb6eafceb61dd08441ffe086c77eb472842494  refs/tags/v0.21.0
// and extract the hash and ref name as capture groups
const gitRefLineRegex = /^([a-fA-F0-9]+)\s+(refs\/(?:tags|heads)\/.*)$/;

const refNameRegexp = /^refs\/(tags|heads)\/(.+)$/;

const tryVersionAsGitCommit = ({version, refs, git}: ResolveVersionOptions): Promise<?ResolvedSha> => {
  const lowercaseVersion = version.toLowerCase();
  if (!isCommitSha(lowercaseVersion)) {
    return Promise.resolve(null);
  }
  for (const ref in refs) {
    const sha = refs[ref];
    if (sha.startsWith(lowercaseVersion)) {
      return Promise.resolve({sha, ref});
    }
  }
  return git.resolveCommit(lowercaseVersion);
};

const tryWildcardVersionAsDefaultBranch = ({version, git}: ResolveVersionOptions): Promise<?ResolvedSha> =>
  version === '*' ? git.resolveDefaultBranch() : Promise.resolve(null);

const tryRef = (refs: GitRefs, ref: string): ?ResolvedSha => {
  if (refs[ref]) {
    return {
      sha: refs[ref],
      ref,
    };
  }
  return null;
};

const tryVersionAsFullRef = ({version, refs}: ResolveVersionOptions): ?ResolvedSha => {
  if (version.startsWith('refs/')) {
    return tryRef(refs, version);
  }
  return null;
};

const tryVersionAsTagName = ({version, refs}: ResolveVersionOptions): ?ResolvedSha => {
  const ref = `${REF_TAG_PREFIX}${version}`;
  return tryRef(refs, ref);
};

const tryVersionAsBranchName = ({version, refs}: ResolveVersionOptions): ?ResolvedSha => {
  const ref = `${REF_BRANCH_PREFIX}${version}`;
  return tryRef(refs, ref);
};

const computeSemverNames = ({config, refs}: ResolveVersionOptions): Names => {
  const names = {
    tags: [],
    branches: [],
  };
  for (const ref in refs) {
    const match = refNameRegexp.exec(ref);
    if (match) {
      const [, type, name] = match;
      if (semver.valid(name, config.looseSemver)) {
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
  return names;
};

const findSemver = (version: string, config: Config, namesList: Array<string>): Promise<?string> =>
  config.resolveConstraints(namesList, version);

const tryVersionAsTagSemver = async (
  {version, config, refs}: ResolveVersionOptions,
  names: Names,
): Promise<?ResolvedSha> => {
  const result = await findSemver(version, config, names.tags);
  if (result) {
    const ref = `${REF_TAG_PREFIX}${result}`;
    return {sha: refs[ref], ref};
  }
  return null;
};

const tryVersionAsBranchSemver = async (
  {version, config, refs}: ResolveVersionOptions,
  names: Names,
): Promise<?ResolvedSha> => {
  const result = await findSemver(version, config, names.branches);
  if (result) {
    const ref = `${REF_BRANCH_PREFIX}${result}`;
    return {sha: refs[ref], ref};
  }
  return null;
};

const tryVersionAsSemverRange = async (options: ResolveVersionOptions): Promise<?ResolvedSha> => {
  const names = computeSemverNames(options);
  return (await tryVersionAsTagSemver(options, names)) || tryVersionAsBranchSemver(options, names);
};

const VERSION_RESOLUTION_STEPS: Array<(ResolveVersionOptions) => ?ResolvedSha | Promise<?ResolvedSha>> = [
  tryVersionAsGitCommit,
  tryVersionAsFullRef,
  tryVersionAsTagName,
  tryVersionAsBranchName,
  tryVersionAsSemverRange,
  tryWildcardVersionAsDefaultBranch,
];

/**
 * Resolve a git-url hash (version) to a git commit sha and branch/tag ref
 * Returns null if the version cannot be resolved to any commit
 */

export const resolveVersion = async (options: ResolveVersionOptions): Promise<?ResolvedSha> => {
  const {version, git} = options;
  if (version.trim() === '') {
    return git.resolveDefaultBranch();
  }

  for (const testFunction of VERSION_RESOLUTION_STEPS) {
    const result = await testFunction(options);
    if (result !== null) {
      return result;
    }
  }
  return null;
};

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
