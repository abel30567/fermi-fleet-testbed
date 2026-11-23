import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { powerDualIterative } from './powerDualIterative.js';

/**
 * Asserts two dual numbers are close within a relative/absolute tolerance.
 *
 * @param {{ v: number, d: number }} actual
 * @param {{ v: number, d: number }} expected
 * @param {number} [tol=1e-12]
 */
function assertDualClose(actual, expected, tol = 1e-12) {
	const vScale = Math.max(1, Math.abs(expected.v));
	const dScale = Math.max(1, Math.abs(expected.d));
	assert.ok(
		Math.abs(actual.v - expected.v) <= tol * vScale,
		`expected v ≈ ${expected.v}, got ${actual.v}`
	);
	assert.ok(
		Math.abs(actual.d - expected.d) <= tol * dScale,
		`expected d ≈ ${expected.d}, got ${actual.d}`
	);
}

describe('powerDualIterative', () => {
	describe('normal cases', () => {
		it('computes positive integer powers with unit and non-unit derivatives', () => {
			assert.deepStrictEqual(powerDualIterative({ v: 2, d: 1 }, 3), {
				v: 8,
				d: 12,
			});
			assert.deepStrictEqual(powerDualIterative({ v: 3, d: 2 }, 4), {
				v: 81,
				d: 216,
			});
			assertDualClose(powerDualIterative({ v: 1.5, d: 0.5 }, 5), {
				v: 1.5 ** 5,
				d: 5 * 1.5 ** 4 * 0.5,
			});
		});

		it('handles negative bases with even and odd exponents', () => {
			assert.deepStrictEqual(powerDualIterative({ v: -2, d: 3 }, 2), {
				v: 4,
				d: -12,
			});
			assert.deepStrictEqual(powerDualIterative({ v: -2, d: 3 }, 3), {
				v: -8,
				d: 36,
			});
			assert.deepStrictEqual(powerDualIterative({ v: -2, d: 1 }, 5), {
				v: -32,
				d: 80,
			});
		});

		it('computes negative integer powers accurately', () => {
			assertDualClose(powerDualIterative({ v: 2, d: 1 }, -1), {
				v: 0.5,
				d: -0.25,
			});
			assertDualClose(powerDualIterative({ v: 2, d: 1 }, -3), {
				v: 0.125,
				d: -0.1875,
			});
			assertDualClose(powerDualIterative({ v: -4, d: 2 }, -2), {
				v: 1 / 16,
				d: 1 / 16,
			});
			assertDualClose(powerDualIterative({ v: 3, d: -1.5 }, -4), {
				v: 3 ** -4,
				d: -4 * 3 ** -5 * -1.5,
			});
		});

		it('supports dual number exponents with zero and non-zero derivatives', () => {
			assert.deepStrictEqual(
				powerDualIterative({ v: 2, d: 1 }, { v: 3, d: 0 }),
				{ v: 8, d: 12 }
			);
			assert.deepStrictEqual(
				powerDualIterative({ v: -2, d: 3 }, { v: 3, d: 0 }),
				{ v: -8, d: 36 }
			);

			// f(x) = x^x at x = 2 => v = 4, d = 4 * (1 + ln(2))
			assertDualClose(powerDualIterative({ v: 2, d: 1 }, { v: 2, d: 1 }), {
				v: 4,
				d: 4 * (1 + Math.log(2)),
			});

			// f(t) = (2 + t)^(3 + 2t) at t = 0 => v = 8, d = 12 + 16*ln(2)
			assertDualClose(powerDualIterative({ v: 2, d: 1 }, { v: 3, d: 2 }), {
				v: 8,
				d: 12 + 16 * Math.log(2),
			});

			// f(t) = (2 + t)^(-2 + 3t) at t = 0 => v = 0.25, d = -0.25 + 0.75*ln(2)
			assertDualClose(powerDualIterative({ v: 2, d: 1 }, { v: -2, d: 3 }), {
				v: 0.25,
				d: -0.25 + 0.75 * Math.log(2),
			});
		});

		it('satisfies algebraic power laws over dual numbers', () => {
			const x = { v: 1.7, d: -0.4 };
			const xm = powerDualIterative(x, 3);
			const xn = powerDualIterative(x, 4);
			const product = {
				v: xm.v * xn.v,
				d: xm.v * xn.d + xm.d * xn.v,
			};
			assertDualClose(powerDualIterative(x, 7), product, 1e-11);

			// (x^3)^2 === x^6
			assertDualClose(
				powerDualIterative(xm, 2),
				powerDualIterative(x, 6),
				1e-11
			);

			// x^4 * x^-4 === 1 + 0ε
			const xNeg = powerDualIterative(x, -4);
			const identity = {
				v: xn.v * xNeg.v,
				d: xn.v * xNeg.d + xn.d * xNeg.v,
			};
			assertDualClose(identity, { v: 1, d: 0 }, 1e-11);
		});
	});

	describe('edge cases', () => {
		it('handles exponent 0 for positive, negative, and zero bases', () => {
			assert.deepStrictEqual(powerDualIterative({ v: 5, d: 3 }, 0), {
				v: 1,
				d: 0,
			});
			assert.deepStrictEqual(powerDualIterative({ v: -5, d: 3 }, 0), {
				v: 1,
				d: 0,
			});
			assert.deepStrictEqual(powerDualIterative({ v: 0, d: 7 }, 0), {
				v: 1,
				d: 0,
			});
			assert.deepStrictEqual(powerDualIterative({ v: 2, d: 1 }, -0), {
				v: 1,
				d: 0,
			});
			// Dual exponent { v: 0, d: 2 }: f(t) = (3 + t)^(2t) => f(0)=1, f'(0)=2*ln(3)
			assertDualClose(powerDualIterative({ v: 3, d: 1 }, { v: 0, d: 2 }), {
				v: 1,
				d: 2 * Math.log(3),
			});
		});

		it('handles exponent 1 without aliasing input and normalizes -0', () => {
			const input = { v: -0, d: -0 };
			const out = powerDualIterative(input, 1);
			assert.notStrictEqual(out, input);
			assert.deepStrictEqual(out, { v: 0, d: 0 });
			assert.ok(Object.is(out.v, 0));
			assert.ok(Object.is(out.d, 0));
		});

		it('handles zero base with positive exponents', () => {
			assert.deepStrictEqual(powerDualIterative({ v: 0, d: 5 }, 1), {
				v: 0,
				d: 5,
			});
			assert.deepStrictEqual(powerDualIterative({ v: 0, d: 5 }, 2), {
				v: 0,
				d: 0,
			});
			assert.deepStrictEqual(powerDualIterative({ v: 0, d: -5 }, 3), {
				v: 0,
				d: 0,
			});
			assert.deepStrictEqual(powerDualIterative({ v: 0, d: 0 }, 100000), {
				v: 0,
				d: 0,
			});
		});

		it('handles constant dual numbers (d = 0) and unit base (v = 1)', () => {
			const negConst = powerDualIterative({ v: -3, d: 0 }, 2);
			assert.deepStrictEqual(negConst, { v: 9, d: 0 });
			assert.ok(Object.is(negConst.d, 0));

			assertDualClose(powerDualIterative({ v: 1, d: 0.25 }, 100), {
				v: 1,
				d: 25,
			});
			assertDualClose(powerDualIterative({ v: 1, d: 0.25 }, -100), {
				v: 1,
				d: -25,
			});
		});

		it('gracefully underflows to { v: 0, d: 0 } without error', () => {
			assert.deepStrictEqual(powerDualIterative({ v: 0.5, d: 1 }, 2000), {
				v: 0,
				d: 0,
			});
			assert.deepStrictEqual(powerDualIterative({ v: 10, d: 1 }, -400), {
				v: 0,
				d: 0,
			});
		});

		it('avoids premature v*v overflow in reciprocal for large bases', () => {
			assertDualClose(powerDualIterative({ v: 1e200, d: 1e200 }, -1), {
				v: 1e-200,
				d: -1e-200,
			});
		});
	});

	describe('input validation and domain errors', () => {
		it('throws TypeError for invalid base types or missing fields', () => {
			for (const badBase of [
				null,
				undefined,
				42,
				'dual',
				[2, 1],
				{},
				{ v: 2 },
				{ d: 1 },
				{ v: '2', d: 1 },
				{ v: 2, d: null },
			]) {
				assert.throws(() => powerDualIterative(badBase, 2), TypeError);
			}
		});

		it('throws RangeError for non-finite base components', () => {
			for (const badBase of [
				{ v: NaN, d: 1 },
				{ v: 2, d: NaN },
				{ v: Infinity, d: 1 },
				{ v: 2, d: -Infinity },
			]) {
				assert.throws(() => powerDualIterative(badBase, 2), RangeError);
			}
		});

		it('throws TypeError for invalid exponent types', () => {
			for (const badExp of [
				null,
				undefined,
				'3',
				true,
				[3, 0],
				{},
				{ v: 3 },
				{ v: '3', d: 0 },
			]) {
				assert.throws(
					() => powerDualIterative({ v: 2, d: 1 }, badExp),
					TypeError
				);
			}
		});

		it('throws RangeError for non-integer, non-finite, or out-of-bound exponents', () => {
			for (const badExp of [
				NaN,
				Infinity,
				-Infinity,
				2.5,
				-0.1,
				1_000_001,
				-1_000_001,
				{ v: 2.5, d: 0 },
				{ v: Infinity, d: 0 },
				{ v: 2, d: NaN },
				{ v: 2, d: Infinity },
				{ v: 1_000_001, d: 0 },
			]) {
				assert.throws(
					() => powerDualIterative({ v: 2, d: 1 }, badExp),
					RangeError
				);
			}
		});

		it('throws RangeError for zero base with negative exponent', () => {
			assert.throws(() => powerDualIterative({ v: 0, d: 1 }, -1), RangeError);
			assert.throws(() => powerDualIterative({ v: 0, d: 0 }, -5), RangeError);
			assert.throws(
				() => powerDualIterative({ v: 0, d: 1 }, { v: -2, d: 0 }),
				RangeError
			);
		});

		it('throws RangeError when exponent has non-zero derivative and base.v <= 0', () => {
			assert.throws(
				() => powerDualIterative({ v: 0, d: 1 }, { v: 2, d: 1 }),
				RangeError
			);
			assert.throws(
				() => powerDualIterative({ v: -2, d: 1 }, { v: 2, d: 1 }),
				RangeError
			);
		});

		it('throws RangeError on floating-point overflow', () => {
			assert.throws(
				() => powerDualIterative({ v: 10, d: 1 }, 400),
				RangeError
			);
			assert.throws(
				() => powerDualIterative({ v: 1e-200, d: 1 }, -1),
				RangeError
			);
		});
	});

	describe('independent cross-checks', () => {
		it('matches central finite-difference derivatives for scalar integer exponents', () => {
			const h = 1e-6;
			const cases = [
				{ v: 2.3, d: 1.0, n: 4 },
				{ v: 1.25, d: -0.7, n: 7 },
				{ v: -1.8, d: 0.6, n: 3 },
				{ v: -2.5, d: -1.2, n: 4 },
				{ v: 3.1, d: 0.9, n: -3 },
				{ v: -1.6, d: 0.4, n: -2 },
				{ v: 4.2, d: 2.5, n: 0 },
				{ v: 0.75, d: 1.3, n: 5 },
			];

			for (const { v, d, n } of cases) {
				const f = (t) => (v + d * t) ** n;
				const fdDeriv = (f(h) - f(-h)) / (2 * h);
				const res = powerDualIterative({ v, d }, n);

				assertDualClose(res, { v: v ** n, d: fdDeriv }, 1e-6);
			}
		});

		it('matches central finite-difference derivatives for dual exponents', () => {
			const h = 1e-6;
			const cases = [
				{ base: { v: 2.4, d: 0.8 }, exp: { v: 3, d: 1.5 } },
				{ base: { v: 1.5, d: -0.5 }, exp: { v: -2, d: 0.9 } },
				{ base: { v: 3.2, d: 1.1 }, exp: { v: 0, d: -0.7 } },
				{ base: { v: 0.8, d: 0.3 }, exp: { v: 4, d: -1.2 } },
			];

			for (const { base, exp } of cases) {
				const f = (t) => (base.v + base.d * t) ** (exp.v + exp.d * t);
				const fdDeriv = (f(h) - f(-h)) / (2 * h);
				const res = powerDualIterative(base, exp);

				assertDualClose(res, { v: base.v ** exp.v, d: fdDeriv }, 1e-6);
			}
		});

		it('matches closed-form analytic power rule across positive and negative exponents', () => {
			const bases = [
				{ v: 0.5, d: 1.2 },
				{ v: 2.7, d: -0.3 },
				{ v: -1.4, d: 0.8 },
			];
			const exponents = [-5, -3, -1, 0, 1, 2, 4, 8];

			for (const base of bases) {
				for (const n of exponents) {
					const expectedV = base.v ** n;
					const expectedD = n === 0 ? 0 : n * base.v ** (n - 1) * base.d;
					assertDualClose(
						powerDualIterative(base, n),
						{ v: expectedV, d: expectedD },
						1e-11
					);
				}
			}
		});
	});
});
