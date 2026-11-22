import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { log2BigIntSeries } from './log2BigIntSeries.js';

const SCALE = 10n ** 18n;

/**
 * Independent reference implementation of log2(n) * 10^18 using binary
 * squaring (shift-and-square bit extraction), completely independent of the
 * atanh Taylor series and ln(2).
 *
 * For n = 2^k * m with m in [1, 2):
 * Repeatedly square m: if m^2 >= 2, the next fractional binary bit is 1 and
 * m <- m^2 / 2; otherwise the bit is 0 and m <- m^2.
 * Extract 80 fractional binary bits (giving ~24 decimal digits of precision),
 * then convert the binary fraction to decimal scale 10^18 with rounding.
 *
 * @param {bigint} n - Positive BigInt integer.
 * @returns {bigint} Fixed-point log2(n) * 10^18.
 */
function referenceLog2BitByBit(n) {
	const k = BigInt(n.toString(2).length - 1);
	if ((n & (n - 1n)) === 0n) {
		return k * SCALE;
	}

	const PREC_BITS = 100n;
	const ONE = 1n << PREC_BITS;
	const TWO = 2n << PREC_BITS;

	// Represent m = n / 2^k at binary fixed-point scale 2^PREC_BITS.
	let m = k <= PREC_BITS ? n << (PREC_BITS - k) : n >> (k - PREC_BITS);

	const FRAC_BITS = 80;
	let fracBin = 0n;
	for (let i = 0; i < FRAC_BITS; i++) {
		m = (m * m) >> PREC_BITS;
		fracBin <<= 1n;
		if (m >= TWO) {
			fracBin |= 1n;
			m >>= 1n;
		}
	}

	const denom = 1n << BigInt(FRAC_BITS);
	const fracDec = (fracBin * SCALE + denom / 2n) / denom;
	return k * SCALE + fracDec;
}

