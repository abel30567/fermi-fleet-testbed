import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { log10BigIntRecursive } from './log10BigIntRecursive.js';

const SCALE = 10n ** 18n;

/**
 * Independent high-precision reference implementation of log10(n) * 10^18
 * using the atanh Taylor series for natural logarithms:
 *   ln(x) = 2 * sum_{k=0..inf} y^(2k+1) / (2k+1), where y = (x - 1) / (x + 1)
 * with binary range reduction into [1, 2) and ln(n) / ln(10).
 *
 * Completely independent from the recursive base-10 divide-and-conquer algorithm.
 */
function referenceLog10Scaled(n) {
	const P = 10n ** 45n;

	// ln(r / P) for r in [P, 2*P] via atanh series
	function lnScaledUnit(r) {
		// Further reduce r by repeated square root? No, for r in [1, 2],
		// y = (r - P) / (r + P) <= 1/3, so y^2 <= 1/9; ~50 terms exceed 45 digits.
		const num = r - P;
		const den = r + P;
		const y = (num * P) / den;
		const y2 = (y * y) / P;
		let term = y;
		let sum = 0n;
		for (let k = 1n; term > 0n; k += 2n) {
			sum += term / k;
			term = (term * y2) / P;
		}
		return 2n * sum;
	}

	const ln2 = lnScaledUnit(2n * P);

	function lnBigInt(val) {
		// Range-reduce val = 2^bits * m with m in [1, 2)
		const bitLen = BigInt(val.toString(2).length - 1);
		const mantissa = (val * P) >> bitLen;
		return bitLen * ln2 + lnScaledUnit(mantissa);
	}

	const lnN = lnBigInt(n);
	const ln10 = lnBigInt(10n);
	// Round (lnN / ln10) * SCALE to nearest integer
	return (lnN * SCALE + ln10 / 2n) / ln10;
}

