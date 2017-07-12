/* @flow */

jest.mock('../../src/util/child.js', () => {
  const realChild = (require: any).requireActual('../../src/util/child.js');

  realChild.spawn = jest.fn(() => Promise.resolve(''));

  return realChild;
});

import Git from '../../src/util/git.js';
import {spawn} from '../../src/util/child.js';
import {NoopReporter} from '../../src/reporters/index.js';

jasmine.DEFAULT_TIMEOUT_INTERVAL = 90000;

test('npmUrlToGitUrl', () => {
  expect(Git.npmUrlToGitUrl('git+https://github.com/npm-opam/ocamlfind.git')).toEqual({
    protocol: 'https:',
    hostname: 'github.com',
    repository: 'https://github.com/npm-opam/ocamlfind.git',
  });
  expect(Git.npmUrlToGitUrl('https://github.com/npm-opam/ocamlfind.git')).toEqual({
    protocol: 'https:',
    hostname: 'github.com',
    repository: 'https://github.com/npm-opam/ocamlfind.git',
  });
  expect(Git.npmUrlToGitUrl('git://github.com/npm-opam/ocamlfind.git')).toEqual({
    protocol: 'git:',
    hostname: 'github.com',
    repository: 'git://github.com/npm-opam/ocamlfind.git',
  });
  expect(Git.npmUrlToGitUrl('git+ssh://git@gitlab.mydomain.tld:10202/project-name/my-package.git')).toEqual({
    protocol: 'ssh:',
    hostname: 'gitlab.mydomain.tld',
    repository: 'ssh://git@gitlab.mydomain.tld:10202/project-name/my-package.git',
  });
  expect(Git.npmUrlToGitUrl('git+ssh://git@github.com/npm-opam/ocamlfind.git')).toEqual({
    protocol: 'ssh:',
    hostname: 'github.com',
    repository: 'ssh://git@github.com/npm-opam/ocamlfind.git',
  });
  expect(Git.npmUrlToGitUrl('git+ssh://scp-host-nickname:npm-opam/ocamlfind.git')).toEqual({
    protocol: 'ssh:',
    hostname: 'scp-host-nickname',
    repository: 'scp-host-nickname:npm-opam/ocamlfind.git',
  });
  expect(Git.npmUrlToGitUrl('git+ssh://user@scp-host-nickname:npm-opam/ocamlfind.git')).toEqual({
    protocol: 'ssh:',
    hostname: 'scp-host-nickname',
    repository: 'user@scp-host-nickname:npm-opam/ocamlfind.git',
  });
  expect(Git.npmUrlToGitUrl('github:npm-opam/ocamlfind.git#v1.2.3')).toEqual({
    protocol: 'ssh:',
    hostname: 'github.com',
    repository: 'ssh://git@github.com/npm-opam/ocamlfind.git#v1.2.3',
  });
  expect(Git.npmUrlToGitUrl('github:npm-opam/ocamlfind#v1.2.3')).toEqual({
    protocol: 'ssh:',
    hostname: 'github.com',
    repository: 'ssh://git@github.com/npm-opam/ocamlfind#v1.2.3',
  });
  expect(Git.npmUrlToGitUrl('github:npm-opam/ocamlfind.git')).toEqual({
    protocol: 'ssh:',
    hostname: 'github.com',
    repository: 'ssh://git@github.com/npm-opam/ocamlfind.git',
  });
  expect(Git.npmUrlToGitUrl('github:npm-opam/ocamlfind')).toEqual({
    protocol: 'ssh:',
    hostname: 'github.com',
    repository: 'ssh://git@github.com/npm-opam/ocamlfind',
  });
});

test('secureGitUrl', async function(): Promise<void> {
  const reporter = new NoopReporter();

  const originalRepoExists = Git.repoExists;
  (Git: any).repoExists = jest.fn();
  Git.repoExists.mockImplementation(() => Promise.resolve(true)).mockImplementationOnce(() => {
    throw new Error('Non-existent repo!');
  });

  let hasException = false;
  try {
    await Git.secureGitUrl(Git.npmUrlToGitUrl('http://fake-fake-fake-fake.com/123.git'), '', reporter);
  } catch (e) {
    hasException = true;
  }
  (Git: any).repoExists = originalRepoExists;
  expect(hasException).toEqual(true);

  let gitURL = await Git.secureGitUrl(Git.npmUrlToGitUrl('http://github.com/yarnpkg/yarn.git'), '', reporter);
  expect(gitURL.repository).toEqual('https://github.com/yarnpkg/yarn.git');

  gitURL = await Git.secureGitUrl(Git.npmUrlToGitUrl('https://github.com/yarnpkg/yarn.git'), '', reporter);
  expect(gitURL.repository).toEqual('https://github.com/yarnpkg/yarn.git');

  gitURL = await Git.secureGitUrl(Git.npmUrlToGitUrl('git://github.com/yarnpkg/yarn.git'), '', reporter);
  expect(gitURL.repository).toEqual('https://github.com/yarnpkg/yarn.git');
});

test('spawn', () => {
  const spawnMock = (spawn: any).mock;

  Git.spawn(['status']);

  expect(spawnMock.calls[0][2].env).toMatchObject({
    GIT_ASKPASS: '',
    GIT_TERMINAL_PROMPT: 0,
    GIT_SSH_COMMAND: 'ssh -oBatchMode=yes',
    ...process.env,
  });
});
