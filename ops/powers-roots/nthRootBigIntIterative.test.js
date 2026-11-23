import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nthRootBigIntIterative } from './nthRootBigIntIterative.js';

const SCALE = 10n ** 18n;

/**
 * Independent binary-search reference implementation for cross-checking.
 * Computes exact floor(|x|^(1/n) * 10^18) with sign preserved for negative odd roots.
 *
 * @param {bigint} x
 * @param {bigint} n
 * @returns {bigint}
 */
function nthRootBinarySearchReference(x, n) {
	if (x === 0n) return 0n;
	if (n === 1n) return x * SCALE;
	const neg = x < 0n;
	const absX = neg ? -x : x;
	if (absX === 1n) return neg ? -SCALE : SCALE;

	const target = absX * 10n ** (18n * n);
	const bitLen = BigInt(target.toString(2).length);
	let lo = 1n;
	let hi = 1n << ((bitLen + n - 1n) / n);

	while (lo < hi) {
		const mid = (lo + hi + 1n) >> 1n;
		if (mid ** n <= target) {
			lo = mid;
		} else {
			hi = mid - 1n;
		}
	}

	return neg ? -lo : lo;
}

describe('nthRootBigIntIterative', () => {
	describe('exact perfect powers', () => {
		it('computes exact square, cube, and higher roots', () => {
			assert.equal(nthRootBigIntIterative(4n, 2n), 2n * SCALE);
			assert.equal(nthRootBigIntIterative(9n, 2n), 3n * SCALE);
			assert.equal(nthRootBigIntIterative(144n, 2n), 12n * SCALE);
			assert.equal(nthRootBigIntIterative(27n, 3n), 3n * SCALE);
			assert.equal(nthRootBigIntIterative(16n, 4n), 2n * SCALE);
			assert.equal(nthRootBigIntIterative(243n, 5n), 3n * SCALE);
			assert.equal(nthRootBigIntIterative(1024n, 10n), 2n * SCALE);
		});

		it('computes exact negative odd roots', () => {
			assert.equal(nthRootBigIntIterative(-8n, 3n), -2n * SCALE);
			assert.equal(nthRootBigIntIterative(-27n, 3n), -3n * SCALE);
			assert.equal(nthRootBigIntIterative(-32n, 5n), -2n * SCALE);
			assert.equal(nthRootBigIntIterative(-128n, 7n), -2n * SCALE);
		});

		it('handles very large exact BigInt powers beyond Number.MAX_SAFE_INTEGER', () => {
			const base1 = 123456789012345678901234567890n;
			assert.equal(nthRootBigIntIterative(base1 ** 2n, 2n), base1 * SCALE);
			assert.equal(nthRootBigIntIterative(base1 ** 3n, 3n), base1 * SCALE);
			assert.equal(nthRootBigIntIterative(-(base1 ** 5n), 5n), -base1 * SCALE);

			const base2 = 1n << 100n;
			assert.equal(nthRootBigIntIterative(base2 ** 4n, 4n), base2 * SCALE);
		});
	});

	describe('non-integer fixed-point roots (10^18 scale)', () => {
		it('matches known mathematical constants truncated to 18 decimal places', () => {
			// sqrt(2) = 1.4142135623730950488016887...
			assert.equal(nthRootBigIntIterative(2n, 2n), 1_414_213_562_373_095_048n);
			// sqrt(3) = 1.7320508075688772935274463...
			assert.equal(nthRootBigIntIterative(3n, 2n), 1_732_050_807_568_877_293n);
			// cbrt(2) = 1.2599210498948731647672106...
			assert.equal(nthRootBigIntIterative(2n, 3n), 1_259_921_049_894_873_164n);
			// cbrt(-2) = -1.259921049894873164...
			assert.equal(nthRootBigIntIterative(-2n, 3n), -1_259_921_049_894_873_164n);
			// 10^(1/4) = 1.7782794100389228012254211...
			assert.equal(nthRootBigIntIterative(10n, 4n), 1_778_279_410_038_922_801n);
		});

		it('handles non-perfect large values near exact powers', () => {
			const base = 10n ** 20n;
			const justBelow = base ** 3n - 1n;
			const justAbove = base ** 3n + 1n;

			const rBelow = nthRootBigIntIterative(justBelow, 3n);
			const rAbove = nthRootBigIntIterative(justAbove, 3n);

			assert.ok(rBelow < base * SCALE);
			assert.equal(rBelow, base * SCALE - 1n);
			assert.equal(rAbove, base * SCALE);
		});
	});

	describe('edge cases', () => {
		it('handles zero, one, and minus one for arbitrary degrees', () => {
			assert.equal(nthRootBigIntIterative(0n, 1n), 0n);
			assert.equal(nthRootBigIntIterative(0n, 2n), 0n);
			assert.equal(nthRootBigIntIterative(0n, 100n), 0n);
			assert.equal(nthRootBigIntIterative(0n, 10n ** 50n), 0n);

			assert.equal(nthRootBigIntIterative(1n, 1n), SCALE);
			assert.equal(nthRootBigIntIterative(1n, 2n), SCALE);
			assert.equal(nthRootBigIntIterative(1n, 10n ** 50n), SCALE);

			assert.equal(nthRootBigIntIterative(-1n, 1n), -SCALE);
			assert.equal(nthRootBigIntIterative(-1n, 3n), -SCALE);
			assert.equal(nthRootBigIntIterative(-1n, 10n ** 50n + 1n), -SCALE);
		});

		it('handles degree n = 1n as exact scaling', () => {
			assert.equal(nthRootBigIntIterative(42n, 1n), 42n * SCALE);
			assert.equal(nthRootBigIntIterative(-42n, 1n), -42n * SCALE);
			const huge = 987654321098765432109876543210n;
			assert.equal(nthRootBigIntIterative(huge, 1n), huge * SCALE);
		});

		it('handles high degree roots', () => {
			// 2^(1/64) = 1.010889286051700460...
			const r64 = nthRootBigIntIterative(2n, 64n);
			const target = 2n * 10n ** (18n * 64n);
			assert.equal(r64, 1_010_889_286_051_700_460n);
			assert.ok(r64 ** 64n <= target);
			assert.ok((r64 + 1n) ** 64n > target);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-BigInt arguments', () => {
			assert.throws(() => nthRootBigIntIterative(4, 2n), TypeError);
			assert.throws(() => nthRootBigIntIterative(4n, 2), TypeError);
			assert.throws(() => nthRootBigIntIterative('4', 2n), TypeError);
			assert.throws(() => nthRootBigIntIterative(4n, '2'), TypeError);
			assert.throws(() => nthRootBigIntIterative(null, 2n), TypeError);
			assert.throws(() => nthRootBigIntIterative(4n, undefined), TypeError);
		});

		it('throws RangeError for non-positive degree n', () => {
			assert.throws(() => nthRootBigIntIterative(4n, 0n), RangeError);
			assert.throws(() => nthRootBigIntIterative(4n, -2n), RangeError);
			assert.throws(() => nthRootBigIntIterative(0n, 0n), RangeError);
		});

		it('throws RangeError for even roots of negative numbers', () => {
			assert.throws(() => nthRootBigIntIterative(-1n, 2n), RangeError);
			assert.throws(() => nthRootBigIntIterative(-16n, 4n), RangeError);
			assert.throws(() => nthRootBigIntIterative(-100n, 100n), RangeError);
		});
	});

	describe('independent cross-checks', () => {
		const testPairs = [
			[0n, 2n],
			[1n, 5n],
			[2n, 2n],
			[2n, 3n],
			[2n, 7n],
			[3n, 2n],
			[5n, 3n],
			[7n, 4n],
			[10n, 2n],
			[10n, 5n],
			[99n, 3n],
			[1000n, 3n],
			[1001n, 3n],
			[65535n, 4n],
			[65536n, 4n],
			[65537n, 4n],
			[-2n, 3n],
			[-100n, 5n],
			[-999999n, 7n],
			[10n ** 30n + 123456789n, 3n],
			[10n ** 40n + 7n, 5n],
			[-(10n ** 35n + 99n), 5n],
			[2n, 50n],
		];

		it('satisfies exact bracket inequality r^n <= |x| * 10^(18n) < (r + 1)^n', () => {
			for (const [x, n] of testPairs) {
				const r = nthRootBigIntIterative(x, n);
				const absX = x < 0n ? -x : x;
				const absR = r < 0n ? -r : r;

				assert.equal(r < 0n, x < 0n, `sign mismatch for (${x}, ${n})`);

				const scaled = absX * 10n ** (18n * n);
				assert.ok(
					absR ** n <= scaled,
					`lower bound failed for (${x}, ${n}): ${absR}^${n} > ${scaled}`,
				);
				assert.ok(
					(absR + 1n) ** n > scaled,
					`upper bound failed for (${x}, ${n}): (${absR}+1)^${n} <= ${scaled}`,
				);
			}
		});

		it('matches independent binary search reference across all test pairs', () => {
			for (const [x, n] of testPairs) {
				const actual = nthRootBigIntIterative(x, n);
				const expected = nthRootBinarySearchReference(x, n);
				assert.equal(
					actual,
					expected,
					`binary-search mismatch for (${x}, ${n}): got ${actual}, expected ${expected}`,
				);
			}
		});

		it('agrees with IEEE-754 Math.pow within float64 precision on safe-range inputs', () => {
			const safeCases = [
				[2n, 2n],
				[7n, 3n],
				[123456n, 5n],
				[999999999n, 4n],
				[-12345n, 3n],
				[2n, 20n],
			];

			for (const [x, n] of safeCases) {
				const r = nthRootBigIntIterative(x, n);
				const asFloat = Number(r) / 1e18;
				const sign = x < 0n ? -1 : 1;
				const expectedFloat = sign * Math.pow(Math.abs(Number(x)), 1 / Number(n));
				const relErr = Math.abs(asFloat - expectedFloat) / Math.abs(expectedFloat);
				assert.ok(
					relErr < 1e-14,
					`float64 cross-check failed for (${x}, ${n}): relErr=${relErr}`,
				);
			}
		});
	});
});
