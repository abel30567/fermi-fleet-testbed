import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { arcsinBigIntSeries } from './arcsinBigIntSeries.js';

const SCALE = 10n ** 18n;
const PI_HALF = 1570796326794896619n; // round(pi/2 * 10^18)
const PI_THIRD = 1047197551196597746n; // round(pi/3 * 10^18)
const PI_QUARTER = 785398163397448310n; // round(pi/4 * 10^18)
const PI_SIXTH = 523598775598298873n; // round(pi/6 * 10^18)

function absDiff(a, b) {
	return a >= b ? a - b : b - a;
}

/**
 * Independent BigInt Taylor series for sin(y) scaled by 10^18, computed at 10^36
 * internal precision to cross-check sin(arcsin(x)) == x to full 18-digit accuracy.
 */
function sinFixed(y) {
	const guard = 10n ** 18n;
	const W = SCALE * guard;
	const W2 = W * W;
	const yW = y * guard;
	const y2 = yW * yW;
	let term = yW;
	let sum = yW;
	for (let k = 1n; ; k++) {
		term = (-term * y2) / (2n * k * (2n * k + 1n) * W2);
		if (term === 0n) break;
		sum += term;
	}
	return sum >= 0n ? (sum + guard / 2n) / guard : -((-sum + guard / 2n) / guard);
}

describe('arcsinBigIntSeries', () => {
	describe('exact and known special values', () => {
		it('handles 0, +1, and -1', () => {
			assert.equal(arcsinBigIntSeries(0n), 0n);
			assert.equal(arcsinBigIntSeries(SCALE), PI_HALF);
			assert.equal(arcsinBigIntSeries(-SCALE), -PI_HALF);
		});

		it('handles +-0.5 exactly to 10^-18', () => {
			assert.equal(arcsinBigIntSeries(SCALE / 2n), PI_SIXTH);
			assert.equal(arcsinBigIntSeries(-(SCALE / 2n)), -PI_SIXTH);
		});

		it('handles +-sqrt(2)/2 and +-sqrt(3)/2', () => {
			const sqrt2Over2 = 707106781186547524n;
			const sqrt3Over2 = 866025403784438647n;
			assert.ok(absDiff(arcsinBigIntSeries(sqrt2Over2), PI_QUARTER) <= 2n);
			assert.ok(absDiff(arcsinBigIntSeries(-sqrt2Over2), -PI_QUARTER) <= 2n);
			assert.ok(absDiff(arcsinBigIntSeries(sqrt3Over2), PI_THIRD) <= 2n);
			assert.ok(absDiff(arcsinBigIntSeries(-sqrt3Over2), -PI_THIRD) <= 2n);
		});
	});

	describe('edge cases and boundaries', () => {
		it('handles smallest non-zero inputs (+-10^-18)', () => {
			assert.equal(arcsinBigIntSeries(1n), 1n);
			assert.equal(arcsinBigIntSeries(-1n), -1n);
		});

		it('is continuous and strictly increasing across the |x| = 0.5 range-reduction boundary', () => {
			const below = arcsinBigIntSeries(SCALE / 2n - 1n);
			const at = arcsinBigIntSeries(SCALE / 2n);
			const above = arcsinBigIntSeries(SCALE / 2n + 1n);

			assert.ok(below < at);
			assert.ok(at < above);
			// Derivative at 0.5 is 1/sqrt(0.75) ~= 1.1547, so 1 ulp step in x gives 1 or 2 ulps in y
			assert.ok(at - below <= 2n);
			assert.ok(above - at <= 2n);
		});

		it('handles inputs very close to +-1', () => {
			// For x = 1 - 10^-18, arcsin(x) = pi/2 - sqrt(2 * 10^-18) + O(10^-27)
			// sqrt(2) * 10^9 = 1414213562.373...
			const nearOne = arcsinBigIntSeries(SCALE - 1n);
			const expected = PI_HALF - 1414213562n;
			assert.ok(absDiff(nearOne, expected) <= 1n);
			assert.equal(arcsinBigIntSeries(-(SCALE - 1n)), -nearOne);

			// For x = 1 - 10^-12, arcsin(x) ~= pi/2 - sqrt(2) * 10^-6
			const nearOne2 = arcsinBigIntSeries(SCALE - 10n ** 6n);
			assert.ok(nearOne2 < nearOne);
			assert.ok(nearOne < PI_HALF);
		});

		it('preserves exact odd symmetry arcsin(-x) === -arcsin(x)', () => {
			const samples = [
				1n,
				123456789012345n,
				250000000000000000n,
				500000000000000000n,
				600000000000000000n,
				800000000000000000n,
				999999999999999999n,
				SCALE,
			];
			for (const s of samples) {
				assert.equal(arcsinBigIntSeries(-s), -arcsinBigIntSeries(s));
			}
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-BigInt inputs', () => {
			for (const bad of [0, 0.5, -1, NaN, Infinity, '0', '500000000000000000', null, undefined, {}, [], true]) {
				assert.throws(() => arcsinBigIntSeries(bad), TypeError);
			}
		});

		it('throws RangeError for inputs outside [-10^18, 10^18]', () => {
			for (const bad of [SCALE + 1n, -(SCALE + 1n), 2n * SCALE, -2n * SCALE, 10n ** 30n, -(10n ** 30n)]) {
				assert.throws(() => arcsinBigIntSeries(bad), RangeError);
			}
		});
	});

	describe('independent cross-checks', () => {
		it('matches Math.asin within IEEE-754 double precision across [-1, 1]', () => {
			for (let i = -20; i <= 20; i++) {
				const x = (BigInt(i) * SCALE) / 20n;
				const actual = arcsinBigIntSeries(x);
				const expected = BigInt(Math.round(Math.asin(i / 20) * 1e18));
				assert.ok(
					absDiff(actual, expected) <= 2000n,
					`Mismatch at i=${i}: actual=${actual}, expected=${expected}`
				);
			}
		});

		it('satisfies sin(arcsin(x)) == x to 10^-18 precision via independent BigInt sin series', () => {
			const testPoints = [
				-999999000000000000n,
				-950000000000000000n,
				-750000000000000000n,
				-500000000000000001n,
				-500000000000000000n,
				-333333333333333333n,
				-100000000000000000n,
				0n,
				100000000000000000n,
				333333333333333333n,
				500000000000000000n,
				500000000000000001n,
				750000000000000000n,
				950000000000000000n,
				999999000000000000n,
			];
			for (const x of testPoints) {
				const y = arcsinBigIntSeries(x);
				const back = sinFixed(y);
				assert.ok(
					absDiff(back, x) <= 2n,
					`sin(arcsin(${x})) = ${back} differs by ${absDiff(back, x)}`
				);
			}
		});

		it('satisfies arcsin(a) + arcsin(b) == pi/2 for exact decimal Pythagorean triples', () => {
			// (3/5, 4/5) = (0.6, 0.8) and (7/25, 24/25) = (0.28, 0.96)
			const pairs = [
				[600000000000000000n, 800000000000000000n],
				[280000000000000000n, 960000000000000000n],
			];
			for (const [a, b] of pairs) {
				const sum = arcsinBigIntSeries(a) + arcsinBigIntSeries(b);
				assert.ok(
					absDiff(sum, PI_HALF) <= 1n,
					`arcsin(${a}) + arcsin(${b}) = ${sum}, expected ${PI_HALF}`
				);
			}
		});
	});
});
