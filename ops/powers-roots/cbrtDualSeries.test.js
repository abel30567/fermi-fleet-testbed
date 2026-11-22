import { describe, test } from 'node:test';
import assert from 'node:assert';
import { cbrtDualSeries } from './cbrtDualSeries.js';

/**
 * Helper to assert two numbers are close within a combined absolute/relative tolerance.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [relTol=1e-12]
 * @param {number} [absTol=1e-12]
 */
function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-12) {
	const diff = Math.abs(actual - expected);
	const bound = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)));
	assert.ok(
		diff <= bound,
		`expected ${actual} to be close to ${expected} (diff=${diff}, bound=${bound})`,
	);
}

/**
 * Independent dual multiplication helper: (a.v + a.d·ε)(b.v + b.d·ε).
 *
 * @param {{ v: number, d: number }} a
 * @param {{ v: number, d: number }} b
 * @returns {{ v: number, d: number }}
 */
function dualMul(a, b) {
	return {
		v: a.v * b.v,
		d: a.v * b.d + a.d * b.v,
	};
}

/**
 * Independent dual cube helper: y³ via two dual multiplications.
 *
 * @param {{ v: number, d: number }} y
 * @returns {{ v: number, d: number }}
 */
function dualCube(y) {
	return dualMul(dualMul(y, y), y);
}

describe('cbrtDualSeries', () => {
	test('computes exact values and derivatives for positive perfect cubes', () => {
		const res1 = cbrtDualSeries({ v: 1, d: 1 });
		assertClose(res1.v, 1);
		assertClose(res1.d, 1 / 3);

		const res8 = cbrtDualSeries({ v: 8, d: 1 });
		assertClose(res8.v, 2);
		assertClose(res8.d, 1 / 12);

		const res27 = cbrtDualSeries({ v: 27, d: 6 });
		assertClose(res27.v, 3);
		assertClose(res27.d, 6 / 27);

		const resFrac = cbrtDualSeries({ v: 0.125, d: -3 });
		assertClose(resFrac.v, 0.5);
		assertClose(resFrac.d, -4);
	});

	test('computes values and derivatives cleanly for negative primal values', () => {
		const resNeg1 = cbrtDualSeries({ v: -1, d: 1 });
		assertClose(resNeg1.v, -1);
		assertClose(resNeg1.d, 1 / 3);

		const resNeg8 = cbrtDualSeries({ v: -8, d: 1 });
		assertClose(resNeg8.v, -2);
		assertClose(resNeg8.d, 1 / 12);

		const resNeg27 = cbrtDualSeries({ v: -27, d: -9 });
		assertClose(resNeg27.v, -3);
		assertClose(resNeg27.d, -1 / 3);
	});

	test('handles zero derivative cleanly without -0 artifacts', () => {
		const pos = cbrtDualSeries({ v: 8, d: 0 });
		assert.strictEqual(pos.v, 2);
		assert.strictEqual(Object.is(pos.d, 0), true);

		const neg = cbrtDualSeries({ v: -8, d: -0 });
		assert.strictEqual(neg.v, -2);
		assert.strictEqual(Object.is(neg.d, 0), true);
	});

	test('handles v === 0 edge cases', () => {
		const zero = cbrtDualSeries({ v: 0, d: 0 });
		assert.deepStrictEqual(zero, { v: 0, d: 0 });
		assert.strictEqual(Object.is(zero.v, 0), true);
		assert.strictEqual(Object.is(zero.d, 0), true);

		const negZero = cbrtDualSeries({ v: -0, d: -0 });
		assert.deepStrictEqual(negZero, { v: 0, d: 0 });

		assert.throws(() => cbrtDualSeries({ v: 0, d: 1 }), RangeError);
		assert.throws(() => cbrtDualSeries({ v: 0, d: -1e-12 }), RangeError);
		assert.throws(() => cbrtDualSeries({ v: -0, d: 2 }), RangeError);
	});

	test('handles very large and very small finite inputs', () => {
		const large = cbrtDualSeries({ v: 1e150, d: 1e100 });
		assertClose(large.v, 1e50, 1e-14);
		assertClose(large.d, 1 / 3, 1e-14);

		const small = cbrtDualSeries({ v: -1e-150, d: 3e-100 });
		assertClose(small.v, -1e-50, 1e-14);
		assertClose(small.d, 1, 1e-14);

		// Extreme tiny v with huge d causing derivative overflow to Infinity
		assert.throws(
			() => cbrtDualSeries({ v: Number.MIN_VALUE, d: 1e200 }),
			RangeError,
		);
	});

	test('validates inputs strictly', () => {
		for (const bad of [null, undefined, 8, '8', true, [8, 1]]) {
			assert.throws(() => cbrtDualSeries(bad), TypeError);
		}

		for (const bad of [
			{},
			{ v: 8 },
			{ d: 1 },
			{ v: '8', d: 1 },
			{ v: 8, d: '1' },
			{ v: 8, d: null },
			{ v: undefined, d: 1 },
		]) {
			assert.throws(() => cbrtDualSeries(bad), TypeError);
		}

		for (const bad of [
			{ v: Number.NaN, d: 1 },
			{ v: 8, d: Number.NaN },
			{ v: Number.POSITIVE_INFINITY, d: 1 },
			{ v: Number.NEGATIVE_INFINITY, d: 1 },
			{ v: 8, d: Number.POSITIVE_INFINITY },
			{ v: 8, d: Number.NEGATIVE_INFINITY },
		]) {
			assert.throws(() => cbrtDualSeries(bad), RangeError);
		}
	});

	test('cross-check: cubing the dual result recovers the input dual number', () => {
		const cases = [
			{ v: 2, d: 1 },
			{ v: 17.5, d: -3.25 },
			{ v: -5.4, d: 2.1 },
			{ v: -0.0042, d: -0.75 },
			{ v: 1e9, d: 42.5 },
			{ v: -1e-6, d: 1e-4 },
		];

		for (const input of cases) {
			const root = cbrtDualSeries(input);
			const cubed = dualCube(root);
			assertClose(cubed.v, input.v, 1e-12, 1e-12);
			assertClose(cubed.d, input.d, 1e-12, 1e-12);
		}
	});

	test('cross-check: forward-mode derivative matches central finite difference', () => {
		const cases = [
			{ v: 3.5, d: 1 },
			{ v: 12.25, d: -2.5 },
			{ v: -4.75, d: 1.75 },
			{ v: -0.25, d: -0.5 },
			{ v: 100, d: 7 },
		];
		const h = 1e-6;

		for (const input of cases) {
			const { v, d } = input;
			const result = cbrtDualSeries(input);
			const fd = (Math.cbrt(v + h * d) - Math.cbrt(v - h * d)) / (2 * h);
			assertClose(result.d, fd, 1e-7, 1e-9);
		}
	});

	test('cross-check: chain rule composition with g(t) = t² - 5', () => {
		const tValues = [-3, -1.5, 0.5, 2.5, 4];
		const h = 1e-6;

		for (const t of tValues) {
			const g = { v: t * t - 5, d: 2 * t };
			const composed = cbrtDualSeries(g);
			const expectedV = Math.cbrt(t * t - 5);
			const fd =
				(Math.cbrt((t + h) ** 2 - 5) - Math.cbrt((t - h) ** 2 - 5)) / (2 * h);

			assertClose(composed.v, expectedV, 1e-12);
			assertClose(composed.d, fd, 1e-7, 1e-9);
		}
	});
});
