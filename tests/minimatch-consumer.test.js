/** @jest-environment node */
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const fromGlob = createRequire(require.resolve('glob'));
const minimatch = fromGlob('minimatch');
const glob = require('glob');
const TestExclude = require('test-exclude');
const { ESLint } = require('eslint');

async function withoutCompiledMinimatch(action) {
    const original = minimatch.Minimatch.prototype.makeRe;
    const sentinel = new Error('synthetic unsafe compiled-minimatch route');
    let calls = 0;
    minimatch.Minimatch.prototype.makeRe = () => { calls++; throw sentinel; };
    try {
        return await action({ sentinel, calls: () => calls });
    } finally {
        minimatch.Minimatch.prototype.makeRe = original;
    }
}

describe('current consumer boundary for retained minimatch API risks', () => {
    test('the call trap detects a real compiled-regex invocation', async () => {
        await withoutCompiledMinimatch(({ sentinel, calls }) => {
            expect(() => new minimatch.Minimatch('**/*.js').makeRe()).toThrow(sentinel);
            expect(calls()).toBe(1);
        });
    });

    test('real coverage selection and filesystem glob use matching without that compiled API', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'js-utils-matching-route-'));
        try {
            mkdirSync(join(dir, 'src'), { recursive: true });
            mkdirSync(join(dir, 'tests'), { recursive: true });
            writeFileSync(join(dir, 'src/index.js'), 'export const fixture = true;\n');
            writeFileSync(join(dir, 'tests/index.test.js'), 'synthetic test\n');
            await withoutCompiledMinimatch(({ calls }) => {
                const exclude = new TestExclude({ cwd: dir });
                expect(exclude.shouldInstrument(join(dir, 'src/index.js'))).toBe(true);
                expect(exclude.shouldInstrument(join(dir, 'tests/index.test.js'))).toBe(false);
                expect(exclude.shouldInstrument(join(dir, 'node_modules/dependency/index.js'))).toBe(false);
                expect(glob.sync('src/**/*.js', { cwd: dir, nodir: true })).toEqual(['src/index.js']);
                expect(calls()).toBe(0);
            });
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test('the real ESLint path keeps valid and invalid outcomes without compiled minimatch', async () => {
        await withoutCompiledMinimatch(async ({ calls }) => {
            const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: [{ rules: { semi: ['error', 'always'] } }] });
            const valid = await eslint.lintText('const value = 17;\n', { filePath: 'src/synthetic.js' });
            const invalid = await eslint.lintText('const value = 17\n', { filePath: 'src/synthetic.js' });
            expect(valid[0].errorCount).toBe(0);
            expect(invalid[0].errorCount).toBe(1);
            expect(invalid[0].messages.map(message => message.ruleId)).toContain('semi');
            expect(calls()).toBe(0);
        });
    });
});
