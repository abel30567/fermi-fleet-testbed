const OUT_DIGITS = 18n
const GUARD_DIGITS = 24n
const WORK_DIGITS = OUT_DIGITS + GUARD_DIGITS

const SCALE = 10n ** OUT_DIGITS
const GUARD_SCALE = 10n ** GUARD_DIGITS
const WORK_SCALE = 10n ** WORK_DIGITS

const BASE_PI_DIGITS = 80n

/**
 * Divide two BigInts with round-half-away-from-zero semantics.
 *
 * @param {bigint} numerator
 * @param {bigint} denominator - Positive BigInt divisor.
 * @returns {bigint}
 */
function roundDiv(numerator, denominator) {
	const half = denominator / 2n
	if (numerator >= 0n) {
		return (numerator + half) / denominator
	}
	return -((-numerator + half) / denominator)
}

/**
 * Iteratively compute `atan(1 / m) * scale` via its Taylor series:
 * `sum_{k=0}^{\infty} (-1)^k / ((2k + 1) * m^(2k + 1))`.
 *
 * @param {bigint} m - Positive integer denominator (`m >= 2n`).
 * @param {bigint} scale - Fixed-point scaling factor.
 * @returns {bigint}
 */
function atanReciprocal(m, scale) {
	const mSquared = m * m
	let power = scale / m
	let sum = power
	let k = 1n

	while (power !== 0n) {
		power /= mSquared
		const term = power / (2n * k + 1n)
		if (term === 0n) {
			break
		}
		if (k % 2n === 1n) {
			sum -= term
		} else {
			sum += term
		}
		k += 1n
	}

	return sum
}

/**
 * Iteratively compute `pi` scaled by `10n ** digits` using Machin's formula:
 * `pi = 16 * atan(1/5) - 4 * atan(1/239)`.
 *
 * @param {bigint} digits - Number of fractional decimal digits.
 * @returns {bigint}
 */
function computePi(digits) {
	const internalGuard = 6n
	const internalScale = 10n ** (digits + internalGuard)
	const piInternal =
		16n * atanReciprocal(5n, internalScale) -
		4n * atanReciprocal(239n, internalScale)
	return roundDiv(piInternal, 10n ** internalGuard)
}

const BASE_PI = computePi(BASE_PI_DIGITS)

/**
 * Compute the trigonometric cosine of an exact fixed-point BigInt angle using
 * a straightforward iterative implementation.
 *
 * Representation:
 * - Input `x` is a fixed-point `BigInt` representing an angle in radians scaled
 *   by `10^18` (i.e. `x` represents the exact rational value `x / 10^18` radians;
 *   for example `1000000000000000000n` is `1` radian and `3141592653589793238n`
 *   is approximately `pi` radians).
 * - Output is a fixed-point `BigInt` representing `cos(x / 10^18)` scaled by
 *   `10^18`, rounded to the nearest integer in `[-10^18, 10^18]`.
 *
 * Algorithm:
 * 1. Validate that `x` is a `BigInt` and use even symmetry `cos(-x) = cos(x)`.
 * 2. Perform high-precision range reduction modulo `2 * pi` with enough extra
 *    digits to prevent cancellation even for very large multi-turn angles
 *    (reusing an 80-digit cached `pi` or computing `pi` dynamically via
 *    Machin's formula when needed), then fold into `[0, pi / 2]` using
 *    `cos(2*pi - r) = cos(r)` and `cos(pi - r) = -cos(r)`.
 * 3. Evaluate the iterative Taylor series
 *    `cos(r) = sum_{k=0}^{\infty} (-1)^k * r^(2k) / (2k)!`
 *    with 24 decimal guard digits (42 fractional digits total) until the next
 *    term vanishes, then round back to scale `10^18`.
 *
 * @param {bigint} x - Angle in fixed-point radians scaled by `10^18`.
 * @returns {bigint} `cos(x / 10^18)` as a fixed-point BigInt scaled by `10^18`.
 * @throws {TypeError} If `x` is not a BigInt.
 */
export function cosBigIntIterative(x) {
	if (typeof x !== 'bigint') {
		throw new TypeError(
			'cosBigIntIterative expects a BigInt angle in fixed-point radians (scaled by 10^18)'
		)
	}

	const absX = x < 0n ? -x : x
	if (absX === 0n) {
		return SCALE
	}

	const intPart = absX / SCALE
	const intDigits = intPart === 0n ? 0n : BigInt(intPart.toString().length)
	const neededPiDigits = WORK_DIGITS + intDigits + 4n

	const reduceDigits =
		neededPiDigits <= BASE_PI_DIGITS ? BASE_PI_DIGITS : neededPiDigits
	const piAtReduce =
		reduceDigits === BASE_PI_DIGITS ? BASE_PI : computePi(reduceDigits)

	const xAtReduce = absX * 10n ** (reduceDigits - OUT_DIGITS)
	const twoPiAtReduce = 2n * piAtReduce
	let rAtReduce = xAtReduce % twoPiAtReduce

	// Fold [0, 2*pi) into [0, pi] using cos(2*pi - r) = cos(r)
	if (rAtReduce > piAtReduce) {
		rAtReduce = twoPiAtReduce - rAtReduce
	}

	// Fold [0, pi] into [0, pi/2] using cos(pi - r) = -cos(r)
	const halfPiAtReduce = piAtReduce / 2n
	let sign = 1n
	if (rAtReduce > halfPiAtReduce) {
		sign = -1n
		rAtReduce = piAtReduce - rAtReduce
	}

	const r = roundDiv(rAtReduce, 10n ** (reduceDigits - WORK_DIGITS))

	// Iterative Taylor series: cos(r) = 1 - r^2/2! + r^4/4! - ...
	const rSquared = roundDiv(r * r, WORK_SCALE)
	let term = WORK_SCALE
	let sum = term
	let k = 1n

	while (term !== 0n) {
		term = -(term * rSquared) / (WORK_SCALE * (2n * k - 1n) * (2n * k))
		sum += term
		k += 1n
	}

	return roundDiv(sign * sum, GUARD_SCALE)
}
