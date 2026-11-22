const SCALE = 10n ** 18n;
const SCALE_SQ = SCALE * SCALE;
const GUARD = 10n ** 24n;
const MIN_SCALED_BITS = 48;

/**
 * Computes the exact integer floor square root `floor(sqrt(value))` for a
 * positive BigInt using Heron's integer recurrence initialized from bit length.
 *
 * @param {bigint} value - Positive BigInt integer.
 * @returns {bigint} Exact `floor(sqrt(value))`.
 */
function isqrt(value) {
	const bits = value.toString(2).length;
	let x = 1n << BigInt(Math.ceil(bits / 2));
	while (true) {
		const next = (x + value / x) >> 1n;
		if (next >= x) {
			return x;
		}
		x = next;
	}
}

/**
 * Computes the square root of a non-negative exact BigInt integer `n`,
 * returned as a fixed-point BigInt scaled by `10^18` (rounded to the nearest
 * integer, and exact for all perfect squares).
 *
 * Algorithm / Identity:
 * 1. For small inputs (`bitLength(n) < 48`), apply the exact power-of-4 scaling
 *    identity:
 *      sqrt(n) = sqrt(n * 4^m) / 2^m
 *    choosing `m = ceil((48 - bitLength(n)) / 2)` so that `n' = n * 4^m` has
 *    at least 48 bits and `r = floor(sqrt(n')) >= 2^23`. For larger inputs,
 *    `m = 0` and `n' = n`.
 * 2. Decompose `n' = r^2 + d` where `r = floor(sqrt(n'))` and `0 <= d <= 2r`.
 *    If `d === 0n`, `n` is a perfect square and `(r >> m) * 10^18` is exact.
 * 3. Otherwise, expand `sqrt(r^2 + d) = r * sqrt(1 + d / r^2)` using the
 *    generalized binomial Taylor series:
 *      sqrt(1 + x) = sum_{k=0}^{infty} C(1/2, k) * x^k
 *    with term recurrence:
 *      T_0 = r * 10^18 * GUARD
 *      T_k = T_{k-1} * ((3 - 2k) * d) / (2k * r^2)
 *    Because `0 < x = d / r^2 <= 2 / r < 2^-22`, the alternating series
 *    converges to 24 extra guard decimal digits in at most 8 iterations for any
 *    non-negative BigInt `n`.
 * 4. Descale by `2^m * GUARD` with half-up rounding and verify the exact
 *    nearest-integer boundary `(2y - 1)^2 < 4 * n * 10^36 < (2y + 1)^2` so
 *    even adversarial near-half-integer cases round with 0-ULP error.
 *
 * @param {bigint} n - Non-negative BigInt integer (`n >= 0n`).
 * @returns {bigint} Fixed-point BigInt representing `round(sqrt(n) * 10^18)`.
 * @throws {TypeError} If `n` is not a BigInt.
 * @throws {RangeError} If `n < 0n`.
 */
export function sqrtBigIntSeries(n) {
	if (typeof n !== 'bigint') {
		throw new TypeError(`Expected a BigInt argument for n, received ${typeof n}`);
	}
	if (n < 0n) {
		throw new RangeError('Expected a non-negative BigInt (n >= 0n)');
	}
	if (n === 0n) {
		return 0n;
	}

	const bits = n.toString(2).length;
	const shift = bits < MIN_SCALED_BITS ? Math.ceil((MIN_SCALED_BITS - bits) / 2) : 0;
	const shiftBig = BigInt(shift);
	const scaledN = shift > 0 ? n << (shiftBig << 1n) : n;

	const r = isqrt(scaledN);
	const r2 = r * r;
	const d = scaledN - r2;

	if (d === 0n) {
		return (r >> shiftBig) * SCALE;
	}

	// Generalized binomial series: r * SCALE * GUARD * sum_{k>=0} C(1/2, k) * (d / r^2)^k
	let term = r * SCALE * GUARD;
	let sum = term;
	for (let k = 1n; ; k += 1n) {
		term = (term * (3n - 2n * k) * d) / (2n * k * r2);
		if (term === 0n) {
			break;
		}
		sum += term;
	}

	const divisor = GUARD << shiftBig;
	let result = (sum + (divisor >> 1n)) / divisor;

	// Exact nearest-integer verification against 4 * n * 10^36
	const target4 = (n * SCALE_SQ) << 2n;
	const upper = (result << 1n) + 1n;
	if (upper * upper < target4) {
		result += 1n;
	} else if (result > 0n) {
		const lower = (result << 1n) - 1n;
		if (lower * lower > target4) {
			result -= 1n;
		}
	}

	return result;
}
