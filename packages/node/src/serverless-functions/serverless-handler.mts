import { addHelpers } from './helpers.js';
import { createServer } from 'http';
import { serializeBody } from '../utils.js';
import EdgePrimitives from '@edge-runtime/primitives';
import exitHook from 'exit-hook';
import { listen } from 'async-listen';
import { isAbsolute } from 'path';
import { pathToFileURL } from 'url';
import type { ServerResponse, IncomingMessage } from 'http';
import type { VercelProxyResponse } from '../types.js';
import type { VercelRequest, VercelResponse } from './helpers.js';
import { Agent } from 'undici';
import type { Dispatcher } from 'undici';

const { fetch, Headers } = EdgePrimitives;

type ServerlessServerOptions = {
  shouldAddHelpers: boolean;
  mode: 'streaming' | 'buffer';
};

type ServerlessFunctionSignature = (
  req: IncomingMessage | VercelRequest,
  res: ServerResponse | VercelResponse
) => void;

const [NODE_MAJOR] = process.versions.node.split('.').map(v => Number(v));

/* https://nextjs.org/docs/app/building-your-application/routing/router-handlers#supported-http-methods */
const HTTP_METHODS = [
  'GET',
  'HEAD',
  'OPTIONS',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
];

async function createServerlessServer(userCode: ServerlessFunctionSignature) {
  const server = createServer(userCode);
  exitHook(() => server.close());
  return { url: await listen(server) };
}

async function compileUserCode(
  entrypointPath: string,
  options: ServerlessServerOptions
) {
  const id = isAbsolute(entrypointPath)
    ? pathToFileURL(entrypointPath).href
    : entrypointPath;
  let listener = await import(id);

  /**
   * In some cases we might have nested default props due to TS => JS
   */
  for (let i = 0; i < 5; i++) {
    if (listener.default) listener = listener.default;
  }

  if (HTTP_METHODS.some(method => typeof listener[method] === 'function')) {
    if (NODE_MAJOR < 18) {
      throw new Error(
        'Node.js v18 or above is required to use HTTP method exports in your functions.'
      );
    }
    const { getWebExportsHandler } = await import('./helpers-web.js');
    return getWebExportsHandler(listener, HTTP_METHODS);
  }

  return async (req: IncomingMessage, res: ServerResponse) => {
    if (options.shouldAddHelpers) await addHelpers(req, res);
    return listener(req, res);
  };
}

const kEncoding = Symbol('encoding');
class CompressionAgent extends Agent {
  [kEncoding]: string | undefined = undefined;

  dispatch(opts: Agent.DispatchOptions, handlers: Dispatcher.DispatchHandlers) {
    const { onHeaders } = handlers;

    const agent = this;
    if (onHeaders) {
      handlers = {
        ...handlers,
        onHeaders(statusCode, headers, ...rest) {
          let outHeaders = headers;

          if (statusCode >= 200 && headers) {
            outHeaders = [];
            for (let n = 0; n < headers.length; n += 2) {
              const key = headers[n + 0].toString('latin1');

              if (key.toLowerCase() === 'content-encoding') {
                agent[kEncoding] = headers[n + 1].toString('latin1');
              } else {
                outHeaders.push(headers[n + 0] as any);
                outHeaders.push(headers[n + 1] as any);
              }
            }
          }

          // `this` is not our `Agent`, it's the `DispatchHandlers`!
          return onHeaders.call(this, statusCode, outHeaders, ...rest);
        },
      };
    }
    return super.dispatch(opts, handlers);
  }
}

export async function createServerlessEventHandler(
  entrypointPath: string,
  options: ServerlessServerOptions
): Promise<(request: IncomingMessage) => Promise<VercelProxyResponse>> {
  const userCode = await compileUserCode(entrypointPath, options);
  const server = await createServerlessServer(userCode);

  return async function (request: IncomingMessage) {
    const url = new URL(request.url ?? '/', server.url);

    const headers = {
      ...request.headers,
      host: request.headers['x-forwarded-host'],
    } as any;

    const dispatcher = new CompressionAgent();
    const webResponse = await fetch(url, {
      body: await serializeBody(request),
      headers,
      method: request.method,
      redirect: 'manual',
      // @ts-expect-error dispatcher is part of undici, not the fetch spec.
      dispatcher,
    });

    const resHeaders = new Headers(webResponse.headers);
    if (dispatcher[kEncoding] !== undefined) {
      resHeaders.append('content-encoding', dispatcher[kEncoding]);
    }

    let body;
    if (options.mode === 'streaming') {
      body = webResponse.body as any;
    } else {
      // FIXME: at this point body is decompressed
      // but we are returning `content-encoding`, causing a mismatching
      // we should to compress it again. Better solution is to pass a custom undici agent.
      body = Buffer.from(await webResponse.arrayBuffer());

      /**
       * `transfer-encoding` is related to streaming chunks.
       * Since we are buffering the response.body, it should be stripped.
       */
      resHeaders.delete('transfer-encoding');

      /**
       * Since the entity-length and the transfer-length is different,
       * the content-length should be stripped.
       */
      if (resHeaders.has('content-encoding')) {
        resHeaders.delete('content-length');
      }
    }

    return {
      status: webResponse.status,
      headers: resHeaders,
      body,
      encoding: 'utf8',
    };
  };
}
