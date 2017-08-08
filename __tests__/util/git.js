/* @flow */

jest.mock('../../src/util/git/git-spawn.js', () => ({
  spawn: jest.fn(([command]) => {
    switch (command) {
      case 'ls-remote':
        return `ref: refs/heads/master  HEAD
7a053e2ca07d19b2e2eebeeb0c27edaacfd67904        HEAD`;
      case 'rev-list':
        return Promise.resolve('7a053e2ca07d19b2e2eebeeb0c27edaacfd67904 Fix ...');
    }
    return Promise.resolve('');
  }),
}));

import type {ExplodedFragment, GitUrl} from '../../src/util/git.js';
import Config from '../../src/config.js';
import Git from '../../src/util/git.js';
import {spawn as spawnGit} from '../../src/util/git/git-spawn.js';
import {NoopReporter} from '../../src/reporters/index.js';

jasmine.DEFAULT_TIMEOUT_INTERVAL = 90000;

type TestData = {
  pattern: string,
  expectedGitUrl: GitUrl,
};
const TEST_DATA_LIST: Array<TestData> = [
  {
    pattern: 'git+https://github.com/npm-opam/ocamlfind.git',
    expectedGitUrl: {
      protocol: 'https:',
      hostname: 'github.com',
      repository: 'https://github.com/npm-opam/ocamlfind.git',
    },
  },
  {
    pattern: 'https://github.com/npm-opam/ocamlfind.git',
    expectedGitUrl: {
      protocol: 'https:',
      hostname: 'github.com',
      repository: 'https://github.com/npm-opam/ocamlfind.git',
    },
  },
  {
    pattern: 'git://github.com/npm-opam/ocamlfind.git',
    expectedGitUrl: {
      protocol: 'git:',
      hostname: 'github.com',
      repository: 'git://github.com/npm-opam/ocamlfind.git',
    },
  },
  {
    pattern: 'git+ssh://git@gitlab.mydomain.tld:10202/project-name/my-package.git',
    expectedGitUrl: {
      protocol: 'ssh:',
      hostname: 'gitlab.mydomain.tld',
      repository: 'ssh://git@gitlab.mydomain.tld:10202/project-name/my-package.git',
    },
  },
  {
    pattern: 'git+ssh://git@github.com/npm-opam/ocamlfind.git',
    expectedGitUrl: {
      protocol: 'ssh:',
      hostname: 'github.com',
      repository: 'ssh://git@github.com/npm-opam/ocamlfind.git',
    },
  },
  {
    pattern: 'git+ssh://scp-host-nickname:npm-opam/ocamlfind.git',
    expectedGitUrl: {
      protocol: 'ssh:',
      hostname: 'scp-host-nickname',
      repository: 'scp-host-nickname:npm-opam/ocamlfind.git',
    },
  },
  {
    pattern: 'git+ssh://user@scp-host-nickname:npm-opam/ocamlfind.git',
    expectedGitUrl: {
      protocol: 'ssh:',
      hostname: 'scp-host-nickname',
      repository: 'user@scp-host-nickname:npm-opam/ocamlfind.git',
    },
  },
  {
    pattern: 'git+ssh://git@bitbucket.org:team/repo.git',
    expectedGitUrl: {
      protocol: 'ssh:',
      hostname: 'bitbucket.org',
      repository: 'git@bitbucket.org:team/repo.git',
    },
  },
  {
    pattern: 'git@bitbucket.org/team/repo.git',
    expectedGitUrl: {
      protocol: 'ssh:',
      hostname: 'bitbucket.org',
      repository: 'ssh://git@bitbucket.org/team/repo.git',
    },
  },
  {
    pattern: 'git@bitbucket.org:team/repo.git',
    expectedGitUrl: {
      protocol: 'ssh:',
      hostname: 'bitbucket.org',
      repository: 'ssh://git@bitbucket.org:team/repo.git',
    },
  },
  {
    pattern: 'github:npm-opam/ocamlfind.git#v1.2.3',
    expectedGitUrl: {
      protocol: 'https:',
      hostname: 'github.com',
      repository: 'https://github.com/npm-opam/ocamlfind.git',
      hostedGit: {
        user: 'npm-opam',
        repo: 'ocamlfind',
        hash: 'v1.2.3',
      },
    },
  },
  {
    pattern: 'github:npm-opam/ocamlfind#v1.2.3',
    expectedGitUrl: {
      protocol: 'https:',
      hostname: 'github.com',
      repository: 'https://github.com/npm-opam/ocamlfind.git',
      hostedGit: {
        user: 'npm-opam',
        repo: 'ocamlfind',
        hash: 'v1.2.3',
      },
    },
  },
  {
    pattern: 'github:npm-opam/ocamlfind.git',
    expectedGitUrl: {
      protocol: 'https:',
      hostname: 'github.com',
      repository: 'https://github.com/npm-opam/ocamlfind.git',
      hostedGit: {
        user: 'npm-opam',
        repo: 'ocamlfind',
        hash: '',
      },
    },
  },
  {
    pattern: 'github:npm-opam/ocamlfind',
    expectedGitUrl: {
      protocol: 'https:',
      hostname: 'github.com',
      repository: 'https://github.com/npm-opam/ocamlfind.git',
      hostedGit: {
        user: 'npm-opam',
        repo: 'ocamlfind',
        hash: '',
      },
    },
  },
  {
    pattern: 'user/repo',
    expectedGitUrl: {
      protocol: 'https:',
      hostname: 'github.com',
      repository: 'https://github.com/user/repo.git',
      hostedGit: {
        user: 'user',
        repo: 'repo',
        hash: '',
      },
    },
  },
];

