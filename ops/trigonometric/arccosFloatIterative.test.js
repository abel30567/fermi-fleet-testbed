import test from 'node:test';
import assert from 'node:assert/strict';
import { arccosFloatIterative } from './arccosFloatIterative.js';

function assertClose(actual, expected, tolerance = 1e-15, label = '') {
	assert.equal(typeof actual, 'number', `${label}: result should be a number`);
	assert.ok(!Number.isNaN(actual), `${label}: result should not be NaN`);
	const diff = Math.abs(actual - expected);
	assert.ok(
		diff <= tolerance,
		`${label}: expected ${actual} to be within ${tolerance} of ${expected} (diff=${diff})`,
	);
}

test('arccosFloatIterative: exact and canonical special values', () => {
	const atOne = arccosFloatIterative(1);
	assert.ok(Object.is(atOne, 0), 'arccos(1) must be +0');

	assert.equal(arccosFloatIterative(-1), Math.PI);
	assert.equal(arccosFloatIterative(0), Math.PI / 2);
	assert.equal(arccosFloatIterative(-0), Math.PI / 2);

	assertClose(arccosFloatIterative(0.5), Math.PI / 3, 1e-15, 'arccos(0.5)');
	assertClose(arccosFloatIterative(-0.5), (2 * Math.PI) / 3, 1e-15, 'arccos(-0.5)');
	assertClose(arccosFloatIterative(Math.SQRT1_2), Math.PI / 4, 1e-15, 'arccos(sqrt(2)/2)');
	assertClose(arccosFloatIterative(-Math.SQRT1_2), (3 * Math.PI) / 4, 1e-15, 'arccos(-sqrt(2)/2)');
	assertClose(arccosFloatIterative(Math.sqrt(3) / 2), Math.PI / 6, 1e-15, 'arccos(sqrt(3)/2)');
	assertClose(arccosFloatIterative(-Math.sqrt(3) / 2), (5 * Math.PI) / 6, 1e-15, 'arccos(-sqrt(3)/2)');
});

test('arccosFloatIterative: input validation rejects non-number arguments with TypeError', () => {
	const invalidInputs = [
		undefined,
		null,
		'0.5',
		'',
		'0',
		true,
		false,
		{},
		[],
		[0.5],
		0n,
		1n,
		Symbol('x'),
		new Number(0.5),
		() => 0.5,
	];

	assert.throws(() => arccosFloatIterative(), TypeError);
	for (const input of invalidInputs) {
		assert.throws(
			() => arccosFloatIterative(input),
			TypeError,
			`expected TypeError for input ${String(input)}`,
		);
	}
});

test('arccosFloatIterative: returns NaN for NaN, infinities, and out-of-domain float64 inputs', () => {
	const outOfDomain = [
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		1 + Number.EPSILON,
		-1 - Number.EPSILON,
		1.0000001,
		-1.0000001,
		2,
		-2,
		1e100,
		-1e100,
		Number.MAX_VALUE,
		-Number.MAX_VALUE,
	];

	for (const x of outOfDomain) {
		assert.ok(Number.isNaN(arccosFloatIterative(x)), `expected NaN for x=${x}`);
	}
});

test('arccosFloatIterative: boundary precision near 0, ±0.5, and ±1 including subnormals', () => {
	const boundaryPoints = [
		Number.MIN_VALUE,
		-Number.MIN_VALUE,
		1e-300,
		-1e-300,
		1e-16,
		-1e-16,
		1e-8,
		-1e-8,
		0.5 - Number.EPSILON,
		0.5,
		0.5 + Number.EPSILON,
		-0.5 - Number.EPSILON,
		-0.5,
		-0.5 + Number.EPSILON,
		1 - 1e-6,
		1 - 1e-10,
		1 - 1e-14,
		1 - Number.EPSILON,
		1 - Number.EPSILON / 2,
		-1 + 1e-6,
		-1 + 1e-10,
		-1 + 1e-14,
		-1 + Number.EPSILON,
	];

	for (const x of boundaryPoints) {
		const actual = arccosFloatIterative(x);
		const expected = Math.acos(x);
		assertClose(actual, expected, 1e-15, `boundary x=${x}`);
		assert.ok(actual >= 0 && actual <= Math.PI, `range invariant failed for x=${x}: ${actual}`);
	}
});

test('arccosFloatIterative: symmetry and strict monotonicity across [-1, 1]', () => {
	const samples = 200;
	let prev = Number.POSITIVE_INFINITY;

	for (let i = 0; i <= samples; i++) {
		const x = -1 + (2 * i) / samples;
		const val = arccosFloatIterative(x);

		assert.ok(val >= 0 && val <= Math.PI, `value out of [0, pi] at x=${x}`);
		assert.ok(val < prev, `expected strictly decreasing value at x=${x}: ${val} < ${prev}`);
		prev = val;

		const negVal = arccosFloatIterative(-x);
		assertClose(val + negVal, Math.PI, 2e-15, `symmetry arccos(${x}) + arccos(${-x})`);
	}
});

test('arccosFloatIterative: independent cross-check via cos(arccos(x)) === x round-trip', () => {
	const samples = 500;
	for (let i = 0; i <= samples; i++) {
		const x = -1 + (2 * i) / samples;
		const angle = arccosFloatIterative(x);
		const recovered = Math.cos(angle);
		assertClose(recovered, x, 1e-14, `cos(arccos(${x}))`);
	}
});

test('arccosFloatIterative: independent cross-check against 2 * atan2(sqrt(1 - x), sqrt(1 + x)) and Math.acos', () => {
	const samples = 1000;
	for (let i = 0; i <= samples; i++) {
		const x = -1 + (2 * i) / samples;
		const actual = arccosFloatIterative(x);
		const atan2Ref = 2 * Math.atan2(Math.sqrt(1 - x), Math.sqrt(1 + x));
		const acosRef = Math.acos(x);

		assertClose(actual, atan2Ref, 2e-15, `atan2 cross-check x=${x}`);
		assertClose(actual, acosRef, 1e-15, `Math.acos cross-check x=${x}`);
	}
});
