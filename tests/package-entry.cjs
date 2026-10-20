const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync, spawnSync } = require('node:child_process');

const project = path.resolve(__dirname, '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'js-utils-package-'));
const marker = '@@PACKAGED_RESULT@@';

const fakePouch = `class MemoryPouch { constructor(){this.docs=new Map([['legacy',{_id:'legacy',_rev:'1-fixture',val:'{"count":17,"enabled":true,"name":"legacy"}'}]]);} async get(key){if(!this.docs.has(key)){const error=new Error('synthetic missing');error.status=404;throw error;}return {...this.docs.get(key)};}async put(doc){this.docs.set(doc._id,{...doc,_rev:'2-fixture'});return {ok:true,id:doc._id,rev:'2-fixture'};} } module.exports=MemoryPouch;`;
const marked = `const marked={Renderer:class {},use(){},parse(value){return '<p>'+value+'</p>';}};module.exports={marked};`;
const sha = `module.exports={sha256:value=>'synthetic-sha256:'+value};`;
const bootstrap = `module.exports={Tooltip:class {},Modal:class {}};`;

function stub(name, cjs, esm) {
    const dir = path.join(root, 'node_modules', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version: '0.0.0-fixture', type: 'module', exports: { import: './index.mjs', require: './index.cjs' } }));
    fs.writeFileSync(path.join(dir, 'index.cjs'), cjs);
    fs.writeFileSync(path.join(dir, 'index.mjs'), esm);
}

const consumer = `
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{pathToFileURL}=require('node:url');
(async()=>{
 const dir=process.argv[2],kind=process.argv[3],pkg=JSON.parse(fs.readFileSync(path.join(dir,'package.json')));let library;
 if(kind==='cjs')library=require(pkg.name);
 else if(kind==='esm')library=await import(pathToFileURL(path.join(dir,pkg.module)).href);
 else {const box={marked:require('marked'),sha256:require('js-sha256'),bootstrap:require('bootstrap'),PouchDB:require('pouchdb'),setTimeout,clearTimeout,URLSearchParams,crypto:undefined};vm.runInNewContext(fs.readFileSync(path.join(dir,pkg.browser),'utf8'),box);library=box.laiskyUtils;}
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');let hash;
 try{Object.defineProperty(globalThis,'crypto',{configurable:true,value:undefined});hash=await library.SHA256('fixture');}finally{if(descriptor)Object.defineProperty(globalThis,'crypto',descriptor);else delete globalThis.crypto;}
 const legacy=await library.kvUtils.KvGet('legacy');
 const value={count:29,enabled:false,nested:{retained:'value'}};await library.kvUtils.KvSet('roundtrip',value);const roundtrip=await library.kvUtils.KvGet('roundtrip');
 console.log('${marker}'+JSON.stringify({keys:Object.keys(library).filter(k=>k!=='__esModule').sort(),defaultKeys:Object.keys(library.default).sort(),compatible:library.Compatible({a:1},{a:1,b:2}),trimmed:library.TrimSpace('  retained  '),html:await library.Markdown2HTML('fixture'),hash,legacy,roundtrip}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});`;

function runConsumer(dir, kind) {
    return spawnSync(process.execPath, [path.join(root, 'consumer.cjs'), dir, kind], { cwd: root, encoding: 'utf8', timeout: 10000, killSignal: 'SIGKILL', maxBuffer: 131072 });
}

try {
    const packed = JSON.parse(execFileSync('npm', ['pack', '.', '--ignore-scripts', '--offline', '--json', '--pack-destination', root], { cwd: project, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))[0];
    const projectPkg = JSON.parse(fs.readFileSync(path.join(project, 'package.json')));
    assert.equal(projectPkg.name, '@laisky/js-utils');
    for (const item of packed.files) assert(item.path && !path.isAbsolute(item.path) && !item.path.split(/[\\/]/).includes('..'));
    const dir = path.join(root, 'node_modules', '@laisky', 'js-utils');
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('tar', ['-xzf', path.join(root, packed.filename), '--strip-components=1', '-C', dir]);
    stub('marked', marked, `import value from './index.cjs';export const marked=value.marked;`);
    stub('js-sha256', sha, `import value from './index.cjs';export const sha256=value.sha256;`);
    stub('bootstrap', bootstrap, `export class Tooltip{};export class Modal{};`);
    stub('pouchdb', fakePouch, `import value from './index.cjs';export default value;`);
    fs.writeFileSync(path.join(root, 'consumer.cjs'), consumer);
    const pkgFile = path.join(dir, 'package.json');
    const originalPkg = fs.readFileSync(pkgFile);
    const pkg = JSON.parse(originalPkg);
    assert(fs.existsSync(path.join(dir, pkg.main)));
    assert(fs.existsSync(path.join(dir, pkg.module)));
    assert(fs.existsSync(path.join(dir, pkg.browser)));
    assert.deepEqual(fs.readFileSync(path.join(dir, pkg.main)), fs.readFileSync(path.join(dir, 'dist/index.cjs.js')));
    const results = {};
    for (const kind of ['cjs', 'esm', 'umd']) {
        const child = runConsumer(dir, kind);
        assert.equal(child.error, undefined, `${kind}: ${child.error?.message}`);
        assert.equal(child.status, 0, `${kind}: ${child.stderr}`);
        const line = child.stdout.split('\n').find(line => line.startsWith(marker));
        assert(line, `${kind}: no observable result`);
        results[kind] = JSON.parse(line.slice(marker.length));
        assert.equal(results[kind].compatible, true);
        assert.equal(results[kind].trimmed, 'retained');
        assert.equal(results[kind].html, '<p>fixture</p>');
        assert.equal(results[kind].hash, 'synthetic-sha256:fixture');
        assert.deepEqual(results[kind].legacy, { count: 17, enabled: true, name: 'legacy' });
        assert.deepEqual(results[kind].roundtrip, { count: 29, enabled: false, nested: { retained: 'value' } });
    }
    assert.deepEqual(results.cjs, results.esm);
    assert.deepEqual(results.cjs, results.umd);
    fs.writeFileSync(pkgFile, JSON.stringify({ ...pkg, main: 'dist/index.cjs.js' }));
    const broken = runConsumer(dir, 'cjs');
    assert.notEqual(broken.status, 0, 'old extension/type failure must remain a detected negative control');
    fs.writeFileSync(pkgFile, originalPkg);
    assert.equal(runConsumer(dir, 'cjs').status, 0, 'restore must pass again');
    console.log(JSON.stringify({ packagedConsumers: ['native CommonJS package main', 'native ESM module file', 'UMD global'], exportCount: results.cjs.keys.length, sameExportsAndValues: true, legacySerializedDataAndRoundtrip: true, legacyFilenameBytesIdentical: true, oldMainNegativeRejected: true, restoredMainAccepted: true, controlledExternalDependencies: true }));
} finally {
    assert(root.startsWith(path.join(os.tmpdir(), 'js-utils-package-')));
    fs.rmSync(root, { recursive: true, force: true });
}