describe('isGitPattern', () => {
  for (const testData of TEST_DATA_LIST) {
    test(`isGitPattern(${testData.pattern})`, () => {
      expect(Git.isGitPattern(testData.pattern)).toBe(true);
    });
  }

  test('not isGitPattern(package@git@bitbucket.org:team/repo.git)', () => {
    expect(Git.isGitPattern('package@git@bitbucket.org:team/repo.git')).toBe(false);
  });
});

describe('npmUrlToGitUrl', () => {
  for (const testData of TEST_DATA_LIST) {
    test(`npmUrlToGitUrl(${testData.pattern})`, () => {
      const reporter = new NoopReporter();
      expect(Git.npmUrlToGitUrl(testData.pattern, reporter)).toEqual(testData.expectedGitUrl);
    });
  }
});

describe('explodeHostedGitFragment', () => {
  test('should allow for hashes as part of the branch name', () => {
    const reporter = new NoopReporter();
    const fragmentString = 'jure/lens#fix-issue-#96';
    const expectedFragment: ExplodedFragment = {
      user: 'jure',
      repo: 'lens',
      hash: 'fix-issue-#96',
    };

    expect(Git.explodeHostedGitFragment(fragmentString, reporter)).toEqual(expectedFragment);
  });

  test('should work for branch names without hashes', () => {
    const reporter = new NoopReporter();
    const fragmentString = 'jure/lens#feature/fix-issue';
    const expectedFragment: ExplodedFragment = {
      user: 'jure',
      repo: 'lens',
      hash: 'feature/fix-issue',
    };

    expect(Git.explodeHostedGitFragment(fragmentString, reporter)).toEqual(expectedFragment);
  });

  test('should work identical with and without .git suffix', () => {
    const reporter = new NoopReporter();
    const fragmentWithGit = 'jure/lens.git#feature/fix-issue';
    const fragmentWithoutGit = 'jure/lens#feature/fix-issue';
    const expectedFragment: ExplodedFragment = {
      user: 'jure',
      repo: 'lens',
      hash: 'feature/fix-issue',
    };

    expect(Git.explodeHostedGitFragment(fragmentWithoutGit, reporter)).toEqual(expectedFragment);
    expect(Git.explodeHostedGitFragment(fragmentWithGit, reporter)).toEqual(expectedFragment);
  });

  test('explodeHostedGitFragment should work for colon separator after host', () => {
    const reporter = new NoopReporter();
    const fragmentString = 'git@bitbucket.org:team2/repo.git';
    const expectedFragment: ExplodedFragment = {
      user: 'team2',
      repo: 'repo',
      hash: '',
    };

    expect(Git.explodeHostedGitFragment(fragmentString, reporter)).toEqual(expectedFragment);
  });

  test('explodeHostedGitFragment should work for colon separator after host and with protocol before', () => {
    const reporter = new NoopReporter();
    const fragmentString = 'git+ssh://git@bitbucket.org:team/repo.git';
    const expectedFragment: ExplodedFragment = {
      user: 'team',
      repo: 'repo',
      hash: '',
    };

    expect(Git.explodeHostedGitFragment(fragmentString, reporter)).toEqual(expectedFragment);
  });

  test('explodeHostedGitFragment should work for slash separator after host', () => {
    const reporter = new NoopReporter();
    const fragmentString = 'git@bitbucket.org/team/repo.git';
    const expectedFragment: ExplodedFragment = {
      user: 'team',
      repo: 'repo',
      hash: '',
    };

    expect(Git.explodeHostedGitFragment(fragmentString, reporter)).toEqual(expectedFragment);
  });

  test('explodeHostedGitFragment should work for package name and colon separator after host', () => {
    const reporter = new NoopReporter();
    const fragmentString = 'package@git@bitbucket.org:team/repo.git';
    const expectedFragment: ExplodedFragment = {
      user: 'team',
      repo: 'repo',
      hash: '',
    };

    expect(Git.explodeHostedGitFragment(fragmentString, reporter)).toEqual(expectedFragment);
  });
});

