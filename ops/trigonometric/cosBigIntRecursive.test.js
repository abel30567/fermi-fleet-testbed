import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	cosBigIntRecursive,
	SCALE,
	PI_SCALED,
	HALF_PI_SCALED,
	TWO_PI_SCALED,
} from './cosBigIntRecursive.js';

/**
 * Independent naive iterative Taylor series reference implementation for cos(x / 10^18)
 * using 50 extra guard digits (only intended for moderate angles |θ| <= 10).
 *
 * @param {bigint} x - Angle scaled by 10^18.
 * @returns {bigint}
 */
function naiveIterativeCos(x) {
	const guard = 10n ** 50n;
	const workScale = SCALE * guard;
	const absX = x < 0n ? -x : x;
	const theta = absX * guard;
	const thetaSq = theta * theta;

	let sum = workScale;
	let term = workScale;

	for (let k = 1n; k <= 80n; k++) {
		term = (-term * thetaSq) / (workScale * workScale * (2n * k - 1n) * (2n * k));
		if (term === 0n) {
			break;
		}
		sum += term;
	}

	// Round half-to-even from workScale down to SCALE
	const neg = sum < 0n;
	const absSum = neg ? -sum : sum;
	const q = absSum / guard;
	const r = absSum % guard;
	const rounded =
		r * 2n > guard || (r * 2n === guard && (q & 1n) === 1n) ? q + 1n : q;
	return neg ? -rounded : rounded;
}

/**
 * Helper to assert two BigInts are within `maxDiff` ULP.
 */
function assertCloseBigInt(actual, expected, maxDiff, message) {
	const diff = actual >= expected ? actual - expected : expected - actual;
	assert.ok(
		diff <= maxDiff,
		`${message ?? 'Values differ'}: actual=${actual}, expected=${expected}, diff=${diff} > ${maxDiff}`
	);
}

