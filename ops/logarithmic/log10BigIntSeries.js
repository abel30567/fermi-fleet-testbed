const OUTPUT_SCALE = 10n ** 18n
const WORK_SCALE = 10n ** 40n
// Threshold ≈ sqrt(2) * WORK_SCALE to reduce r into m ∈ [~0.707, ~1.414],
// bounding |z| = |m - 1| / (m + 1) <= ~0.1716 for rapid atanh Taylor convergence.
const SQRT2_THRESHOLD = (1414n * WORK_SCALE) / 1000n

/**
 * Computes 2 * atanh(num / den) = ln((den + num) / (den - num)) scaled by WORK_SCALE,
 * using the Taylor series:
 *   2 * atanh(z) = 2 * sum_{j=0}^\infty z^(2j+1) / (2j + 1)
 * for |num| < den and den > 0.
 *
 * @param {bigint} num - Rational numerator satisfying |num| < den.
 * @param {bigint} den - Strictly positive rational denominator.
 * @returns {bigint} Fixed-point value of 2 * atanh(num / den) scaled by WORK_SCALE.
 */
function twoAtanhRational(num, den) {
	if (num === 0n) {
		return 0n
	}
	const negative = num < 0n
	const a = negative ? -num : num
	const a2 = a * a
	const b2 = den * den

	let termPower = (2n * WORK_SCALE * a) / den
	let sum = termPower
	let odd = 3n

	while (termPower > 0n) {
		termPower = (termPower * a2) / b2
		const term = termPower / odd
		if (term === 0n) {
			break
		}
		sum += term
		odd += 2n
	}

	return negative ? -sum : sum
}

// Precomputed natural logarithm constants at WORK_SCALE (10^40) via atanh identities:
//   ln(2)  = ln((1 + 1/3) / (1 - 1/3)) = 2 * atanh(1/3)
//   ln(10) = ln(2^3 * 5/4) = 3 * ln(2) + ln((1 + 1/9) / (1 - 1/9)) = 3 * ln(2) + 2 * atanh(1/9)
const LN2 = twoAtanhRational(1n, 3n)
const LN10 = 3n * LN2 + twoAtanhRational(1n, 9n)

/**
 * Computes the base-10 logarithm of a positive exact BigInt integer as a fixed-point
 * BigInt scaled by 10^18 (representing round(log10(n) * 10^18)).
 *
 * Algorithm / Identities:
 * 1. Base-10 argument reduction: express n = 10^k * r with k = floor(log10(n)) and r ∈ [1, 10).
 *    If n === 10^k exactly, return k * 10^18 directly.
 * 2. Secondary base-2 reduction: express r = 2^p * m with p ∈ {0, 1, 2, 3} so that
 *    m ∈ [~0.707, ~1.414] lies near 1, keeping |z| = |m - 1| / (m + 1) <= ~0.1716.
 * 3. Series evaluation: evaluate ln(m) = 2 * atanh((m - 1) / (m + 1)) via the odd-power
 *    Taylor series 2 * sum_{j=0}^\infty z^(2j+1) / (2j + 1) at 10^40 working scale
 *    (22 extra guard digits beyond the 10^18 output scale), yielding ln(r) = p * ln(2) + ln(m).
 * 4. Change-of-base identity: log10(n) = k + ln(r) / ln(10), rounded to the nearest 10^-18.
 *
 * @param {bigint} n - Strictly positive BigInt integer (n > 0n).
 * @returns {bigint} Fixed-point BigInt equal to round(log10(n) * 10^18).
 * @throws {TypeError} If n is not a BigInt.
 * @throws {RangeError} If n <= 0n.
 */
export function log10BigIntSeries(n) {
	if (typeof n !== 'bigint') {
		throw new TypeError('Expected n to be a BigInt')
	}
	if (n <= 0n) {
		throw new RangeError('Expected n to be a positive BigInt (> 0n)')
	}

	const k = BigInt(n.toString(10).length - 1)
	const pow10 = 10n ** k

	if (n === pow10) {
		return k * OUTPUT_SCALE
	}

	const rScaled = (n * WORK_SCALE + (pow10 >> 1n)) / pow10

	let p = 0n
	let threshold = SQRT2_THRESHOLD
	while (rScaled > threshold) {
		p += 1n
		threshold <<= 1n
	}

	const denom = WORK_SCALE << p
	const lnR = p * LN2 + twoAtanhRational(rScaled - denom, rScaled + denom)

	const frac = (lnR * OUTPUT_SCALE + (LN10 >> 1n)) / LN10
	return k * OUTPUT_SCALE + frac
}
