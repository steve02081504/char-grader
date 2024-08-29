import { nodeResolve } from '@rollup/plugin-node-resolve'
import terser from '@rollup/plugin-terser'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import nodePolyfills from 'rollup-plugin-polyfill-node'

export default {
	input: 'src/index.mjs',
	output: {
		name: 'grader_js',
		strict: false,
		file: 'dist/index.js',
		format: 'iife',
		globals: {
			'llama3-tokenizer-js': 'llama3Tokenizer',
			'@zip.js/zip.js': 'zip',
			'showdown': 'showdown',
			'buffer': 'buffer',
			'node-unrar-js': 'node_unrar_js',
			'lz-string': 'LZString',
			'aws-sdk': 'AWS',
		},
		sourcemap: true
	},
	external: ['llama3-tokenizer-js', '@zip.js/zip.js', 'showdown', 'buffer', 'node-unrar-js', 'lz-string', 'aws-sdk'],
	plugins: [nodeResolve(), commonjs(), nodePolyfills(), json(), process.env.EdenOS?null:terser()],
}
