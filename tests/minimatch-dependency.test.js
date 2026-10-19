/** @jest-environment node */
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const require = createRequire(import.meta.url);
// Exercise the minimatch selected by the real filesystem glob caller, not mocks.
const fromGlob = createRequire(require.resolve('glob'));
const minimatchPath = fromGlob.resolve('minimatch');
const minimatch = fromGlob('minimatch');
const glob = require('glob');

const childSource = `
const mm = require(process.argv[1]);
const scenario = process.argv[2];
if (scenario === 'stars') {
  const pattern = 'a' + '*'.repeat(100) + 'b';
  console.log(JSON.stringify({match: new mm.Minimatch(pattern).makeRe().test('a' + 'c'.repeat(25))}));
} else if (scenario === 'globstars') {
  const pattern = Array(50).fill('**/a').join('/') + '/b/**';
  const missing = Array(100).fill('a').join('/') + '/a';
  const present = Array(100).fill('a').join('/') + '/b/c/d/.e/a/b';
  console.log(JSON.stringify({missing: mm(missing, pattern), dotMatch: mm(present, pattern, {dot:true}), dotExcluded: mm(present, pattern)}));
} else {
  throw new Error('unknown synthetic scenario');
}
`;

function isolatedMatch(scenario) {
    // A process watchdog also bounds the old vulnerable graph; a hung matcher
    // cannot block Jest's own timeout or leave a child running after the test.
    const result = spawnSync(process.execPath, ['-e', childSource, minimatchPath, scenario], {
        encoding: 'utf8', timeout: 2000, killSignal: 'SIGKILL', maxBuffer: 65536,
        env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=256' }
    });
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    return JSON.parse(result.stdout);
}

describe('filesystem glob minimatch dependency compatibility', () => {
    test('bounds a compiled expression containing consecutive stars', () => {
        expect(isolatedMatch('stars')).toEqual({ match: false });
    });

    test('bounds repeated non-adjacent globstars and keeps valid/dot outcomes', () => {
        expect(isolatedMatch('globstars')).toEqual({ missing: false, dotMatch: true, dotExcluded: false });
    });

    test.each([
        ['src/index.js', 'src/*.js', {}, true],
        ['src/nested/index.js', 'src/*.js', {}, false],
        ['src/index.js', 'src/**/*.js', {}, true],
        ['src/nested/index.js', 'src/**/*.js', {}, true],
        ['src/.hidden.js', 'src/**/*.js', {}, false],
        ['src/.hidden.js', 'src/**/*.js', { dot: true }, true],
        ['src/../index.js', 'src/**/index.js', { dot: true }, false],
        ['assets/app.css', 'assets/*.{js,css}', {}, true],
        ['file-2.js', 'file-[1-3].js', {}, true],
        ['file-4.js', 'file-[1-3].js', {}, false],
        ['literal[1].js', 'literal\\[1\\].js', {}, true],
        ['cache/file.js', '!cache/**', {}, false],
        ['src/file.js', '!cache/**', {}, true],
        ['src/index.ts', 'src/*.+(js|ts)', {}, true],
        ['SRC/File.JS', 'src/*.js', { nocase: true }, true],
        ['deep/path/test.js', '*.js', { matchBase: true }, true],
        ['a/b', 'a/b/c', { partial: true }, true],
        ['a/b', 'a/c/d', { partial: true }, false],
        ['#literal', '#literal', { nocomment: true }, true],
        ['!literal', '!literal', { nonegate: true }, true]
    ])('preserves %s against %s with %j', (file, pattern, options, expected) => {
        expect(minimatch(file, pattern, options)).toBe(expected);
    });

    test('keeps filter and nonull list contracts', () => {
        const files = ['src/index.js', 'src/data.json', 'src/nested/util.js'];
        expect(files.filter(minimatch.filter('**/*.js'))).toEqual(['src/index.js', 'src/nested/util.js']);
        expect(minimatch.match(files, '*.missing', { nonull: true })).toEqual(['*.missing']);
    });

    test('preserves an explicitly budgeted complex positive pattern', () => {
        const pattern = Array(202).fill('**/a').join('/') + '/**';
        const file = Array(202).fill('a').join('/') + '/tail';
        expect(minimatch(file, pattern, { maxGlobstarRecursion: 256 })).toBe(true);
    });

    test('real glob keeps filesystem matches, ignores, dot options and ordering', () => {
        const dir = mkdtempSync(join(tmpdir(), 'js-utils-minimatch-'));
        const files = ['src/index.js', 'src/nested/util.js', 'src/nested/util.test.js', 'src/.hidden.js', 'src/nested/.dot/deep.js', 'src/data.json', 'docs/readme.md'];
        try {
            for (const file of files) {
                mkdirSync(dirname(join(dir, file)), { recursive: true });
                writeFileSync(join(dir, file), 'synthetic fixture\n');
            }
            const normal = glob.sync('src/**/*.js', { cwd: dir, nodir: true, ignore: '**/*.test.js' });
            expect(normal).toEqual(['src/index.js', 'src/nested/util.js']);
            const dots = glob.sync('src/**/*.js', { cwd: dir, nodir: true, dot: true, ignore: '**/*.test.js' });
            expect(dots).toEqual(['src/.hidden.js', 'src/index.js', 'src/nested/.dot/deep.js', 'src/nested/util.js']);
            expect(glob.sync('src/*.{js,json}', { cwd: dir, nodir: true })).toEqual(['src/data.json', 'src/index.js']);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
