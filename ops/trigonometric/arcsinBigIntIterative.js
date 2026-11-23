/**
 * Fixed-point scale factor (10^18) used for inputs and outputs.
 * A BigInt value `n` represents the real number `n / 10^18`.
 * @type {bigint}
 */
export const SCALE = 10n ** 18n

const GUARD = 10n ** 18n
const WORK_SCALE = SCALE * GUARD
const WORK_SCALE_SQ = WORK_SCALE * WORK_SCALE
const SCALE_SQ = SCALE * SCALE
const HALF_GUARD = GUARD / 2n

/**
 * Iterative integer square root floor(sqrt(n)) for non-negative BigInt n
 * using Newton's method.
 *
 * @param {bigint} n - Non-negative BigInt.
 * @returns {bigint} Floor of the square root of n.
 */
function isqrt(n) {
	if (n === 0n) return 0n
	const bitLength = BigInt(n.toString(2).length)
	let x = 1n << ((bitLength + 1n) >> 1n)
	while (true) {
		const next = (x + n / x) >> 1n
		if (next >= x) return x
		x = next
	}
}

/**
 * Computes arcsin(x) using the iterative Maclaurin series at WORK_SCALE precision:
 *   arcsin(x) = sum_{n=0..inf} ((2n-1)!! / (2n)!!) * x^(2n+1) / (2n+1)
 *
 * Caller guarantees 0 <= xW <= WORK_SCALE * sqrt(2) / 2 so each term shrinks
 * by at least a factor of 2.
 *
 * @param {bigint} xW - Non-negative input scaled by WORK_SCALE.
 * @returns {bigint} arcsin(xW / WORK_SCALE) scaled by WORK_SCALE.
 */
function arcsinSeries(xW) {
	const x2 = xW * xW
	let factor = xW
	let sum = xW
	for (let n = 1n; ; n += 1n) {
		factor = (factor * (2n * n - 1n) * x2) / (2n * n * WORK_SCALE_SQ)
		const term = factor / (2n * n + 1n)
		if (term === 0n) break
		sum += term
	}
	return sum
}

// pi / 2 = 3 * arcsin(1/2), computed iteratively at WORK_SCALE precision.
const HALF_PI_WORK = 3n * arcsinSeries(WORK_SCALE / 2n)

/**
 * Computes the inverse sine (arcsin) in radians over exact fixed-point BigInt
 * integers scaled by 10^18, using a straightforward iterative Maclaurin series
 * with argument reduction near |x| = 1.
 *
 * Input `x` represents the real value `x / 10^18` and must satisfy
 * `-10^18 <= x <= 10^18`. The returned BigInt represents `arcsin(x / 10^18)`
 * in radians, rounded to the nearest multiple of `10^-18`, in the range
 * `[-round(pi/2 * 10^18), round(pi/2 * 10^18)]`.
 *
 * @param {bigint} x - Fixed-point input scaled by 10^18, in [-10^18, 10^18].
 * @returns {bigint} Fixed-point arcsin(x) in radians, scaled by 10^18.
 * @throws {TypeError} If `x` is not a BigInt.
 * @throws {RangeError} If `x` is outside [-10^18, 10^18].
 */
export function arcsinBigIntIterative(x) {
	if (typeof x !== 'bigint') {
		throw new TypeError(`Expected a BigInt argument, received ${typeof x}`)
	}
	if (x < -SCALE || x > SCALE) {
		throw new RangeError(
			`Input out of domain [-10^18, 10^18]: received ${x.toString()}`
		)
	}
	if (x === 0n) return 0n

	const negative = x < 0n
	const absX = negative ? -x : x

	let resultWork
	if (absX === SCALE) {
		resultWork = HALF_PI_WORK
	} else if (2n * absX * absX <= SCALE_SQ) {
		resultWork = arcsinSeries(absX * GUARD)
	} else {
		// Argument reduction: arcsin(x) = pi/2 - arcsin(sqrt(1 - x^2))
		const xW = absX * GUARD
		const yW = isqrt(WORK_SCALE_SQ - xW * xW)
		resultWork = HALF_PI_WORK - arcsinSeries(yW)
	}

	const rounded = (resultWork + HALF_GUARD) / GUARD
	return negative ? -rounded : rounded
}
