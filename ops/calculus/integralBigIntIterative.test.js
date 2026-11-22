import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { integralBigIntIterative, SCALE } from './integralBigIntIterative.js';

/** Fixed-point multiplication: (x * y) / SCALE, rounded half away from zero. */
function fpMul(x, y) {
	const prod = x * y;
	const half = SCALE / 2n;
	return prod >= 0n ? (prod + half) / SCALE : (prod - half) / SCALE;
}

/** Fixed-point division: (x * SCALE) / y, rounded half away from zero. */
function fpDiv(x, y) {
	const sign = (x < 0n) !== (y < 0n) ? -1n : 1n;
	const num = (x < 0n ? -x : x) * SCALE;
	const den = y < 0n ? -y : y;
	return sign * ((num + den / 2n) / den);
}

/** Absolute value of a BigInt. */
function absBigInt(x) {
	return x < 0n ? -x : x;
}

/** Independent reference composite trapezoidal rule in fixed-point BigInt. */
function referenceTrapezoidal(f, a, b, steps) {
	const dx = b - a;
	let sum = f(a) + f(b);
	for (let i = 1n; i < steps; i++) {
		const xi = a + (dx * i) / steps;
		sum += 2n * f(xi);
	}
	const num = dx * sum;
	const den = 2n * steps * SCALE;
	return num >= 0n ? (num + den / 2n) / den : (num - den / 2n) / den;
}

