/** @jest-environment node */
import { EventEmitter, getEventListeners } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Exercise the real dependency used by JSDOM's HTTP proxy agent, outside Jest mocks.
const requireFromProxyAgent = createRequire(require.resolve('http-proxy-agent'));
const once = requireFromProxyAgent('@tootallnate/once').default;

// observe reports a bounded pending result instead of mistaking a hung promise for success.
async function observe(promise) {
    let timer;
    try {
        return await Promise.race([
            promise.then(
                value => ({ state: 'fulfilled', value }),
                error => ({ state: 'rejected', error })
            ),
            new Promise(resolve => {
                timer = setTimeout(() => resolve({ state: 'pending' }), 100);
            })
        ]);
    } finally {
        clearTimeout(timer);
    }
}

// expectClean checks both emitter and AbortSignal listener ownership after settlement.
function expectClean(emitter, signal) {
    expect(emitter.listenerCount('ready')).toBe(0);
    expect(emitter.listenerCount('error')).toBe(0);
    if (signal) {
        expect(getEventListeners(signal, 'abort')).toHaveLength(0);
    }
}

describe('JSDOM proxy once dependency contract', () => {
    test('resolves all event arguments and removes its listeners', async () => {
        const emitter = new EventEmitter();
        const controller = new AbortController();
        const value = { accepted: true };
        const pending = once(emitter, 'ready', { signal: controller.signal });
        emitter.emit('ready', value, 17, false);
        await expect(pending).resolves.toEqual([value, 17, false]);
        expectClean(emitter, controller.signal);
    });

    test('preserves the original emitted error and cleans up', async () => {
        const emitter = new EventEmitter();
        const controller = new AbortController();
        const error = new Error('synthetic proxy failure');
        const settled = observe(once(emitter, 'ready', { signal: controller.signal }));
        emitter.emit('error', error);
        const result = await settled;
        expect(result.state).toBe('rejected');
        expect(result.error).toBe(error);
        expectClean(emitter, controller.signal);
    });

    test('does not settle without an event, error or abort', async () => {
        const emitter = new EventEmitter();
        const pending = once(emitter, 'ready');
        expect((await observe(pending)).state).toBe('pending');
        emitter.emit('ready', 'event arrived');
        await expect(pending).resolves.toEqual(['event arrived']);
        expectClean(emitter);
    });

    test('rejects an already aborted signal rather than hanging', async () => {
        const emitter = new EventEmitter();
        const controller = new AbortController();
        controller.abort();
        const result = await observe(once(emitter, 'ready', { signal: controller.signal }));
        expect(result.state).toBe('rejected');
        expect(result.error.name).toBe('AbortError');
        expectClean(emitter, controller.signal);
    });

    test('rejects an abort during the wait and removes listeners', async () => {
        const emitter = new EventEmitter();
        const controller = new AbortController();
        const settled = observe(once(emitter, 'ready', { signal: controller.signal }));
        controller.abort();
        const result = await settled;
        expect(result.state).toBe('rejected');
        expect(result.error.name).toBe('AbortError');
        expectClean(emitter, controller.signal);
    });

    test('keeps a completed event result when the signal aborts later', async () => {
        const emitter = new EventEmitter();
        const controller = new AbortController();
        const pending = once(emitter, 'ready', { signal: controller.signal });
        emitter.emit('ready', 'first');
        controller.abort();
        emitter.emit('ready', 'second');
        await expect(pending).resolves.toEqual(['first']);
        expectClean(emitter, controller.signal);
    });

    test('keeps a completed error when the signal aborts later', async () => {
        const emitter = new EventEmitter();
        const controller = new AbortController();
        const error = new Error('synthetic first error');
        const settled = observe(once(emitter, 'ready', { signal: controller.signal }));
        emitter.emit('error', error);
        controller.abort();
        const result = await settled;
        expect(result.state).toBe('rejected');
        expect(result.error).toBe(error);
        expectClean(emitter, controller.signal);
    });
});
