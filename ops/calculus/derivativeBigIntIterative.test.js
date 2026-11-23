import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	derivativeBigIntIterative,
	SCALE,
	DEFAULT_STEP,
} from './derivativeBigIntIterative.js';

/** Fixed-point multiplication of two 10^18-scaled BigInts with rounding. */
function mulFP(a, b) {
	const prod = a * b;
	return prod >= 0n
		? (prod + SCALE / 2n) / SCALE
		: -((-prod + SCALE / 2n) / SCALE);
}

/** Fixed-point division of two 10^18-scaled BigInts with rounding. */
function divFP(a, b) {
	const num = a * SCALE;
	const neg = (num < 0n) !== (b < 0n);
	const absNum = num < 0n ? -num : num;
	const absDen = b < 0n ? -b : b;
	const q = (absNum + absDen / 2n) / absDen;
	return neg ? -q : q;
}

/** Absolute difference between two BigInts. */
function absDiff(a, b) {
	return a >= b ? a - b : b - a;
}

/**
 * Evaluates a polynomial with 10^18-scaled coefficients [c0, c1, c2, ...]
 * at a 10^18-scaled point x using Horner's method.
 */
function evalPolyFP(coeffs, x) {
	let acc = 0n;
	for (let i = coeffs.length - 1; i >= 0; i -= 1) {
		acc = mulFP(acc, x) + coeffs[i];
	}
	return acc;
}

/**
 * Analytically differentiates a polynomial's coefficient array [c0, c1, c2, ...].
 */
function analyticPolyDerivativeCoeffs(coeffs) {
	if (coeffs.length <= 1) {
		return [0n];
	}
	const deriv = new Array(coeffs.length - 1);
	for (let i = 1; i < coeffs.length; i += 1) {
		deriv[i - 1] = coeffs[i] * BigInt(i);
	}
	return deriv;
}

/**
 * Computes exp(x) in 10^18 fixed-point using an iterative Taylor series.
 */
function expFP(x) {
	let sum = SCALE;
	let term = SCALE;
	for (let k = 1n; k <= 40n; k += 1n) {
		term = (term * x) / (SCALE * k);
		sum += term;
		if (term === 0n) {
			break;
		}
	}
	return sum;
}

