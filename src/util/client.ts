import qs from 'querystring';
import { EventEmitter } from 'events';
import { parse as parseUrl } from 'url';
import retry, { RetryFunction, Options as RetryOptions } from 'async-retry';
import createOutput, { Output } from './output/create-output';
import Agent, { AgentFetchOptions } from './agent';
import responseError from './response-error';
import ua from './ua';

export type FetchOptions = {
  body?: NodeJS.ReadableStream | object;
  headers?: { [key: string]: string };
  json?: boolean;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  retry?: RetryOptions;
  useCurrentTeam?: boolean;
};

export default class Client extends EventEmitter {
  _agent: Agent;
  _apiUrl: string;
  _debug: boolean;
  _forceNew: boolean;
  _output: Output;
  _token: string;
  currentTeam?: string;

  constructor({
    apiUrl,
    token,
    currentTeam,
    forceNew = false,
    debug = false
  }: {
    apiUrl: string;
    token: string;
    currentTeam?: string;
    forceNew?: boolean;
    debug?: boolean;
  }) {
    super();
    this._token = token;
    this._debug = debug;
    this._forceNew = forceNew;
    this._output = createOutput({ debug });
    this._apiUrl = apiUrl;
    this._agent = new Agent(apiUrl, { debug });
    this._onRetry = this._onRetry.bind(this);
    this.currentTeam = currentTeam;

    const closeAgent = () => {
      this._agent.close();
      process.removeListener('nowExit', closeAgent);
    };

    // @ts-ignore
    process.on('nowExit', closeAgent);
  }

  retry<T>(fn: RetryFunction<T>, { retries = 3, maxTimeout = Infinity } = {}) {
    return retry(fn, {
      retries,
      maxTimeout,
      onRetry: this._onRetry
    });
  }

  _fetch(_url: string, opts: FetchOptions = {}) {
    if (opts.json !== false && opts.body && typeof opts.body === 'object') {
      Object.assign(opts, {
        body: JSON.stringify(opts.body),
        headers: Object.assign({}, opts.headers, {
          'Content-Type': 'application/json'
        })
      });
    }

    if (opts.useCurrentTeam && this.currentTeam) {
      const parsedUrl = parseUrl(_url, true);
      const query = parsedUrl.query;
      query.teamId = this.currentTeam;
      _url = `${parsedUrl.pathname}?${qs.stringify(query)}`;
      delete opts.useCurrentTeam;
    }

    opts.headers = opts.headers || {};
    opts.headers.authorization = `Bearer ${this._token}`;
    opts.headers['user-agent'] = ua;

    return this._output.time(
      `${opts.method || 'GET'} ${this._apiUrl}${_url} ${JSON.stringify(
        opts.body
      ) || ''}`,
      this._agent.fetch(_url, opts as AgentFetchOptions)
    );
  }

  async fetch<T>(url: string, opts: FetchOptions = {}): Promise<T> {
    return this.retry(async bail => {
      const res = await this._fetch(url, opts);
      if (res.ok) {
        if (opts.json === false) {
          return res;
        }

        if (!res.headers.get('content-type')) {
          return null;
        }

        return res.headers.get('content-type').includes('application/json')
          ? res.json()
          : res;
      }
      const error = await responseError(res);
      if (res.status >= 400 && res.status < 500) {
        return bail(error);
      }

      throw error;
    }, opts.retry);
  }

  _onRetry(error: Error) {
    this._output.debug(`Retrying: ${error}\n${error.stack}`);
  }

  close() {
    this._agent.close();
  }
}
