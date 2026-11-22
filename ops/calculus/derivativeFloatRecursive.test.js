import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { derivativeFloatRecursive } from './derivativeFloatRecursive.js';

function assertClose(actual, expected, tol = 1e-9, message = '') {
	const diff = Math.abs(actual - expected);
	const scale = Math.max(1, Math.abs(expected));
	assert.ok(
		diff <= tol * scale,
		`${message ? `${message}: ` : ''}expected ${actual} to be within ${tol * scale} of ${expected} (diff=${diff})`,
	);
}

describe('derivativeFloatRecursive', () => {
	describe('normal cases', () => {
		it('differentiates polynomials accurately', () => {
			// f(x) = 3x^4 - 2x^3 + 5x^2 - 7x + 11
			// f'(x) = 12x^3 - 6x^2 + 10x - 7
			const f = (x) => 3 * x ** 4 - 2 * x ** 3 + 5 * x ** 2 - 7 * x + 11;
			const df = (x) => 12 * x ** 3 - 6 * x ** 2 + 10 * x - 7;

			for (const x of [-3.5, -1, 0, 0.25, 2, 7.5]) {
				assertClose(derivativeFloatRecursive(f, x), df(x), 1e-9, `poly at x=${x}`);
			}
		});

		it('differentiates trigonometric functions (sin and cos)', () => {
			for (const x of [-Math.PI, -1.23, 0, Math.PI / 6, Math.PI / 2, 2.71]) {
				assertClose(derivativeFloatRecursive(Math.sin, x), Math.cos(x), 1e-10, `sin at x=${x}`);
				assertClose(derivativeFloatRecursive(Math.cos, x), -Math.sin(x), 1e-10, `cos at x=${x}`);
			}
		});

		it('differentiates exponential function exp(x)', () => {
			for (const x of [-5, -1, 0, 1, 3.5]) {
				assertClose(derivativeFloatRecursive(Math.exp, x), Math.exp(x), 1e-10, `exp at x=${x}`);
			}
		});

		it('differentiates natural logarithm ln(x)', () => {
			for (const x of [1e-4, 0.05, 0.5, 1, Math.E, 100]) {
				assertClose(derivativeFloatRecursive(Math.log, x), 1 / x, 1e-9, `ln at x=${x}`);
			}
		});

		it('respects custom step, tolerance, and maxDepth options', () => {
			const result = derivativeFloatRecursive(Math.sin, 1.0, {
				step: 0.1,
				tolerance: 1e-12,
				maxDepth: 15,
			});
			assertClose(result, Math.cos(1.0), 1e-11);

			// Shallow maxDepth still returns a valid finite approximation.
			const shallow = derivativeFloatRecursive((x) => x ** 3, 2, {
				step: 1e-2,
				maxDepth: 1,
			});
			assertClose(shallow, 12, 1e-10);
		});
	});

	describe('edge cases', () => {
		it('returns 0 (positive zero) for constant functions', () => {
			for (const c of [0, 42, -1e8]) {
				const d = derivativeFloatRecursive(() => c, 3.14);
				assert.equal(d, 0);
				assert.ok(!Object.is(d, -0), 'should normalize -0 to +0');
			}
		});

		it('differentiates linear functions exactly within float64 precision', () => {
			const f = (x) => -4.75 * x + 19.2;
			for (const x of [-1000, 0, 1000]) {
				assertClose(derivativeFloatRecursive(f, x), -4.75, 1e-10, `linear at x=${x}`);
			}
		});

		it('handles negative and large x values accurately', () => {
			assertClose(derivativeFloatRecursive((x) => x * x, -1e6), -2e6, 1e-7, 'x^2 at -1e6');
			assertClose(derivativeFloatRecursive((x) => x * x, 1e6), 2e6, 1e-7, 'x^2 at 1e6');
			assertClose(derivativeFloatRecursive(Math.sin, 1e6), Math.cos(1e6), 1e-7, 'sin at 1e6');
			assertClose(derivativeFloatRecursive(Math.sin, -1e5), Math.cos(-1e5), 1e-8, 'sin at -1e5');
		});

		it('handles evaluation at very small nonzero x', () => {
			assertClose(derivativeFloatRecursive((x) => x ** 3 + 2 * x, 1e-8), 2, 1e-10);
			assertClose(derivativeFloatRecursive(Math.log, 1e-6), 1e6, 1e-8);
		});
	});

	describe('analytical cross-checks', () => {
		it('satisfies d/dx sin(x) == cos(x) and d/dx exp(x) == exp(x) across a grid', () => {
			const points = [-4, -2.5, -0.7, 0, 0.7, 1.5, 3.2];
			for (const x of points) {
				assertClose(derivativeFloatRecursive(Math.sin, x), Math.cos(x), 1e-10);
				assertClose(derivativeFloatRecursive(Math.exp, x), Math.exp(x), 1e-10);
			}
		});

		it('satisfies the product rule (fg)\' = f\'g + fg\'', () => {
			const f = (x) => Math.exp(0.5 * x);
			const g = (x) => Math.sin(2 * x) + x * x;
			const fg = (x) => f(x) * g(x);

			for (const x of [-2, -0.5, 0, 0.8, 2.3]) {
				const lhs = derivativeFloatRecursive(fg, x);
				const rhs =
					derivativeFloatRecursive(f, x) * g(x) +
					f(x) * derivativeFloatRecursive(g, x);
				assertClose(lhs, rhs, 1e-9, `product rule at x=${x}`);
			}
		});

		it('satisfies the chain rule (f(g(x)))\' = f\'(g(x)) * g\'(x)', () => {
			const f = (u) => Math.log(u);
			const g = (x) => x * x + 1;
			const fog = (x) => f(g(x));

			for (const x of [-3, -0.4, 0, 1.2, 4]) {
				const lhs = derivativeFloatRecursive(fog, x);
				const rhs = derivativeFloatRecursive(f, g(x)) * derivativeFloatRecursive(g, x);
				const analytical = (2 * x) / (x * x + 1);
				assertClose(lhs, rhs, 1e-9, `chain rule numeric at x=${x}`);
				assertClose(lhs, analytical, 1e-9, `chain rule analytical at x=${x}`);
			}
		});
	});

	describe('input validation', () => {
		it('rejects non-function f', () => {
			for (const bad of [null, undefined, 42, 'x => x', {}]) {
				assert.throws(() => derivativeFloatRecursive(bad, 1), TypeError);
			}
		});

		it('rejects non-number or non-finite x', () => {
			assert.throws(() => derivativeFloatRecursive(Math.sin, '1'), TypeError);
			assert.throws(() => derivativeFloatRecursive(Math.sin, null), TypeError);
			assert.throws(() => derivativeFloatRecursive(Math.sin, NaN), RangeError);
			assert.throws(() => derivativeFloatRecursive(Math.sin, Infinity), RangeError);
			assert.throws(() => derivativeFloatRecursive(Math.sin, -Infinity), RangeError);
		});

		it('rejects invalid options', () => {
			assert.throws(() => derivativeFloatRecursive(Math.sin, 1, null), TypeError);
			assert.throws(() => derivativeFloatRecursive(Math.sin, 1, []), TypeError);
			assert.throws(() => derivativeFloatRecursive(Math.sin, 1, 'bad'), TypeError);

			assert.throws(() => derivativeFloatRecursive(Math.sin, 1, { step: '0.1' }), TypeError);
			assert.throws(() => derivativeFloatRecursive(Math.sin, 1, { step: 0 }), RangeError);
			assert.throws(() => derivativeFloatRecursive(Math.sin, 1, { step: -1e-3 }), RangeError);
			assert.throws(() => derivativeFloatRecursive(Math.sin, 1, { step: NaN }), RangeError);
			assert.throws(() => derivativeFloatRecursive(Math.sin, 1, { step: Infinity }), RangeError);

			assert.throws(() => derivativeFloatRecursive(Math.sin, 1, { tolerance: '1e-6' }), TypeError);
			assert.throws(() => derivativeFloatRecursive(Math.sin, 1, { tolerance: 0 }), RangeError);
			assert.throws(() => derivativeFloatRecursive(Math.sin, 1, { tolerance: -1e-6 }), RangeError);
			assert.throws(() => derivativeFloatRecursive(Math.sin, 1, { tolerance: Infinity }), RangeError);

			assert.throws(() => derivativeFloatRecursive(Math.sin, 1, { maxDepth: '5' }), TypeError);
			assert.throws(() => derivativeFloatRecursive(Math.sin, 1, { maxDepth: 0 }), RangeError);
			assert.throws(() => derivativeFloatRecursive(Math.sin, 1, { maxDepth: -2 }), RangeError);
			assert.throws(() => derivativeFloatRecursive(Math.sin, 1, { maxDepth: 2.5 }), RangeError);
			assert.throws(() => derivativeFloatRecursive(Math.sin, 1, { maxDepth: 100 }), RangeError);
		});

		it('rejects non-finite or non-numeric outputs from f', () => {
			assert.throws(() => derivativeFloatRecursive(() => NaN, 1), RangeError);
			assert.throws(() => derivativeFloatRecursive(() => Infinity, 1), RangeError);
			assert.throws(() => derivativeFloatRecursive(() => -Infinity, 1), RangeError);
			assert.throws(() => derivativeFloatRecursive(() => '123', 1), TypeError);
			assert.throws(() => derivativeFloatRecursive(() => undefined, 1), TypeError);
		});

		it('rejects step sizes that underflow below float64 ULP or overflow', () => {
			assert.throws(() => derivativeFloatRecursive(Math.sin, 1e16, { step: 1e-6 }), RangeError);
			assert.throws(() => derivativeFloatRecursive((x) => x, Number.MAX_VALUE, { step: Number.MAX_VALUE }), RangeError);
		});
	});
});
