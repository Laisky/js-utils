'use strict';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pkg = require('./package.json');

import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import babel from '@rollup/plugin-babel';
import terser from '@rollup/plugin-terser';
import dts from 'rollup-plugin-dts';

export default [
  // ESM, CommonJS, and UMD builds
  {
    input: 'src/index.js',
    output: [
      { file: pkg.module, format: 'es' },
      { file: pkg.main, format: 'cjs' },
      {
        file: pkg.browser,
        format: 'umd',
        name: 'laiskyUtils',
        globals: {
          pouchdb: 'PouchDB',
          'js-sha256': 'sha256',
          marked: 'marked',
          bootstrap: 'bootstrap'
        }
      }
    ],
    external: [
      'pouchdb',
      'js-sha256',
      'marked',
      'bootstrap'
    ],
    plugins: [
      resolve(),
      commonjs(),
      babel({
        babelHelpers: 'bundled',
        exclude: 'node_modules/**'
      }),
      terser()
    ]
  }
  // TypeScript declaration
  // {
  //   input: 'src/index.js',
  //   output: [{ file: pkg.types, format: 'es' }],
  //   plugins: [dts()]
  // }
];
