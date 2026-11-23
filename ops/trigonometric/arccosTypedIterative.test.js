import test from 'node:test';
import assert from 'node:assert/strict';
import { arccosTypedIterative } from './arccosTypedIterative.js';

const EPS = 1e-12;

function assertClose(actual, expected, eps = EPS, message) {
	assert.ok(
		Math.abs(actual - expected) <= eps,
		message ?? `Expected ${actual} to be within ${eps} of ${expected}`
	);
}

test('arccosTypedIterative computes exact and standard trigonometric values', () => {
	const input = new Float64Array([
		1,
		Math.sqrt(3) / 2,
		Math.SQRT1_2,
		0.5,
		0,
		-0.5,
		-Math.SQRT1_2,
		-Math.sqrt(3) / 2,
		-1,
	]);
	const expected = [
		0,
		Math.PI / 6,
		Math.PI / 4,
		Math.PI / 3,
		Math.PI / 2,
		(2 * Math.PI) / 3,
		(3 * Math.PI) / 4,
		(5 * Math.PI) / 6,
		Math.PI,
	];

	const output = arccosTypedIterative(input);

	assert.ok(output instanceof Float64Array);
	assert.equal(output.length, input.length);
	for (let i = 0; i < expected.length; i += 1) {
		assertClose(output[i], expected[i], EPS, `Mismatch at index ${i}`);
	}
});

test('arccosTypedIterative does not mutate input and returns a new Float64Array', () => {
	const input = new Float64Array([1, 0, -1]);
	const snapshot = new Float64Array(input);
	const output = arccosTypedIterative(input);

	assert.notEqual(output, input);
	assert.deepEqual(input, snapshot);
});

test('arccosTypedIterative handles empty Float64Array and subarray views', () => {
	const empty = new Float64Array(0);
	const emptyOut = arccosTypedIterative(empty);
	assert.ok(emptyOut instanceof Float64Array);
	assert.equal(emptyOut.length, 0);
	assert.notEqual(emptyOut, empty);

	const backing = new Float64Array([99, -1, 0, 1, -99]);
	const view = backing.subarray(1, 4);
	const viewOut = arccosTypedIterative(view);
	assert.equal(viewOut.length, 3);
	assertClose(viewOut[0], Math.PI);
	assertClose(viewOut[1], Math.PI / 2);
	assert.equal(viewOut[2], 0);
});

test('arccosTypedIterative handles edge cases: signed zero, near-boundary, out-of-domain, and NaN', () => {
	const input = new Float64Array([
		-0,
		0,
		1 - 1e-12,
		-1 + 1e-12,
		1.000001,
		-1.000001,
		Infinity,
		-Infinity,
		Number.NaN,
	]);
	const output = arccosTypedIterative(input);

	assertClose(output[0], Math.PI / 2);
	assertClose(output[1], Math.PI / 2);
	assertClose(output[2], Math.sqrt(2e-12), 1e-9);
	assertClose(output[3], Math.PI - Math.sqrt(2e-12), 1e-9);

	for (let i = 4; i < input.length; i += 1) {
		assert.ok(Number.isNaN(output[i]), `Expected NaN at index ${i}`);
	}
});

test('arccosTypedIterative validates input type strictly', () => {
	const invalidInputs = [
		null,
		undefined,
		[0, 0.5, 1],
		new Float32Array([0, 0.5, 1]),
		new Int32Array([0, 1]),
		new ArrayBuffer(8),
		0.5,
		'0.5',
		{ length: 1, 0: 0.5 },
	];

	for (const bad of invalidInputs) {
		assert.throws(() => arccosTypedIterative(bad), TypeError);
	}
});

test('arccosTypedIterative passes independent mathematical cross-checks', () => {
	const n = 201;
	const xs = new Float64Array(n);
	const negXs = new Float64Array(n);
	for (let i = 0; i < n; i += 1) {
		const x = -1 + (2 * i) / (n - 1);
		xs[i] = x;
		negXs[i] = -x;
	}

	const acosXs = arccosTypedIterative(xs);
	const acosNegXs = arccosTypedIterative(negXs);

	for (let i = 0; i < n; i += 1) {
		const x = xs[i];
		const y = acosXs[i];

		// Range invariant: [0, pi]
		assert.ok(y >= 0 && y <= Math.PI, `Out of range at index ${i}: ${y}`);

		// Round-trip identity: cos(arccos(x)) == x
		assertClose(Math.cos(y), x, EPS, `cos(arccos(${x})) round-trip failed`);

		// Independent formula cross-check: arccos(x) == atan2(sqrt(1 - x^2), x)
		const viaAtan2 = Math.atan2(Math.sqrt(Math.max(0, 1 - x * x)), x);
		assertClose(y, viaAtan2, EPS, `atan2 cross-check failed at x=${x}`);

		// Complementary identity: arccos(x) + asin(x) == pi / 2
		assertClose(y + Math.asin(x), Math.PI / 2, EPS, `asin complement failed at x=${x}`);

		// Symmetry identity: arccos(-x) == pi - arccos(x)
		assertClose(acosNegXs[i], Math.PI - y, EPS, `symmetry failed at x=${x}`);

		// Monotonicity: strictly decreasing over [-1, 1]
		if (i > 0) {
			assert.ok(y < acosXs[i - 1], `Expected strictly decreasing at index ${i}`);
		}
	}
});
