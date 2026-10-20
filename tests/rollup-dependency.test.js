/** @jest-environment node */
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const require = createRequire(import.meta.url);
const { rollup } = require('rollup');

function asset(fileName) {
    return { type: 'asset', fileName, name: undefined, names: [], originalFileNames: [], needsCodeReference: false, source: 'retained synthetic asset' };
}

async function build(extra = [], source = 'export const value = 17;') {
    return rollup({
        input: 'synthetic-entry',
        plugins: [{ name: 'synthetic-input', resolveId(id) { if (id === 'synthetic-entry') return '\0entry'; }, load(id) { if (id === '\0entry') return source; } }, ...extra]
    });
}

async function injected(key, fileName = key) {
    const bundle = await build([{ name: 'synthetic-output', generateBundle(_options, output) { output[key] = asset(fileName); } }]);
    try { return await bundle.generate({ format: 'es' }); } finally { await bundle.close(); }
}

describe('native Rollup output boundary and compilation compatibility', () => {
    test.each([
        ['parent traversal', '../outside.txt', '../outside.txt'],
        ['mid-path traversal', 'nested/../../outside.txt', 'nested/../../outside.txt'],
        ['safe key with escaping fileName', 'safe.txt', '../outside.txt'],
        ['Windows absolute path', 'C:\\synthetic\\outside.txt', 'C:\\synthetic\\outside.txt'],
        ['dot', '.', '.'],
        ['dot-dot', '..', '..']
    ])('rejects %s during generation before any file write', async (_name, key, fileName) => {
        await expect(injected(key, fileName)).rejects.toMatchObject({ code: 'FILE_NAME_OUTSIDE_OUTPUT_DIRECTORY' });
    });

    test('rejects an absolute path during generation only', async () => {
        const root = mkdtempSync(join(tmpdir(), 'js-utils-rollup-absolute-'));
        try {
            await expect(injected(join(root, 'outside.txt'))).rejects.toMatchObject({ code: 'FILE_NAME_OUTSIDE_OUTPUT_DIRECTORY' });
        } finally { rmSync(root, { recursive: true, force: true }); }
    });

    test('rejects an entry naming pattern that escapes after normalization', async () => {
        const bundle = await build();
        try {
            await expect(bundle.generate({ format: 'es', entryFileNames: 'nested/../../outside.js' })).rejects.toMatchObject({ code: 'FILE_NAME_OUTSIDE_OUTPUT_DIRECTORY' });
        } finally { await bundle.close(); }
    });

    test.each(['nested/asset.txt', 'nested/../asset.txt', './asset.txt', '..looks-like-traversal.txt'])('retains legitimate output name %s', async fileName => {
        const result = await injected(fileName);
        const output = result.output.find(entry => entry.type === 'asset');
        expect(output.fileName).toBe(fileName);
        expect(output.source).toBe('retained synthetic asset');
    });

    test('writes valid normalized assets only inside the owned output tree', async () => {
        const root = mkdtempSync(join(tmpdir(), 'js-utils-rollup-write-'));
        const out = join(root, 'output');
        const names = ['nested/asset.txt', 'folder/../normalized.txt', '..legitimate.txt'];
        for (const name of names) expect(resolve(out, name).startsWith(resolve(out) + sep)).toBe(true);
        const bundle = await build([{ name: 'synthetic-assets', generateBundle(_options, output) { for (const name of names) output[name] = asset(name); } }]);
        try {
            await bundle.write({ dir: out, format: 'es' });
            for (const name of names) expect(readFileSync(resolve(out, name), 'utf8')).toBe('retained synthetic asset');
        } finally { await bundle.close(); rmSync(root, { recursive: true, force: true }); }
    });

    test.each(['es', 'cjs', 'umd'])('preserves executable %s exports, live bindings, lazy chunks and maps', async format => {
        const root = mkdtempSync(join(tmpdir(), 'js-utils-rollup-module-'));
        const modules = {
            '\0entry': "export { state, increment } from './dep'; export const message='retained'; export const double=x=>x*2; export async function lazy(){return (await import('./lazy')).value;}",
            '\0dep': "export let state=0;export function increment(){state++;}export const unused='UNREACHABLE_SYNTHETIC_MARKER';",
            '\0lazy': 'export const value=42;'
        };
        const bundle = await rollup({ input: '\0entry', plugins: [{ name: 'synthetic-modules', resolveId(id) { return id.startsWith('\0') ? id : '\0' + id.slice(2); }, load(id) { return modules[id]; } }] });
        const extension = format === 'es' ? 'mjs' : format === 'cjs' ? 'cjs' : 'js';
        const fileName = `entry.${extension}`;
        try {
            const generated = await bundle.write({ dir: root, entryFileNames: fileName, chunkFileNames: `chunks/[name]-[hash].${extension}`, format, name: 'SyntheticExports', inlineDynamicImports: format === 'umd', sourcemap: true });
            expect(generated.output.filter(entry => entry.type === 'chunk').every(entry => !entry.code.includes('UNREACHABLE_SYNTHETIC_MARKER'))).toBe(true);
            const map = JSON.parse(readFileSync(join(root, fileName + '.map'), 'utf8'));
            expect(map.version).toBe(3);
            expect(map.mappings.length).toBeGreaterThan(0);
            const runner = `const fs=require('node:fs'),vm=require('node:vm'),{pathToFileURL}=require('node:url');(async()=>{const file=process.argv[1],format=process.argv[2];let m;if(format==='es')m=await import(pathToFileURL(file).href);else if(format==='cjs')m=require(file);else{const box={};vm.runInNewContext(fs.readFileSync(file,'utf8'),box);m=box.SyntheticExports;}const before=m.state;m.increment();console.log(JSON.stringify({keys:Object.keys(m).sort(),before,after:m.state,double:m.double(9),message:m.message,lazy:await m.lazy()}));})().catch(e=>{console.error(e.stack);process.exitCode=1;});`;
            const child = spawnSync(process.execPath, ['-e', runner, join(root, fileName), format], { encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 65536 });
            expect(child.error).toBeUndefined();
            expect(child.status).toBe(0);
            expect(JSON.parse(child.stdout)).toEqual({ keys: ['double', 'increment', 'lazy', 'message', 'state'], before: 0, after: 1, double: 18, message: 'retained', lazy: 42 });
        } finally { await bundle.close(); rmSync(root, { recursive: true, force: true }); }
    });

    test('keeps malformed source as a real compiler failure', async () => {
        await expect(build([], 'export const = ;')).rejects.toMatchObject({ code: 'PARSE_ERROR' });
    });
});
