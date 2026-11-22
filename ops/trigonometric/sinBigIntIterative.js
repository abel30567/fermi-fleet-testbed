const OUTPUT_DECIMALS = 18
const GUARD_DECIMALS = 32
const WORK_DECIMALS = OUTPUT_DECIMALS + GUARD_DECIMALS

const SCALE = 10n ** BigInt(OUTPUT_DECIMALS)
const WORK_SCALE = 10n ** BigInt(WORK_DECIMALS)
const DOWN_SCALE = 10n ** BigInt(GUARD_DECIMALS)
const HALF_DOWN_SCALE = DOWN_SCALE / 2n

/**
 * Computes floor(atan(1 / m) * scale) iteratively using the Gregory-Leibniz series.
 *
 * @param {bigint} m - Integer reciprocal denominator (m >= 2).
 * @param {bigint} scale - Fixed-point scale factor (e.g. 10n ** D).
 * @returns {bigint} Scaled arctangent value.
 */
function atanReciprocalScaled(m, scale) {
	const mSquared = m * m
	let power = scale / m
	let sum = power
	let k = 1n
	let subtract = true

	while (power !== 0n) {
		power /= mSquared
		const term = power / (2n * k + 1n)
		if (term === 0n) {
			break
		}
		sum = subtract ? sum - term : sum + term
		subtract = !subtract
		k += 1n
	}

	return sum
}

/**
 * Computes round(pi * 10^decimals) iteratively via Machin's formula:
 * pi = 16 * atan(1/5) - 4 * atan(1/239).
 *
 * @param {number} decimals - Number of fractional decimal digits.
 * @returns {bigint} Scaled value of pi.
 */
function computePiScaled(decimals) {
	const extraGuard = 10
	const guardFactor = 10n ** BigInt(extraGuard)
	const internalScale = 10n ** BigInt(decimals + extraGuard)
	const piInternal =
		16n * atanReciprocalScaled(5n, internalScale) -
		4n * atanReciprocalScaled(239n, internalScale)
	return (piInternal + guardFactor / 2n) / guardFactor
}

const DEFAULT_PI_DECIMALS = 80
const DEFAULT_PI_SCALED = computePiScaled(DEFAULT_PI_DECIMALS)

/**
 * Computes the trigonometric sine of an angle given as an exact fixed-point BigInt.
 *
 * The input `xScaled` represents an angle in radians scaled by `10^18`
 * (i.e. `x = xScaled / 10^18` radians). The returned BigInt is the fixed-point
 * value of `sin(x)` scaled by `10^18` (rounded to the nearest integer).
 *
 * Algorithm:
 * 1. Uses odd symmetry (`sin(-x) = -sin(x)`) to work with non-negative angles.
 * 2. Performs high-precision range reduction modulo `2*pi` with enough guard
 *    digits to accommodate arbitrarily large multi-turn BigInt angles (using a
 *    precomputed 80-digit `pi` for typical magnitudes and dynamically computing
 *    extra digits via Machin's formula when needed), then folds into `[0, pi/2]`.
 * 3. Evaluates `sin(r)` on `[0, pi/2]` via a straightforward iterative Taylor
 *    series (`sum_{k=0}^{\infty} (-1)^k * r^(2k+1) / (2k+1)!`) with 32 decimal
 *    guard digits (50 total fractional digits) before rounding to `10^18`.
 *
 * @param {bigint} xScaled - Angle in radians scaled by `10n ** 18n` (`x * 10^18`).
 * @returns {bigint} Fixed-point `sin(xScaled / 10^18)` scaled by `10n ** 18n`,
 *   in the inclusive range `[-10n ** 18n, 10n ** 18n]`.
 * @throws {TypeError} If `xScaled` is not a `bigint`.
 */
export function sinBigIntIterative(xScaled) {
	if (typeof xScaled !== 'bigint') {
		throw new TypeError(
			`sinBigIntIterative expects a BigInt argument, received ${xScaled === null ? 'null' : typeof xScaled}`,
		)
	}

	if (xScaled === 0n) {
		return 0n
	}

	let negative = xScaled < 0n
	const absX = negative ? -xScaled : xScaled

	// Determine precision required so range reduction modulo 2*pi preserves full
	// WORK_DECIMALS fractional precision even for very large angles.
	const digitLength = absX.toString().length
	const intDigits = Math.max(0, digitLength - OUTPUT_DECIMALS)
	const requiredDecimals = intDigits + WORK_DECIMALS + 10

	let reduceDecimals
	let piHigh
	if (requiredDecimals <= DEFAULT_PI_DECIMALS) {
		reduceDecimals = DEFAULT_PI_DECIMALS
		piHigh = DEFAULT_PI_SCALED
	} else {
		reduceDecimals = requiredDecimals
		piHigh = computePiScaled(reduceDecimals)
	}

	// Lift absX to reduceDecimals fractional digits exactly, then reduce mod 2*pi.
	const liftFactor = 10n ** BigInt(reduceDecimals - OUTPUT_DECIMALS)
	const twoPiHigh = 2n * piHigh
	let remHigh = (absX * liftFactor) % twoPiHigh

	// Quadrant folding into [0, pi/2] while still at full reduction precision.
	if (remHigh >= piHigh) {
		remHigh -= piHigh
		negative = !negative
	}
	const halfPiHigh = piHigh / 2n
	if (remHigh > halfPiHigh) {
		remHigh = piHigh - remHigh
	}

	// Scale reduced angle to WORK_DECIMALS (50 fractional digits) with rounding.
	const reduceToWork = 10n ** BigInt(reduceDecimals - WORK_DECIMALS)
	const r = (remHigh + reduceToWork / 2n) / reduceToWork

	if (r === 0n) {
		return 0n
	}

	// Straightforward iterative Taylor series for sin(r) on [0, pi/2]:
	// term_0 = r, term_k = term_{k-1} * r^2 / ((2k) * (2k + 1))
	const rSquared = (r * r) / WORK_SCALE
	let term = r
	let sum = term
	let k = 1n
	let subtract = true

	while (term !== 0n) {
		const denom = 2n * k * (2n * k + 1n)
		term = (term * rSquared) / (WORK_SCALE * denom)
		if (term === 0n) {
			break
		}
		sum = subtract ? sum - term : sum + term
		subtract = !subtract
		k += 1n
	}

	// Round from WORK_SCALE (10^50) down to SCALE (10^18).
	let magnitude = (sum + HALF_DOWN_SCALE) / DOWN_SCALE
	if (magnitude > SCALE) {
		magnitude = SCALE
	}

	return negative ? -magnitude : magnitude
}
