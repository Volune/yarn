/* @flow */

import type {Manifest} from '../../types.js';
import type PackageRequest from '../../package-request.js';
import * as versionUtil from '../../util/version.js';
import guessName from '../../util/guess-name.js';
import {registries} from '../../registries/index.js';
import ExoticResolver from './exotic-resolver.js';
import Git from '../../util/git.js';

export default class GitResolver extends ExoticResolver {
  constructor(request: PackageRequest, fragment: string) {
    super(request, fragment);

    const {url, hash} = versionUtil.explodeHashedUrl(fragment);
    this.url = url;
    this.hash = hash;
  }

  url: string;
  hash: string;

  static isVersion(pattern: string): boolean {
    return Git.isGitPattern(pattern);
  }

  async resolve(): Promise<Manifest> {
    const {url} = this;

    // get from lockfile
    const shrunk = this.request.getLocked('git');
    if (shrunk) {
      return shrunk;
    }

    const {config} = this;

    const gitUrl = Git.npmUrlToGitUrl(url, this.reporter);
    const client = new Git(config, gitUrl, this.hash);
    const commit = await client.init();

    async function tryRegistry(registry): Promise<?Manifest> {
      const {filename} = registries[registry];

      const file = await client.getFile(filename);
      if (!file) {
        return null;
      }

      const json = await config.readJson(`${url}/${filename}`, () => JSON.parse(file));
      json._uid = commit;
      json._remote = {
        resolved: `${url}#${commit}`,
        type: 'git',
        reference: url,
        hash: commit,
        registry,
      };
      return json;
    }

    const file = await tryRegistry(this.registry);
    if (file) {
      return file;
    }

    for (const registry in registries) {
      if (registry === this.registry) {
        continue;
      }

      const file = await tryRegistry(registry);
      if (file) {
        return file;
      }
    }

    return {
      // This is just the default, it can be overridden with key of dependencies
      name: guessName(url),
      version: '0.0.0',
      _uid: commit,
      _remote: {
        resolved: `${url}#${commit}`,
        type: 'git',
        reference: url,
        hash: commit,
        registry: 'npm',
      },
    };
  }
}