describe('integralBigIntIterative', () => {
	describe('normal cases', () => {
		it('integrates a constant function exactly', () => {
			// ∫_1^5 7 dx = 28
			const f = () => 7n * SCALE;
			const result = integralBigIntIterative(f, 1n * SCALE, 5n * SCALE, 10n);
			assert.equal(result, 28n * SCALE);
		});

		it('integrates a linear function exactly', () => {
			// ∫_{-2}^{5} (3x - 4) dx = [1.5x^2 - 4x]_{-2}^{5} = (37.5 - 20) - (6 + 8) = 3.5
			const f = (x) => 3n * x - 4n * SCALE;
			const result = integralBigIntIterative(f, -2n * SCALE, 5n * SCALE, 2n);
			assert.equal(result, (35n * SCALE) / 10n);
		});

		it('integrates a quadratic function to exact fixed-point rounding', () => {
			// ∫_0^2 x^2 dx = 8/3 ≈ 2.666666666666666667
			const f = (x) => fpMul(x, x);
			const result = integralBigIntIterative(f, 0n, 2n * SCALE, 4n);
			assert.equal(result, 2_666_666_666_666_666_667n);
		});

		it('integrates a cubic polynomial exactly with even steps', () => {
			// ∫_{-1}^{3} (x^3 - 2x^2 + 3x - 5) dx = -20/3 ≈ -6.666666666666666667
			const f = (x) => {
				const x2 = fpMul(x, x);
				const x3 = fpMul(x2, x);
				return x3 - 2n * x2 + 3n * x - 5n * SCALE;
			};
			const result = integralBigIntIterative(f, -1n * SCALE, 3n * SCALE, 4n);
			assert.equal(result, -6_666_666_666_666_666_667n);
		});

		it('supports odd steps including steps=1n (trapezoidal) and steps>=3n (Simpson 1/3 + 3/8)', () => {
			// steps = 1n exact for linear: ∫_0^4 (2x + 1) dx = 20
			const linear = (x) => 2n * x + SCALE;
			assert.equal(integralBigIntIterative(linear, 0n, 4n * SCALE, 1n), 20n * SCALE);

			// steps = 3n and 5n exact for cubic: ∫_0^3 x^3 dx = 81/4 = 20.25
			const cubic = (x) => fpMul(fpMul(x, x), x);
			const expected = (81n * SCALE) / 4n;
			assert.equal(integralBigIntIterative(cubic, 0n, 3n * SCALE, 3n), expected);
			assert.equal(integralBigIntIterative(cubic, 0n, 5n * SCALE, 5n), (625n * SCALE) / 4n);
		});

		it('uses default steps when omitted', () => {
			// ∫_0^1 x^2 dx = 1/3 ≈ 0.333333333333333333
			const f = (x) => fpMul(x, x);
			const result = integralBigIntIterative(f, 0n, SCALE);
			assert.equal(result, 333_333_333_333_333_333n);
		});

		it('integrates smooth rational function 1 / (1 + x^2) over [0, 1] to pi/4', () => {
			// ∫_0^1 1/(1 + x^2) dx = pi/4 ≈ 0.785398163397448310
			const f = (x) => fpDiv(SCALE, SCALE + fpMul(x, x));
			const result = integralBigIntIterative(f, 0n, SCALE, 200n);
			const expectedPiOver4 = 785_398_163_397_448_310n;
			assert.ok(
				absBigInt(result - expectedPiOver4) <= 10_000n,
				`Expected within 1e-14 of pi/4, got diff=${absBigInt(result - expectedPiOver4)}`
			);
		});

		it('integrates 1 / x over [1, 2] to ln(2)', () => {
			// ∫_1^2 (1/x) dx = ln(2) ≈ 0.693147180559945309
			const f = (x) => fpDiv(SCALE, x);
			const result = integralBigIntIterative(f, SCALE, 2n * SCALE, 1000n);
			const expectedLn2 = 693_147_180_559_945_309n;
			assert.ok(
				absBigInt(result - expectedLn2) <= 100_000n,
				`Expected within 1e-13 of ln(2), got diff=${absBigInt(result - expectedLn2)}`
			);
		});
	});

	describe('edge cases', () => {
		it('returns 0n for zero-width intervals (a === b)', () => {
			const f = (x) => fpMul(x, x) + SCALE;
			assert.equal(integralBigIntIterative(f, 0n, 0n, 10n), 0n);
			assert.equal(integralBigIntIterative(f, 5n * SCALE, 5n * SCALE, 10n), 0n);
			assert.equal(integralBigIntIterative(f, -3n * SCALE, -3n * SCALE, 1n), 0n);
		});

		it('returns 0n for the zero function', () => {
			assert.equal(integralBigIntIterative(() => 0n, -10n * SCALE, 10n * SCALE, 50n), 0n);
		});

		it('negates the integral when bounds are reversed (a > b) for even and odd steps', () => {
			const f = (x) => fpDiv(SCALE, SCALE + fpMul(x, x));
			for (const steps of [1n, 3n, 5n, 20n, 51n]) {
				const forward = integralBigIntIterative(f, 0n, 2n * SCALE, steps);
				const reverse = integralBigIntIterative(f, 2n * SCALE, 0n, steps);
				assert.equal(reverse, -forward, `Anti-symmetry failed for steps=${steps}`);
			}
		});

		it('integrates an odd function over a symmetric interval [-a, a] to 0n', () => {
			// ∫_{-3}^{3} (x^3 - 5x) dx = 0
			const oddFn = (x) => fpMul(fpMul(x, x), x) - 5n * x;
			assert.equal(integralBigIntIterative(oddFn, -3n * SCALE, 3n * SCALE, 12n), 0n);
		});

		it('handles negative bounds and negative integrand values', () => {
			// ∫_{-4}^{-1} (-2x) dx = [-x^2]_{-4}^{-1} = -1 - (-16) = 15
			const f = (x) => -2n * x;
			assert.equal(integralBigIntIterative(f, -4n * SCALE, -1n * SCALE, 6n), 15n * SCALE);
		});

		it('handles very large BigInt bounds far beyond Number.MAX_SAFE_INTEGER without precision loss', () => {
			// ∫_0^{10^30} 2x dx = (10^30)^2 = 10^60 (scaled by 10^18 => 10^78)
			const upper = 10n ** 30n * SCALE;
			const result = integralBigIntIterative((x) => 2n * x, 0n, upper, 2n);
			assert.equal(result, 10n ** 60n * SCALE);
		});

		it('handles very small sub-unit intervals', () => {
			// ∫_0^{10^-15} 1000 dx = 10^-12 (i.e. 10^6 in 10^18 fixed-point)
			const result = integralBigIntIterative(() => 1000n * SCALE, 0n, 1000n, 4n);
			assert.equal(result, 1_000_000n);
		});
	});

	describe('input validation', () => {
		const id = (x) => x;

		it('throws TypeError when f is not a function', () => {
			for (const bad of [null, undefined, 42, 'x => x', {}]) {
				assert.throws(
					() => integralBigIntIterative(bad, 0n, SCALE, 10n),
					{ name: 'TypeError' }
				);
			}
		});

		it('throws TypeError when a or b is not a BigInt', () => {
			for (const bad of [0, 1.5, '0', null, undefined, NaN]) {
				assert.throws(
					() => integralBigIntIterative(id, bad, SCALE, 10n),
					{ name: 'TypeError' }
				);
				assert.throws(
					() => integralBigIntIterative(id, 0n, bad, 10n),
					{ name: 'TypeError' }
				);
			}
		});

		it('throws TypeError when steps is not a BigInt', () => {
			for (const bad of [10, 10.5, '10', null, NaN, {}]) {
				assert.throws(
					() => integralBigIntIterative(id, 0n, SCALE, bad),
					{ name: 'TypeError' }
				);
			}
		});

		it('throws RangeError when steps < 1n', () => {
			for (const bad of [0n, -1n, -100n]) {
				assert.throws(
					() => integralBigIntIterative(id, 0n, SCALE, bad),
					{ name: 'RangeError' }
				);
			}
		});

		it('throws TypeError when f(x) returns a non-BigInt value', () => {
			assert.throws(
				() => integralBigIntIterative(() => 123, 0n, SCALE, 2n),
				{ name: 'TypeError' }
			);
			assert.throws(
				() => integralBigIntIterative((x) => (x === 0n ? 0n : 'bad'), 0n, SCALE, 2n),
				{ name: 'TypeError' }
			);
			assert.throws(
				() => integralBigIntIterative(() => undefined, 0n, SCALE, 1n),
				{ name: 'TypeError' }
			);
		});
	});

	describe('independent cross-checks', () => {
		it('satisfies interval additivity: ∫_a^c f + ∫_c^b f === ∫_a^b f', () => {
			const f = (x) => fpMul(x, x) + 3n * x - 2n * SCALE;
			const a = -2n * SCALE;
			const c = 1n * SCALE;
			const b = 4n * SCALE;
			const whole = integralBigIntIterative(f, a, b, 12n);
			const left = integralBigIntIterative(f, a, c, 6n);
			const right = integralBigIntIterative(f, c, b, 6n);
			assert.equal(left + right, whole);
		});

		it('satisfies linearity: ∫(αf + βg) === α∫f + β∫g', () => {
			const f = (x) => fpMul(x, x);
			const g = (x) => 2n * x + SCALE;
			const alpha = 5n;
			const beta = -3n;
			const combo = (x) => alpha * f(x) + beta * g(x);

			const lhs = integralBigIntIterative(combo, -1n * SCALE, 3n * SCALE, 10n);
			const rhs =
				alpha * integralBigIntIterative(f, -1n * SCALE, 3n * SCALE, 10n) +
				beta * integralBigIntIterative(g, -1n * SCALE, 3n * SCALE, 10n);

			assert.ok(absBigInt(lhs - rhs) <= 10n, `Linearity mismatch: lhs=${lhs}, rhs=${rhs}`);
		});

		it('agrees with an independent composite trapezoidal rule and float Math references', () => {
			// Cross-check 1: ∫_1^2 (1/x) dx vs independent trapezoidal rule and Math.LN2
			const invX = (x) => fpDiv(SCALE, x);
			const simpsonLn2 = integralBigIntIterative(invX, SCALE, 2n * SCALE, 1000n);
			const trapLn2 = referenceTrapezoidal(invX, SCALE, 2n * SCALE, 2000n);
			const floatLn2 = BigInt(Math.round(Math.LN2 * 1e15)) * 1000n;

			assert.ok(absBigInt(simpsonLn2 - trapLn2) < 10n ** 11n);
			assert.ok(absBigInt(simpsonLn2 - floatLn2) < 10n ** 6n);

			// Cross-check 2: ∫_0^1 1/(1 + x^2) dx vs Math.PI / 4 and independent trapezoidal rule
			const atanDeriv = (x) => fpDiv(SCALE, SCALE + fpMul(x, x));
			const simpsonPi4 = integralBigIntIterative(atanDeriv, 0n, SCALE, 200n);
			const trapPi4 = referenceTrapezoidal(atanDeriv, 0n, SCALE, 2000n);
			const floatPi4 = BigInt(Math.round((Math.PI / 4) * 1e15)) * 1000n;

			assert.ok(absBigInt(simpsonPi4 - trapPi4) < 10n ** 11n);
			assert.ok(absBigInt(simpsonPi4 - floatPi4) < 10n ** 6n);
		});

		it('exhibits O(h^4) convergence order on degree-4 polynomial ∫_0^2 x^4 dx = 32/5', () => {
			// Exact value: 32 / 5 = 6.4 = 6.4 * 10^18
			const x4 = (x) => {
				const x2 = fpMul(x, x);
				return fpMul(x2, x2);
			};
			const exact = (32n * SCALE) / 5n;

			const err10 = absBigInt(integralBigIntIterative(x4, 0n, 2n * SCALE, 10n) - exact);
			const err20 = absBigInt(integralBigIntIterative(x4, 0n, 2n * SCALE, 20n) - exact);

			// For Simpson's rule on x^4, halving h reduces error by exactly 2^4 = 16
			assert.ok(err10 > 0n && err20 > 0n);
			assert.ok(
				absBigInt(err10 - 16n * err20) <= 16n,
				`Expected 16x error reduction: err10=${err10}, err20=${err20}`
			);
		});
	});
});
