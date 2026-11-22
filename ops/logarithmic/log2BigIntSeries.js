/**
 * Fixed-point output scale: 10^18.
 * @type {bigint}
 */
const OUTPUT_SCALE = 10n ** 18n;

/**
 * Internal working fixed-point scale with 12 guard digits: 10^30.
 * @type {bigint}
 */
const WORK_SCALE = 10n ** 30n;

/**
 * Maximum bit shift retained before truncating low-order bits when computing
 * the normalized mantissa m = n / 2^k at WORK_SCALE (2^-128 << 10^-30).
 * @type {bigint}
 */
const MAX_EXACT_SHIFT = 128n;

/**
 * Computes the bit length of a positive BigInt n (i.e., floor(log2(n)) + 1).
 *
 * @param {bigint} n - Positive BigInt integer.
 * @returns {bigint} Number of significant binary digits in n.
 */
function bitLength(n) {
	const hex = n.toString(16);
	const leadingNibble = Number.parseInt(hex[0], 16);
	const leadingBits = 32 - Math.clz32(leadingNibble);
	return BigInt(hex.length - 1) * 4n + BigInt(leadingBits);
}

/**
 * Computes ln((q + p) / (q - p)) * WORK_SCALE = 2 * atanh(p / q) * WORK_SCALE
 * via the Taylor series:
 *
 *   ln((1 + z) / (1 - z)) = 2 * sum_{j=0}^{inf} z^{2j + 1} / (2j + 1)
 *
 * where z = p / q with 0 <= p < q. For m in [1, 2], z = (m - 1) / (m + 1)
 * lies in [0, 1/3], so z^2 <= 1/9 and the series converges at least by a
 * factor of 9 per term (~32 terms for 10^30 working precision).
 *
 * @param {bigint} p - Non-negative numerator of z = p / q.
 * @param {bigint} q - Positive denominator of z = p / q, with p < q.
 * @returns {bigint} Scaled natural logarithm at WORK_SCALE (10^30).
 */
function lnAtanhSeriesScaled(p, q) {
	if (p === 0n) {
		return 0n;
	}

	const p2 = p * p;
	const q2 = q * q;

	let power = (WORK_SCALE * p) / q;
	let sum = power;
	let denom = 3n;

	while (power > 0n) {
		power = (power * p2) / q2;
		const term = power / denom;
		if (term === 0n) {
			break;
		}
		sum += term;
		denom += 2n;
	}

	return sum * 2n;
}

/**
 * Precomputed ln(2) * WORK_SCALE via ln(2) = 2 * atanh(1/3).
 * @type {bigint}
 */
const LN2_SCALED = lnAtanhSeriesScaled(1n, 3n);

/**
 * Computes the base-2 logarithm log2(n) of an exact positive BigInt integer n,
 * returning a fixed-point BigInt scaled by 10^18 (i.e. round(log2(n) * 10^18)).
 *
 * Algorithm / Identity:
 * 1. Exact power-of-two fast path: if n = 2^k, returns k * 10^18 exactly.
 * 2. Binary argument reduction: express n = 2^k * m where
 *    k = bitLength(n) - 1 and m = n / 2^k in [1, 2).
 * 3. Compute ln(m) and ln(2) at a 10^30 working scale (12 guard digits) using
 *    the hyperbolic arctangent Taylor series:
 *      ln(x) = ln((1 + z) / (1 - z)) = 2 * sum_{j=0}^{inf} z^{2j + 1} / (2j + 1)
 *    with z = (x - 1) / (x + 1) in [0, 1/3].
 * 4. Combine via the change-of-base identity:
 *      log2(n) = k + ln(m) / ln(2)
 *    rounded to the nearest multiple of 10^-18.
 *
 * @param {bigint} n - Exact positive BigInt integer (n > 0n).
 * @returns {bigint} Fixed-point BigInt representing round(log2(n) * 10^18).
 * @throws {TypeError} If n is not a BigInt.
 * @throws {RangeError} If n <= 0n.
 */
export function log2BigIntSeries(n) {
	if (typeof n !== 'bigint') {
		throw new TypeError(`Expected n to be a BigInt, received ${typeof n}`);
	}
	if (n <= 0n) {
		throw new RangeError('Expected n to be a positive BigInt (n > 0n)');
	}

	const k = bitLength(n) - 1n;

	// Exact power-of-two fast path: n = 2^k => log2(n) = k exactly.
	if ((n & (n - 1n)) === 0n) {
		return k * OUTPUT_SCALE;
	}

	// Compute mScaled = round((n / 2^k) * WORK_SCALE) with m in (1, 2).
	let mScaled;
	if (k <= MAX_EXACT_SHIFT) {
		mScaled = (n * WORK_SCALE + (1n << (k - 1n))) >> k;
	} else {
		const nTop = n >> (k - MAX_EXACT_SHIFT);
		mScaled =
			(nTop * WORK_SCALE + (1n << (MAX_EXACT_SHIFT - 1n))) >> MAX_EXACT_SHIFT;
	}

	// z = (m - 1) / (m + 1) = (mScaled - WORK_SCALE) / (mScaled + WORK_SCALE).
	const lnMScaled = lnAtanhSeriesScaled(
		mScaled - WORK_SCALE,
		mScaled + WORK_SCALE,
	);

	// frac = round((ln(m) / ln(2)) * OUTPUT_SCALE).
	const fracScaled =
		(lnMScaled * OUTPUT_SCALE + LN2_SCALED / 2n) / LN2_SCALED;

	return k * OUTPUT_SCALE + fracScaled;
}
