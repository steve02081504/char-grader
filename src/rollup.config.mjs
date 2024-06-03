import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import nodePolyfills from 'rollup-plugin-polyfill-node';

export default {
	input: 'src/index.mjs',
	output: {
		name: 'char_grader',
		strict: false,
		file: 'dist/index.js',
		format: 'iife'
	},
	plugins: [nodeResolve(), commonjs(), nodePolyfills()]
}
