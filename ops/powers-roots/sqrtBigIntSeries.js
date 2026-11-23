/**
 * Fixed-point scale factor (10^18) used for non-integer BigInt results.
 * A returned BigInt `r` represents the real value `r / 10^18`.
 * @type {bigint}
 */
export const SCALE = 10n ** 18n;

const SCALE_SQUARED = SCALE * SCALE;
const ANCHOR_BITS = 8;
const ANCHOR_MIN = 1n << BigInt(ANCHOR_BITS); // 256n
const ANCHOR_MAX = ANCHOR_MIN << 1n; // 512n

/**
 * Computes the square root of a non-negative exact BigInt integer as a
 * fixed-point BigInt scaled by 10^18 (rounded to the nearest 10^-18), using
 * exact dyadic range-reduction and the binomial power series for sqrt(1 + u).
 *
 * Mathematical basis:
 *   Given x > 0, let X = x * 10^36 so that sqrt(x) * 10^18 = sqrt(X).
 *   Choose a dyadic anchor a = m * 2^(k - 8) with A = a^2 closest to X so that
 *   u = (X - A) / A satisfies |u| < 1 / 255. Then by the exact identity
 *   sqrt(X) = a * sqrt(1 + u) and the binomial series:
 *
 *     sqrt(X) = sum_{n=0}^{infinity} a * C(1/2, n) * u^n
 *             = sum_{n=0}^{infinity} T_n
 *
 *   where T_0 = a and T_n = T_{n-1} * ((3 - 2n) * (X - A)) / (2n * A).
 *
 * Guard precision of (k + 32) bits guarantees that the rounded result is the
 * exact nearest integer to sqrt(x) * 10^18 (including exact multiples of 10^18
 * for all perfect squares).
 *
 * @param {bigint} x - Non-negative exact BigInt integer.
 * @returns {bigint} Fixed-point BigInt equal to round(sqrt(x) * 10^18).
 * @throws {TypeError} If `x` is not a BigInt.
 * @throws {RangeError} If `x` is negative.
 */
export function sqrtBigIntSeries(x) {
	if (typeof x !== 'bigint') {
		throw new TypeError(`Expected a BigInt argument, received ${typeof x}`);
	}
	if (x < 0n) {
		throw new RangeError('Cannot compute square root of a negative BigInt');
	}
	if (x === 0n) {
		return 0n;
	}

	const X = x * SCALE_SQUARED;
	const bitLen = X.toString(2).length;
	const k = (bitLen - 1) >> 1; // 4^k <= X < 4^(k+1), with k >= 59 since X >= 10^36

	// Extract top 17-18 bits q = floor(X / 2^(2k - 16)) in [65536, 262143]
	// and locate m = floor(sqrt(q)) in [256, 511] via 8-step binary search.
	const q = X >> BigInt(2 * k - 2 * ANCHOR_BITS);
	let lo = ANCHOR_MIN;
	let hi = ANCHOR_MAX;
	while (lo + 1n < hi) {
		const mid = (lo + hi) >> 1n;
		if (mid * mid <= q) {
			lo = mid;
		} else {
			hi = mid;
		}
	}

	// Pick the closer of aLo = lo * 2^(k - 8) and aHi = (lo + 1) * 2^(k - 8)
	// so that |u| = |X - A| / A < 1/255 (~8 bits of convergence per term).
	const shift = BigInt(k - ANCHOR_BITS);
	const aLo = lo << shift;
	const aHi = (lo + 1n) << shift;
	const sqLo = aLo * aLo;
	const sqHi = aHi * aHi;
	const useHi = sqHi - X < X - sqLo;
	const a = useHi ? aHi : aLo;
	const A = useHi ? sqHi : sqLo;
	const D = X - A;

	if (D === 0n) {
		return a;
	}

	// Evaluate a * sum_{n>=0} C(1/2, n) * (D / A)^n with (k + 32) guard bits.
	// Since |4X - (2m+1)^2| >= 1, sqrt(X) is always at least 1 / (8*sqrt(X) + 4)
	// away from any half-integer; k + 32 guard bits ensures exact rounding.
	const guardBits = BigInt(k + 32);
	let term = a << guardBits;
	let sum = term;

	for (let n = 1n; ; n += 1n) {
		term = (term * (3n - 2n * n) * D) / (2n * n * A);
		if (term === 0n) {
			break;
		}
		sum += term;
	}

	return (sum + (1n << (guardBits - 1n))) >> guardBits;
}
