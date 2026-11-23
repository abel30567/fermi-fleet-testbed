import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { arctanBigIntIterative } from './arctanBigIntIterative.js';

const SCALE = 10n ** 18n;
const PI_OVER_4_SCALED = 785398163397448310n;
const PI_OVER_2_SCALED = 1570796326794896619n;

/**
 * Independent BigInt reference for arctan(1 / k) using Gauss/Lambert's
 * generalized continued fraction evaluated bottom-up with exact rationals:
 *   arctan(1 / k) = 1 / (k + 1^2 / (3k + 2^2 / (5k + 3^2 / (7k + ...))))
 *
 * @param {bigint} k - Positive integer >= 1n.
 * @param {number} depth - Continued fraction depth.
 * @returns {bigint} Rounded fixed-point BigInt scaled by 10^18.
 */
function arctanReciprocalContinuedFraction(k, depth = 60) {
	let num = 0n;
	let den = 1n;
	for (let m = depth; m >= 1; m--) {
		const mb = BigInt(m);
		const a = mb * mb;
		const b = (2n * mb + 1n) * k;
		// new value = a / (b + num / den) = (a * den) / (b * den + num)
		const nextNum = a * den;
		const nextDen = b * den + num;
		num = nextNum;
		den = nextDen;
	}
	// Final step: 1 / (k + num / den) = den / (k * den + num)
	const finalNum = den;
	const finalDen = k * den + num;
	// Round half up: floor((finalNum * SCALE * 2 + finalDen) / (2 * finalDen))
	return (finalNum * SCALE * 2n + finalDen) / (2n * finalDen);
}

describe('arctanBigIntIterative', () => {
	describe('normal cases', () => {
		it('returns 0n for 0n', () => {
			assert.strictEqual(arctanBigIntIterative(0n), 0n);
		});

		it('computes arctan(1n) and arctan(-1n) accurately to 18 decimal places', () => {
			assert.strictEqual(arctanBigIntIterative(1n), PI_OVER_4_SCALED);
			assert.strictEqual(arctanBigIntIterative(-1n), -PI_OVER_4_SCALED);
		});

		it('computes exact rounded values for small positive integers', () => {
			// arctan(2)  = 1.107148717794090503017065...
			assert.strictEqual(arctanBigIntIterative(2n), 1107148717794090503n);
			// arctan(3)  = 1.249045772398254425829917...
			assert.strictEqual(arctanBigIntIterative(3n), 1249045772398254426n);
			// arctan(10) = 1.471127674303734591852875...
			assert.strictEqual(arctanBigIntIterative(10n), 1471127674303734592n);
		});

		it('satisfies odd symmetry arctan(-x) === -arctan(x)', () => {
			for (const x of [1n, 2n, 3n, 5n, 10n, 42n, 1000n, 10n ** 12n]) {
				assert.strictEqual(
					arctanBigIntIterative(-x),
					-arctanBigIntIterative(x),
				);
			}
		});
	});

	describe('edge cases', () => {
		it('approaches pi/2 for large positive BigInts and -pi/2 for large negative BigInts', () => {
			// For x = 10^9, pi/2 - 10^-9 = 1.570796325794896619...
			assert.strictEqual(
				arctanBigIntIterative(10n ** 9n),
				1570796325794896619n,
			);
			// For x = 10^18, pi/2 - 10^-18 = 1.570796326794896618231... -> rounds to ...618
			assert.strictEqual(
				arctanBigIntIterative(10n ** 18n),
				1570796326794896618n,
			);
			// For x >= 10^20, 1/x is negligible at 10^18 scale
			assert.strictEqual(arctanBigIntIterative(10n ** 20n), PI_OVER_2_SCALED);
			assert.strictEqual(arctanBigIntIterative(10n ** 100n), PI_OVER_2_SCALED);
			assert.strictEqual(arctanBigIntIterative(-(10n ** 20n)), -PI_OVER_2_SCALED);
			assert.strictEqual(
				arctanBigIntIterative(-(10n ** 100n)),
				-PI_OVER_2_SCALED,
			);
		});

		it('is strictly increasing across consecutive small integers and bounded by pi/2', () => {
			let prev = arctanBigIntIterative(-20n);
			for (let i = -19n; i <= 20n; i++) {
				const curr = arctanBigIntIterative(i);
				assert.ok(curr > prev, `Expected arctan(${i}) > arctan(${i - 1n})`);
				assert.ok(curr <= PI_OVER_2_SCALED && curr >= -PI_OVER_2_SCALED);
				prev = curr;
			}
		});

		it('throws TypeError for non-BigInt inputs', () => {
			const invalidInputs = [
				0,
				1,
				-1,
				1.5,
				NaN,
				Infinity,
				-Infinity,
				'0',
				'1',
				null,
				undefined,
				true,
				false,
				{},
				[],
				Symbol('1'),
			];
			for (const bad of invalidInputs) {
				assert.throws(() => arctanBigIntIterative(bad), TypeError);
			}
		});
	});

	describe('independent cross-checks', () => {
		it('matches Math.atan within IEEE-754 double precision across a wide range', () => {
			const samples = [
				-1000000, -1000, -50, -7, -3, -2, -1, 0, 1, 2, 3, 4, 5, 7, 10, 50,
				100, 1000, 1000000, 1e12,
			];
			for (const n of samples) {
				const expected = Math.atan(n);
				const actual = Number(arctanBigIntIterative(BigInt(n))) / 1e18;
				assert.ok(
					Math.abs(actual - expected) < 1e-15,
					`Mismatch for ${n}: actual=${actual}, expected=${expected}`,
				);
			}
		});

		it('matches exact continued-fraction reference to the last ULP via arctan(k) = pi/2 - arctan(1/k)', () => {
			const piOver4CF = arctanReciprocalContinuedFraction(1n, 60);
			assert.strictEqual(arctanBigIntIterative(1n), piOver4CF);

			// Compute pi/2 with extra precision via continued fraction for arctan(1)
			// and verify arctan(k) + arctan(1/k) = pi/2 to within <= 1 ULP of rounding.
			for (const k of [2n, 3n, 4n, 5n, 7n, 10n, 25n, 100n]) {
				const atanK = arctanBigIntIterative(k);
				const atanRecipCF = arctanReciprocalContinuedFraction(k, 60);
				const sum = atanK + atanRecipCF;
				const diff =
					sum >= PI_OVER_2_SCALED
						? sum - PI_OVER_2_SCALED
						: PI_OVER_2_SCALED - sum;
				assert.ok(
					diff <= 1n,
					`Identity mismatch for k=${k}: atan(k)+atan(1/k)=${sum}, pi/2=${PI_OVER_2_SCALED}`,
				);
			}
		});

		it('satisfies Euler identity arctan(1) + arctan(2) + arctan(3) = pi', () => {
			const lhs =
				arctanBigIntIterative(1n) +
				arctanBigIntIterative(2n) +
				arctanBigIntIterative(3n);
			const piScaled = 3141592653589793238n;
			const diff = lhs >= piScaled ? lhs - piScaled : piScaled - lhs;
			assert.ok(
				diff <= 2n,
				`Expected arctan(1)+arctan(2)+arctan(3) ≈ pi (${piScaled}), got ${lhs}`,
			);
		});
	});
});
