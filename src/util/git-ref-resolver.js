/* @flow */

import type Config from '../config.js';
import {removeSuffix} from './misc.js';

const semver = require('semver');

export type GitRefs = {
  [name: string]: string,
};
export type ResolveVersionOptions = {
  version: string,
  config: Config,
  refs: GitRefs,
};
export type DefaultBranch = {defaultBranch: true};
export type ResolvedSha = {sha: string, ref: ?string};
type ResolveResult = DefaultBranch | ResolvedSha | false;
type Names = {tags: Array<string>, branches: Array<string>};

export const isCommitSha = (target: string): boolean => Boolean(target) && /^[a-f0-9]{5,40}$/.test(target);

const REF_TAG_PREFIX = 'refs/tags/';
const REF_BRANCH_PREFIX = 'refs/heads/';
const DEFAULT_BRANCH: DefaultBranch = Object.freeze({defaultBranch: true});

// This regex is designed to match output from git of the style:
//   ebeb6eafceb61dd08441ffe086c77eb472842494  refs/tags/v0.21.0
// and extract the hash and ref name as capture groups
const gitRefLineRegex = /^([a-fA-F0-9]+)\s+(refs\/(?:tags|heads)\/.*)$/;

const refNameRegexp = /^refs\/(tags|heads)\/(.+)$/;

const tryVersionAsGitCommit = ({version, refs}: ResolveVersionOptions): ResolvedSha | false => {
  const lowercaseVersion = version.toLowerCase();
  if (!isCommitSha(lowercaseVersion)) {
    return false;
  }
  for (const ref in refs) {
    const sha = refs[ref];
    if (sha.startsWith(lowercaseVersion)) {
      return {sha, ref};
    }
  }
  return {sha: lowercaseVersion, ref: undefined};
};

const tryEmptyVersionAsDefaultBranch = ({version}: ResolveVersionOptions): DefaultBranch | false =>
  version === '' && DEFAULT_BRANCH;
const tryWildcardVersionAsDefaultBranch = ({version}: ResolveVersionOptions): DefaultBranch | false =>
  version === '*' && DEFAULT_BRANCH;

const tryRef = (refs: GitRefs, ref: string): ResolvedSha | false => {
  if (refs[ref]) {
    return {
      sha: refs[ref],
      ref,
    };
  }
  return false;
};

const tryVersionAsFullRef = ({version, refs}: ResolveVersionOptions): ResolvedSha | false => {
  if (version.startsWith('refs/')) {
    return tryRef(refs, version);
  }
  return false;
};

const tryVersionAsTagName = ({version, refs}: ResolveVersionOptions): ResolvedSha | false => {
  const ref = `${REF_TAG_PREFIX}${version}`;
  return tryRef(refs, ref);
};

const tryVersionAsBranchName = ({version, refs}: ResolveVersionOptions): ResolvedSha | false => {
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
): Promise<ResolvedSha | false> => {
  const result = await findSemver(version, config, names.tags);
  if (result) {
    const ref = `${REF_TAG_PREFIX}${result}`;
    return {sha: refs[ref], ref};
  }
  return false;
};

const tryVersionAsBranchSemver = async (
  {version, config, refs}: ResolveVersionOptions,
  names: Names,
): Promise<ResolvedSha | false> => {
  const result = await findSemver(version, config, names.branches);
  if (result) {
    const ref = `${REF_BRANCH_PREFIX}${result}`;
    return {sha: refs[ref], ref};
  }
  return false;
};

const tryVersionAsSemverRange = async (options: ResolveVersionOptions): Promise<ResolvedSha | false> => {
  const names = computeSemverNames(options);
  return (await tryVersionAsTagSemver(options, names)) || tryVersionAsBranchSemver(options, names);
};

const VERSION_RESOLUTION_STEPS: [(ResolveVersionOptions) => ResolveResult | Promise<ResolveResult>] = [
  tryVersionAsGitCommit,
  tryEmptyVersionAsDefaultBranch,
  tryVersionAsFullRef,
  tryVersionAsTagName,
  // tryVersionAsBranchName,
  // tryVersionAsSemverRange,
  // tryWildcardVersionAsDefaultBranch,
];

/**
 * Resolve a git-url hash (version) to a git commit sha and branch/tag ref
 */

export const resolveVersion = async (options: ResolveVersionOptions): Promise<ResolveResult> => {
  for (const testFunction of VERSION_RESOLUTION_STEPS) {
    const result = await testFunction(options);
    if (result !== false) {
      return result;
    }
  }
  return false;
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
