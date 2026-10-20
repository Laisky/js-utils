/** @jest-environment node */
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
// Follow ESLint's actual cache dependency chain, outside application Jest mocks.
const fromESLint = createRequire(require.resolve('eslint'));
const fromFileCache = createRequire(fromESLint.resolve('file-entry-cache'));
const fromFlatCache = createRequire(fromFileCache.resolve('flat-cache'));
const flatted = fromFlatCache('flatted');
const flatCache = fromFileCache('flat-cache');
const { ESLint } = require('eslint');

const legacyWire = '[{"name":"1","self":"0","shared":"2","same":"2"},"legacy",{"count":17,"enabled":true}]';
const depth = 12000;

function deepGraph() {
    const root = {};
    let leaf = root;
    for (let i = 0; i < depth; i++) {
        leaf.next = {};
        leaf = leaf.next;
    }
    leaf.value = 'complete';
    return root;
}

function expectCompleteGraph(root) {
    let leaf = root;
    for (let i = 0; i < depth; i++) {
        expect(leaf).toHaveProperty('next');
        leaf = leaf.next;
    }
    expect(leaf.value).toBe('complete');
}

describe('ESLint flatted cache dependency compatibility', () => {
    let dir;
    beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'js-utils-flatted-')); });
    afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

    test('retains normal values and literal prototype-looking strings', () => {
        const value = {
            count: 17, ratio: 12.5, enabled: true, absent: null,
            names: ['__proto__', 'constructor', 'toString', '', '0'],
            empty: {}, list: []
        };
        expect(flatted.parse(flatted.stringify(value))).toEqual(value);
    });

    test('preserves cycles and shared object identities', () => {
        const shared = { value: 'retained' };
        const original = { left: shared, right: shared, list: [shared] };
        original.self = original;
        shared.parent = original;
        const result = flatted.parse(flatted.stringify(original));
        expect(result.self).toBe(result);
        expect(result.left).toBe(result.right);
        expect(result.list[0]).toBe(result.left);
        expect(result.left.parent).toBe(result);
    });

    test('reads the original persisted wire format and writes it identically', () => {
        const result = flatted.parse(legacyWire);
        expect(result.name).toBe('legacy');
        expect(result.self).toBe(result);
        expect(result.shared).toBe(result.same);
        expect(result.shared).toEqual({ count: 17, enabled: true });
        expect(flatted.stringify(result)).toBe(legacyWire);
    });

    test('preserves replacer, reviver and holder behavior', () => {
        const holders = [];
        const wire = flatted.stringify({ amount: 7, ignored: true }, (key, value) => key === 'ignored' ? undefined : value);
        const result = flatted.parse(wire, function (key, value) {
            if (key === 'amount') {
                holders.push(this);
                return value * 2;
            }
            return value;
        });
        expect(result).toEqual({ amount: 14 });
        expect(holders).toHaveLength(1);
        expect(holders[0]).toBe(result);
    });

    test('preserves toJSON/fromJSON recursion helpers', () => {
        const original = { name: 'cache' };
        original.self = original;
        const result = flatted.fromJSON(flatted.toJSON(original));
        expect(result.name).toBe('cache');
        expect(result.self).toBe(result);
    });

    test.each(['__proto__', 'constructor', 'toString'])('does not resolve malformed %s references through Array.prototype', key => {
        const before = Object.getOwnPropertyNames(Object.prototype);
        const result = flatted.parse(JSON.stringify([{ value: key }]));
        expect(result.value).toBeUndefined();
        expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
        expect(Object.getOwnPropertyNames(Object.prototype)).toEqual(before);
    });

    test('parses a deep graph without a recursive call-stack overflow', () => {
        expectCompleteGraph(flatted.parse(flatted.stringify(deepGraph())));
    });

    test('persists and cold-reopens cyclic lint metadata without losing aliases', () => {
        const cache = flatCache.create('metadata', dir);
        const original = flatted.parse(legacyWire);
        cache.setKey('entry', original);
        cache.save(true);
        const reopened = flatCache.create('metadata', dir).getKey('entry');
        expect(reopened.name).toBe('legacy');
        expect(reopened.self).toBe(reopened);
        expect(reopened.shared).toBe(reopened.same);
        expect(reopened.shared.count).toBe(17);
        expect(readFileSync(join(dir, 'metadata'), 'utf8')).toContain('legacy');
    });

    test('cold-reopens deep metadata instead of silently replacing it with an empty cache', () => {
        const cache = flatCache.create('deep', dir);
        cache.setKey('entry', deepGraph());
        cache.save(true);
        expectCompleteGraph(flatCache.create('deep', dir).getKey('entry'));
    });

    test('retains the cache reader fallback for genuinely malformed JSON', () => {
        writeFileSync(join(dir, 'broken'), '{invalid JSON');
        expect(flatCache.create('broken', dir).all()).toEqual({});
    });

    test('real ESLint cache reuses clean results and invalidates modified source', async () => {
        const file = join(dir, 'fixture.js');
        const cacheLocation = join(dir, 'eslint-cache');
        const eslint = () => new ESLint({
            cwd: dir,
            overrideConfigFile: true,
            overrideConfig: [{ rules: { semi: ['error', 'always'] } }],
            cache: true, cacheLocation
        });
        writeFileSync(file, 'const value = 17;\n');
        expect((await eslint().lintFiles([file]))[0].errorCount).toBe(0);
        expect((await eslint().lintFiles([file]))[0].errorCount).toBe(0);
        writeFileSync(file, 'const value = 12345\n');
        const result = (await eslint().lintFiles([file]))[0];
        expect(result.messages.map(message => message.ruleId)).toContain('semi');
        expect(result.errorCount).toBe(1);
    });
});
