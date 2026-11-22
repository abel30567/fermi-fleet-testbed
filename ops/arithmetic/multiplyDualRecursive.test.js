import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { multiplyDualRecursive } from './multiplyDualRecursive.js';

describe('multiplyDualRecursive', () => {
	describe('binary multiplication', () => {
		it('multiplies two standard dual numbers using the product rule', () => {
			const result = multiplyDualRecursive({ v: 3, d: 2 }, { v: 5, d: 7 });
			assert.deepStrictEqual(result, { v: 15, d: 31 });
		});

		it('handles constants (zero derivative)', () => {
			assert.deepStrictEqual(
				multiplyDualRecursive({ v: 4, d: 0 }, { v: 6, d: 3 }),
				{ v: 24, d: 12 },
			);
			assert.deepStrictEqual(
				multiplyDualRecursive({ v: 4, d: 0 }, { v: 6, d: 0 }),
				{ v: 24, d: 0 },
			);
		});

		it('preserves multiplicative identity { v: 1, d: 0 }', () => {
			const a = { v: -7.5, d: 4.25 };
			const one = { v: 1, d: 0 };
			assert.deepStrictEqual(multiplyDualRecursive(a, one), { v: -7.5, d: 4.25 });
			assert.deepStrictEqual(multiplyDualRecursive(one, a), { v: -7.5, d: 4.25 });
		});

		it('handles zeros and normalizes -0 to 0', () => {
			const zero = { v: 0, d: 0 };
			const neg = { v: -5, d: -2 };
			const r1 = multiplyDualRecursive(zero, neg);
			assert.deepStrictEqual(r1, { v: 0, d: 0 });
			assert.equal(Object.is(r1.v, 0), true);
			assert.equal(Object.is(r1.d, 0), true);

			const r2 = multiplyDualRecursive({ v: 0, d: 3 }, { v: -4, d: 9 });
			assert.deepStrictEqual(r2, { v: 0, d: -12 });
			assert.equal(Object.is(r2.v, 0), true);
		});

		it('satisfies ε² = 0 for pure dual numbers', () => {
			const r = multiplyDualRecursive({ v: 0, d: 4 }, { v: 0, d: -9 });
			assert.deepStrictEqual(r, { v: 0, d: 0 });
		});

		it('handles negative values and derivatives', () => {
			const r = multiplyDualRecursive({ v: -3, d: -4 }, { v: -2, d: 5 });
			// v = (-3)*(-2) = 6, d = (-3)*5 + (-4)*(-2) = -15 + 8 = -7
			assert.deepStrictEqual(r, { v: 6, d: -7 });
		});

		it('avoids ε² cancellation when primal and dual magnitudes differ widely', () => {
			const a = { v: 1e12, d: 1 };
			const b = { v: 1, d: 1e-12 };
			const r = multiplyDualRecursive(a, b);
			// v = 1e12, d = 1e12 * 1e-12 + 1 * 1 = 2
			assert.equal(r.v, 1e12);
			assert.equal(r.d, 2);
		});
	});

	describe('multi-factor recursive divide-and-conquer products', () => {
		it('returns multiplicative identity { v: 1, d: 0 } for empty array', () => {
			assert.deepStrictEqual(multiplyDualRecursive([]), { v: 1, d: 0 });
		});

		it('returns a fresh copy for single dual argument or single-element array', () => {
			const input = { v: 3, d: -1 };
			const r1 = multiplyDualRecursive(input);
			const r2 = multiplyDualRecursive([input]);
			assert.deepStrictEqual(r1, { v: 3, d: -1 });
			assert.deepStrictEqual(r2, { v: 3, d: -1 });
			assert.notEqual(r1, input);
			assert.notEqual(r2, input);
		});

		it('computes d/dx(x^n) = n * x^(n-1) across odd and even factor counts', () => {
			const x = 2.5;
			for (const n of [1, 2, 3, 4, 5, 7, 8, 9, 13]) {
				const factors = Array.from({ length: n }, () => ({ v: x, d: 1 }));
				const fromArray = multiplyDualRecursive(factors);
				const fromVariadic = multiplyDualRecursive(...factors);
				const expectedV = x ** n;
				const expectedD = n * x ** (n - 1);

				assert.ok(Math.abs(fromArray.v - expectedV) <= 1e-9 * Math.abs(expectedV));
				assert.ok(Math.abs(fromArray.d - expectedD) <= 1e-9 * Math.abs(expectedD));
				assert.deepStrictEqual(fromVariadic, fromArray);
			}
		});

		it('satisfies generalized product rule for polynomial (x + 1)(x + 2)(x + 3)(x + 4)(x + 5)', () => {
			// P(x) = (x+1)(x+2)(x+3)(x+4)(x+5)
			// At x = 2: values are 3, 4, 5, 6, 7 -> P(2) = 2520
			// P'(2) = 2520 * (1/3 + 1/4 + 1/5 + 1/6 + 1/7) = 840 + 630 + 504 + 420 + 360 = 2754
			const x = 2;
			const factors = [1, 2, 3, 4, 5].map((c) => ({ v: x + c, d: 1 }));
			const r = multiplyDualRecursive(factors);
			assert.deepStrictEqual(r, { v: 2520, d: 2754 });
		});

		it('is commutative across factor permutations', () => {
			const a = { v: 2, d: 3 };
			const b = { v: -5, d: 1 };
			const c = { v: 7, d: -4 };
			const d = { v: 11, d: 2 };
			const e = { v: -13, d: 6 };

			const r1 = multiplyDualRecursive(a, b, c, d, e);
			const r2 = multiplyDualRecursive(e, c, a, d, b);
			assert.deepStrictEqual(r1, r2);
		});
	});

	describe('finite-difference cross-checks', () => {
		it('matches central finite differences for f(x) = g(x) * h(x)', () => {
			const g = (x) => Math.sin(x) + x * x;
			const dg = (x) => Math.cos(x) + 2 * x;
			const h = (x) => Math.exp(0.5 * x) * Math.cos(x);
			const dh = (x) => Math.exp(0.5 * x) * (0.5 * Math.cos(x) - Math.sin(x));
			const f = (x) => g(x) * h(x);

			const eps = 1e-6;
			for (const x of [-1.7, -0.3, 0, 0.85, 2.4]) {
				const dual = multiplyDualRecursive(
					{ v: g(x), d: dg(x) },
					{ v: h(x), d: dh(x) },
				);
				const fd = (f(x + eps) - f(x - eps)) / (2 * eps);

				assert.ok(
					Math.abs(dual.v - f(x)) < 1e-12,
					`value mismatch at x=${x}: dual=${dual.v}, exact=${f(x)}`,
				);
				assert.ok(
					Math.abs(dual.d - fd) < 1e-7 * (1 + Math.abs(fd)),
					`derivative mismatch at x=${x}: dual=${dual.d}, fd=${fd}`,
				);
			}
		});

		it('matches central finite differences for 5-factor nonlinear product F(x)', () => {
			const fns = [
				{ f: (x) => Math.sin(x) + 2, df: (x) => Math.cos(x) },
				{ f: (x) => Math.cos(0.5 * x) + 1.5, df: (x) => -0.5 * Math.sin(0.5 * x) },
				{ f: (x) => Math.exp(0.25 * x), df: (x) => 0.25 * Math.exp(0.25 * x) },
				{ f: (x) => x * x - x + 3, df: (x) => 2 * x - 1 },
				{ f: (x) => Math.log(x * x + 2), df: (x) => (2 * x) / (x * x + 2) },
			];
			const prod = (x) => fns.reduce((acc, item) => acc * item.f(x), 1);

			const eps = 1e-6;
			for (const x of [-1.2, 0.4, 1.9]) {
				const duals = fns.map(({ f, df }) => ({ v: f(x), d: df(x) }));
				const result = multiplyDualRecursive(duals);
				const fd = (prod(x + eps) - prod(x - eps)) / (2 * eps);

				assert.ok(Math.abs(result.v - prod(x)) < 1e-11 * (1 + Math.abs(prod(x))));
				assert.ok(Math.abs(result.d - fd) < 1e-6 * (1 + Math.abs(fd)));
			}
		});
	});

	describe('input validation', () => {
		it('throws TypeError when called with no arguments', () => {
			assert.throws(() => multiplyDualRecursive(), TypeError);
		});

		it('throws TypeError when array is mixed with extra arguments', () => {
			assert.throws(
				() => multiplyDualRecursive([{ v: 1, d: 0 }], { v: 2, d: 0 }),
				TypeError,
			);
		});

		it('throws TypeError for non-object or malformed dual inputs', () => {
			const badInputs = [
				null,
				undefined,
				42,
				'1+2e',
				true,
				{},
				{ v: 1 },
				{ d: 1 },
				{ v: '1', d: 0 },
				{ v: 1, d: null },
				[{ v: 1, d: 0 }],
			];

			for (const bad of badInputs) {
				assert.throws(
					() => multiplyDualRecursive({ v: 1, d: 0 }, bad),
					TypeError,
					`expected TypeError for second arg: ${String(bad)}`,
				);
				assert.throws(
					() => multiplyDualRecursive([{ v: 1, d: 0 }, bad]),
					TypeError,
					`expected TypeError inside array: ${String(bad)}`,
				);
			}
		});

		it('throws RangeError for non-finite v or d values', () => {
			const nonFinite = [
				{ v: Number.NaN, d: 0 },
				{ v: 0, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 1 },
				{ v: 1, d: Number.NEGATIVE_INFINITY },
			];

			for (const bad of nonFinite) {
				assert.throws(() => multiplyDualRecursive(bad, { v: 1, d: 0 }), RangeError);
				assert.throws(() => multiplyDualRecursive([{ v: 1, d: 0 }, bad]), RangeError);
			}
		});
	});
});
