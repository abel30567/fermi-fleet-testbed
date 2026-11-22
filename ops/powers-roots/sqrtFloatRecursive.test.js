import test from 'node:test';
import assert from 'node:assert/strict';
import { sqrtFloatRecursive } from './sqrtFloatRecursive.js';

/**
 * Computes relative error `|actual - expected| / |expected|`, handling zero.
 */
function relError(actual, expected) {
	if (expected === 0) {
		return Math.abs(actual);
	}
	return Math.abs(actual - expected) / Math.abs(expected);
}

test('sqrtFloatRecursive: zero and one edge cases', () => {
	assert.strictEqual(sqrtFloatRecursive(0), 0);
	assert.strictEqual(Object.is(sqrtFloatRecursive(0), 0), true);
	assert.strictEqual(Object.is(sqrtFloatRecursive(-0), -0), true);
	assert.strictEqual(sqrtFloatRecursive(1), 1);
});

test('sqrtFloatRecursive: exact perfect squares', () => {
	const roots = [
		2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16, 25, 32, 64, 100, 256, 1000, 1024,
		65536, 1e6, 2 ** 26,
	];
	for (const r of roots) {
		assert.strictEqual(
			sqrtFloatRecursive(r * r),
			r,
			`Expected sqrt(${r * r}) to equal ${r}`,
		);
	}

	// Exhaustive check for small integer perfect squares 1..1000
	for (let n = 1; n <= 1000; n += 1) {
		assert.strictEqual(sqrtFloatRecursive(n * n), n);
	}

	// Exact dyadic fractional squares
	assert.strictEqual(sqrtFloatRecursive(0.25), 0.5);
	assert.strictEqual(sqrtFloatRecursive(0.0625), 0.25);
	assert.strictEqual(sqrtFloatRecursive(2.25), 1.5);
	assert.strictEqual(sqrtFloatRecursive(1.5625), 1.25);
});

test('sqrtFloatRecursive: normal and irrational values', () => {
	const values = [0.1, 0.5, 0.75, 2, 3, 5, 7, 10, Math.E, Math.PI, 12345.6789];
	for (const x of values) {
		const actual = sqrtFloatRecursive(x);
		const expected = Math.sqrt(x);
		assert.ok(
			relError(actual, expected) <= Number.EPSILON,
			`sqrtFloatRecursive(${x}) = ${actual} differed from Math.sqrt = ${expected}`,
		);
	}
});

test('sqrtFloatRecursive: range-reduction boundary values', () => {
	const boundaries = [
		0.25 - 1e-16,
		0.25,
		0.25 + 1e-16,
		1 - Number.EPSILON / 2,
		1,
		1 + Number.EPSILON,
		4 - 2 * Number.EPSILON,
		4,
		4 + 4 * Number.EPSILON,
		16,
		2 ** -512,
		2 ** -256,
		2 ** 256,
		2 ** 512,
		2 ** 1022,
	];
	for (const x of boundaries) {
		const actual = sqrtFloatRecursive(x);
		const expected = Math.sqrt(x);
		assert.ok(
			relError(actual, expected) <= Number.EPSILON,
			`Boundary x=${x}: got ${actual}, expected ${expected}`,
		);
	}
});

test('sqrtFloatRecursive: extreme scales (1e-300, 1e300, subnormals, MIN_VALUE, MAX_VALUE)', () => {
	const extremes = [
		Number.MIN_VALUE,
		1e-320,
		1e-310,
		2 ** -1022,
		1e-300,
		1e-150,
		1e150,
		1e300,
		1e308,
		Number.MAX_VALUE,
	];
	for (const x of extremes) {
		const actual = sqrtFloatRecursive(x);
		const expected = Math.sqrt(x);
		assert.ok(
			Number.isFinite(actual) && actual > 0,
			`Expected positive finite result for x=${x}, got ${actual}`,
		);
		assert.ok(
			relError(actual, expected) <= Number.EPSILON,
			`Extreme x=${x}: got ${actual}, expected ${expected}, relErr=${relError(actual, expected)}`,
		);
	}

	// Explicit check for 1e-300 and 1e300 against r * r ≈ x
	const rSmall = sqrtFloatRecursive(1e-300);
	assert.ok(relError(rSmall, 1e-150) <= Number.EPSILON);
	assert.ok(relError(rSmall * rSmall, 1e-300) <= 4 * Number.EPSILON);

	const rLarge = sqrtFloatRecursive(1e300);
	assert.ok(relError(rLarge, 1e150) <= Number.EPSILON);
	assert.ok(relError(rLarge * rLarge, 1e300) <= 4 * Number.EPSILON);
});

