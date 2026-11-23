import test from 'node:test';
import assert from 'node:assert/strict';
import { arccosTypedSeries } from './arccosTypedSeries.js';

const TOLERANCE = 1e-14;

test('arccosTypedSeries computes exact landmark values (-1, 0, 1, +/-0.5)', () => {
	const input = new Float64Array([-1, -0.5, 0, -0, 0.5, 1]);
	const out = arccosTypedSeries(input);

	assert.ok(out instanceof Float64Array);
	assert.equal(out.length, input.length);
	assert.notEqual(out, input);

	assert.equal(out[0], Math.PI);
	assert.ok(Math.abs(out[1] - (2 * Math.PI) / 3) < TOLERANCE);
	assert.equal(out[2], Math.PI / 2);
	assert.equal(out[3], Math.PI / 2);
	assert.ok(Math.abs(out[4] - Math.PI / 3) < TOLERANCE);
	assert.equal(out[5], 0);
	assert.ok(Object.is(out[5], 0));
});

test('arccosTypedSeries handles empty Float64Array and does not mutate input', () => {
	const empty = new Float64Array(0);
	const emptyOut = arccosTypedSeries(empty);
	assert.ok(emptyOut instanceof Float64Array);
	assert.equal(emptyOut.length, 0);
	assert.notEqual(emptyOut, empty);

	const original = new Float64Array([-0.75, 0.25, 0.9]);
	const snapshot = new Float64Array(original);
	arccosTypedSeries(original);
	assert.deepEqual(original, snapshot);
});

test('arccosTypedSeries returns NaN for out-of-domain values and NaN', () => {
	const input = new Float64Array([
		Number.NaN,
		-1.0000001,
		1.0000001,
		-2,
		2,
		Number.NEGATIVE_INFINITY,
		Number.POSITIVE_INFINITY,
	]);
	const out = arccosTypedSeries(input);

	for (let i = 0; i < out.length; i++) {
		assert.ok(Number.isNaN(out[i]), `Expected NaN at index ${i} for input ${input[i]}`);
	}
});

test('arccosTypedSeries throws TypeError for invalid inputs', () => {
	const invalidInputs = [
		null,
		undefined,
		0.5,
		'0.5',
		[0, 0.5, 1],
		new Float32Array([0, 0.5]),
		new Int32Array([0, 1]),
		{ length: 1, 0: 0.5 },
	];

	for (const bad of invalidInputs) {
		assert.throws(() => arccosTypedSeries(bad), TypeError);
	}
});

test('arccosTypedSeries is accurate near +/-1 and across range-reduction boundaries', () => {
	const input = new Float64Array([
		-1 + 1e-12,
		-1 + 1e-9,
		-1 + 1e-6,
		-0.5 - 1e-12,
		-0.5,
		-0.5 + 1e-12,
		-1e-12,
		1e-12,
		0.5 - 1e-12,
		0.5,
		0.5 + 1e-12,
		1 - 1e-6,
		1 - 1e-9,
		1 - 1e-12,
	]);
	const out = arccosTypedSeries(input);

	for (let i = 0; i < input.length; i++) {
		const expected = Math.acos(input[i]);
		const err = Math.abs(out[i] - expected);
		assert.ok(
			err < TOLERANCE,
			`Mismatch at x=${input[i]}: got ${out[i]}, expected ${expected}, err=${err}`
		);
	}
});

test('arccosTypedSeries cross-checks against Math.acos, Math.cos inverse, and symmetry identity', () => {
	const count = 201;
	const input = new Float64Array(count);
	const negated = new Float64Array(count);
	for (let i = 0; i < count; i++) {
		const x = -1 + (2 * i) / (count - 1);
		input[i] = x;
		negated[i] = -x;
	}

	const out = arccosTypedSeries(input);
	const outNeg = arccosTypedSeries(negated);

	for (let i = 0; i < count; i++) {
		const x = input[i];
		const y = out[i];

		// Range invariant: arccos(x) in [0, pi]
		assert.ok(y >= 0 && y <= Math.PI, `Out of range at x=${x}: y=${y}`);

		// Independent cross-check 1: Math.acos
		const ref = Math.acos(x);
		assert.ok(
			Math.abs(y - ref) < TOLERANCE,
			`Math.acos cross-check failed at x=${x}: got ${y}, expected ${ref}`
		);

		// Independent cross-check 2: cos(arccos(x)) === x
		const roundTrip = Math.cos(y);
		assert.ok(
			Math.abs(roundTrip - x) < TOLERANCE,
			`cos(arccos(x)) failed at x=${x}: got ${roundTrip}`
		);

		// Independent cross-check 3: arccos(x) + arccos(-x) === pi
		assert.ok(
			Math.abs(y + outNeg[i] - Math.PI) < TOLERANCE,
			`Symmetry failed at x=${x}: ${y} + ${outNeg[i]} !== pi`
		);
	}
});
