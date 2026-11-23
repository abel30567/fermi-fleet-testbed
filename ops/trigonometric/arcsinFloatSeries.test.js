import test from 'node:test';
import assert from 'node:assert/strict';
import { arcsinFloatSeries } from './arcsinFloatSeries.js';

const HALF_PI = Math.PI / 2;

test('arcsinFloatSeries: exact special values and signed zero', () => {
	assert.ok(Object.is(arcsinFloatSeries(0), 0), 'arcsin(+0) should be +0');
	assert.ok(Object.is(arcsinFloatSeries(-0), -0), 'arcsin(-0) should be -0');
	assert.equal(arcsinFloatSeries(1), HALF_PI);
	assert.equal(arcsinFloatSeries(-1), -HALF_PI);
});

test('arcsinFloatSeries: known exact trigonometric values', () => {
	const cases = [
		[0.5, Math.PI / 6],
		[-0.5, -Math.PI / 6],
		[Math.SQRT1_2, Math.PI / 4],
		[-Math.SQRT1_2, -Math.PI / 4],
		[Math.sqrt(3) / 2, Math.PI / 3],
		[-Math.sqrt(3) / 2, -Math.PI / 3],
	];

	for (const [input, expected] of cases) {
		const actual = arcsinFloatSeries(input);
		assert.ok(
			Math.abs(actual - expected) <= 1e-15,
			`arcsinFloatSeries(${input}) = ${actual}, expected ${expected}`
		);
	}
});

test('arcsinFloatSeries: boundary and near-boundary edge cases', () => {
	// Near 0 (tiny and subnormal values: arcsin(x) ≈ x)
	const tinyValues = [
		Number.MIN_VALUE,
		-Number.MIN_VALUE,
		1e-300,
		-1e-300,
		1e-15,
		-1e-15,
		1e-8,
		-1e-8,
	];
	for (const x of tinyValues) {
		const actual = arcsinFloatSeries(x);
		const ref = Math.asin(x);
		assert.ok(
			Math.abs(actual - ref) <= 2 * Number.EPSILON * Math.max(Math.abs(ref), Number.MIN_VALUE),
			`tiny x=${x}: got ${actual}, expected ${ref}`
		);
	}

	// Around the 0.5 branch crossover
	const crossover = [
		0.5 - Number.EPSILON,
		0.5 - 1e-12,
		0.5,
		0.5 + Number.EPSILON,
		0.5 + 1e-12,
		-0.5 + Number.EPSILON,
		-0.5,
		-0.5 - Number.EPSILON,
	];
	for (const x of crossover) {
		const actual = arcsinFloatSeries(x);
		const ref = Math.asin(x);
		assert.ok(
			Math.abs(actual - ref) <= 4 * Number.EPSILON,
			`crossover x=${x}: got ${actual}, expected ${ref}`
		);
	}

	// Very close to ±1
	const nearOne = [
		1 - Number.EPSILON,
		1 - 1e-12,
		1 - 1e-6,
		-(1 - Number.EPSILON),
		-(1 - 1e-12),
		-(1 - 1e-6),
	];
	for (const x of nearOne) {
		const actual = arcsinFloatSeries(x);
		const ref = Math.asin(x);
		assert.ok(
			Math.abs(actual - ref) <= 4 * Number.EPSILON,
			`near ±1 x=${x}: got ${actual}, expected ${ref}`
		);
	}
});

test('arcsinFloatSeries: odd symmetry and monotonicity across [-1, 1]', () => {
	let prev = -Infinity;
	const steps = 200;
	for (let i = -steps; i <= steps; i++) {
		const x = i / steps;
		const y = arcsinFloatSeries(x);
		assert.ok(y >= -HALF_PI && y <= HALF_PI, `result out of range for x=${x}: ${y}`);
		assert.ok(y > prev, `expected strict monotonicity at x=${x}: ${y} <= ${prev}`);
		prev = y;

		if (x !== 0) {
			assert.equal(
				arcsinFloatSeries(-x),
				-y,
				`odd symmetry violated at x=${x}`
			);
		}
	}
});

test('arcsinFloatSeries: independent cross-check via sin(arcsin(x)) = x and arcsin(x) = atan2(x, sqrt(1 - x^2))', () => {
	const samples = 500;
	for (let i = 0; i <= samples; i++) {
		const x = -1 + (2 * i) / samples;
		const y = arcsinFloatSeries(x);

		// Cross-check 1: inverse relationship sin(arcsin(x)) === x
		assert.ok(
			Math.abs(Math.sin(y) - x) <= 4 * Number.EPSILON,
			`sin(arcsin(${x})) = ${Math.sin(y)}, diff=${Math.abs(Math.sin(y) - x)}`
		);

		// Cross-check 2: independent closed-form identity via Math.atan2
		const atanRef = Math.atan2(x, Math.sqrt(Math.max(0, 1 - x * x)));
		assert.ok(
			Math.abs(y - atanRef) <= 4 * Number.EPSILON,
			`atan2 identity mismatch at x=${x}: got ${y}, atanRef=${atanRef}`
		);

		// Cross-check 3: reference Math.asin
		const asinRef = Math.asin(x);
		assert.ok(
			Math.abs(y - asinRef) <= 4 * Number.EPSILON,
			`Math.asin mismatch at x=${x}: got ${y}, asinRef=${asinRef}`
		);
	}
});

test('arcsinFloatSeries: invalid input validation', () => {
	// Non-number inputs -> TypeError
	const nonNumbers = [
		undefined,
		null,
		'0.5',
		'',
		true,
		false,
		0n,
		{},
		[],
		[0.5],
		Symbol('x'),
		() => 0,
	];
	for (const bad of nonNumbers) {
		assert.throws(
			() => arcsinFloatSeries(bad),
			{ name: 'TypeError' },
			`expected TypeError for ${String(bad)}`
		);
	}

	// Non-finite and out-of-domain numbers -> RangeError
	const outOfDomain = [
		NaN,
		Infinity,
		-Infinity,
		1 + Number.EPSILON,
		-(1 + Number.EPSILON),
		1.0001,
		-1.0001,
		2,
		-2,
		1e100,
		-1e100,
	];
	for (const bad of outOfDomain) {
		assert.throws(
			() => arcsinFloatSeries(bad),
			{ name: 'RangeError' },
			`expected RangeError for ${bad}`
		);
	}
});
