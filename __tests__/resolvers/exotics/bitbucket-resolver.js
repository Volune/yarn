/* @flow */
import {explodeHostedGitFragment} from '../../../src/resolvers/exotics/hosted-git-resolver.js';
import BitBucketResolver from '../../../src/resolvers/exotics/bitbucket-resolver.js';
import type {ExplodedFragment} from '../../../src/resolvers/exotics/hosted-git-resolver.js';
import Git from '../../../src/util/git.js';
import * as reporters from '../../../src/reporters/index.js';

const url = require('url');
const _bitBucketBase = 'https://bitbucket.org/';
const reporter = new reporters.NoopReporter({});

test('explodeHostedGitFragment should work for colon separator after host', () => {
  const fragmentString = 'git@bitbucket.org:team2/repo.git';

  const expectedFragment: ExplodedFragment = {
    user: 'team2',
    repo: 'repo',
    hash: '',
  };

  expect(explodeHostedGitFragment(fragmentString, reporter)).toEqual(expectedFragment);
});

test('explodeHostedGitFragment should work for colon separator after host and with protocol before', () => {
  const fragmentString = 'git+ssh://git@bitbucket.org:team/repo.git';

  const expectedFragment: ExplodedFragment = {
    user: 'team',
    repo: 'repo',
    hash: '',
  };

  expect(explodeHostedGitFragment(fragmentString, reporter)).toEqual(expectedFragment);
});

test('explodeHostedGitFragment should work for slash separator after host', () => {
  const fragmentString = 'git@bitbucket.org/team/repo.git';

  const expectedFragment: ExplodedFragment = {
    user: 'team',
    repo: 'repo',
    hash: '',
  };

  expect(explodeHostedGitFragment(fragmentString, reporter)).toEqual(expectedFragment);
});

test('explodeHostedGitFragment should work for package name and colon separator after host', () => {
  const fragmentString = 'package@git@bitbucket.org:team/repo.git';

  const expectedFragment: ExplodedFragment = {
    user: 'team',
    repo: 'repo',
    hash: '',
  };

  expect(explodeHostedGitFragment(fragmentString, reporter)).toEqual(expectedFragment);
});
