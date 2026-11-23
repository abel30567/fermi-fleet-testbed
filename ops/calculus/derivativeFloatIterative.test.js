import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { derivativeFloatIterative } from './derivativeFloatIterative.js';

function assertClose(actual, expected, tolerance = 1e-7, message = '') {
	const scale = Math.max(1, Math.abs(expected));
	const error = Math.abs(actual - expected);
	assert.ok(
		error <= tolerance * scale,
		`${message ? `${message}: ` : ''}expected ${actual} to be within ${tolerance * scale} of ${expected} (error=${error})`
	);
}

describe('derivativeFloatIterative', () => {
	describe('normal cases against analytic derivatives', () => {
		test('constant function has zero derivative', () => {
			assert.strictEqual(derivativeFloatIterative(() => 42.5, 0), 0);
			assert.strictEqual(derivativeFloatIterative(() => -7, 123.45), 0);
		});

		test('linear function returns exact slope', () => {
			assertClose(derivativeFloatIterative((x) => 3.5 * x - 11, 4), 3.5, 1e-11);
			assertClose(derivativeFloatIterative((x) => -2.25 * x + 9, -8), -2.25, 1e-11);
		});

		test('polynomial functions', () => {
			assertClose(derivativeFloatIterative((x) => x * x, 5), 10, 1e-10);
			assertClose(derivativeFloatIterative((x) => x ** 3 - 4 * x + 1, 2), 8, 1e-9);
			assertClose(derivativeFloatIterative((x) => x ** 4, -1.5), 4 * (-1.5) ** 3, 1e-9);
		});

		test('trigonometric functions', () => {
			assertClose(derivativeFloatIterative(Math.sin, 0), 1, 1e-9);
			assertClose(derivativeFloatIterative(Math.sin, Math.PI / 3), Math.cos(Math.PI / 3), 1e-9);
			assertClose(derivativeFloatIterative(Math.cos, 1.2), -Math.sin(1.2), 1e-9);
			assertClose(derivativeFloatIterative(Math.tan, 0.5), 1 / (Math.cos(0.5) ** 2), 1e-9);
		});

		test('exponential, logarithmic, and rational functions', () => {
			assertClose(derivativeFloatIterative(Math.exp, 0), 1, 1e-9);
			assertClose(derivativeFloatIterative(Math.exp, 1.5), Math.exp(1.5), 1e-9);
			assertClose(derivativeFloatIterative(Math.log, 2.5), 1 / 2.5, 1e-9);
			assertClose(derivativeFloatIterative(Math.sqrt, 9), 1 / 6, 1e-9);
			assertClose(derivativeFloatIterative((x) => 1 / x, -2), -0.25, 1e-9);
		});
	});

	describe('edge cases and options', () => {
		test('evaluates accurately at zero, negative zero, and negative points', () => {
			assertClose(derivativeFloatIterative((x) => x ** 3, 0), 0, 1e-9);
			assert.strictEqual(Object.is(derivativeFloatIterative(() => 0, -0), 0), true);
			assertClose(derivativeFloatIterative((x) => Math.exp(-x), -2), -Math.exp(2), 1e-9);
		});

		test('handles large magnitude evaluation points via automatic step scaling', () => {
			const x = 1e8;
			assertClose(derivativeFloatIterative((t) => 0.5 * t * t + 3 * t, x), x + 3, 1e-6);
		});

		test('handles removable discontinuity at x without evaluating f(x) directly', () => {
			// f(x) = sin(x) / x has f'(0) = 0, even though f(0) is NaN
			const sinc = (x) => Math.sin(x) / x;
			assertClose(derivativeFloatIterative(sinc, 0), 0, 1e-12);
		});

		test('respects custom h, tolerance, and maxIterations options', () => {
			// Near log domain boundary x = 1e-4 requires smaller initial step h < 1e-4
			const d = derivativeFloatIterative(Math.log, 1e-4, { h: 1e-6, tolerance: 1e-9 });
			assertClose(d, 1e4, 1e-7);

			// Single iteration uses central difference with exact initial step h
			const h = 0.1;
			const single = derivativeFloatIterative((x) => x ** 3, 2, { h, maxIterations: 1 });
			const expectedSingle = ((2 + h) ** 3 - (2 - h) ** 3) / ((2 + h) - (2 - h));
			assert.strictEqual(single, expectedSingle);

			// Zero tolerance still terminates cleanly due to float64 round-off guard
			const zeroTol = derivativeFloatIterative(Math.sin, 1, { tolerance: 0, maxIterations: 40 });
			assertClose(zeroTol, Math.cos(1), 1e-9);
		});
	});

	describe('input validation', () => {
		test('rejects invalid function argument', () => {
			assert.throws(() => derivativeFloatIterative(null, 1), TypeError);
			assert.throws(() => derivativeFloatIterative(123, 1), TypeError);
			assert.throws(() => derivativeFloatIterative('x => x', 1), TypeError);
		});

		test('rejects invalid x argument', () => {
			assert.throws(() => derivativeFloatIterative((x) => x, '1'), TypeError);
			assert.throws(() => derivativeFloatIterative((x) => x, undefined), TypeError);
			assert.throws(() => derivativeFloatIterative((x) => x, NaN), RangeError);
			assert.throws(() => derivativeFloatIterative((x) => x, Infinity), RangeError);
			assert.throws(() => derivativeFloatIterative((x) => x, -Infinity), RangeError);
		});

		test('rejects invalid options object and option fields', () => {
			const id = (x) => x;
			assert.throws(() => derivativeFloatIterative(id, 1, null), TypeError);
			assert.throws(() => derivativeFloatIterative(id, 1, []), TypeError);
			assert.throws(() => derivativeFloatIterative(id, 1, 0.01), TypeError);

			assert.throws(() => derivativeFloatIterative(id, 1, { h: '0.01' }), TypeError);
			assert.throws(() => derivativeFloatIterative(id, 1, { h: 0 }), RangeError);
			assert.throws(() => derivativeFloatIterative(id, 1, { h: -1e-3 }), RangeError);
			assert.throws(() => derivativeFloatIterative(id, 1, { h: Infinity }), RangeError);
			assert.throws(() => derivativeFloatIterative(id, 1, { h: NaN }), RangeError);
			// Step too small to perturb x=1 in float64
			assert.throws(() => derivativeFloatIterative(id, 1, { h: 1e-20 }), RangeError);

			assert.throws(() => derivativeFloatIterative(id, 1, { tolerance: '1e-6' }), TypeError);
			assert.throws(() => derivativeFloatIterative(id, 1, { tolerance: -1e-6 }), RangeError);
			assert.throws(() => derivativeFloatIterative(id, 1, { tolerance: NaN }), RangeError);

			assert.throws(() => derivativeFloatIterative(id, 1, { maxIterations: '5' }), TypeError);
			assert.throws(() => derivativeFloatIterative(id, 1, { maxIterations: 0 }), RangeError);
			assert.throws(() => derivativeFloatIterative(id, 1, { maxIterations: -3 }), RangeError);
			assert.throws(() => derivativeFloatIterative(id, 1, { maxIterations: 2.5 }), RangeError);
		});

		test('rejects functions returning non-number or non-finite values', () => {
			assert.throws(() => derivativeFloatIterative(() => '42', 1), TypeError);
			assert.throws(() => derivativeFloatIterative(() => NaN, 1), RangeError);
			assert.throws(() => derivativeFloatIterative(() => Infinity, 1), RangeError);
			assert.throws(() => derivativeFloatIterative(Math.log, -5), RangeError);
		});
	});

	describe('independent cross-checks', () => {
		test('matches independent complex-step differentiation for f(x) = exp(x) * sin(x)', () => {
			// Complex-step derivative: f'(x) ≈ Im(f(x + i*h)) / h for tiny h = 1e-30 (no cancellation).
			// For f(z) = exp(z) * sin(z) with z = x + i*h:
			//   exp(x + i*h) = exp(x) * (cos(h) + i*sin(h))
			//   sin(x + i*h) = sin(x)*cosh(h) + i*cos(x)*sinh(h)
			//   Im(exp(z)*sin(z)) = exp(x) * (cos(h)*cos(x)*sinh(h) + sin(h)*sin(x)*cosh(h))
			const f = (x) => Math.exp(x) * Math.sin(x);
			const complexStepDerivative = (x) => {
				const h = 1e-30;
				const im = Math.exp(x) * (
					Math.cos(h) * Math.cos(x) * Math.sinh(h) +
					Math.sin(h) * Math.sin(x) * Math.cosh(h)
				);
				return im / h;
			};

			for (const x of [-1.5, -0.3, 0, 0.7, 2.1]) {
				const iterative = derivativeFloatIterative(f, x);
				const complexStep = complexStepDerivative(x);
				assertClose(iterative, complexStep, 1e-9, `x=${x}`);
			}
		});

		test('satisfies Fundamental Theorem of Calculus via independent Simpson integration', () => {
			const f = (x) => Math.sin(x) + 0.25 * x * x * x - Math.cos(2 * x);
			const a = -0.5;
			const b = 1.7;
			const n = 100; // even number of subintervals for composite Simpson's rule
			const dx = (b - a) / n;

			let sum = derivativeFloatIterative(f, a) + derivativeFloatIterative(f, b);
			for (let i = 1; i < n; i += 1) {
				const weight = i % 2 === 0 ? 2 : 4;
				sum += weight * derivativeFloatIterative(f, a + i * dx);
			}
			const integralOfDerivative = (dx / 3) * sum;
			const netChange = f(b) - f(a);

			assertClose(integralOfDerivative, netChange, 1e-7);
		});

		test('satisfies linearity, product rule, and chain rule identities', () => {
			const f = (x) => Math.sin(x) + x * x;
			const g = (x) => Math.exp(0.5 * x) + 1;
			const x = 1.1;

			// Linearity: (2f - 3g)' = 2f' - 3g'
			const linLeft = derivativeFloatIterative((t) => 2 * f(t) - 3 * g(t), x);
			const linRight = 2 * derivativeFloatIterative(f, x) - 3 * derivativeFloatIterative(g, x);
			assertClose(linLeft, linRight, 1e-8, 'linearity');

			// Product rule: (f * g)' = f'g + fg'
			const prodLeft = derivativeFloatIterative((t) => f(t) * g(t), x);
			const prodRight =
				derivativeFloatIterative(f, x) * g(x) + f(x) * derivativeFloatIterative(g, x);
			assertClose(prodLeft, prodRight, 1e-8, 'product rule');

			// Chain rule: (f o g)'(x) = f'(g(x)) * g'(x)
			const chainLeft = derivativeFloatIterative((t) => f(g(t)), x);
			const chainRight = derivativeFloatIterative(f, g(x)) * derivativeFloatIterative(g, x);
			assertClose(chainLeft, chainRight, 1e-8, 'chain rule');
		});
	});
});
