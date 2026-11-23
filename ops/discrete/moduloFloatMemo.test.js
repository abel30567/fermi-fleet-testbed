import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { moduloFloatMemo } from './moduloFloatMemo.js';

/**
 * Independent reference: exact floored modulo over BigInt.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function bigIntFlooredMod(a, b) {
	const r = a % b;
	if (r === 0n) return 0n;
	return (r < 0n) !== (b < 0n) ? r + b : r;
}

/**
 * Independent reference: repeated addition/subtraction for moderate float64 values.
 * Avoids using `%` or `Math.floor`.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function iterativeFlooredMod(a, b) {
	let r = a;
	if (b > 0) {
		while (r >= b) r -= b;
		while (r < 0) r += b;
		if (r === b) r = 0;
	} else {
		while (r <= b) r -= b;
		while (r > 0) r += b;
		if (r === b) r = 0;
	}
	return r === 0 ? 0 : r;
}

describe('moduloFloatMemo', () => {
	it('computes precomputed table entries for small non-negative integers', () => {
		assert.equal(moduloFloatMemo(0, 1), 0);
		assert.equal(moduloFloatMemo(0, 7), 0);
		assert.equal(moduloFloatMemo(17, 5), 2);
		assert.equal(moduloFloatMemo(63, 64), 63);
		assert.equal(moduloFloatMemo(63, 10), 3);
		assert.equal(moduloFloatMemo(42, 6), 0);
	});

	it('computes discrete floored modulo for positive and negative dividends and divisors', () => {
		// Positive divisor: result in [0, b)
		assert.equal(moduloFloatMemo(13, 5), 3);
		assert.equal(moduloFloatMemo(-1, 5), 4);
		assert.equal(moduloFloatMemo(-5, 5), 0);
		assert.equal(moduloFloatMemo(-13, 5), 2);

		// Negative divisor: result in (b, 0]
		assert.equal(moduloFloatMemo(1, -5), -4);
		assert.equal(moduloFloatMemo(5, -5), 0);
		assert.equal(moduloFloatMemo(13, -5), -2);
		assert.equal(moduloFloatMemo(-1, -5), -1);
		assert.equal(moduloFloatMemo(-5, -5), 0);
		assert.equal(moduloFloatMemo(-13, -5), -3);
	});

	it('handles fractional IEEE-754 float64 values accurately', () => {
		assert.equal(moduloFloatMemo(5.5, 2), 1.5);
		assert.equal(moduloFloatMemo(-5.5, 2), 0.5);
		assert.equal(moduloFloatMemo(7.5, 2.5), 0);
		assert.equal(moduloFloatMemo(1.25, 0.5), 0.25);
		assert.equal(moduloFloatMemo(-1.25, 0.5), 0.25);
		assert.equal(moduloFloatMemo(1.25, -0.5), -0.25);
		assert.equal(moduloFloatMemo(-1.25, -0.5), -0.25);
		assert.ok(Math.abs(moduloFloatMemo(Math.PI, 1) - (Math.PI - 3)) < 1e-15);
	});

	it('normalizes -0 to +0 and guards rounding boundary for tiny opposite-sign dividends', () => {
		assert.ok(Object.is(moduloFloatMemo(-0, 5), 0));
		assert.ok(Object.is(moduloFloatMemo(-0, -5), 0));
		assert.ok(Object.is(moduloFloatMemo(-10, 5), 0));
		assert.ok(Object.is(moduloFloatMemo(10, -5), 0));

		// Tiny negative dividend with positive modulus: (-1e-20 + 1) rounds to 1 in float64,
		// so floored modulo must wrap cleanly to 0 rather than violating r < b.
		assert.ok(Object.is(moduloFloatMemo(-1e-20, 1), 0));
		assert.ok(Object.is(moduloFloatMemo(-Number.MIN_VALUE, 1), 0));
		assert.ok(Object.is(moduloFloatMemo(Number.MIN_VALUE, -1), 0));
		assert.equal(moduloFloatMemo(Number.MIN_VALUE, 1), Number.MIN_VALUE);
	});

	it('handles large finite float64 values without precision loss from naive floor(a/b)*b', () => {
		const expectedPos = Number(BigInt(Number.MAX_SAFE_INTEGER) % 97n);
		assert.equal(expectedPos, 31);
		assert.equal(moduloFloatMemo(Number.MAX_SAFE_INTEGER, 97), expectedPos);
		assert.equal(moduloFloatMemo(-Number.MAX_SAFE_INTEGER, 97), 97 - expectedPos);

		const largeRes = moduloFloatMemo(Number.MAX_VALUE, 3);
		assert.ok(largeRes >= 0 && largeRes < 3);
		assert.equal(largeRes, Number.MAX_VALUE % 3);
	});

	it('validates input types, finiteness, and non-zero modulus', () => {
		for (const bad of ['5', null, undefined, {}, [], true, 5n, Symbol('x')]) {
			assert.throws(() => moduloFloatMemo(bad, 3), TypeError);
			assert.throws(() => moduloFloatMemo(3, bad), TypeError);
		}

		for (const nonFinite of [NaN, Infinity, -Infinity]) {
			assert.throws(() => moduloFloatMemo(nonFinite, 3), RangeError);
			assert.throws(() => moduloFloatMemo(3, nonFinite), RangeError);
		}

		assert.throws(() => moduloFloatMemo(5, 0), RangeError);
		assert.throws(() => moduloFloatMemo(5, -0), RangeError);
		assert.throws(() => moduloFloatMemo(0, 0), RangeError);
	});

	it('returns consistent results across repeated memoized calls and LRU cache eviction', () => {
		// Repeated calls on non-table inputs exercise memoization hits.
		for (let i = 0; i < 5; i++) {
			assert.equal(moduloFloatMemo(123.75, 11.5), 8.75);
			assert.equal(moduloFloatMemo(-123.75, 11.5), 2.75);
			assert.ok(Object.is(moduloFloatMemo(-0, 99.5), 0));
			assert.ok(Object.is(moduloFloatMemo(0, 99.5), 0));
		}

		// Insert > 4096 distinct keys to exercise LRU cache eviction, then re-query early keys.
		for (let i = 0; i < 5000; i++) {
			const a = 100 + i * 0.25;
			const b = 7.5;
			const expected = iterativeFlooredMod(a, b);
			assert.ok(Math.abs(moduloFloatMemo(a, b) - expected) < 1e-12);
		}

		assert.equal(moduloFloatMemo(123.75, 11.5), 8.75);
	});

	it('independent cross-check: matches BigInt floored modulo across integer grid (table + non-table)', () => {
		const dividends = [-1000, -65, -64, -17, -1, 0, 1, 17, 63, 64, 65, 1000, 123456789];
		const divisors = [-100, -64, -7, -1, 1, 2, 7, 63, 64, 65, 100];

		for (const a of dividends) {
			for (const b of divisors) {
				const expected = Number(bigIntFlooredMod(BigInt(a), BigInt(b)));
				const actual = moduloFloatMemo(a, b);
				assert.ok(
					Object.is(actual, expected),
					`Mismatch for (${a}, ${b}): got ${actual}, expected ${expected}`
				);
			}
		}
	});

	it('independent cross-check: satisfies Euclidean division identity and iterative reference on exact dyadic rationals', () => {
		// Exact binary fractions (multiples of 1/16) have zero representation error in IEEE-754 float64.
		const values = [];
		for (let k = -48; k <= 48; k += 3) {
			values.push(k / 16);
		}

		for (const a of values) {
			for (const b of values) {
				if (b === 0) continue;
				const r = moduloFloatMemo(a, b);
				const ref = iterativeFlooredMod(a, b);

				assert.ok(
					Object.is(r, ref),
					`Iterative reference mismatch for (${a}, ${b}): got ${r}, expected ${ref}`
				);

				// Range invariant
				if (b > 0) {
					assert.ok(r >= 0 && r < b, `Out of range [0, ${b}) for (${a}, ${b}): ${r}`);
				} else {
					assert.ok(r <= 0 && r > b, `Out of range (${b}, 0] for (${a}, ${b}): ${r}`);
				}

				// Division algorithm identity: a === floor(a / b) * b + r
				const q = Math.floor(a / b);
				assert.equal(q * b + r, a, `Division identity failed for (${a}, ${b})`);
			}
		}
	});
});
