/* @flow */

import BaseResolver from './base-resolver.js';

import RegistryNpm from './registries/npm-resolver.js';
import RegistryYarn from './registries/yarn-resolver.js';

export const registries = {
  npm: RegistryNpm,
  yarn: RegistryYarn,
};

//

import ExoticGit from './exotics/git-resolver.js';
import ExoticTarball from './exotics/tarball-resolver.js';
import ExoticFile from './exotics/file-resolver.js';
import ExoticLink from './exotics/link-resolver.js';
import ExoticGist from './exotics/gist-resolver.js';

const exotics: Set<Class<$Subtype<BaseResolver>>> = new Set([
  ExoticGit,
  ExoticTarball,
  ExoticFile,
  ExoticLink,
  ExoticGist,
]);

export function getExoticResolver(pattern: string): ?Class<$Subtype<BaseResolver>> {
  for (const Resolver of exotics) {
    if (Resolver.isVersion(pattern)) {
      return Resolver;
    }
  }
  return null;
}

//

import ExoticRegistryResolver from './exotics/registry-resolver.js';

for (const key in registries) {
  const RegistryResolver = registries[key];

  exotics.add(
    class extends ExoticRegistryResolver {
      static protocol = key;
      static factory = RegistryResolver;
    },
  );
}
