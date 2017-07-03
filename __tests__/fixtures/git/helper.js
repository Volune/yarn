import path from 'path';
import * as fs from '../../../src/util/fs.js';
import {promisify} from '../../../src/util/promise.js';
import mkdir from '../../_temp.js';

const exec = promisify(require('child_process').exec);

const DEFAULT_BRANCH = 'main';

const BRANCH_REF_PREFIX = 'refs/heads/';
const TAG_REF_PREFIX = 'refs/tags/';

class FakeGitRepo {
  constructor() {
    this.repoPath = undefined;
    this.refs = {
      branches: {},
      tags: {},
      head: '',
    };
  }

  repoPath: ?string;
  gitDir: ?string;
  remoteUrl: ?string;
  initializationPromise: ?Promise<void>;
  refs: {
    branches: {},
    tags: {},
    head: string,
  };

  get initialized(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.init();
    }
    return this.initializationPromise;
  }

  async init(): Promise<void> {
    this.repoPath = await mkdir('yarn-test-git');
    this.gitDir = path.join(this.repoPath, '.git');
    this.remoteUrl = 'file://' + this.repoPath;
    await this.git({}, 'init');
    await fs.lstat(this.gitDir); // let an exception propagate if something went wront in "git init"
    await this.createBranches();
    await this.createTags();
    await this.setDefaultBranch();
    await this.initRefs();
    console.log("INITIALIZED")
  }

  async createBranches(): Promise<void> {
    const filenames = await fs.readdir(__dirname);
    let branches = await Promise.all(filenames.map(async (name) => {
      const loc = path.join(__dirname, name);
      const stat = await fs.lstat(loc);
      if (stat.isDirectory()) {
        return name;
      }
      return undefined;
    }));
    branches = branches.filter(Boolean);
    for (const branch of branches) {
      const folder = path.join(__dirname, branch);
      await this.git({workTree: folder}, 'checkout', '--orphan', branch);
      await this.git({workTree: folder}, 'add', '*');
      await this.git({workTree: folder}, 'commit', '-m', `"Create branch ${branch}"`);
    }
  }

  async createTags(): Promise<void> {
    await this.git({}, 'tag', 'v1.1.0', `${BRANCH_REF_PREFIX}v1.1.0`);
    await this.git({}, 'branch', '-d', 'v1.1.0');
  }

  setDefaultBranch(): Promise<string> {
    return this.git({}, 'symbolic-ref', 'HEAD', `${BRANCH_REF_PREFIX}${DEFAULT_BRANCH}`);
  }

  async initRefs(): Promise<void> {
    const stdout = await this.git({}, 'show-ref', '--head', '--heads', '--tags');
    const refs = stdout.split('\n');
    for (const ref of refs) {
      const [hash, name] = ref.split(/\s+/);
      if (!name) {
        // ignore
      } else if (name === 'HEAD') {
        this.refs.head = hash;
      } else if (name.indexOf(BRANCH_REF_PREFIX) === 0) {
        this.refs.branches[name.substr(BRANCH_REF_PREFIX.length)] = hash;
      } else if (name.indexOf(TAG_REF_PREFIX) === 0) {
        this.refs.tags[name.substr(TAG_REF_PREFIX.length)] = hash;
      } else {
        // ignore
      }
    }
  }

  async git({workTree = this.repoPath}, ...args): Promise<string> {
    const command = ['git', '--git-dir', this.gitDir, '--work-tree', workTree].concat(args).join(' ');
    const [stdout] = await exec(command, {env: {}});
    return stdout;
  }
}

const fakeGitRepo = new FakeGitRepo();

afterAll(async () => {
  if (fakeGitRepo.repoPath) {
    // await fs.unlink(fakeGitRepo.repoPath);
  }
});

export default fakeGitRepo;
