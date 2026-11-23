import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lnBigIntRecursive } from './lnBigIntRecursive.js';

const SCALE = 10n ** 18n;

/**
 * Independent fixed-point exp(x / SCALE) * SCALE implementation using simple iterative
 * range reduction and Taylor series, used solely as an inverse-function cross-check.
 *
 * @param {bigint} xScaled - Non-negative fixed-point BigInt scaled by 10^18.
 * @returns {bigint} Fixed-point approximation of exp(xScaled / 10^18) * 10^18.
 */
function independentExpScaled(xScaled) {
	// Reduce x by halving k times so |x / 2^k| < 2^-10, then square k times.
	const guard = 10n ** 12n;
	const workScale = SCALE * guard;
	let x = xScaled * guard;
	let halvings = 0;
	const threshold = workScale >> 10n;
	while (x > threshold) {
		x = x >> 1n;
		halvings += 1;
	}

	let sum = workScale;
	let term = workScale;
	for (let k = 1n; term > 0n; k += 1n) {
		term = (term * x) / (k * workScale);
		sum += term;
	}

	for (let i = 0; i < halvings; i += 1) {
		sum = (sum * sum + (workScale >> 1n)) / workScale;
	}

	return (sum + (guard >> 1n)) / guard;
}

describe('lnBigIntRecursive', () => {
	describe('exact known values and normal cases', () => {
		it('returns 0n for 1n', () => {
			assert.equal(lnBigIntRecursive(1n), 0n);
		});

		it('matches high-precision reference values for small integers', () => {
			const expected = [
				[2n, 693147180559945309n],
				[3n, 1098612288668109691n],
				[4n, 1386294361119890619n],
				[5n, 1609437912434100375n],
				[6n, 1791759469228055001n],
				[7n, 1945910149055313305n],
				[8n, 2079441541679835928n],
				[9n, 2197224577336219383n],
				[10n, 2302585092994045684n],
				[100n, 4605170185988091368n],
				[1000n, 6907755278982137052n],
			];

			for (const [input, want] of expected) {
				assert.equal(
					lnBigIntRecursive(input),
					want,
					`Mismatch for ln(${input}n)`
				);
			}
		});

		it('handles exact powers of two and ten accurately', () => {
			// 100 * ln(2) = 69.31471805599453094172...
			assert.equal(lnBigIntRecursive(2n ** 100n), 69314718055994530942n);
			// 1000 * ln(2) = 693.14718055994530941723...
			assert.equal(lnBigIntRecursive(2n ** 1000n), 693147180559945309417n);
			// 18 * ln(10) = 41.44653167389282231232...
			assert.equal(lnBigIntRecursive(10n ** 18n), 41446531673892822312n);
			// 100 * ln(10) = 230.25850929940456840179...
			assert.equal(lnBigIntRecursive(10n ** 100n), 230258509299404568402n);
		});
	});

	describe('edge cases and large BigInts', () => {
		it('handles boundary values around sqrt(2) * 2^k', () => {
			// sqrt(2) * 1024 ≈ 1448.15468787
			const ln1448 = lnBigIntRecursive(1448n);
			const ln1449 = lnBigIntRecursive(1449n);
			assert.ok(ln1448 < ln1449);
			// Cross-check against Math.log within 1e-13 * SCALE
			const diff1448 = Math.abs(Number(ln1448) / 1e18 - Math.log(1448));
			const diff1449 = Math.abs(Number(ln1449) / 1e18 - Math.log(1449));
			assert.ok(diff1448 < 1e-13, `diff1448=${diff1448}`);
			assert.ok(diff1449 < 1e-13, `diff1449=${diff1449}`);
		});

		it('handles values immediately adjacent to large powers of two', () => {
			const p = 1n << 200n;
			const lnBelow = lnBigIntRecursive(p - 1n);
			const lnExact = lnBigIntRecursive(p);
			const lnAbove = lnBigIntRecursive(p + 1n);

			// 200 * ln(2) = 138.62943611198906188344...
			assert.equal(lnExact, 138629436111989061883n);
			// 1 / 2^200 < 10^-60 << 10^-18, so all three round to the same 18-digit fixed-point value
			assert.equal(lnBelow, lnExact);
			assert.equal(lnAbove, lnExact);
		});

		it('handles very large BigInts without stack overflow or precision loss', () => {
			// 10000 * ln(2) = 6931.47180559945309417232...
			assert.equal(lnBigIntRecursive(2n ** 10000n), 6931471805599453094172n);
			// 500 * ln(10) = 1151.29254649702284200899...
			assert.equal(lnBigIntRecursive(10n ** 500n), 1151292546497022842009n);
		});

		it('is strictly increasing across consecutive small integers', () => {
			let prev = lnBigIntRecursive(1n);
			for (let i = 2n; i <= 50n; i += 1n) {
				const curr = lnBigIntRecursive(i);
				assert.ok(curr > prev, `Expected ln(${i}n) > ln(${i - 1n}n)`);
				prev = curr;
			}
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-BigInt inputs', () => {
			const invalidTypes = [
				1,
				0,
				-5,
				2.718,
				NaN,
				Infinity,
				-Infinity,
				'10',
				'10n',
				null,
				undefined,
				true,
				false,
				{},
				[1n],
				Symbol('1'),
			];

			for (const bad of invalidTypes) {
				assert.throws(
					() => lnBigIntRecursive(bad),
					TypeError,
					`Expected TypeError for ${String(bad)}`
				);
			}
		});

		it('throws RangeError for zero and negative BigInt inputs', () => {
			const nonPositive = [0n, -1n, -2n, -(10n ** 50n)];
			for (const bad of nonPositive) {
				assert.throws(
					() => lnBigIntRecursive(bad),
					RangeError,
					`Expected RangeError for ${bad}n`
				);
			}
		});
	});

	describe('independent cross-checks', () => {
		it('agrees with Math.log across safe integer magnitudes', () => {
			const samples = [
				1n,
				2n,
				17n,
				42n,
				255n,
				256n,
				257n,
				123456n,
				999999999n,
				2n ** 52n + 12345n,
				BigInt(Number.MAX_SAFE_INTEGER),
			];

			for (const n of samples) {
				const got = Number(lnBigIntRecursive(n)) / 1e18;
				const expected = Math.log(Number(n));
				const relErr = expected === 0 ? Math.abs(got) : Math.abs(got - expected) / expected;
				assert.ok(relErr < 1e-14, `n=${n}: got=${got}, expected=${expected}, relErr=${relErr}`);
			}
		});

		it('satisfies the logarithmic product identity ln(a * b) = ln(a) + ln(b) within 1 ULP', () => {
			const pairs = [
				[3n, 7n],
				[123456789n, 987654321n],
				[2n ** 73n + 19n, 3n ** 41n + 7n],
				[10n ** 40n + 13n, 10n ** 60n + 29n],
			];

			for (const [a, b] of pairs) {
				const lhs = lnBigIntRecursive(a * b);
				const rhs = lnBigIntRecursive(a) + lnBigIntRecursive(b);
				const diff = lhs > rhs ? lhs - rhs : rhs - lhs;
				assert.ok(diff <= 1n, `Product identity failed for (${a}, ${b}): diff=${diff}`);
			}
		});

		it('inverts accurately under an independent fixed-point exp implementation', () => {
			const inputs = [1n, 2n, 3n, 7n, 15n, 42n, 100n, 12345n];
			for (const n of inputs) {
				const y = lnBigIntRecursive(n);
				const reconstructed = independentExpScaled(y);
				const target = n * SCALE;
				const diff = reconstructed > target ? reconstructed - target : target - reconstructed;
				// Allow small rounding tolerance proportional to n (derivative of exp is n)
				const tolerance = n * 20n + 20n;
				assert.ok(
					diff <= tolerance,
					`exp(ln(${n}n)) mismatch: reconstructed=${reconstructed}, target=${target}, diff=${diff}`
				);
			}
		});
	});
});