test('sqrtFloatRecursive: input validation throws TypeError and RangeError', () => {
	// Negative numbers -> RangeError
	for (const neg of [-1, -0.0001, -Number.MIN_VALUE, -1e-300, -1e300, -Number.MAX_VALUE]) {
		assert.throws(
			() => sqrtFloatRecursive(neg),
			{ name: 'RangeError' },
			`Expected RangeError for negative input ${neg}`,
		);
	}

	// Non-finite numbers -> RangeError
	for (const nonFinite of [NaN, Infinity, -Infinity]) {
		assert.throws(
			() => sqrtFloatRecursive(nonFinite),
			{ name: 'RangeError' },
			`Expected RangeError for non-finite input ${nonFinite}`,
		);
	}

	// Non-number inputs -> TypeError
	for (const invalid of ['4', '', null, undefined, true, false, 4n, {}, [], Symbol('x'), () => 4]) {
		assert.throws(
			() => sqrtFloatRecursive(invalid),
			{ name: 'TypeError' },
			`Expected TypeError for non-number input ${String(invalid)}`,
		);
	}
});

test('sqrtFloatRecursive: cross-check against Math.sqrt(x) and r * r ≈ x across full float64 sweep', () => {
	// Deterministic LCG for reproducible mantissas in [1, 2)
	let state = 0x12345678;
	const nextMantissa = () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return 1 + state / 2 ** 32;
	};

	// Sweep exponents from -1070 (subnormal) to +1022 (near MAX_VALUE)
	for (let exp = -1070; exp <= 1022; exp += 3) {
		const x = nextMantissa() * 2 ** exp;
		if (!Number.isFinite(x) || x === 0) {
			continue;
		}
		const r = sqrtFloatRecursive(x);
		const expected = Math.sqrt(x);

		// Cross-check 1: independent Math.sqrt reference within 1 ULP
		assert.ok(
			relError(r, expected) <= Number.EPSILON,
			`Math.sqrt mismatch at x=${x}: got ${r}, expected ${expected}`,
		);

		// Cross-check 2: defining identity r * r ≈ x (for normal range where r*r won't underflow to subnormal spacing or overflow)
		if (exp >= -1000 && exp <= 1020) {
			assert.ok(
				relError(r * r, x) <= 4 * Number.EPSILON,
				`r*r mismatch at x=${x}: r*r=${r * r}`,
			);
		}
	}
});

test('sqrtFloatRecursive: algebraic properties (multiplicativity and monotonicity)', () => {
	const pairs = [
		[2, 3],
		[0.5, 18],
		[1e-100, 1e100],
		[1e-200, 1e-100],
		[1e100, 1e200],
		[Math.PI, Math.E],
	];
	for (const [a, b] of pairs) {
		const lhs = sqrtFloatRecursive(a * b);
		const rhs = sqrtFloatRecursive(a) * sqrtFloatRecursive(b);
		assert.ok(
			relError(lhs, rhs) <= 4 * Number.EPSILON,
			`Multiplicativity failed for (${a}, ${b}): ${lhs} vs ${rhs}`,
		);
	}

	// Monotonicity across ascending sequence
	const ascending = [0, Number.MIN_VALUE, 1e-300, 1e-10, 0.25, 0.5, 1, 2, 4, 1e10, 1e300, Number.MAX_VALUE];
	for (let i = 1; i < ascending.length; i += 1) {
		assert.ok(
			sqrtFloatRecursive(ascending[i - 1]) < sqrtFloatRecursive(ascending[i]),
			`Monotonicity failed between ${ascending[i - 1]} and ${ascending[i]}`,
		);
	}
});
