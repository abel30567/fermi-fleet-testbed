import test from 'node:test';
import assert from 'node:assert/strict';
import { arcsinTypedSeries } from './arcsinTypedSeries.js';

function assertClose(actual, expected, tol = 1e-14, message = '') {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`${message ? `${message}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`
	);
}

test('arcsinTypedSeries handles exact special values', () => {
	const input = new Float64Array([-1, -0.5, -0, 0, 0.5, 1]);
	const result = arcsinTypedSeries(input);

	assert.ok(result instanceof Float64Array);
	assert.notEqual(result, input);
	assert.equal(result.length, input.length);

	assertClose(result[0], -Math.PI / 2, 1e-15, 'arcsin(-1)');
	assertClose(result[1], -Math.PI / 6, 1e-15, 'arcsin(-0.5)');
	assert.ok(Object.is(result[2], -0), 'preserves -0');
	assert.ok(Object.is(result[3], 0), 'preserves +0');
	assertClose(result[4], Math.PI / 6, 1e-15, 'arcsin(0.5)');
	assertClose(result[5], Math.PI / 2, 1e-15, 'arcsin(1)');
});

test('arcsinTypedSeries handles empty Float64Array', () => {
	const input = new Float64Array(0);
	const result = arcsinTypedSeries(input);

	assert.ok(result instanceof Float64Array);
	assert.equal(result.length, 0);
	assert.notEqual(result, input);
});

test('arcsinTypedSeries does not mutate input array', () => {
	const input = new Float64Array([-0.75, 0.25, 0.9]);
	const snapshot = new Float64Array(input);
	arcsinTypedSeries(input);

	assert.deepEqual(input, snapshot);
});

test('arcsinTypedSeries returns NaN for out-of-domain values and NaN', () => {
	const input = new Float64Array([
		-Infinity,
		-2,
		-1.0000001,
		1.0000001,
		2,
		Infinity,
		NaN,
	]);
	const result = arcsinTypedSeries(input);

	for (let i = 0; i < result.length; i += 1) {
		assert.ok(Number.isNaN(result[i]), `index ${i} (${input[i]}) should yield NaN`);
	}
});

test('arcsinTypedSeries handles values near +/-1 and boundary +/-0.5 accurately', () => {
	const values = [
		-1 + 1e-15,
		-1 + 1e-12,
		-1 + 1e-6,
		-0.5 - 1e-12,
		-0.5 + 1e-12,
		-1e-12,
		-1e-200,
		1e-200,
		1e-12,
		0.5 - 1e-12,
		0.5 + 1e-12,
		1 - 1e-6,
		1 - 1e-12,
		1 - 1e-15,
	];
	const input = new Float64Array(values);
	const result = arcsinTypedSeries(input);

	for (let i = 0; i < values.length; i += 1) {
		assertClose(result[i], Math.asin(values[i]), 1e-14, `near-boundary x=${values[i]}`);
	}
});

test('arcsinTypedSeries matches Math.asin across a dense grid on [-1, 1]', () => {
	const n = 2001;
	const input = new Float64Array(n);
	for (let i = 0; i < n; i += 1) {
		input[i] = -1 + (2 * i) / (n - 1);
	}
	const result = arcsinTypedSeries(input);

	for (let i = 0; i < n; i += 1) {
		assertClose(result[i], Math.asin(input[i]), 1e-14, `grid x=${input[i]}`);
	}
});

test('arcsinTypedSeries satisfies sin(arcsin(x)) === x and odd symmetry cross-check', () => {
	const samples = new Float64Array([
		0.001, 0.1, 0.25, 0.499, 0.5, 0.501, 0.7071067811865475, 0.8660254037844386,
		0.95, 0.999, 0.999999,
	]);
	const negSamples = new Float64Array(samples.length);
	for (let i = 0; i < samples.length; i += 1) {
		negSamples[i] = -samples[i];
	}

	const posOut = arcsinTypedSeries(samples);
	const negOut = arcsinTypedSeries(negSamples);

	for (let i = 0; i < samples.length; i += 1) {
		assertClose(Math.sin(posOut[i]), samples[i], 1e-14, `sin(arcsin(${samples[i]}))`);
		assertClose(Math.sin(negOut[i]), negSamples[i], 1e-14, `sin(arcsin(${negSamples[i]}))`);
		assert.equal(negOut[i], -posOut[i], `odd symmetry for x=${samples[i]}`);
	}
});

test('arcsinTypedSeries throws TypeError for non-Float64Array inputs', () => {
	const invalidInputs = [
		null,
		undefined,
		0.5,
		'0.5',
		[0, 0.5],
		new Float32Array([0, 0.5]),
		new Int32Array([0, 1]),
		new ArrayBuffer(8),
		{ length: 1, 0: 0.5 },
	];

	for (const bad of invalidInputs) {
		assert.throws(() => arcsinTypedSeries(bad), TypeError);
	}
});
