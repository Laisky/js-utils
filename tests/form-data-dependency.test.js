/** @jest-environment node */
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';

const require = createRequire(import.meta.url);
// Resolve the native serializer actually selected by JSDOM, outside Jest mocks.
const fromJSDOM = createRequire(require.resolve('jsdom'));
const FormData = fromJSDOM('form-data');
const crypto = require('node:crypto');
const { JSDOM } = require('jsdom');

const fixedBoundary = 'js-utils-synthetic-boundary';
const binary = Buffer.from([0, 255, 13, 10, 34, 128, 65]);

function fixedForm() {
    const form = new FormData();
    form.setBoundary(fixedBoundary);
    form.append('label', '東京🙂');
    form.append('count', 17);
    form.append('file', binary, { filename: 'fixture.bin', contentType: 'application/octet-stream' });
    return form;
}

function expectedBody() {
    return Buffer.concat([
        Buffer.from(`--${fixedBoundary}\r\nContent-Disposition: form-data; name="label"\r\n\r\n東京🙂\r\n`),
        Buffer.from(`--${fixedBoundary}\r\nContent-Disposition: form-data; name="count"\r\n\r\n17\r\n`),
        Buffer.from(`--${fixedBoundary}\r\nContent-Disposition: form-data; name="file"; filename="fixture.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`),
        binary,
        Buffer.from(`\r\n--${fixedBoundary}--\r\n`)
    ]);
}

function readForm(form) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        form.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        form.once('error', reject);
        form.once('end', () => resolve(Buffer.concat(chunks)));
        form.resume();
    });
}

function getLength(form) {
    return new Promise((resolve, reject) => form.getLength((error, length) => error ? reject(error) : resolve(length)));
}

