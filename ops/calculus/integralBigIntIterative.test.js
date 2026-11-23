import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { integralBigIntIterative, SCALE } from './integralBigIntIterative.js';

const S = SCALE;

function absBigInt(x) {
	return x < 0n ? -x : x;
}

function assertApproxBigInt(actual, expected, tolerance, message) {
	const diff = absBigInt(actual - expected);
	assert.ok(
		diff <= tolerance,
		`${message ?? 'Value out of tolerance'}: actual=${actual}, expected=${expected}, diff=${diff}, tol=${tolerance}`
	);
}

describe('integralBigIntIterative', () => {
	describe('normal cases — exact analytic polynomials', () => {
		it('integrates a constant function exactly', () => {
			// ∫[2, 7] 5 dx = 25
			const result = integralBigIntIterative(() => 5n * S, 2n * S, 7n * S, 10n);
			assert.equal(result, 25n * S);
		});

		it('integrates a linear function exactly with both Simpson and trapezoidal rules', () => {
			// ∫[1, 5] (3x + 2) dx = [1.5x^2 + 2x]_1^5 = 47.5 - 3.5 = 44
			const fn = (x) => 3n * x + 2n * S;
			const simpson = integralBigIntIterative(fn, 1n * S, 5n * S, 2n, 'simpson');
			const trap = integralBigIntIterative(fn, 1n * S, 5n * S, 1n, 'trapezoidal');
			assert.equal(simpson, 44n * S);
			assert.equal(trap, 44n * S);
		});

		it('integrates a quadratic polynomial against its analytic antiderivative', () => {
			// f(x) = 3x^2 - 2x + 5, F(x) = x^3 - x^2 + 5x
			// ∫[-1, 4] f(x) dx = (64 - 16 + 20) - (-1 - 1 - 5) = 68 - (-7) = 75
			const fn = (x) => (3n * x * x) / S - 2n * x + 5n * S;
			const result = integralBigIntIterative(fn, -1n * S, 4n * S, 10n);
			assert.equal(result, 75n * S);
		});

		it('integrates a cubic polynomial exactly using Simpson rule', () => {
			// f(x) = 4x^3 - 3x^2 + 2x - 1, F(x) = x^4 - x^3 + x^2 - x
			// ∫[-2, 3] f(x) dx = (81 - 27 + 9 - 3) - (16 + 8 + 4 + 2) = 60 - 30 = 30
			const fn = (x) => (4n * x * x * x) / (S * S) - (3n * x * x) / S + 2n * x - S;
			const result = integralBigIntIterative(fn, -2n * S, 3n * S, 10n);
			assert.equal(result, 30n * S);
		});

		it('handles non-integer rational result with 10^18 fixed-point precision', () => {
			// ∫[0, 1] x^2 dx = 1/3 ≈ 0.333333333333333333
			const fn = (x) => (x * x) / S;
			const result = integralBigIntIterative(fn, 0n, S, 2n);
			assert.equal(result, 333_333_333_333_333_333n);
		});

		it('works with default steps and method parameters', () => {
			// ∫[0, 2] x^3 dx = 4
			const fn = (x) => (x * x * x) / (S * S);
			const result = integralBigIntIterative(fn, 0n, 2n * S);
			assert.equal(result, 4n * S);
		});
	});

	describe('edge cases', () => {
		it('returns 0n for a zero-width interval (a === b)', () => {
			const result = integralBigIntIterative((x) => x * 10n, 3n * S, 3n * S, 10n);
			assert.equal(result, 0n);
		});

		it('returns exact negation when bounds are reversed (a > b)', () => {
			// ∫[4, -1] (x^2 + 1) dx = -∫[-1, 4] (x^2 + 1) dx
			const fn = (x) => (x * x) / S + S;
			const forward = integralBigIntIterative(fn, -1n * S, 4n * S, 100n);
			const backward = integralBigIntIterative(fn, 4n * S, -1n * S, 100n);
			assert.equal(backward, -forward);
		});

		it('integrates an odd function over a symmetric interval to 0n', () => {
			// ∫[-3, 3] x^3 dx = 0
			const fn = (x) => (x * x * x) / (S * S);
			const result = integralBigIntIterative(fn, -3n * S, 3n * S, 20n);
			assert.equal(result, 0n);
		});

		it('handles negative-only intervals and negative integrand values', () => {
			// ∫[-5, -2] (-2x) dx = [-x^2]_{-5}^{-2} = -4 - (-25) = 21
			const fn = (x) => -2n * x;
			const result = integralBigIntIterative(fn, -5n * S, -2n * S, 6n);
			assert.equal(result, 21n * S);
		});

		it('handles sub-unit intervals where span is smaller than steps', () => {
			// ∫[0, 7 * 10^-18] 1 dx = 7 * 10^-18
			const result = integralBigIntIterative(() => S, 0n, 7n, 100n);
			assert.equal(result, 7n);
		});

		it('handles very large BigInt bounds far beyond Number.MAX_SAFE_INTEGER without precision loss', () => {
			// ∫[0, 10^25] 2x dx = (10^25)^2 = 10^50 (scaled by 10^18 -> 10^68)
			const upper = 10n ** 25n * S;
			const result = integralBigIntIterative((x) => 2n * x, 0n, upper, 10n);
			assert.equal(result, 10n ** 50n * S);
		});

		it('supports trapezoidal rule with odd step counts including steps = 1n', () => {
			// ∫[0, 4] (x + 1) dx = 8 + 4 = 12
			const result = integralBigIntIterative((x) => x + S, 0n, 4n * S, 1n, 'trapezoidal');
			assert.equal(result, 12n * S);
		});
	});

	describe('independent cross-checks', () => {
		it('satisfies interval additivity: ∫[a, c] f = ∫[a, b] f + ∫[b, c] f', () => {
			// f(x) = x^3 - 2x + 7 on [-3, 5] split at 1.5
			const fn = (x) => (x * x * x) / (S * S) - 2n * x + 7n * S;
			const a = -3n * S;
			const b = (3n * S) / 2n; // 1.5
			const c = 5n * S;

			const whole = integralBigIntIterative(fn, a, c, 200n);
			const left = integralBigIntIterative(fn, a, b, 100n);
			const right = integralBigIntIterative(fn, b, c, 100n);

			// Analytic: [x^4/4 - x^2 + 7x]_{-3}^{5} = (156.25 - 25 + 35) - (20.25 - 9 - 21) = 166.25 - (-9.75) = 176
			assert.equal(whole, 176n * S);
			assert.equal(left + right, whole);
		});

		it('satisfies linearity: ∫(αf + βg) = α∫f + β∫g', () => {
			const f = (x) => (x * x) / S;
			const g = (x) => 3n * x + S;
			const alpha = 5n;
			const beta = -2n;
			const combined = (x) => alpha * f(x) + beta * g(x);

			const lhs = integralBigIntIterative(combined, 0n, 6n * S, 100n);
			const rhs =
				alpha * integralBigIntIterative(f, 0n, 6n * S, 100n) +
				beta * integralBigIntIterative(g, 0n, 6n * S, 100n);

			assert.equal(lhs, rhs);
		});

		it('matches analytic antiderivative of higher-degree polynomial x^4 and exhibits O(h^4) Simpson convergence', () => {
			// ∫[0, 1] x^4 dx = 1/5 = 0.2
			const fn = (x) => (x * x * x * x) / (S * S * S);
			const exact = S / 5n;

			const err50 = absBigInt(integralBigIntIterative(fn, 0n, S, 50n, 'simpson') - exact);
			const err100 = absBigInt(integralBigIntIterative(fn, 0n, S, 100n, 'simpson') - exact);
			const err1000 = absBigInt(integralBigIntIterative(fn, 0n, S, 1000n, 'simpson') - exact);

			// Doubling steps should shrink Simpson error by ~16x (2^4)
			const ratio = Number(err50) / Number(err100);
			assert.ok(ratio > 15.5 && ratio < 16.5, `Expected ~16x error reduction, got ${ratio}`);
			// At n = 1000, error ≈ 24 / (180 * 10^12) ≈ 1.33e-13 -> ~1.33e5 in scaled units
			assert.ok(err1000 < 200_000n, `Expected err1000 < 2e5, got ${err1000}`);
		});

		it('approximates π via ∫[0, 1] 4 / (1 + x^2) dx and agrees between Simpson and trapezoidal rules', () => {
			// ∫[0, 1] 4 / (1 + x^2) dx = π ≈ 3.141592653589793238
			const piScaled = 3_141_592_653_589_793_238n;
			const fn = (x) => (4n * S * S * S) / (S * S + x * x);

			const simpson = integralBigIntIterative(fn, 0n, S, 1000n, 'simpson');
			const trap = integralBigIntIterative(fn, 0n, S, 1000n, 'trapezoidal');

			// Simpson should be accurate to >13 decimal places (tolerance 10^5 in 10^18 scale = 10^-13)
			assertApproxBigInt(simpson, piScaled, 100_000n, 'Simpson π estimate');
			// Trapezoidal at n = 1000 has error ≈ 1/(6*10^6) ≈ 1.67e-7 (tolerance 10^12 = 10^-6)
			assertApproxBigInt(trap, piScaled, 1_000_000_000_000n, 'Trapezoidal π estimate');
			// Simpson must be substantially more accurate than trapezoidal at the same step count
			assert.ok(absBigInt(simpson - piScaled) < absBigInt(trap - piScaled));
		});
	});

	describe('input validation', () => {
		it('throws TypeError when fn is not a function', () => {
			assert.throws(() => integralBigIntIterative(null, 0n, S), TypeError);
			assert.throws(() => integralBigIntIterative(42, 0n, S), TypeError);
			assert.throws(() => integralBigIntIterative('x => x', 0n, S), TypeError);
		});

		it('throws TypeError when bounds a or b are not BigInt', () => {
			const id = (x) => x;
			assert.throws(() => integralBigIntIterative(id, 0, S), TypeError);
			assert.throws(() => integralBigIntIterative(id, 0n, 1), TypeError);
			assert.throws(() => integralBigIntIterative(id, '0', S), TypeError);
			assert.throws(() => integralBigIntIterative(id, 0n, Number.NaN), TypeError);
		});

		it('throws TypeError when steps is not a BigInt', () => {
			const id = (x) => x;
			assert.throws(() => integralBigIntIterative(id, 0n, S, 100), TypeError);
			assert.throws(() => integralBigIntIterative(id, 0n, S, '100'), TypeError);
			assert.throws(() => integralBigIntIterative(id, 0n, S, null), TypeError);
		});

		it('throws RangeError when steps is zero or negative', () => {
			const id = (x) => x;
			assert.throws(() => integralBigIntIterative(id, 0n, S, 0n), RangeError);
			assert.throws(() => integralBigIntIterative(id, 0n, S, -10n), RangeError);
			assert.throws(() => integralBigIntIterative(id, 0n, S, 0n, 'trapezoidal'), RangeError);
		});

		it('throws RangeError when Simpson rule receives an odd number of steps', () => {
			const id = (x) => x;
			assert.throws(() => integralBigIntIterative(id, 0n, S, 1n, 'simpson'), RangeError);
			assert.throws(() => integralBigIntIterative(id, 0n, S, 99n, 'simpson'), RangeError);
		});

		it('throws TypeError or RangeError for invalid method values', () => {
			const id = (x) => x;
			assert.throws(() => integralBigIntIterative(id, 0n, S, 10n, 123), TypeError);
			assert.throws(() => integralBigIntIterative(id, 0n, S, 10n, 'euler'), RangeError);
			assert.throws(() => integralBigIntIterative(id, 0n, S, 10n, ''), RangeError);
		});

		it('throws TypeError when integrand returns a non-BigInt value', () => {
			assert.throws(() => integralBigIntIterative(() => 42, 0n, S, 4n), TypeError);
			assert.throws(() => integralBigIntIterative(() => undefined, 0n, S, 4n), TypeError);
		});

		it('validates arguments even when a === b', () => {
			assert.throws(() => integralBigIntIterative((x) => x, S, S, 3n, 'simpson'), RangeError);
			assert.throws(() => integralBigIntIterative((x) => x, S, S, 0n), RangeError);
			assert.throws(() => integralBigIntIterative(null, S, S), TypeError);
		});
	});
});
