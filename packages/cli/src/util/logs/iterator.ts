import { URLSearchParams } from 'url';
import { on } from 'events';
import jsonlines from 'jsonlines';
import type Client from '../client';
import type { AbortController } from 'abort-controller';

export async function* createLogsIterator(
  client: Client,
  deploymentId: string,
  abortController?: AbortController
) {
  const query = new URLSearchParams({
    direction: 'forward',
    follow: '1',
    format: 'lines',
  });
  const eventsUrl = `/v1/deployments/${deploymentId}/events?${query}`;
  const eventsRes = await client.fetch(eventsUrl, {
    json: false,
    signal: abortController?.signal,
  });
  if (!eventsRes.ok) {
    throw new Error(await eventsRes.text());
  }
  if (abortController?.signal.aborted) return;
  const stream = eventsRes.body.pipe(jsonlines.parse());
  abortController?.signal.addEventListener('abort', () => {
    stream.destroy();
  });
  yield* on(stream, 'data');
}
