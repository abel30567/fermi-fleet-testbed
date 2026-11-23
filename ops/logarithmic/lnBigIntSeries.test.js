import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lnBigIntSeries, SCALE } from './lnBigIntSeries.js';

/**
 * Independent fixed-point exp(x) using range reduction by 2^k and
 * Taylor series sum_{j=0}^\infty t^j / j!, for inverse cross-checking
 * that exp(ln(n)) ~= n without sharing any code with lnBigIntSeries.
 *
 * @param {bigint} xScaled - Fixed-point value scaled by 10^18 (x >= 0).
 * @returns {bigint} Fixed-point exp(x) scaled by 10^18.
 */
function independentExpFixed(xScaled) {
	const guard = 10n ** 12n;
	const workScale = SCALE * guard;
	let t = xScaled * guard;

	// Halve argument until t <= 0.25 so exp(t) converges rapidly
	let halvings = 0;
	while (t > workScale / 4n) {
		t >>= 1n;
		halvings += 1;
	}

	// Taylor series: exp(t) = sum_{j=0}^\infty t^j / j!
	let sum = workScale;
	let term = workScale;
	let j = 1n;
	while (term !== 0n) {
		term = (term * t) / (workScale * j);
		sum += term;
		j += 1n;
	}

	// Square `halvings` times to recover exp(x)
	for (let i = 0; i < halvings; i++) {
		sum = (sum * sum) / workScale;
	}

	return (sum + guard / 2n) / guard;
}