describe('log10BigIntRecursive', () => {
	describe('exact powers of 10', () => {
		it('returns exact integer multiples of 10^18 for powers of 10', () => {
			assert.equal(log10BigIntRecursive(1n), 0n);
			assert.equal(log10BigIntRecursive(10n), 1n * SCALE);
			assert.equal(log10BigIntRecursive(100n), 2n * SCALE);
			assert.equal(log10BigIntRecursive(1000n), 3n * SCALE);
			assert.equal(log10BigIntRecursive(10n ** 18n), 18n * SCALE);
			assert.equal(log10BigIntRecursive(10n ** 100n), 100n * SCALE);
			assert.equal(log10BigIntRecursive(10n ** 1000n), 1000n * SCALE);
		});
	});

	describe('known non-integer values', () => {
		it('matches known 18-decimal-place constants for small integers', () => {
			// Known high-precision values of log10(n) rounded to 18 decimal places:
			// log10(2) = 0.3010299956639811952137...
			// log10(3) = 0.4771212547196624372950...
			// log10(5) = 0.6989700043360188047862...
			// log10(7) = 0.8450980400142568307122...
			// log10(9) = 0.9542425094393248745900...
			assert.equal(log10BigIntRecursive(2n), 301_029_995_663_981_195n);
			assert.equal(log10BigIntRecursive(3n), 477_121_254_719_662_437n);
			assert.equal(log10BigIntRecursive(5n), 698_970_004_336_018_805n);
			assert.equal(log10BigIntRecursive(7n), 845_098_040_014_256_831n);
			assert.equal(log10BigIntRecursive(9n), 954_242_509_439_324_875n);
		});

		it('handles multi-digit and large BigInt values accurately', () => {
			// log10(2^1000) = 1000 * 0.30102999566398119521373889... = 301.029995663981195214
			assert.equal(
				log10BigIntRecursive(2n ** 1000n),
				301n * SCALE + 29_995_663_981_195_214n
			);
			// log10(3 * 10^500) = 500 + log10(3)
			assert.equal(
				log10BigIntRecursive(3n * 10n ** 500n),
				500n * SCALE + 477_121_254_719_662_437n
			);
		});
	});

	describe('edge cases', () => {
		it('handles values immediately adjacent to powers of 10', () => {
			// Just below and just above 10^k for moderate k
			assert.ok(log10BigIntRecursive(999_999n) < 6n * SCALE);
			assert.ok(log10BigIntRecursive(1_000_001n) > 6n * SCALE);

			// Very large near-powers of 10 where difference < 0.5 * 10^-18 rounds cleanly
			assert.equal(log10BigIntRecursive(10n ** 60n - 1n), 60n * SCALE);
			assert.equal(log10BigIntRecursive(10n ** 60n + 1n), 60n * SCALE);
		});

		it('handles extremely large BigInts without stack overflow', () => {
			const huge = 10n ** 5000n;
			assert.equal(log10BigIntRecursive(huge), 5000n * SCALE);

			const hugeNonPower = 2n * 10n ** 5000n;
			assert.equal(
				log10BigIntRecursive(hugeNonPower),
				5000n * SCALE + 301_029_995_663_981_195n
			);
		});

		it('is monotonically non-decreasing across increasing inputs', () => {
			const values = [1n, 2n, 3n, 9n, 10n, 11n, 99n, 100n, 101n, 10n ** 20n - 1n, 10n ** 20n, 10n ** 20n + 1n];
			for (let i = 1; i < values.length; i++) {
				assert.ok(
					log10BigIntRecursive(values[i]) >= log10BigIntRecursive(values[i - 1]),
					`Expected log10(${values[i]}) >= log10(${values[i - 1]})`
				);
			}
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-BigInt arguments', () => {
			const invalidTypes = [
				10,
				0,
				-5,
				NaN,
				Infinity,
				-Infinity,
				'10',
				'100',
				null,
				undefined,
				true,
				false,
				{},
				[],
				Symbol('10'),
			];
			for (const val of invalidTypes) {
				assert.throws(
					() => log10BigIntRecursive(val),
					{ name: 'TypeError' },
					`Expected TypeError for ${String(val)}`
				);
			}
		});

		it('throws RangeError for zero and negative BigInt arguments', () => {
			const invalidValues = [0n, -1n, -10n, -(10n ** 100n)];
			for (const val of invalidValues) {
				assert.throws(
					() => log10BigIntRecursive(val),
					{ name: 'RangeError' },
					`Expected RangeError for ${val}n`
				);
			}
		});
	});

	describe('independent cross-checks', () => {
		it('matches independent atanh Taylor-series reference to the exact last digit', () => {
			const testInputs = [
				1n,
				2n,
				3n,
				4n,
				5n,
				6n,
				7n,
				8n,
				9n,
				11n,
				42n,
				99n,
				123456789n,
				999_999_999_999_999_999n,
				(1n << 64n) - 1n,
				(1n << 128n) + 1234567890123456789n,
				3n ** 250n,
				7n ** 150n,
				10n ** 35n - 1n,
				10n ** 35n + 1n,
			];

			for (const x of testInputs) {
				const actual = log10BigIntRecursive(x);
				const expected = referenceLog10Scaled(x);
				assert.equal(
					actual,
					expected,
					`Mismatch for x=${x}: actual=${actual}, expected=${expected}`
				);
			}
		});

		it('agrees with IEEE-754 Math.log10 within floating-point precision', () => {
			const samples = [2n, 7n, 37n, 1024n, 65537n, 1_000_003n, 123_456_789_012n];
			for (const x of samples) {
				const actual = Number(log10BigIntRecursive(x)) / 1e18;
				const expected = Math.log10(Number(x));
				assert.ok(
					Math.abs(actual - expected) < 1e-14,
					`Float mismatch for x=${x}: actual=${actual}, expected=${expected}`
				);
			}
		});

		it('satisfies logarithmic product and power identities', () => {
			// log10(2) + log10(5) === log10(10) === 10^18
			assert.equal(log10BigIntRecursive(2n) + log10BigIntRecursive(5n), SCALE);

			// log10(a * b) ≈ log10(a) + log10(b) within 1 ulp
			const pairs = [
				[13n, 29n],
				[10n ** 25n + 7n, 10n ** 30n + 19n],
				[2n ** 100n, 3n ** 80n],
			];
			for (const [a, b] of pairs) {
				const lhs = log10BigIntRecursive(a * b);
				const rhs = log10BigIntRecursive(a) + log10BigIntRecursive(b);
				const diff = lhs >= rhs ? lhs - rhs : rhs - lhs;
				assert.ok(diff <= 1n, `Product identity failed for (${a}, ${b}): diff=${diff}`);
			}
		});
	});
});
