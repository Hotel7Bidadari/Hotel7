/**
 * This file is spawned in the background and checks npm for the latest version
 * of the CLI, then writes the version to the cache file.
 *
 * NOTE: Since this file runs asynchronously in the background, it's possible
 * for multiple instances of this file to be running at the same time leading
 * to a race condition where the most recent instance will overwrite the
 * previous cache file resetting the `notified` flag and cause the update
 * notification to appear for multiple consequetive commands. Not the end of
 * the world, but something to be aware of.
 *
 * IMPORTANT! This file must NOT depend on any 3rd party dependencies. This
 * file is NOT bundled by `ncc` and thus any 3rd party dependencies will never
 * be available.
 */

const https = require('https');
const { mkdirSync, writeFileSync } = require('fs');
const { access, mkdir, readFile, unlink, writeFile } = require('fs/promises');
const path = require('path');
const { format, inspect } = require('util');

/**
 * An simple output helper which accumulates error and debug log messages in
 * memory for potential persistance to disk while immediately outputting errors
 * and debug messages, when the `--debug` flag is set, to `stderr`.
 */
class WorkerOutput {
  debugLog = [];
  logFile = null;

  constructor({ debug = true }) {
    this.debugOutputEnabled = debug;
  }

  debug(...args) {
    this.print('debug', args);
  }

  error(...args) {
    this.print('error', args);
  }

  print(type, args) {
    const str = format(
      ...args.map(s => (typeof s === 'string' ? s : inspect(s)))
    );
    this.debugLog.push(`[${new Date().toISOString()}] [${type}] ${str}`);
    if (type === 'debug' && this.debugOutputEnabled) {
      console.error(`> '[debug] [${new Date().toISOString()}] ${str}`);
    } else if (type === 'error') {
      console.error(`Error: ${str}`);
    }
  }

  setLogFile(file) {
    // wire up the exit handler the first time the log file is set
    if (this.logFile === null) {
      process.on('exit', () => {
        if (this.debugLog.length) {
          mkdirSync(path.dirname(this.logFile), { recursive: true });
          writeFileSync(this.logFile, this.debugLog.join('\n'));
        }
      });
    }
    this.logFile = file;
  }
}

const output = new WorkerOutput({
  // enable the debug logging if the `--debug` is set or if this worker script
  // was directly executed
  debug: process.argv.includes('--debug') || !process.connected,
});

process.on('unhandledRejection', err => {
  output.error('Exiting worker due to unhandled rejection:', err);
  process.exit(1);
});

// this timer will prevent this worker process from running longer than 10s
const timer = setTimeout(() => {
  output.error('Worker timed out after 10 seconds');
  process.exit(1);
}, 10000);

// wait for the parent to give us the work payload
process.once('message', async msg => {
  output.debug('Received message from parent:', msg);

  output.debug('Disconnecting from parent');
  process.disconnect();

  const { cacheFile, distTag, name, updateCheckInterval } = msg;
  const cacheFileParsed = path.parse(cacheFile);
  await mkdir(cacheFileParsed.dir, { recursive: true });

  output.setLogFile(
    path.join(cacheFileParsed.dir, `${cacheFileParsed.name}.log`)
  );

  const lockFile = path.join(
    cacheFileParsed.dir,
    `${cacheFileParsed.name}.lock`
  );

  try {
    // check for a lock file and either bail if running or write our pid and continue
    output.debug(`Checking lock file: ${lockFile}`);
    if (await isRunning(lockFile)) {
      output.debug('Worker already running, exiting');
      process.exit(1);
    }
    output.debug(`Initializing lock file with pid ${process.pid}`);
    await writeFile(lockFile, String(process.pid), 'utf-8');

    // fetch the latest version from npm
    const agent = new https.Agent({
      keepAlive: true,
      maxSockets: 15, // See: `npm config get maxsockets`
    });
    const headers = {
      accept:
        'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
    };
    const url = `https://registry.npmjs.org/${name}`;
    output.debug(`Fetching ${url}`);

    const json = await new Promise((resolve, reject) => {
      const req = https.get(
        url,
        {
          agent,
          headers,
        },
        res => {
          let buf = '';
          res.on('data', chunk => {
            buf += chunk;
          });
          res.on('end', () => {
            try {
              resolve(JSON.parse(buf));
            } catch (err) {
              reject(err);
            }
          });
        }
      );

      req.on('error', reject);
      req.end();
    });

    const tags = json['dist-tags'];
    const version = tags[distTag];

    if (version) {
      output.debug(`Found dist tag "${distTag}" with version "${version}"`);
    } else {
      output.error(`Dist tag "${distTag}" not found`);
      output.debug('Available dist tags:', Object.keys(tags));
    }

    output.debug(`Writing cache file: ${cacheFile}`);
    await writeFile(
      cacheFile,
      JSON.stringify({
        expireAt: Date.now() + updateCheckInterval,
        notified: false,
        version,
      })
    );
  } catch (err) {
    output.error(`Failed to get package info:`, err);
  } finally {
    clearTimeout(timer);

    if (await fileExists(lockFile)) {
      output.debug(`Releasing lock file: ${lockFile}`);
      await unlink(lockFile);
    }

    output.debug(`Worker finished successfully!`);

    // force the worker to exit
    process.exit(0);
  }
});

// signal the parent process we're ready
if (process.connected) {
  output.debug("Notifying parent we're ready");
  process.send({ type: 'ready' });
} else {
  console.error('No IPC bridge detected, exiting');
  process.exit(1);
}

async function fileExists(file) {
  return access(file)
    .then(() => true)
    .catch(() => false);
}

async function isRunning(lockFile) {
  try {
    const pid = parseInt(await readFile(lockFile, 'utf-8'));
    output.debug(`Found lock file with pid: ${pid}`);

    // checks for existence of a process; throws if not found
    process.kill(pid, 0);

    // process is still running
    return true;
  } catch (err) {
    if (await fileExists(lockFile)) {
      // lock file does not exist or process is not running and pid is stale
      output.debug(`Resetting lock file: ${err.toString()}`);
      await unlink(lockFile);
    }
    return false;
  }
}