test('secureGitUrl', async (): Promise<void> => {
  const reporter = new NoopReporter();

  const originalRepoExists = Git.repoExists;
  (Git: any).repoExists = jest.fn();
  Git.repoExists.mockImplementation(() => Promise.resolve(true)).mockImplementationOnce(() => {
    throw new Error('Non-existent repo!');
  });

  let hasException = false;
  try {
    await Git.secureGitUrl(Git.npmUrlToGitUrl('http://fake-fake-fake-fake.com/123.git', reporter), '', reporter);
  } catch (e) {
    hasException = true;
  }
  (Git: any).repoExists = originalRepoExists;
  expect(hasException).toEqual(true);

  let gitURL = await Git.secureGitUrl(Git.npmUrlToGitUrl('http://github.com/yarnpkg/yarn.git', reporter), '', reporter);
  expect(gitURL.repository).toEqual('https://github.com/yarnpkg/yarn.git');

  gitURL = await Git.secureGitUrl(Git.npmUrlToGitUrl('https://github.com/yarnpkg/yarn.git', reporter), '', reporter);
  expect(gitURL.repository).toEqual('https://github.com/yarnpkg/yarn.git');

  gitURL = await Git.secureGitUrl(Git.npmUrlToGitUrl('git://github.com/yarnpkg/yarn.git', reporter), '', reporter);
  expect(gitURL.repository).toEqual('https://github.com/yarnpkg/yarn.git');
});

test('resolveDefaultBranch', async () => {
  const spawnGitMock = (spawnGit: any).mock;
  const config = await Config.create();
  const git = new Git(
    config,
    {
      protocol: '',
      hostname: undefined,
      repository: '',
    },
    '',
  );
  expect(await git.resolveDefaultBranch()).toEqual({
    sha: '7a053e2ca07d19b2e2eebeeb0c27edaacfd67904',
    ref: 'refs/heads/master',
  });
  const lastCall = spawnGitMock.calls[spawnGitMock.calls.length - 1];
  expect(lastCall[0]).toContain('ls-remote');
});

test('resolveCommit', async () => {
  const spawnGitMock = (spawnGit: any).mock;
  const config = await Config.create();
  const git = new Git(
    config,
    {
      protocol: '',
      hostname: undefined,
      repository: '',
    },
    '',
  );
  expect(await git.resolveCommit('7a053e2')).toEqual({
    sha: '7a053e2ca07d19b2e2eebeeb0c27edaacfd67904',
    ref: undefined,
  });
  const lastCall = spawnGitMock.calls[spawnGitMock.calls.length - 1];
  expect(lastCall[0]).toContain('rev-list');
  expect(lastCall[0]).toContain('7a053e2');
});
