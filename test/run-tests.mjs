import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const outputDir = await mkdtemp(join(tmpdir(), 'mikumodoro-tests-'));
const obsidianMock = join(import.meta.dirname, 'obsidian-mock.mjs');
const testFiles = ['timer.test.mjs', 'persistence.test.mjs', 'task-cache.test.mjs'];

try {
	await build({
		entryPoints: testFiles.map(file => join(import.meta.dirname, file)),
		bundle: true,
		format: 'esm',
		platform: 'node',
		target: 'node18',
		outdir: outputDir,
		outExtension: { '.js': '.mjs' },
		plugins: [{
			name: 'obsidian-test-mock',
			setup(builder) {
				builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: obsidianMock }));
			},
		}],
	});
	for (const testFile of testFiles) {
		await import(pathToFileURL(join(outputDir, testFile)).href);
	}
} finally {
	await rm(outputDir, { recursive: true, force: true });
}
