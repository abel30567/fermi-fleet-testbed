import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { lnFloatRecursive } from './lnFloatRecursive.js';

/**
 * Computes the ULP (unit in the last place) distance between two finite
 * IEEE-754 float64 numbers.
 */
function ulpDistance(a, b) {
	if (a === b) return 0n;
	const buf = new ArrayBuffer(16);
	const f64 = new Float64Array(buf);
	const u64 = new BigUint64Array(buf);
	f64[0] = a;
	f64[1] = b;
	const toOrdered = (bits) =>
		(bits & (1n << 63n)) !== 0n ? ~bits : bits ^ (1n << 63n);
	const oa = toOrdered(u64[0]);
	const ob = toOrdered(u64[1]);
	return oa > ob ? oa - ob : ob - oa;
}

describe('lnFloatRecursive', () => {
	test('input validation rejects non-number arguments', () => {
		for (const invalid of [
			undefined,
			null,
			'2',
			true,
			false,
			{},
			[1],
			1n,
			Symbol('x'),
		]) {
			assert.throws(() => lnFloatRecursive(invalid), TypeError);
		}
	});

	test('IEEE-754 special values and domain edge cases', () => {
		assert.ok(Number.isNaN(lnFloatRecursive(NaN)));
		assert.ok(Number.isNaN(lnFloatRecursive(-1)));
		assert.ok(Number.isNaN(lnFloatRecursive(-Number.MIN_VALUE)));
		assert.ok(Number.isNaN(lnFloatRecursive(-Infinity)));
		assert.equal(lnFloatRecursive(0), -Infinity);
		assert.equal(lnFloatRecursive(-0), -Infinity);
		assert.equal(lnFloatRecursive(Infinity), Infinity);
		assert.ok(Object.is(lnFloatRecursive(1), 0));
	});

	test('known exact and standard normal values', () => {
		const cases = [
			[Math.E, 1],
			[Math.E ** 2, 2],
			[Math.E ** -3, -3],
			[2, Math.LN2],
			[10, Math.LN10],
			[0.5, -Math.LN2],
			[Math.SQRT2, Math.LN2 / 2],
			[Math.SQRT1_2, -Math.LN2 / 2],
			[3, Math.log(3)],
			[100, Math.log(100)],
			[0.01, Math.log(0.01)],
			[123456.789, Math.log(123456.789)],
		];

		for (const [x, expected] of cases) {
			const actual = lnFloatRecursive(x);
			const ulps = ulpDistance(actual, expected);
			assert.ok(
				ulps <= 2n,
				`ln(${x}): got ${actual}, expected ${expected} (${ulps} ULPs)`,
			);
		}
	});

	test('precision near 1 (avoiding catastrophic cancellation)', () => {
		const deltas = [
			Number.EPSILON,
			-Number.EPSILON / 2,
			1e-15,
			-1e-15,
			1e-12,
			-1e-12,
			1e-8,
			-1e-8,
			1e-4,
			-1e-4,
			0.25,
			-0.25,
		];

		for (const d of deltas) {
			const x = 1 + d;
			const actual = lnFloatRecursive(x);
			const expected = Math.log(x);
			const ulps = ulpDistance(actual, expected);
			assert.ok(
				ulps <= 2n,
				`ln(1 + ${d}): got ${actual}, expected ${expected} (${ulps} ULPs)`,
			);
		}
	});

	test('extreme magnitudes, powers of two, and subnormals', () => {
		const extremes = [
			Number.MAX_VALUE,
			Number.MIN_VALUE,
			2 ** -1074,
			2 ** -1050,
			2 ** -1023,
			2 ** -1022,
			2 ** -512,
			2 ** -1,
			2 ** 1,
			2 ** 512,
			2 ** 1023,
			1e-308,
			1e-320,
			1e308,
			Math.SQRT1_2 * (1 - Number.EPSILON),
			Math.SQRT1_2 * (1 + Number.EPSILON),
			Math.SQRT2 * (1 - Number.EPSILON),
			Math.SQRT2 * (1 + Number.EPSILON),
		];

		for (const x of extremes) {
			const actual = lnFloatRecursive(x);
			const expected = Math.log(x);
			const ulps = ulpDistance(actual, expected);
			assert.ok(
				ulps <= 2n,
				`ln(${x}): got ${actual}, expected ${expected} (${ulps} ULPs)`,
			);
		}
	});

	test('independent cross-checks: Math.log comparison, Math.exp inverse, and algebraic identities', () => {
		// Deterministic sweep across 600 orders of magnitude (subnormal to MAX_VALUE)
		const samples = [];
		for (let exp = -1074; exp <= 1023; exp += 13) {
			const base = 2 ** exp;
			for (const mantissa of [1.0, 1.15, 1.37, 1.73, 1.9999999]) {
				const v = base * mantissa;
				if (v > 0 && Number.isFinite(v)) {
					samples.push(v);
				}
			}
		}

		for (const x of samples) {
			const y = lnFloatRecursive(x);
			const ref = Math.log(x);
			const ulps = ulpDistance(y, ref);
			assert.ok(
				ulps <= 2n,
				`Math.log cross-check failed for ${x}: got ${y}, ref ${ref} (${ulps} ULPs)`,
			);

			// Inverse check: exp(ln(x)) ≈ x for normal values where exp does not underflow/overflow
			if (x >= 1e-300 && x <= 1e300) {
				const reconstructed = Math.exp(y);
				const relErr = Math.abs(reconstructed - x) / x;
				assert.ok(
					relErr <= 1e-12,
					`exp(ln(${x})) = ${reconstructed}, relErr = ${relErr}`,
				);
			}
		}

		// Logarithmic algebraic identities: ln(a * b) ≈ ln(a) + ln(b) and ln(a^p) ≈ p * ln(a)
		const pairs = [
			[3.5, 7.25],
			[1e-50, 1e80],
			[0.123456, 98765.4321],
			[Math.PI, Math.SQRT2],
		];
		for (const [a, b] of pairs) {
			const lhs = lnFloatRecursive(a * b);
			const rhs = lnFloatRecursive(a) + lnFloatRecursive(b);
			assert.ok(
				Math.abs(lhs - rhs) <= 1e-13 * Math.max(1, Math.abs(lhs)),
				`Product identity failed for (${a}, ${b}): ${lhs} vs ${rhs}`,
			);
		}

		for (const a of [0.3, 1.7, 42.5]) {
			for (const p of [-3, -1, 2, 5]) {
				const lhs = lnFloatRecursive(a ** p);
				const rhs = p * lnFloatRecursive(a);
				assert.ok(
					Math.abs(lhs - rhs) <= 1e-13 * Math.max(1, Math.abs(lhs)),
					`Power identity failed for ${a}^${p}: ${lhs} vs ${rhs}`,
				);
			}
		}
	});
});
