import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { log2DualIterative } from './log2DualIterative.js';

function assertClose(actual, expected, tol = 1e-12, label = '') {
	const diff = Math.abs(actual - expected);
	const scale = Math.max(1, Math.abs(expected));
	assert.ok(
		diff <= tol * scale,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol} (rel) of ${expected} (diff=${diff})`,
	);
}

describe('log2DualIterative', () => {
	describe('normal cases', () => {
		test('computes exact primal values and derivatives for powers of two', () => {
			const cases = [
				{ v: 1, d: 1, expV: 0 },
				{ v: 2, d: 1, expV: 1 },
				{ v: 4, d: 3, expV: 2 },
				{ v: 8, d: -2, expV: 3 },
				{ v: 1024, d: 0.5, expV: 10 },
				{ v: 0.5, d: 1, expV: -1 },
				{ v: 0.25, d: -4, expV: -2 },
				{ v: 0.125, d: 2.5, expV: -3 },
			];

			for (const { v, d, expV } of cases) {
				const res = log2DualIterative({ v, d });
				assert.equal(res.v, expV);
				assertClose(res.d, d / (v * Math.LN2), 1e-14, `d at v=${v}, d=${d}`);
			}
		});

		test('computes accurate primal values and derivatives for general positive values', () => {
			const cases = [
				{ v: 3, d: 1 },
				{ v: 5, d: 2.5 },
				{ v: 10, d: -3.25 },
				{ v: Math.E, d: 1 },
				{ v: Math.PI, d: 4.2 },
				{ v: 42.5, d: -0.75 },
				{ v: 0.1, d: 1 },
				{ v: 0.3, d: -0.6 },
				{ v: 0.75, d: 1.5 },
				{ v: 0.999999, d: 2 },
			];

			for (const { v, d } of cases) {
				const res = log2DualIterative({ v, d });
				assertClose(res.v, Math.log2(v), 1e-14, `v at v=${v}`);
				assertClose(res.d, d / (v * Math.LN2), 1e-14, `d at v=${v}`);
			}
		});

		test('handles zero and negative derivatives cleanly without mutating input', () => {
			const inputZero = { v: 7, d: 0 };
			const resZero = log2DualIterative(inputZero);
			assertClose(resZero.v, Math.log2(7), 1e-14);
			assert.equal(Object.is(resZero.d, 0), true);
			assert.deepEqual(inputZero, { v: 7, d: 0 });

			const resNegZero = log2DualIterative({ v: 7, d: -0 });
			assert.equal(Object.is(resNegZero.d, 0), true);

			const resNeg = log2DualIterative({ v: 3.5, d: -9.25 });
			assertClose(resNeg.v, Math.log2(3.5), 1e-14);
			assertClose(resNeg.d, -9.25 / (3.5 * Math.LN2), 1e-14);
		});
	});

	describe('edge cases', () => {
		test('handles very large and very small positive values including subnormals', () => {
			const largeAndSmall = [
				{ v: 1e100, d: 1e100 },
				{ v: 1e300, d: 1e300 },
				{ v: Number.MAX_VALUE, d: 1 },
				{ v: 1e-100, d: 1e-100 },
				{ v: 1e-300, d: 1e-300 },
				{ v: 2 ** -1022, d: 2 ** -1022 },
				{ v: Number.MIN_VALUE, d: Number.MIN_VALUE },
			];

			for (const { v, d } of largeAndSmall) {
				const res = log2DualIterative({ v, d });
				assertClose(res.v, Math.log2(v), 1e-14, `v at v=${v}`);
				const expectedD = v < 1 ? (d / v) / Math.LN2 : d / (v * Math.LN2);
				assertClose(res.d, expectedD, 1e-14, `d at v=${v}`);
			}

			// Exact power-of-two subnormal: Number.MIN_VALUE === 2^-1074
			const minRes = log2DualIterative({ v: Number.MIN_VALUE, d: Number.MIN_VALUE });
			assert.equal(minRes.v, -1074);
			assertClose(minRes.d, 1 / Math.LN2, 1e-14);
		});

		test('handles range-reduction boundaries and values near 1 accurately', () => {
			const boundaryValues = [
				Math.SQRT1_2,
				Math.SQRT2,
				2 ** 64,
				2 ** -64,
				2 ** 64 * 1.125,
				2 ** -64 * 0.875,
				1 + Number.EPSILON,
				1 - Number.EPSILON / 2,
				1 + 1e-12,
				1 - 1e-12,
			];

			for (const v of boundaryValues) {
				const res = log2DualIterative({ v, d: 1 });
				assertClose(res.v, Math.log2(v), 1e-14, `v at boundary ${v}`);
				assertClose(res.d, 1 / (v * Math.LN2), 1e-14, `d at boundary ${v}`);
			}
		});

		test('throws TypeError for non-dual or non-finite inputs', () => {
			const invalidInputs = [
				undefined,
				null,
				4,
				'2',
				true,
				[2, 1],
				{},
				{ v: 2 },
				{ d: 1 },
				{ v: '2', d: 1 },
				{ v: 2, d: '1' },
				{ v: null, d: 1 },
				{ v: 2, d: undefined },
				{ v: Number.NaN, d: 1 },
				{ v: 2, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 1 },
				{ v: Number.NEGATIVE_INFINITY, d: 1 },
				{ v: 2, d: Number.POSITIVE_INFINITY },
				{ v: 2, d: Number.NEGATIVE_INFINITY },
			];

			for (const bad of invalidInputs) {
				assert.throws(() => log2DualIterative(bad), TypeError);
			}
		});

		test('throws RangeError for non-positive primal values v <= 0', () => {
			const outOfDomain = [
				{ v: 0, d: 1 },
				{ v: -0, d: 0 },
				{ v: -1, d: 1 },
				{ v: -Number.MIN_VALUE, d: 1 },
				{ v: -1e100, d: -5 },
			];

			for (const bad of outOfDomain) {
				assert.throws(() => log2DualIterative(bad), RangeError);
			}
		});
	});

	describe('cross-checks against independent computations', () => {
		test('matches Math.log2 across a dense logarithmic sweep', () => {
			for (let exp = -250; exp <= 250; exp += 17) {
				for (const mult of [1.0, 1.13, 1.414, 1.732, 1.999]) {
					const v = mult * 2 ** exp;
					const res = log2DualIterative({ v, d: 1 });
					assertClose(res.v, Math.log2(v), 1e-14, `sweep v=${v}`);
				}
			}
		});

		test('matches central finite-difference numerical derivative', () => {
			const samples = [
				{ v: 0.15, d: 1.0 },
				{ v: 0.75, d: -2.3 },
				{ v: 1.0, d: 3.7 },
				{ v: 2.5, d: 1.0 },
				{ v: 9.8, d: -0.45 },
				{ v: 123.456, d: 5.5 },
			];

			for (const { v, d } of samples) {
				const h = Math.max(v * 1e-6, 1e-8);
				const numericDeriv = ((Math.log2(v + h) - Math.log2(v - h)) / (2 * h)) * d;
				const res = log2DualIterative({ v, d });
				assertClose(res.d, numericDeriv, 1e-8, `finite-diff at v=${v}, d=${d}`);
			}
		});

		test('satisfies dual-number product, quotient, and reciprocal log2 identities', () => {
			const a = { v: 3.25, d: 1.4 };
			const b = { v: 5.75, d: -0.9 };

			// Dual multiplication: (a.v * b.v, a.d * b.v + a.v * b.d)
			const prod = { v: a.v * b.v, d: a.d * b.v + a.v * b.d };
			// Dual division: (a.v / b.v, (a.d * b.v - a.v * b.d) / (b.v * b.v))
			const quot = { v: a.v / b.v, d: (a.d * b.v - a.v * b.d) / (b.v * b.v) };
			// Dual reciprocal: (1 / a.v, -a.d / (a.v * a.v))
			const recip = { v: 1 / a.v, d: -a.d / (a.v * a.v) };

			const logA = log2DualIterative(a);
			const logB = log2DualIterative(b);
			const logProd = log2DualIterative(prod);
			const logQuot = log2DualIterative(quot);
			const logRecip = log2DualIterative(recip);

			assertClose(logProd.v, logA.v + logB.v, 1e-14, 'product primal');
			assertClose(logProd.d, logA.d + logB.d, 1e-14, 'product derivative');

			assertClose(logQuot.v, logA.v - logB.v, 1e-14, 'quotient primal');
			assertClose(logQuot.d, logA.d - logB.d, 1e-14, 'quotient derivative');

			assertClose(logRecip.v, -logA.v, 1e-14, 'reciprocal primal');
			assertClose(logRecip.d, -logA.d, 1e-14, 'reciprocal derivative');
		});
	});
});
