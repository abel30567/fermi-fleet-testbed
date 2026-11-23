import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addDualIterative } from './addDualIterative.js';

describe('addDualIterative', () => {
	describe('normal cases', () => {
		it('adds two positive dual numbers component-wise', () => {
			assert.deepStrictEqual(
				addDualIterative({ v: 2, d: 1 }, { v: 3, d: 4 }),
				{ v: 5, d: 5 },
			);
		});

		it('adds dual numbers with negative and fractional components', () => {
			assert.deepStrictEqual(
				addDualIterative({ v: -2.5, d: 3.25 }, { v: 1.5, d: -7.75 }),
				{ v: -1, d: -4.5 },
			);
		});

		it('iteratively sums three or more dual numbers', () => {
			const result = addDualIterative(
				{ v: 1, d: 10 },
				{ v: 2, d: 20 },
				{ v: 3, d: 30 },
				{ v: -4, d: -5 },
			);
			assert.deepStrictEqual(result, { v: 2, d: 55 });
		});

		it('iteratively sums a large sequence of dual numbers accurately', () => {
			const count = 1000;
			const terms = Array.from({ length: count }, (_, i) => ({ v: i + 1, d: 2 * (i + 1) }));
			const expectedV = (count * (count + 1)) / 2;
			const expectedD = count * (count + 1);
			assert.deepStrictEqual(addDualIterative(...terms), { v: expectedV, d: expectedD });
		});

		it('satisfies algebraic laws (identity, inverse, commutativity, associativity)', () => {
			const a = { v: 3.5, d: -1.25 };
			const b = { v: -2.25, d: 4.5 };
			const c = { v: 1.75, d: 0.75 };
			const zero = { v: 0, d: 0 };

			// Additive identity
			assert.deepStrictEqual(addDualIterative(a, zero), a);
			assert.deepStrictEqual(addDualIterative(zero, a), a);

			// Additive inverse
			assert.deepStrictEqual(addDualIterative(a, { v: -a.v, d: -a.d }), zero);

			// Commutativity
			assert.deepStrictEqual(addDualIterative(a, b), addDualIterative(b, a));

			// Associativity (exact dyadic rationals)
			const leftAssoc = addDualIterative(addDualIterative(a, b), c);
			const rightAssoc = addDualIterative(a, addDualIterative(b, c));
			const variadic = addDualIterative(a, b, c);
			assert.deepStrictEqual(leftAssoc, rightAssoc);
			assert.deepStrictEqual(leftAssoc, variadic);
		});
	});

	describe('edge cases', () => {
		it('normalizes negative zero inputs to +0', () => {
			const result = addDualIterative({ v: -0, d: -0 }, { v: -0, d: -0 });
			assert.ok(Object.is(result.v, 0));
			assert.ok(Object.is(result.d, 0));
		});

		it('handles subnormal values and large cancelling magnitudes', () => {
			assert.deepStrictEqual(
				addDualIterative({ v: Number.MIN_VALUE, d: 0 }, { v: Number.MIN_VALUE, d: Number.MIN_VALUE }),
				{ v: 2 * Number.MIN_VALUE, d: Number.MIN_VALUE },
			);
			assert.deepStrictEqual(
				addDualIterative({ v: 1e308, d: -1e308 }, { v: -1e308, d: 1e308 }),
				{ v: 0, d: 0 },
			);
		});

		it('does not mutate inputs and returns a clean { v, d } object', () => {
			const a = Object.freeze({ v: 1, d: 2, extra: 'ignored' });
			const b = Object.freeze({ v: 3, d: 4, label: 'b' });
			const result = addDualIterative(a, b);
			assert.deepStrictEqual(result, { v: 4, d: 6 });
			assert.deepStrictEqual(Object.keys(result), ['v', 'd']);
			assert.notEqual(result, a);
			assert.notEqual(result, b);
		});
	});

	describe('input validation', () => {
		it('throws TypeError when fewer than two operands are provided', () => {
			assert.throws(() => addDualIterative(), TypeError);
			assert.throws(() => addDualIterative({ v: 1, d: 2 }), TypeError);
		});

		it('throws TypeError for non-object, null, or array operands', () => {
			const badValues = [null, undefined, 42, '1', true, [1, 2], () => ({ v: 1, d: 2 })];
			for (const bad of badValues) {
				assert.throws(() => addDualIterative(bad, { v: 1, d: 1 }), TypeError);
				assert.throws(() => addDualIterative({ v: 1, d: 1 }, bad), TypeError);
				assert.throws(() => addDualIterative({ v: 1, d: 1 }, { v: 2, d: 2 }, bad), TypeError);
			}
		});

		it('throws TypeError when v or d is missing or not a number', () => {
			const badDuals = [
				{},
				{ v: 1 },
				{ d: 1 },
				{ v: '1', d: 2 },
				{ v: 1, d: '2' },
				{ v: null, d: 0 },
				{ v: 0, d: undefined },
				{ v: 1n, d: 2 },
				{ v: true, d: false },
			];
			for (const bad of badDuals) {
				assert.throws(() => addDualIterative(bad, { v: 0, d: 0 }), TypeError);
				assert.throws(() => addDualIterative({ v: 0, d: 0 }, bad), TypeError);
			}
		});

		it('throws RangeError when any component is NaN or infinite', () => {
			const nonFiniteDuals = [
				{ v: Number.NaN, d: 0 },
				{ v: 0, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 0 },
				{ v: Number.NEGATIVE_INFINITY, d: 0 },
				{ v: 0, d: Number.POSITIVE_INFINITY },
				{ v: 0, d: Number.NEGATIVE_INFINITY },
			];
			for (const bad of nonFiniteDuals) {
				assert.throws(() => addDualIterative(bad, { v: 1, d: 1 }), RangeError);
				assert.throws(() => addDualIterative({ v: 1, d: 1 }, bad), RangeError);
				assert.throws(() => addDualIterative({ v: 1, d: 1 }, { v: 2, d: 2 }, bad), RangeError);
			}
		});

		it('throws RangeError when the accumulated sum overflows to Infinity', () => {
			assert.throws(
				() => addDualIterative({ v: Number.MAX_VALUE, d: 0 }, { v: Number.MAX_VALUE, d: 0 }),
				RangeError,
			);
			assert.throws(
				() => addDualIterative({ v: 0, d: -Number.MAX_VALUE }, { v: 0, d: -Number.MAX_VALUE }),
				RangeError,
			);
		});
	});

	describe('independent cross-checks', () => {
		it('matches central finite-difference derivatives for summed smooth functions', () => {
			// f(x) = g(x) + h(x) + k(x)
			// where g(x) = x^3, h(x) = sin(x), k(x) = exp(0.5 * x)
			const g = (x) => x ** 3;
			const gp = (x) => 3 * x ** 2;
			const h = (x) => Math.sin(x);
			const hp = (x) => Math.cos(x);
			const k = (x) => Math.exp(0.5 * x);
			const kp = (x) => 0.5 * Math.exp(0.5 * x);
			const f = (x) => g(x) + h(x) + k(x);

			const eps = 1e-6;
			const points = [-2.5, -0.75, 0, 1.25, 3.1];

			for (const x of points) {
				const dualSum = addDualIterative(
					{ v: g(x), d: gp(x) },
					{ v: h(x), d: hp(x) },
					{ v: k(x), d: kp(x) },
				);
				const finiteDiff = (f(x + eps) - f(x - eps)) / (2 * eps);

				assert.ok(
					Math.abs(dualSum.v - f(x)) < 1e-12,
					`value mismatch at x=${x}: got ${dualSum.v}, expected ${f(x)}`,
				);
				assert.ok(
					Math.abs(dualSum.d - finiteDiff) < 1e-8,
					`derivative mismatch at x=${x}: got ${dualSum.d}, finiteDiff=${finiteDiff}`,
				);
			}
		});

		it('matches 2x2 lower-triangular matrix representation of dual numbers', () => {
			// Dual number (v + d*ε) is isomorphic to [[v, 0], [d, v]] under addition.
			const toMatrix = ({ v, d }) => [
				[v, 0],
				[d, v],
			];
			const addMatrices = (m1, m2) => [
				[m1[0][0] + m2[0][0], m1[0][1] + m2[0][1]],
				[m1[1][0] + m2[1][0], m1[1][1] + m2[1][1]],
			];

			const a = { v: 7.25, d: -3.5 };
			const b = { v: -1.75, d: 6.25 };
			const dualSum = addDualIterative(a, b);
			const matSum = addMatrices(toMatrix(a), toMatrix(b));

			assert.deepStrictEqual(toMatrix(dualSum), matSum);
		});
	});
});
