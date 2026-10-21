/** @jest-environment node */
import { spawnSync } from 'node:child_process';

// A native child keeps Babel and the real loader outside Jest's dependency mocks.
// All source below is a bounded local fixture; export names are only string data.
const cases = [
    ['plain identifier control', 'friendlyName', true],
    ['quoted identifier control', 'friendlyName'],
    ['Unicode identifier control', '名称'],
    ['space in export name', 'friendly name'],
    ['punctuation in export name', 'display-name'],
    ['quote in export name', 'say "hello"'],
    ['backslash in export name', 'path\\name'],
    ['newline in export name', 'line\nbreak'],
    ['Unicode punctuation', '名称・表示'],
    ['line separators', 'first\u2028second\u2029third']
];

async function runFixtures(cases) {
    const assert = require('node:assert/strict');
    const { createRequire } = require('node:module');
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
    const { tmpdir } = require('node:os');
    const { join, resolve } = require('node:path');
    const { pathToFileURL } = require('node:url');
    const babel = require('@babel/core');
    const presetPath = require.resolve('@babel/preset-env');
    const fromPreset = createRequire(presetPath);
    const transformPath = fromPreset.resolve('@babel/plugin-transform-modules-systemjs');
    const { System } = require('systemjs');
    const root = mkdtempSync(join(tmpdir(), 'js-utils-systemjs-'));
    const results = [];
    const dependency = `
        export let count = 7;
        export function increment() { count += 1; }
        export const label = 'ready';
        export default 'default-value';
        globalThis.__jsUtilsModuleLoads += 1;
    `;

    function compile(directory, name, source) {
        const filename = join(directory, name);
        const { code } = babel.transformSync(source, {
            filename, configFile: false, babelrc: false,
            presets: [[presetPath, { targets: { node: '22' }, modules: 'systemjs' }]]
        });
        writeFileSync(filename, code);
    }

    async function check(name, run) {
        try {
            await run();
            results.push({ name, passed: true });
        } catch (error) {
            results.push({ name, passed: false, error: `${error.name}: ${error.message}` });
        }
    }

    try {
        await check('normal Babel callers do not activate SystemJS', () => {
            const explicit = babel.loadOptions({
                configFile: false, babelrc: false,
                presets: [[presetPath, { targets: { node: '22' }, modules: 'systemjs' }]]
            });
            assert(explicit.plugins.some(plugin => plugin.key === 'transform-modules-systemjs'));
            for (const [name, supportsStaticESM] of [['@rollup/plugin-babel', true], ['babel-jest', false]]) {
                const options = babel.loadOptions({
                    filename: resolve('src/index.js'),
                    caller: { name, supportsStaticESM, supportsDynamicImport: supportsStaticESM }
                });
                assert(!options.plugins.some(plugin => plugin.key === 'transform-modules-systemjs'));
            }
            // Resolve from preset-env, which is the package that actually selects it.
            assert.equal(typeof fromPreset(transformPath).default, 'function');
        });

        for (const [index, [name, alias, plain]] of cases.entries()) {
            await check(name, async () => {
                const directory = join(root, String(index));
                mkdirSync(directory);
                compile(directory, 'dep.js', dependency);
                compile(directory, 'entry.js', `
                    export { count as ${plain ? alias : JSON.stringify(alias)} } from './dep.js';
                    export * from './dep.js';
                `);
                globalThis.__jsUtilsModuleLoads = 0;
                const loader = new System.constructor();
                const url = pathToFileURL(join(directory, 'entry.js')).href;
                const namespace = await loader.import(url);
                assert.deepEqual(Object.keys(namespace).sort(), [alias, 'count', 'increment', 'label'].sort());
                assert.equal(namespace[alias], 7);
                assert.equal(namespace.label, 'ready');
                namespace.increment();
                assert.equal(namespace[alias], 8);
                assert.equal(namespace.count, 8);
                assert.equal(await loader.import(url), namespace);
                assert.equal(globalThis.__jsUtilsModuleLoads, 1);
            });
        }

        await check('string-named import alongside namespace import', async () => {
            const directory = join(root, 'string-import');
            mkdirSync(directory);
            compile(directory, 'dep.js', `${dependency}\nexport { count as "display name" };`);
            compile(directory, 'entry.js', `
                import { "display name" as value, increment } from './dep.js';
                import * as namespace from './dep.js';
                export const read = () => [value, namespace["display name"]];
                export { increment };
            `);
            globalThis.__jsUtilsModuleLoads = 0;
            const loader = new System.constructor();
            const entry = await loader.import(pathToFileURL(join(directory, 'entry.js')).href);
            assert.deepEqual(Object.keys(entry).sort(), ['increment', 'read']);
            assert.deepEqual(entry.read(), [7, 7]);
            entry.increment();
            assert.deepEqual(entry.read(), [8, 8]);
            assert.equal(globalThis.__jsUtilsModuleLoads, 1);
        });

        await check('default, namespace, live bindings and dynamic import', async () => {
            const directory = join(root, 'ordinary');
            mkdirSync(directory);
            compile(directory, 'dep.js', dependency);
            compile(directory, 'bridge.js', `
                export { default as namedDefault, count as observed } from './dep.js';
                export * from './dep.js';
            `);
            compile(directory, 'entry.js', `
                import defaultValue, * as namespace from './dep.js';
                import { count, increment } from './dep.js';
                export { defaultValue, namespace, increment };
                export { count } from './dep.js';
                export const readCount = () => count;
                export const getDynamic = () => import('./bridge.js');
            `);
            globalThis.__jsUtilsModuleLoads = 0;
            const loader = new System.constructor();
            const entry = await loader.import(pathToFileURL(join(directory, 'entry.js')).href);
            assert.deepEqual(Object.keys(entry).sort(), ['count', 'defaultValue', 'getDynamic', 'increment', 'namespace', 'readCount']);
            assert.equal(entry.defaultValue, 'default-value');
            assert.equal(entry.namespace.default, 'default-value');
            assert.equal(entry.count, 7);
            entry.increment();
            assert.equal(entry.count, 8, 'direct re-export stays live');
            assert.equal(entry.readCount(), 8, 'local imported binding stays live');
            assert.equal(entry.namespace.count, 8, 'namespace import stays live');
            const dynamic = await entry.getDynamic();
            assert.deepEqual(Object.keys(dynamic).sort(), ['count', 'increment', 'label', 'namedDefault', 'observed']);
            assert.equal(dynamic.namedDefault, 'default-value');
            assert.equal(dynamic.observed, 8, 'dynamic import sees the latest value');
            dynamic.increment();
            assert.equal(dynamic.observed, 9, 'dynamic re-export stays live');
            assert.equal(entry.count, 9, 'direct re-export sees dynamic updates');
            assert.equal(entry.readCount(), 9, 'local binding sees dynamic updates');
            assert.equal(entry.namespace.count, 9, 'namespace sees dynamic updates');
            assert.equal(await entry.getDynamic(), dynamic);
            assert.equal(globalThis.__jsUtilsModuleLoads, 1);
        });
    } finally {
        delete globalThis.__jsUtilsModuleLoads;
        rmSync(root, { recursive: true, force: true });
    }
    process.stdout.write(JSON.stringify(results));
}

describe('Babel SystemJS dependency compatibility', () => {
    let results;
    beforeAll(() => {
        const source = `(${runFixtures.toString()})(${JSON.stringify(cases)}).catch(error => { console.error(error); process.exitCode = 1; });`;
        const result = spawnSync(process.execPath, ['--input-type=commonjs', '-e', source], {
            encoding: 'utf8', timeout: 10000, maxBuffer: 65536,
            env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=256' }
        });
        expect(result.error).toBeUndefined();
        expect(result.signal).toBeNull();
        if (result.status !== 0) throw new Error(result.stderr || `fixture process exited ${result.status}`);
        results = JSON.parse(result.stdout);
    });

    test.each([
        'normal Babel callers do not activate SystemJS',
        ...cases.map(([name]) => name),
        'string-named import alongside namespace import',
        'default, namespace, live bindings and dynamic import'
    ])('%s', name => {
        expect(results.find(result => result.name === name)).toEqual({ name, passed: true });
    });
});