describe('log2BigIntSeries', () => {
	describe('exact powers of 2', () => {
		it('returns k * 10^18 exactly for 2^k across small and large exponents', () => {
			const exponents = [0n, 1n, 2n, 3n, 10n, 31n, 32n, 53n, 63n, 64n, 128n, 512n, 2048n];
			for (const k of exponents) {
				assert.equal(log2BigIntSeries(1n << k), k * SCALE, `failed for 2^${k}`);
			}
		});
	});

	describe('known 18-digit fixed-point values', () => {
		it('matches high-precision reference constants to all 18 fractional digits', () => {
			// log2(3)    = 1.5849625007211561814537389439478...
			assert.equal(log2BigIntSeries(3n), 1584962500721156181n);

			// log2(5)    = 2.3219280948873623478703194294893...
			assert.equal(log2BigIntSeries(5n), 2321928094887362348n);

			// log2(7)    = 2.8073549220576041074419693172318...
			assert.equal(log2BigIntSeries(7n), 2807354922057604107n);

			// log2(10)   = 3.3219280948873623478703194294893...
			assert.equal(log2BigIntSeries(10n), 3321928094887362348n);

			// log2(10^18) = 18 * log2(10) = 59.794705707972522261665749730809...
			assert.equal(log2BigIntSeries(10n ** 18n), 59794705707972522262n);
		});
	});

	describe('edge cases and large BigInts', () => {
		it('returns 0n for n = 1n', () => {
			assert.equal(log2BigIntSeries(1n), 0n);
		});

		it('resolves tiny perturbations near powers of 2 accurately', () => {
			// log2(2^60 + 1) = 60 + 1/(2^60 * ln(2)) ≈ 60 + 1.2513e-18 -> 60*10^18 + 1
			assert.equal(log2BigIntSeries((1n << 60n) + 1n), 60n * SCALE + 1n);

			// log2(2^60 - 1) = 60 - 1/(2^60 * ln(2)) ≈ 60 - 1.2513e-18 -> 60*10^18 - 1
			assert.equal(log2BigIntSeries((1n << 60n) - 1n), 60n * SCALE - 1n);

			// For 2^1000 ± 1, the offset is ~10^-301 << 10^-18, so it rounds to 1000 * 10^18.
			assert.equal(log2BigIntSeries((1n << 1000n) + 1n), 1000n * SCALE);
			assert.equal(log2BigIntSeries((1n << 1000n) - 1n), 1000n * SCALE);
		});

		it('handles large shifted non-power-of-two BigInts exactly', () => {
			// log2(3 * 2^500) = 500 + log2(3)
			assert.equal(
				log2BigIntSeries(3n << 500n),
				500n * SCALE + 1584962500721156181n,
			);

			// log2(10 * 2^256) = 256 + log2(10)
			assert.equal(
				log2BigIntSeries(10n << 256n),
				256n * SCALE + 3321928094887362348n,
			);
		});

		it('is strictly monotonically increasing on positive integers', () => {
			let prev = log2BigIntSeries(1n);
			for (let n = 2n; n <= 100n; n++) {
				const curr = log2BigIntSeries(n);
				assert.ok(curr > prev, `expected log2(${n}) > log2(${n - 1n})`);
				prev = curr;
			}
		});
	});

	describe('cross-checks against identities and independent implementations', () => {
		it('satisfies the product identity log2(a * b) ≈ log2(a) + log2(b)', () => {
			const pairs = [
				[3n, 5n],
				[7n, 13n],
				[10n, 10n],
				[123456789n, 987654321n],
				[10n ** 25n + 7n, 10n ** 30n + 19n],
				[(1n << 200n) + 12345n, (1n << 300n) + 67891n],
			];

			for (const [a, b] of pairs) {
				const lhs = log2BigIntSeries(a * b);
				const rhs = log2BigIntSeries(a) + log2BigIntSeries(b);
				const diff = lhs >= rhs ? lhs - rhs : rhs - lhs;
				assert.ok(
					diff <= 1n,
					`product identity mismatch for (${a}, ${b}): diff=${diff}`,
				);
			}
		});

		it('satisfies the power identity log2(a^e) ≈ e * log2(a)', () => {
			const cases = [
				[3n, 17n],
				[10n, 50n],
				[13n, 29n],
			];

			for (const [a, e] of cases) {
				const lhs = log2BigIntSeries(a ** e);
				const rhs = e * log2BigIntSeries(a);
				const diff = lhs >= rhs ? lhs - rhs : rhs - lhs;
				// Up to e * 0.5 ULP rounding error in rhs plus 0.5 ULP in lhs.
				assert.ok(
					diff <= e,
					`power identity mismatch for ${a}^${e}: diff=${diff}`,
				);
			}
		});

		it('agrees with Math.log2 within IEEE-754 floating-point precision', () => {
			const values = [
				1n,
				2n,
				3n,
				6n,
				9n,
				10n,
				42n,
				100n,
				999n,
				65535n,
				65537n,
				10n ** 9n,
				10n ** 15n,
			];

			for (const n of values) {
				const exactScaled = log2BigIntSeries(n);
				const approxFloat = Number(exactScaled) / 1e18;
				const jsLog2 = Math.log2(Number(n));
				assert.ok(
					Math.abs(approxFloat - jsLog2) < 1e-13,
					`Math.log2 mismatch for ${n}: got ${approxFloat}, expected ${jsLog2}`,
				);
			}
		});

		it('matches an independent binary-squaring log2 algorithm to the last digit', () => {
			const values = [
				1n,
				2n,
				3n,
				5n,
				7n,
				10n,
				11n,
				99n,
				1023n,
				1025n,
				10n ** 12n + 3n,
				(1n << 95n) + 1234567890123456789n,
				(1n << 300n) * 7n + 999999999n,
			];

			for (const n of values) {
				const seriesVal = log2BigIntSeries(n);
				const bitByBitVal = referenceLog2BitByBit(n);
				assert.equal(
					seriesVal,
					bitByBitVal,
					`reference mismatch for n=${n}: series=${seriesVal}, ref=${bitByBitVal}`,
				);
			}
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-BigInt inputs', () => {
			const invalidTypes = [
				0,
				1,
				2,
				3.5,
				Number.NaN,
				Number.POSITIVE_INFINITY,
				Number.NEGATIVE_INFINITY,
				'2',
				'10',
				null,
				undefined,
				true,
				false,
				{},
				[2n],
				Symbol('2'),
			];

			for (const val of invalidTypes) {
				assert.throws(
					() => log2BigIntSeries(val),
					{ name: 'TypeError' },
					`expected TypeError for ${String(val)}`,
				);
			}
		});

		it('throws RangeError for non-positive BigInt inputs', () => {
			const invalidValues = [0n, -1n, -2n, -(10n ** 30n)];
			for (const val of invalidValues) {
				assert.throws(
					() => log2BigIntSeries(val),
					{ name: 'RangeError' },
					`expected RangeError for ${val}`,
				);
			}
		});
	});
});
