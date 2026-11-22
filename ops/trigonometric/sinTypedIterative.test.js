import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sinTypedIterative } from './sinTypedIterative.js';

/**
 * Independent Maclaurin series approximation of sin(x) on [-pi, pi].
 *
 * @param {number} x - Angle in radians within [-pi, pi].
 * @returns {number}
 */
function sinMaclaurin(x) {
	let term = x;
	let sum = x;
	const x2 = x * x;
	for (let k = 1; k <= 20; k++) {
		term = (-term * x2) / ((2 * k) * (2 * k + 1));
		sum += term;
	}
	return sum;
}

function assertClose(actual, expected, tol = 1e-15, label = '') {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol} of ${expected}`,
	);
}

test('sinTypedIterative computes exact/known values for standard angles', () => {
	const input = new Float64Array([
		0,
		Math.PI / 6,
		Math.PI / 4,
		Math.PI / 3,
		Math.PI / 2,
		Math.PI,
		(3 * Math.PI) / 2,
		2 * Math.PI,
		-Math.PI / 6,
		-Math.PI / 2,
	]);
	const expected = [
		0,
		0.5,
		Math.SQRT1_2,
		Math.sqrt(3) / 2,
		1,
		0,
		-1,
		0,
		-0.5,
		-1,
	];

	const snapshot = new Float64Array(input);
	const result = sinTypedIterative(input);

	assert.ok(result instanceof Float64Array);
	assert.notEqual(result, input);
	assert.equal(result.length, input.length);
	assert.deepEqual(input, snapshot, 'input array must not be mutated');

	for (let i = 0; i < expected.length; i++) {
		assertClose(result[i], expected[i], 1e-15, `index ${i}`);
	}
});

test('sinTypedIterative handles empty and single-element Float64Arrays', () => {
	const empty = new Float64Array(0);
	const emptyResult = sinTypedIterative(empty);
	assert.ok(emptyResult instanceof Float64Array);
	assert.equal(emptyResult.length, 0);
	assert.notEqual(emptyResult, empty);

	const emptyOut = new Float64Array(0);
	assert.equal(sinTypedIterative(empty, emptyOut), emptyOut);

	const single = new Float64Array([Math.PI / 2]);
	const singleResult = sinTypedIterative(single);
	assert.equal(singleResult.length, 1);
	assert.equal(singleResult[0], 1);
});

test('sinTypedIterative preserves IEEE-754 special values and extreme magnitudes', () => {
	const input = new Float64Array([
		0,
		-0,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		Number.MIN_VALUE,
		-Number.MIN_VALUE,
		1e-12,
		1e6,
		-1e6,
	]);

	const result = sinTypedIterative(input);

	assert.ok(Object.is(result[0], 0));
	assert.ok(Object.is(result[1], -0));
	assert.ok(Number.isNaN(result[2]));
	assert.ok(Number.isNaN(result[3]));
	assert.ok(Number.isNaN(result[4]));
	assert.equal(result[5], Number.MIN_VALUE);
	assert.equal(result[6], -Number.MIN_VALUE);
	assertClose(result[7], 1e-12, 1e-27);
	assert.equal(result[8], Math.sin(1e6));
	assert.equal(result[9], -result[8]);
});

test('sinTypedIterative supports preallocated out, in-place, subarrays, and overlapping views', () => {
	const input = new Float64Array([0.1, 0.5, 1.2, 2.3, -1.7]);
	const out = new Float64Array(input.length);
	const returned = sinTypedIterative(input, out);
	assert.equal(returned, out);
	for (let i = 0; i < input.length; i++) {
		assert.equal(out[i], Math.sin(input[i]));
	}

	// In-place
	const inPlace = new Float64Array(input);
	assert.equal(sinTypedIterative(inPlace, inPlace), inPlace);
	assert.deepEqual(inPlace, out);

	// Non-zero byteOffset subarray view
	const backing = new Float64Array([99, 0.25, 0.75, 1.5, 88]);
	const view = backing.subarray(1, 4);
	const viewRes = sinTypedIterative(view);
	assert.deepEqual(
		viewRes,
		new Float64Array([Math.sin(0.25), Math.sin(0.75), Math.sin(1.5)]),
	);

	// Overlapping views in the same ArrayBuffer (forward overlap: out starts after input)
	const bufForward = new Float64Array([0.2, 0.4, 0.6, 0.8, 1.0]);
	const srcForward = bufForward.subarray(0, 4);
	const dstForward = bufForward.subarray(1, 5);
	const expectedForward = new Float64Array([
		Math.sin(0.2),
		Math.sin(0.4),
		Math.sin(0.6),
		Math.sin(0.8),
	]);
	sinTypedIterative(srcForward, dstForward);
	assert.deepEqual(dstForward, expectedForward);

	// Overlapping views in the same ArrayBuffer (backward overlap: out starts before input)
	const bufBackward = new Float64Array([0.2, 0.4, 0.6, 0.8, 1.0]);
	const srcBackward = bufBackward.subarray(1, 5);
	const dstBackward = bufBackward.subarray(0, 4);
	const expectedBackward = new Float64Array([
		Math.sin(0.4),
		Math.sin(0.6),
		Math.sin(0.8),
		Math.sin(1.0),
	]);
	sinTypedIterative(srcBackward, dstBackward);
	assert.deepEqual(dstBackward, expectedBackward);
});

test('sinTypedIterative throws TypeError and RangeError on invalid inputs', () => {
	const invalidInputs = [
		undefined,
		null,
		[0, 1, 2],
		new Float32Array([0, 1]),
		new Int32Array([0, 1]),
		42,
		'0.5',
		{ length: 1, 0: 0 },
	];

	for (const bad of invalidInputs) {
		assert.throws(() => sinTypedIterative(bad), TypeError);
	}

	const valid = new Float64Array([0, 1, 2]);
	for (const badOut of [null, [0, 0, 0], new Float32Array(3), 3, 'out']) {
		assert.throws(() => sinTypedIterative(valid, badOut), TypeError);
	}

	assert.throws(() => sinTypedIterative(valid, new Float64Array(2)), RangeError);
	assert.throws(() => sinTypedIterative(valid, new Float64Array(4)), RangeError);
	assert.throws(() => sinTypedIterative(valid, new Float64Array(0)), RangeError);
});

test('cross-check against independent Maclaurin series on [-pi, pi]', () => {
	const n = 201;
	const angles = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		angles[i] = -Math.PI + (2 * Math.PI * i) / (n - 1);
	}

	const result = sinTypedIterative(angles);
	for (let i = 0; i < n; i++) {
		const independent = sinMaclaurin(angles[i]);
		assertClose(result[i], independent, 1e-14, `angle=${angles[i]}`);
	}
});

test('cross-check against trigonometric identities and inverse asin', () => {
	const n = 100;
	const x = new Float64Array(n);
	const negX = new Float64Array(n);
	const twoX = new Float64Array(n);

	for (let i = 0; i < n; i++) {
		const angle = -Math.PI / 2 + (Math.PI * i) / (n - 1);
		x[i] = angle;
		negX[i] = -angle;
		twoX[i] = 2 * angle;
	}

	const sinX = sinTypedIterative(x);
	const sinNegX = sinTypedIterative(negX);
	const sinTwoX = sinTypedIterative(twoX);

	for (let i = 0; i < n; i++) {
		const cosX = Math.cos(x[i]);

		// Pythagorean identity: sin^2(x) + cos^2(x) === 1
		assertClose(sinX[i] * sinX[i] + cosX * cosX, 1, 1e-15, `pythagorean[${i}]`);

		// Odd symmetry: sin(-x) === -sin(x)
		assert.equal(sinNegX[i], -sinX[i]);

		// Double-angle identity: sin(2x) === 2 sin(x) cos(x)
		assertClose(sinTwoX[i], 2 * sinX[i] * cosX, 1e-15, `double-angle[${i}]`);

		// Inverse on [-pi/2, pi/2]: asin(sin(x)) === x
		assertClose(Math.asin(sinX[i]), x[i], 1e-14, `inverse[${i}]`);
	}
});
