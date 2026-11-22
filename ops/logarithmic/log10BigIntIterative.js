const SCALE = 10n ** 18n
const WORK_SCALE = 10n ** 36n

/**
 * Computes ln((1 + y) / (1 - y)) = 2 * atanh(y) for 0 <= y < 1/3
 * using the iterative Taylor series 2 * sum_{k=0..inf} y^(2k+1) / (2k+1),
 * where `yScaled` is `y * WORK_SCALE`.
 *
 * @param {bigint} yScaled
 * @returns {bigint} ln((1 + y) / (1 - y)) scaled by WORK_SCALE.
 */
function lnFromAtanhScaled(yScaled) {
	if (yScaled === 0n) return 0n
	const y2 = (yScaled * yScaled) / WORK_SCALE
	let term = yScaled
	let sum = 0n
	let k = 1n

	while (term > 0n) {
		sum += term / k
		term = (term * y2) / WORK_SCALE
		k += 2n
	}

	return 2n * sum
}

/**
 * Computes ln((num + den) / (den - num)) = 2 * atanh(num / den) for small exact
 * rationals 0 < num < den, scaled by WORK_SCALE.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {bigint}
 */
function lnFromAtanhRational(num, den) {
	const num2 = num * num
	const den2 = den * den
	let term = (WORK_SCALE * num) / den
	let sum = 0n
	let k = 1n

	while (term > 0n) {
		sum += term / k
		term = (term * num2) / den2
		k += 2n
	}

	return 2n * sum
}

// Precomputed high-precision constants at WORK_SCALE (10^36):
// ln(2) = 2 * atanh(1/3), ln(5/4) = 2 * atanh(1/9), ln(10) = 3*ln(2) + ln(5/4).
const LN2_SCALED = lnFromAtanhRational(1n, 3n)
const LN10_SCALED = 3n * LN2_SCALED + lnFromAtanhRational(1n, 9n)

/**
 * Computes the base-10 logarithm of a positive exact BigInt integer,
 * returning a fixed-point BigInt scaled by `10n ** 18n` (rounded to the
 * nearest `10^-18`).
 *
 * Uses a straightforward iterative algorithm:
 * 1. Iterative power-of-10 reduction to extract the exact integer part
 *    `k = floor(log10(x))` and `10^k <= x < 10^(k+1)`. Exact powers of 10
 *    return `k * 10n ** 18n` immediately.
 * 2. Iterative factor-of-2 reduction on `x / 10^k` into `[1, 2)` so that
 *    `y = (m - 1) / (m + 1) < 1/3`.
 * 3. Iterative `atanh` series with 18 guard digits (`10^36` working scale)
 *    to compute `ln(m) / ln(10)` accurately before rounding to `10^18`.
 *
 * @param {bigint} x - Positive BigInt integer (`x > 0n`).
 * @returns {bigint} Fixed-point `log10(x)` scaled by `10n ** 18n`.
 * @throws {TypeError} If `x` is not a BigInt.
 * @throws {RangeError} If `x <= 0n`.
 */
export function log10BigIntIterative(x) {
	if (typeof x !== 'bigint') {
		throw new TypeError(`Expected x to be a BigInt, received ${typeof x}`)
	}
	if (x <= 0n) {
		throw new RangeError(`Expected x to be a positive BigInt (> 0n), received ${x}n`)
	}

	// Step 1: Iteratively find integer part k and power = 10^k <= x < 10^(k+1).
	const powers = [[1n, 10n]]
	while (powers[powers.length - 1][1] <= x) {
		const [exp, val] = powers[powers.length - 1]
		const nextVal = val * val
		if (nextVal > x) break
		powers.push([exp * 2n, nextVal])
	}

	let intPart = 0n
	let power = 1n
	for (let i = powers.length - 1; i >= 0; i--) {
		const [exp, val] = powers[i]
		const candidate = power * val
		if (candidate <= x) {
			power = candidate
			intPart += exp
		}
	}

	if (x === power) {
		return intPart * SCALE
	}

	// Step 2: Reduce x / 10^k by factors of 2 into [1, 2) (at most 3 halvings).
	let twos = 0n
	let denom = power
	while (denom * 2n <= x) {
		denom *= 2n
		twos += 1n
	}

	// Step 3: Compute ln(x / 10^k) = twos * ln(2) + ln(x / denom) via atanh series.
	const num = x - denom
	const den = x + denom
	const yScaled = (WORK_SCALE * num + den / 2n) / den
	const lnFrac = twos * LN2_SCALED + lnFromAtanhScaled(yScaled)

	// Convert natural log of mantissa to base-10 fractional part scaled by 10^18.
	const fracScaled = (lnFrac * SCALE + LN10_SCALED / 2n) / LN10_SCALED

	return intPart * SCALE + fracScaled
}
