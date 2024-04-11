const originalCwd = process.cwd();
import { afterAll, beforeAll, afterEach } from 'vitest';

// Register Jest matcher extensions for CLI unit tests
import './matchers';

import chalk from 'chalk';
import { PassThrough } from 'stream';
import { createServer, Server } from 'http';
import express, { Express, Router } from 'express';
import { listen } from 'async-listen';
import Client from '../../src/util/client';
import { Output } from '../../src/util/output';
import { ReadableTTY, WritableTTY } from '@vercel-internals/types';

// Disable colors in `chalk` so that tests don't need
// to worry about ANSI codes
chalk.level = 0;

export type Scenario = Router;

class MockStream extends PassThrough {
  isTTY: boolean;

  constructor() {
    super();
    this.isTTY = true;
  }

  // These are for the `ora` module
  clearLine() {}
  cursorTo() {}
}

export class MockClient extends Client {
  scenario: Scenario;
  mockServer?: Server;
  private app: Express;

  constructor() {
    super({
      // Gets populated in `startMockServer()`
      apiUrl: '',

      // Gets re-initialized for every test in `reset()`
      argv: [],
      authConfig: {},
      config: {},
      localConfig: {},
      stdin: new PassThrough() as unknown as ReadableTTY,
      stdout: new PassThrough() as unknown as WritableTTY,
      stderr: new PassThrough() as unknown as WritableTTY,
      output: new Output(new PassThrough() as unknown as WritableTTY),
    });

    this.app = express();
    this.app.use(express.json());

    // play scenario
    this.app.use((req, res, next) => {
      this.scenario(req, res, next);
    });

    // catch requests that were not intercepted
    this.app.use((req, res) => {
      const message = `[Vercel API Mock] \`${req.method} ${req.path}\` was not handled.`;
      console.warn(message);
      res.status(404).json({
        error: {
          code: 'not_found',
          message,
        },
      });
    });

    this.scenario = Router();

    this.reset();
  }

  reset() {
    this.stdin = new MockStream() as unknown as WritableTTY;

    this.stdout = new MockStream() as unknown as WritableTTY;
    this.stdout.setEncoding('utf8');
    this.stdout.end = () => this.stdout;
    this.stdout.pause();

    this.stderr = new MockStream() as unknown as WritableTTY;
    this.stderr.setEncoding('utf8');
    this.stderr.end = () => this.stderr;
    this.stderr.pause();
    this.stderr.isTTY = true;

    this.output = new Output(this.stderr);

    this.argv = [];
    this.authConfig = {
      token: 'token_dummy',
    };
    this.config = {};
    this.localConfig = {};
    this.localConfigPath = undefined;

    this.scenario = Router();

    this.agent?.destroy();
    this.agent = undefined;

    this.cwd = originalCwd;
  }

  async startMockServer() {
    this.mockServer = createServer(this.app);
    await listen(this.mockServer, 0);
    const address = this.mockServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('Unexpected http server address');
    }
    this.apiUrl = `http://127.0.0.1:${address.port}`;
  }

  stopMockServer() {
    return new Promise<void>((resolve, reject) => {
      if (!this.mockServer?.close) {
        reject(new Error(`mockServer did not exist when closing`));
        return;
      }

      this.mockServer.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  setArgv(...argv: string[]) {
    this.argv = [process.execPath, 'cli.js', ...argv];
    this.output = new Output(this.stderr, {
      debug: argv.includes('--debug') || argv.includes('-d'),
      noColor: argv.includes('--no-color'),
    });
  }

  resetOutput() {
    this.output = new Output(this.stderr);
  }

  useScenario(scenario: Scenario) {
    this.scenario = scenario;
  }
}

export const client = new MockClient();

beforeAll(async () => {
  await client.startMockServer();
});

afterEach(() => {
  client.reset();
});

afterAll(async () => {
  await client.stopMockServer();
});