describe('cosBigIntRecursive', () => {
	describe('exported constants', () => {
		it('exports expected 10^18 fixed-point constants', () => {
			assert.equal(SCALE, 10n ** 18n);
			assert.equal(PI_SCALED, 3141592653589793238n);
			assert.equal(HALF_PI_SCALED, 1570796326794896619n);
			assert.equal(TWO_PI_SCALED, 6283185307179586477n);
		});
	});

	describe('special angles and exact 18-digit reference values', () => {
		it('computes cos(0) = 1 exactly', () => {
			assert.equal(cosBigIntRecursive(0n), SCALE);
		});

		it('computes cos at multiples of π/6, π/4, π/3, π/2, π, 2π', () => {
			// π/6 ≈ 0.523598775598298873 -> cos(π/6) = √3 / 2 ≈ 0.866025403784438647
			assert.equal(cosBigIntRecursive(523598775598298873n), 866025403784438647n);
			// π/4 ≈ 0.785398163397448310 -> cos(π/4) = √2 / 2 ≈ 0.707106781186547524
			assert.equal(cosBigIntRecursive(785398163397448310n), 707106781186547524n);
			// π/3 ≈ 1.047197551196597746 -> cos(π/3) = 0.5
			assert.equal(cosBigIntRecursive(1047197551196597746n), 500000000000000000n);
			// π/2 ≈ 1.570796326794896619 -> cos(π/2) = 0
			assert.equal(cosBigIntRecursive(HALF_PI_SCALED), 0n);
			// Just past π/2: 1.570796326794896620 -> -0.768678...e-18 -> rounds to -1n
			assert.equal(cosBigIntRecursive(HALF_PI_SCALED + 1n), -1n);
			// 2π/3 ≈ 2.094395102393195492 -> cos(2π/3) = -0.5
			assert.equal(cosBigIntRecursive(2094395102393195492n), -500000000000000000n);
			// π -> -1
			assert.equal(cosBigIntRecursive(PI_SCALED), -SCALE);
			// 3π/2 ≈ 4.712388980384689858 -> 0
			assert.equal(cosBigIntRecursive(4712388980384689858n), 0n);
			// 2π -> 1
			assert.equal(cosBigIntRecursive(TWO_PI_SCALED), SCALE);
		});

		it('matches known 18-digit exact values for rational radian inputs', () => {
			// cos(0.5) = 0.877582561890372716116...
			assert.equal(cosBigIntRecursive(500000000000000000n), 877582561890372716n);
			// cos(1.0) = 0.540302305868139717400...
			assert.equal(cosBigIntRecursive(SCALE), 540302305868139717n);
			// cos(2.0) = -0.416146836547142386997...
			assert.equal(cosBigIntRecursive(2n * SCALE), -416146836547142387n);
			// cos(3.0) = -0.989992496600445457271...
			assert.equal(cosBigIntRecursive(3n * SCALE), -989992496600445457n);
			// cos(10.0) = -0.839071529076452452258...
			assert.equal(cosBigIntRecursive(10n * SCALE), -839071529076452452n);
		});
	});

	describe('small-angle precision and boundary rounding', () => {
		it('handles tiny non-zero angles accurately without cancellation', () => {
			assert.equal(cosBigIntRecursive(1n), SCALE);
			assert.equal(cosBigIntRecursive(-1n), SCALE);
			// θ = 10^-9: cos(θ) = 1 - 0.5e-18 + (1/24)e-36 > 1 - 0.5e-18 -> rounds up to SCALE
			assert.equal(cosBigIntRecursive(10n ** 9n), SCALE);
			// θ = 10^-9 + 10^-18: cos(θ) < 1 - 0.5e-18 -> rounds down to SCALE - 1n
			assert.equal(cosBigIntRecursive(10n ** 9n + 1n), SCALE - 1n);
		});
	});

	describe('symmetry, periodicity, and algebraic identities', () => {
		it('satisfies exact even symmetry cos(-x) === cos(x)', () => {
			const samples = [
				1n,
				123456789012345678n,
				HALF_PI_SCALED,
				SCALE,
				PI_SCALED,
				7n * SCALE,
				10n ** 35n,
				10n ** 100n,
			];
			for (const x of samples) {
				assert.equal(cosBigIntRecursive(-x), cosBigIntRecursive(x), `symmetry failed at x=${x}`);
			}
		});

		it('satisfies double-angle identity cos(2x) ≈ 2*cos(x)^2 - 1', () => {
			const samples = [
				0n,
				100000000000000000n,
				500000000000000000n,
				1234567890123456789n,
				-2718281828459045235n,
				10n * SCALE,
				-42n * SCALE,
				10n ** 50n,
				10n ** 100n,
			];
			for (const x of samples) {
				const c = cosBigIntRecursive(x);
				const c2 = cosBigIntRecursive(2n * x);
				const rhs = (2n * c * c) / SCALE - SCALE;
				assertCloseBigInt(c2, rhs, 3n, `double-angle failed at x=${x}`);
			}
		});

		it('satisfies triple-angle identity cos(3x) ≈ 4*cos(x)^3 - 3*cos(x)', () => {
			const samples = [
				250000000000000000n,
				SCALE,
				-1750000000000000000n,
				5n * SCALE,
				10n ** 40n,
			];
			for (const x of samples) {
				const c = cosBigIntRecursive(x);
				const c3 = cosBigIntRecursive(3n * x);
				const rhs = (4n * c * c * c) / (SCALE * SCALE) - 3n * c;
				assertCloseBigInt(c3, rhs, 8n, `triple-angle failed at x=${x}`);
			}
		});

		it('satisfies Pythagorean identity cos(x)^2 + cos(π/2 - x)^2 ≈ 1', () => {
			const samples = [
				0n,
				123456789012345678n,
				500000000000000000n,
				SCALE,
				2500000000000000000n,
				-3700000000000000000n,
				10n ** 30n,
			];
			for (const x of samples) {
				const cosX = cosBigIntRecursive(x);
				const sinX = cosBigIntRecursive(HALF_PI_SCALED - x);
				const sumSq = (cosX * cosX + sinX * sinX) / SCALE;
				assertCloseBigInt(sumSq, SCALE, 3n, `Pythagorean identity failed at x=${x}`);
			}
		});

		it('satisfies product-to-sum identity 2*cos(a)*cos(b) ≈ cos(a-b) + cos(a+b)', () => {
			const pairs = [
				[SCALE, 2n * SCALE],
				[-700000000000000000n, 1900000000000000000n],
				[10n ** 25n, 3n * 10n ** 25n],
			];
			for (const [a, b] of pairs) {
				const lhs = (2n * cosBigIntRecursive(a) * cosBigIntRecursive(b)) / SCALE;
				const rhs = cosBigIntRecursive(a - b) + cosBigIntRecursive(a + b);
				assertCloseBigInt(lhs, rhs, 3n, `product-to-sum failed for a=${a}, b=${b}`);
			}
		});

		it('always returns values within [-SCALE, SCALE]', () => {
			const samples = [
				0n,
				1n,
				-1n,
				HALF_PI_SCALED,
				PI_SCALED,
				TWO_PI_SCALED,
				10n ** 25n,
				-(10n ** 60n),
				10n ** 120n,
			];
			for (const x of samples) {
				const val = cosBigIntRecursive(x);
				assert.ok(val >= -SCALE && val <= SCALE, `out of bounds for x=${x}: ${val}`);
			}
		});
	});

	describe('cross-checks against independent computations', () => {
		it('matches independent naive iterative Taylor reference with 0 ULP error', () => {
			const samples = [
				-5n * SCALE,
				-3141592653589793238n,
				-2345678901234567890n,
				-1000000000000000000n,
				-123456789012345678n,
				-1000000000n,
				0n,
				1n,
				1000000000n,
				1000000001n,
				333333333333333333n,
				1000000000000000000n,
				1570796326794896619n,
				1570796326794896620n,
				2718281828459045235n,
				6283185307179586477n,
				8500000000000000000n,
			];
			for (const x of samples) {
				assert.equal(
					cosBigIntRecursive(x),
					naiveIterativeCos(x),
					`mismatch vs naive iterative Taylor at x=${x}`
				);
			}
		});

		it('matches Math.cos within tight tolerance across [-100, 100] radians', () => {
			for (let k = -100; k <= 100; k += 3) {
				const theta = k + 0.375; // exact binary float
				const x = BigInt(Math.round(theta * 1e6)) * 10n ** 12n;
				const approx = Number(cosBigIntRecursive(x)) / 1e18;
				const expected = Math.cos(theta);
				assert.ok(
					Math.abs(approx - expected) < 1e-14,
					`Math.cos mismatch at theta=${theta}: got ${approx}, expected ${expected}`
				);
			}
		});
	});

	describe('large BigInt inputs and stack safety', () => {
		it('handles very large BigInt angles accurately without stack overflow', () => {
			const huge = 10n ** 120n;
			const c = cosBigIntRecursive(huge);
			assert.ok(c >= -SCALE && c <= SCALE);
			// Verify consistency via double-angle and symmetry at 120-digit scale
			assert.equal(cosBigIntRecursive(-huge), c);
			const c2 = cosBigIntRecursive(2n * huge);
			const expectedC2 = (2n * c * c) / SCALE - SCALE;
			assertCloseBigInt(c2, expectedC2, 3n, 'double-angle failed at 10^120');
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-BigInt inputs', () => {
			const invalidInputs = [
				undefined,
				null,
				0,
				1,
				1.5,
				NaN,
				Infinity,
				-Infinity,
				'0',
				'1000000000000000000',
				true,
				false,
				{},
				[],
				Symbol('x'),
			];
			for (const bad of invalidInputs) {
				assert.throws(
					() => cosBigIntRecursive(bad),
					{ name: 'TypeError' },
					`Expected TypeError for ${String(bad)}`
				);
			}
		});
	});
});
