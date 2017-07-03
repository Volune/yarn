/* @flow */

import Config from '../../src/config.js';
import Git from '../../src/util/git.js';
import gitRepo from '../fixtures/git/helper.js';

jasmine.DEFAULT_TIMEOUT_INTERVAL = 90000;

describe('resolve hash', () => {
  beforeAll(async () => {
    await gitRepo.initialized;
  });

  const resolveHash = async version => {
    const config = await Config.create();
    const gitUrl = {
      hostname: null,
      protocol: 'file:',
      repository: gitRepo.remoteUrl,
    };
    const client = new Git(config, gitUrl, version);
    return client.setRefRemote();
  };

  test('#', async () => {
    expect(await resolveHash('')).toEqual(gitRepo.refs.head);
  });

  test('#1.1', async () => {
    expect(await resolveHash('1.1')).toEqual(gitRepo.refs.branches['1.1']);
  });

  test('#v1.1.0', async () => {
    expect(await resolveHash('v1.1.0')).toEqual(gitRepo.refs.tags['v1.1.0']);
  });

  test('# >=1.1', async () => {
    expect(await resolveHash(' >=1.1')).toEqual(gitRepo.refs.tags['v1.1.0']);
  });
});