describe('JSDOM native multipart dependency compatibility', () => {
    test('automatic boundary generation does not use Math.random', () => {
        const original = Math.random;
        Math.random = () => { throw new Error('synthetic insecure randomness sentinel'); };
        let boundary;
        try {
            boundary = new FormData().getBoundary();
        } finally {
            Math.random = original;
        }
        expect(boundary).toMatch(/^[a-zA-Z0-9-]+$/);
        expect(boundary).toHaveLength(50);
    });

    test('entropy source failure is visible instead of falling back to Math.random', () => {
        const original = crypto.randomBytes;
        const error = new Error('synthetic entropy unavailable');
        crypto.randomBytes = () => { throw error; };
        let observed;
        try {
            new FormData().getBoundary();
        } catch (failure) {
            observed = failure;
        } finally {
            crypto.randomBytes = original;
        }
        expect(observed).toBe(error);
    });

    test('an explicitly chosen boundary remains supported without randomness', () => {
        const original = Math.random;
        Math.random = () => { throw new Error('synthetic randomness sentinel'); };
        try {
            const form = new FormData();
            form.setBoundary(fixedBoundary);
            expect(form.getBoundary()).toBe(fixedBoundary);
            expect(form.getHeaders()['content-type']).toBe(`multipart/form-data; boundary=${fixedBoundary}`);
        } finally {
            Math.random = original;
        }
    });

    test('preserves exact UTF-8, numeric and binary multipart bytes', () => {
        expect(fixedForm().getBuffer()).toEqual(expectedBody());
    });

    test('preserves the streamed body as well as the buffered body', async () => {
        expect(await readForm(fixedForm())).toEqual(expectedBody());
    });

    test('reports matching synchronous and asynchronous lengths for known parts', async () => {
        const form = fixedForm();
        expect(form.getLengthSync()).toBe(expectedBody().length);
        expect(await getLength(form)).toBe(expectedBody().length);
    });

    test('preserves explicitly supplied own headers without copying inherited headers', () => {
        const headers = Object.create({ 'X-Inherited': 'omit' });
        headers['X-Fixture'] = 'retained';
        const result = fixedForm().getHeaders(headers);
        expect(result['x-fixture']).toBe('retained');
        expect(result).not.toHaveProperty('x-inherited');
        expect(result['content-type']).toBe(`multipart/form-data; boundary=${fixedBoundary}`);
    });

    test('keeps repeated names and empty field values', () => {
        const form = new FormData();
        form.setBoundary(fixedBoundary);
        form.append('item', 'first');
        form.append('item', 'second');
        form.append('empty', '');
        const body = form.getBuffer().toString('utf8');
        expect(body.match(/name="item"/g)).toHaveLength(2);
        expect(body).toContain('name="item"\r\n\r\nfirst\r\n');
        expect(body).toContain('name="item"\r\n\r\nsecond\r\n');
        expect(body).toContain('name="empty"\r\n\r\n\r\n');
    });

    test('streams chunked binary input with its declared length', async () => {
        const form = new FormData();
        form.setBoundary(fixedBoundary);
        form.append('file', Readable.from([binary.subarray(0, 2), binary.subarray(2)]), {
            filename: 'fixture.bin', contentType: 'application/octet-stream', knownLength: binary.length
        });
        const length = await getLength(form);
        const body = await readForm(form);
        expect(body.length).toBe(length);
        expect(body.indexOf(binary)).toBeGreaterThan(0);
        expect(body.subarray(-Buffer.byteLength(`\r\n--${fixedBoundary}--\r\n`)).toString()).toBe(`\r\n--${fixedBoundary}--\r\n`);
    });

    test('reports an unknown stream length instead of inventing a content length', async () => {
        const form = new FormData();
        form.setBoundary(fixedBoundary);
        const input = Readable.from([binary]);
        form.append('file', input, { filename: 'fixture.bin' });
        try {
            await expect(getLength(form)).rejects.toBe('Unknown stream');
        } finally {
            input.destroy();
        }
    });

    test('retains the unsupported-array error', () => {
        const form = new FormData();
        const errors = [];
        form.on('error', error => errors.push(error));
        form.append('invalid', ['first', 'second']);
        expect(errors).toHaveLength(1);
        expect(errors[0].message).toBe('Arrays are not supported.');
    });

    test('JSDOM XHR sends fields and binary files with consistent headers to an owned loopback receiver', async () => {
        let received;
        const server = createServer((request, response) => {
            const chunks = [];
            let size = 0;
            request.on('data', chunk => {
                size += chunk.length;
                if (size > 65536) { request.destroy(); return; }
                chunks.push(chunk);
            });
            request.on('end', () => {
                received = { headers: request.headers, body: Buffer.concat(chunks), method: request.method, path: request.url };
                response.writeHead(201, { Connection: 'close', 'Content-Type': 'text/plain' });
                response.end('accepted synthetic upload');
            });
        });
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', resolve);
        });
        const origin = `http://127.0.0.1:${server.address().port}`;
        let window;
        try {
            window = new JSDOM('<!doctype html>', { url: `${origin}/` }).window;
            const form = new window.FormData();
            form.append('label', '東京🙂');
            form.append('item', 'first');
            form.append('item', 'second');
            form.append('nullValue', null);
            form.append('file', new window.Blob([new window.Uint8Array(binary)], { type: 'application/octet-stream' }), 'fixture.bin');
            const result = await new Promise((resolve, reject) => {
                const xhr = new window.XMLHttpRequest();
                xhr.open('POST', `${origin}/upload`);
                xhr.timeout = 3000;
                xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
                xhr.onerror = () => reject(new Error('synthetic upload failed'));
                xhr.ontimeout = () => reject(new Error('synthetic upload timed out'));
                xhr.send(form);
            });
            expect(result).toEqual({ status: 201, text: 'accepted synthetic upload' });
            expect(received.method).toBe('POST');
            expect(received.path).toBe('/upload');
            expect(Number(received.headers['content-length'])).toBe(received.body.length);
            const match = /^multipart\/form-data; boundary=(.+)$/.exec(received.headers['content-type']);
            expect(match).not.toBeNull();
            expect(received.body.subarray(0, Buffer.byteLength(`--${match[1]}\r\n`)).toString()).toBe(`--${match[1]}\r\n`);
            expect(received.body.subarray(-Buffer.byteLength(`--${match[1]}--\r\n`)).toString()).toBe(`--${match[1]}--\r\n`);
            expect(received.body.indexOf(binary)).toBeGreaterThan(0);
            const text = received.body.toString('utf8');
            expect(text).toContain('name="label"\r\n\r\n東京🙂\r\n');
            expect(text.match(/name="item"/g)).toHaveLength(2);
            expect(text).toContain('name="nullValue"\r\n\r\nnull\r\n');
            expect(text).toContain('filename="fixture.bin"');
        } finally {
            window?.close();
            await new Promise(resolve => server.close(resolve));
        }
    });
});