describe('lnBigIntSeries', () => {
	describe('input validation', () => {
		it('throws TypeError for non-BigInt inputs', () => {
			for (const bad of [1, 2, 0, -1, 1.5, NaN, Infinity, '10', null, undefined, true, {}, []]) {
				assert.throws(() => lnBigIntSeries(bad), TypeError);
			}
		});

		it('throws RangeError for zero and negative BigInts', () => {
			for (const bad of [0n, -1n, -2n, -1000n, -(10n ** 50n)]) {
				assert.throws(() => lnBigIntSeries(bad), RangeError);
			}
		});
	});

	describe('exact known values (scaled by 10^18)', () => {
		it('returns 0n for 1n', () => {
			assert.equal(lnBigIntSeries(1n), 0n);
		});

		it('matches high-precision reference constants to the exact last digit', () => {
			// Known values of round(ln(n) * 10^18)
			const reference = [
				[2n, 693147180559945309n],
				[3n, 1098612288668109691n],
				[4n, 1386294361119890619n],
				[5n, 1609437912434100375n],
				[7n, 1945910149055313305n],
				[10n, 2302585092994045684n],
				[100n, 4605170185988091368n],
				[1000n, 6907755278982137052n],
				[10n ** 18n, 41446531673892822312n],
			];

			for (const [input, expected] of reference) {
				assert.equal(
					lnBigIntSeries(input),
					expected,
					`Mismatch for ln(${input})`
				);
			}
		});
	});

	describe('edge cases and large BigInts', () => {
		it('handles exact powers of 2 accurately', () => {
			const ln2 = lnBigIntSeries(2n);
			for (const exp of [1, 2, 10, 53, 64, 128, 1000]) {
				const n = 1n << BigInt(exp);
				const actual = lnBigIntSeries(n);
				// Within exp ulps of exp * rounded(ln2)
				const approx = BigInt(exp) * ln2;
				const diff = actual > approx ? actual - approx : approx - actual;
				assert.ok(
					diff <= BigInt(exp),
					`ln(2^${exp}): diff ${diff} exceeded ${exp}`
				);
			}
		});

		it('handles values on both sides of the argument-reduction split (17/12 * 2^k)', () => {
			// Sweep consecutive integers around multiple powers of 2
			for (let n = 2n; n <= 40n; n++) {
				const actual = lnBigIntSeries(n);
				const expectedApprox = Math.log(Number(n)) * 1e18;
				const relErr = Math.abs(Number(actual) - expectedApprox) / expectedApprox;
				assert.ok(
					relErr < 1e-14,
					`n=${n}: relative error ${relErr} too large`
				);
			}
		});

		it('handles BigInts far larger than Number.MAX_VALUE (~1.8e308)', () => {
			// 10^400 overflows IEEE-754 double; ln(10^400) = 400 * ln(10)
			// 400 * 2.302585092994045684017991454684364... = 921.034037197618273607...
			const n = 10n ** 400n;
			assert.equal(lnBigIntSeries(n), 921034037197618273607n);
		});

		it('is strictly monotonically increasing for consecutive large integers', () => {
			const base = 10n ** 12n;
			const a = lnBigIntSeries(base);
			const b = lnBigIntSeries(base + 1n);
			// ln(base + 1) - ln(base) ~= 1 / base = 10^-12 -> 10^6 in fixed point
			assert.ok(b > a, 'Expected ln(base + 1) > ln(base)');
			assert.equal(b - a, 1_000_000n);
		});
	});

	describe('independent cross-checks', () => {
		it('cross-checks against Math.log across small and medium integers', () => {
			const samples = [
				2n, 3n, 6n, 9n, 17n, 42n, 99n, 255n, 256n, 257n,
				1024n, 65537n, 1_000_000n, 123_456_789n, (1n << 53n) - 1n,
			];
			for (const n of samples) {
				const got = Number(lnBigIntSeries(n)) / 1e18;
				const ref = Math.log(Number(n));
				const relErr = Math.abs(got - ref) / ref;
				assert.ok(
					relErr < 1e-14,
					`Math.log mismatch for ${n}: got=${got}, ref=${ref}, relErr=${relErr}`
				);
			}
		});

		it('cross-checks against independent exp(x) inverse: exp(ln(n)) ~= n', () => {
			const samples = [1n, 2n, 3n, 5n, 7n, 10n, 13n, 37n, 100n, 999n, 10_000n, 123_456n];
			for (const n of samples) {
				const y = lnBigIntSeries(n);
				const recovered = independentExpFixed(y);
				const expected = n * SCALE;
				const diff = recovered > expected ? recovered - expected : expected - recovered;
				// Error in exp(y) due to 0.5 ulp rounding of y is at most ~0.5 * n ulps + guard noise
				const tolerance = n + 10n;
				assert.ok(
					diff <= tolerance,
					`exp(ln(${n})) mismatch: recovered=${recovered}, expected=${expected}, diff=${diff}`
				);
			}
		});

		it('satisfies logarithm multiplicative identity ln(a * b) == ln(a) + ln(b) within 1 ulp', () => {
			const pairs = [
				[2n, 3n],
				[7n, 13n],
				[12345n, 67890n],
				[10n ** 25n + 7n, 10n ** 30n + 19n],
				[(1n << 200n) + 123456789n, (1n << 300n) + 987654321n],
			];
			for (const [a, b] of pairs) {
				const lhs = lnBigIntSeries(a * b);
				const rhs = lnBigIntSeries(a) + lnBigIntSeries(b);
				const diff = lhs > rhs ? lhs - rhs : rhs - lhs;
				assert.ok(
					diff <= 1n,
					`Identity ln(${a}*${b}) failed: lhs=${lhs}, rhs=${rhs}, diff=${diff}`
				);
			}
		});

		it('satisfies analytic difference bounds 1/(n+1) < ln(n+1) - ln(n) < 1/n', () => {
			for (const n of [1n, 2n, 5n, 10n, 100n, 10_000n, 1_000_000n]) {
				const diff = lnBigIntSeries(n + 1n) - lnBigIntSeries(n);
				const lower = SCALE / (n + 1n);
				const upper = (SCALE + n - 1n) / n;
				assert.ok(
					diff >= lower - 1n && diff <= upper + 1n,
					`Bounds failed for n=${n}: lower=${lower}, diff=${diff}, upper=${upper}`
				);
			}
		});
	});
});