describe('derivativeBigIntIterative', () => {
	describe('constants and basic first derivatives', () => {
		it('exports expected SCALE and DEFAULT_STEP constants', () => {
			assert.equal(SCALE, 10n ** 18n);
			assert.equal(DEFAULT_STEP, 10n ** 12n);
		});

		it('returns 0n for a constant function', () => {
			const f = () => 42n * SCALE;
			assert.equal(derivativeBigIntIterative(f, 0n), 0n);
			assert.equal(derivativeBigIntIterative(f, 7n * SCALE), 0n);
			assert.equal(derivativeBigIntIterative(f, -123n * SCALE), 0n);
		});

		it('computes exact derivative for linear functions', () => {
			const f = (x) => 3n * x - 7n * SCALE;
			assert.equal(derivativeBigIntIterative(f, 0n), 3n * SCALE);
			assert.equal(derivativeBigIntIterative(f, 5n * SCALE), 3n * SCALE);
			assert.equal(derivativeBigIntIterative(f, -9n * SCALE), 3n * SCALE);
		});

		it('computes exact derivative for quadratic functions', () => {
			// f(x) = 2x^2 - 5x + 1 => f'(x) = 4x - 5
			const f = (x) => 2n * mulFP(x, x) - 5n * x + SCALE;
			const points = [-4n * SCALE, -SCALE / 2n, 0n, SCALE, 10n * SCALE];
			for (const x of points) {
				const expected = 4n * x - 5n * SCALE;
				const actual = derivativeBigIntIterative(f, x);
				assert.ok(
					absDiff(actual, expected) <= 10n,
					`at x=${x}: expected ${expected}, got ${actual}`,
				);
			}
		});

		it('computes non-integer fixed-point derivatives accurately (1/x)', () => {
			// f(x) = 1 / x => f'(x) = -1 / x^2
			const f = (x) => divFP(SCALE, x);
			const x = 2n * SCALE; // f'(2) = -0.25
			const expected = -(SCALE / 4n);
			const actual = derivativeBigIntIterative(f, x);
			assert.ok(
				absDiff(actual, expected) <= 10n ** 6n,
				`expected ~${expected}, got ${actual}`,
			);
		});

		it('supports custom step sizes h', () => {
			// f(x) = x^2 / 2 => f'(x) = x
			const f = (x) => mulFP(x, x) / 2n;
			const x = 3n * SCALE;
			assert.equal(derivativeBigIntIterative(f, x, SCALE), 3n * SCALE);
			assert.equal(derivativeBigIntIterative(f, x, 10n ** 15n), 3n * SCALE);
		});
	});

	describe('higher-order derivatives (iterative difference table)', () => {
		it('computes exact 2nd derivative of quadratic and cubic polynomials', () => {
			// f(x) = 3x^2 - 4x + 9 => f''(x) = 6
			const quad = (x) => 3n * mulFP(x, x) - 4n * x + 9n * SCALE;
			assert.equal(
				derivativeBigIntIterative(quad, 5n * SCALE, SCALE, 2),
				6n * SCALE,
			);

			// g(x) = x^3 => g''(x) = 6x
			const cubic = (x) => mulFP(mulFP(x, x), x);
			assert.equal(
				derivativeBigIntIterative(cubic, 4n * SCALE, SCALE, 2),
				24n * SCALE,
			);
			assert.equal(
				derivativeBigIntIterative(cubic, -3n * SCALE, SCALE, 2),
				-18n * SCALE,
			);
		});

		it('computes exact 3rd and 4th derivatives of polynomials', () => {
			// f(x) = x^3 => f'''(x) = 6
			const cubic = (x) => mulFP(mulFP(x, x), x);
			assert.equal(
				derivativeBigIntIterative(cubic, 2n * SCALE, SCALE, 3),
				6n * SCALE,
			);

			// g(x) = x^4 => g''''(x) = 24
			const quartic = (x) => {
				const x2 = mulFP(x, x);
				return mulFP(x2, x2);
			};
			assert.equal(
				derivativeBigIntIterative(quartic, -2n * SCALE, SCALE, 4),
				24n * SCALE,
			);
			// g^(5)(x) = 0
			assert.equal(
				derivativeBigIntIterative(quartic, 3n * SCALE, SCALE, 5),
				0n,
			);
		});

		it('accepts bigint values for order', () => {
			const cubic = (x) => mulFP(mulFP(x, x), x);
			assert.equal(
				derivativeBigIntIterative(cubic, 2n * SCALE, SCALE, 2n),
				12n * SCALE,
			);
			assert.equal(
				derivativeBigIntIterative(cubic, 2n * SCALE, SCALE, 3n),
				6n * SCALE,
			);
		});
	});

	describe('edge cases', () => {
		it('handles x = 0n and preserves odd/even derivative symmetry', () => {
			// Even function f(x) = x^4 - 2x^2 => odd derivative f'(-x) = -f'(x)
			const evenFn = (x) => {
				const x2 = mulFP(x, x);
				return mulFP(x2, x2) - 2n * x2;
			};
			assert.equal(derivativeBigIntIterative(evenFn, 0n), 0n);
			const pos = derivativeBigIntIterative(evenFn, 2n * SCALE);
			const neg = derivativeBigIntIterative(evenFn, -2n * SCALE);
			assert.equal(neg, -pos);

			// Odd function g(x) = x^3 + x => even derivative g'(-x) = g'(x)
			const oddFn = (x) => mulFP(mulFP(x, x), x) + x;
			const gPos = derivativeBigIntIterative(oddFn, 2n * SCALE);
			const gNeg = derivativeBigIntIterative(oddFn, -2n * SCALE);
			assert.equal(gNeg, gPos);
		});

		it('works with minimum step size h = 1n on exact linear functions', () => {
			const f = (x) => 7n * x + 13n * SCALE;
			assert.equal(derivativeBigIntIterative(f, 0n, 1n), 7n * SCALE);
			assert.equal(derivativeBigIntIterative(f, -5n * SCALE, 1n), 7n * SCALE);
		});

		it('handles arbitrarily large BigInt coordinates beyond Number.MAX_SAFE_INTEGER', () => {
			const bigX = 10n ** 30n * SCALE;
			// f(x) = -11x + 5
			const linear = (x) => -11n * x + 5n * SCALE;
			assert.equal(derivativeBigIntIterative(linear, bigX), -11n * SCALE);

			// Exact integer-grid quadratic: f(x) = x^2 / SCALE => f'(x) = 2x
			const quad = (x) => (x * x) / SCALE;
			assert.equal(derivativeBigIntIterative(quad, bigX, SCALE), 2n * bigX);
		});

		it('rounds half away from zero symmetrically for positive and negative quotients', () => {
			// With h = SCALE, 2h = 2 * SCALE, so result = round((f(x+h) - f(x-h)) / 2)
			const posHalf = (x) => (x > 0n ? 1n : 0n);
			assert.equal(derivativeBigIntIterative(posHalf, 0n, SCALE), 1n);

			const negHalf = (x) => (x > 0n ? -1n : 0n);
			assert.equal(derivativeBigIntIterative(negHalf, 0n, SCALE), -1n);
		});

		it('returns 0n for the zero function across orders', () => {
			const zero = () => 0n;
			for (let order = 1; order <= 5; order += 1) {
				assert.equal(derivativeBigIntIterative(zero, SCALE, SCALE, order), 0n);
			}
		});
	});

	describe('input validation', () => {
		const identity = (x) => x;

		it('throws TypeError when fn is not a function', () => {
			for (const badFn of [null, undefined, 42, 'x => x', {}, []]) {
				assert.throws(
					() => derivativeBigIntIterative(badFn, 0n),
					TypeError,
				);
			}
		});

		it('throws TypeError when x is not a bigint', () => {
			for (const badX of [0, 1.5, NaN, '0', null, undefined, {}]) {
				assert.throws(
					() => derivativeBigIntIterative(identity, badX),
					TypeError,
				);
			}
		});

		it('throws TypeError when h is not a bigint', () => {
			for (const badH of [1, 1e-6, '1000', null, {}]) {
				assert.throws(
					() => derivativeBigIntIterative(identity, 0n, badH),
					TypeError,
				);
			}
		});

		it('throws RangeError when h is zero or negative', () => {
			for (const badH of [0n, -1n, -SCALE]) {
				assert.throws(
					() => derivativeBigIntIterative(identity, 0n, badH),
					RangeError,
				);
			}
		});

		it('throws TypeError or RangeError for invalid order values', () => {
			for (const badType of ['1', null, {}, []]) {
				assert.throws(
					() => derivativeBigIntIterative(identity, 0n, DEFAULT_STEP, badType),
					TypeError,
				);
			}
			for (const badRange of [
				0,
				-1,
				1.5,
				NaN,
				Infinity,
				Number.MAX_SAFE_INTEGER + 1,
				0n,
				-3n,
				BigInt(Number.MAX_SAFE_INTEGER) + 1n,
			]) {
				assert.throws(
					() => derivativeBigIntIterative(identity, 0n, DEFAULT_STEP, badRange),
					RangeError,
				);
			}
		});

		it('throws TypeError if fn returns a non-bigint value', () => {
			assert.throws(
				() => derivativeBigIntIterative(() => 42, 0n),
				TypeError,
			);
			assert.throws(
				() => derivativeBigIntIterative(() => undefined, 0n),
				TypeError,
			);
		});
	});

	describe('independent cross-checks', () => {
		it('matches analytic derivatives of a degree-5 polynomial across multiple points', () => {
			// P(x) = 1.5 - 2x + 0.5x^2 - 3x^3 + 0.25x^4 + 2x^5
			const coeffs = [
				(3n * SCALE) / 2n,
				-2n * SCALE,
				SCALE / 2n,
				-3n * SCALE,
				SCALE / 4n,
				2n * SCALE,
			];
			const d1Coeffs = analyticPolyDerivativeCoeffs(coeffs);
			const d2Coeffs = analyticPolyDerivativeCoeffs(d1Coeffs);

			const poly = (x) => evalPolyFP(coeffs, x);
			const testPoints = [
				-2n * SCALE,
				-(SCALE / 2n),
				0n,
				SCALE / 4n,
				SCALE,
				(5n * SCALE) / 2n,
			];

			for (const x of testPoints) {
				const numD1 = derivativeBigIntIterative(poly, x);
				const anaD1 = evalPolyFP(d1Coeffs, x);
				assert.ok(
					absDiff(numD1, anaD1) <= 10n ** 9n,
					`1st deriv mismatch at x=${x}: num=${numD1}, ana=${anaD1}`,
				);

				// Use h = 10^-5 for 2nd derivative to balance truncation O(h^2) vs rounding O(10^-18 / h^2)
				const h2 = 10n ** 13n;
				const numD2 = derivativeBigIntIterative(poly, x, h2, 2);
				const anaD2 = evalPolyFP(d2Coeffs, x);
				assert.ok(
					absDiff(numD2, anaD2) <= 10n ** 11n,
					`2nd deriv mismatch at x=${x}: num=${numD2}, ana=${anaD2}`,
				);
			}
		});

		it('satisfies d/dx exp(x) == exp(x) and d^2/dx^2 exp(x) == exp(x)', () => {
			const testPoints = [-SCALE, 0n, SCALE / 2n, SCALE, 2n * SCALE];
			for (const x of testPoints) {
				const expected = expFP(x);
				const d1 = derivativeBigIntIterative(expFP, x);
				assert.ok(
					absDiff(d1, expected) <= 10n ** 8n,
					`exp'(x) mismatch at x=${x}: d1=${d1}, exp=${expected}`,
				);

				const d2 = derivativeBigIntIterative(expFP, x, 10n ** 14n, 2);
				assert.ok(
					absDiff(d2, expected) <= 10n ** 11n,
					`exp''(x) mismatch at x=${x}: d2=${d2}, exp=${expected}`,
				);
			}
		});

		it('obeys the product rule (f*g)\'(x) == f\'(x)g(x) + f(x)g\'(x)', () => {
			const f = (x) => mulFP(x, x) + SCALE;
			const g = (x) => 3n * x - 2n * SCALE;
			const fg = (x) => mulFP(f(x), g(x));

			const testPoints = [-3n * SCALE, 0n, SCALE / 2n, 4n * SCALE];
			for (const x of testPoints) {
				const lhs = derivativeBigIntIterative(fg, x);
				const rhs =
					mulFP(derivativeBigIntIterative(f, x), g(x)) +
					mulFP(f(x), derivativeBigIntIterative(g, x));
				assert.ok(
					absDiff(lhs, rhs) <= 10n ** 8n,
					`product rule mismatch at x=${x}: lhs=${lhs}, rhs=${rhs}`,
				);
			}
		});
	});
});
