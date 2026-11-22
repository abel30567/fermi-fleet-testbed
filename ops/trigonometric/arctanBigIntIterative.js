const SCALE = 10n ** 18n
const GUARD = 10n ** 12n
const WORK_SCALE = SCALE * GUARD
const HALF_GUARD = GUARD >> 1n
const REDUCTION_THRESHOLD = WORK_SCALE >> 6n

/**
 * Computes the exact integer square root floor(sqrt(n)) for a non-negative BigInt
 * using iterative Newton's method.
 *
 * @param {bigint} n - Non-negative BigInt radicand.
 * @returns {bigint} Largest BigInt r such that r * r <= n.
 */
function isqrt(n) {
	if (n < 2n) {
		return n
	}
	let x0 = 1n << BigInt((n.toString(2).length + 1) >> 1)
	let x1 = (x0 + n / x0) >> 1n
	while (x1 < x0) {
		x0 = x1
		x1 = (x0 + n / x0) >> 1n
	}
	return x0
}

/**
 * Computes arctan(1 / q) scaled by `scale` using the alternating Taylor series.
 *
 * @param {bigint} q - Positive integer reciprocal denominator (q >= 2n).
 * @param {bigint} scale - Fixed-point scaling factor.
 * @returns {bigint} Fixed-point approximation of arctan(1 / q) * scale.
 */
function arctanReciprocal(q, scale) {
	const q2 = q * q
	let power = scale / q
	let sum = power
	let n = 1n
	let sign = -1n
	while (power > 0n) {
		power /= q2
		const term = power / (2n * n + 1n)
		if (term === 0n) {
			break
		}
		sum += sign * term
		sign = -sign
		n += 1n
	}
	return sum
}

/**
 * Precomputed pi / 2 at WORK_SCALE (10^30) via Machin's formula:
 * pi / 2 = 8 * arctan(1/5) - 2 * arctan(1/239).
 */
const PI_HALF_WORK = (() => {
	const extra = 10000n
	const extraScale = WORK_SCALE * extra
	const raw =
		8n * arctanReciprocal(5n, extraScale) -
		2n * arctanReciprocal(239n, extraScale)
	return (raw + (extra >> 1n)) / extra
})()

/**
 * Computes arctan(x) for a fixed-point BigInt input scaled by 10^18, returning
 * radians as a fixed-point BigInt scaled by 10^18.
 *
 * Algorithm:
 * 1. Uses odd symmetry `arctan(-x) = -arctan(x)` to work with non-negative values.
 * 2. Applies reciprocal argument reduction `arctan(x) = pi/2 - arctan(1/x)` when
 *    `|x| > 10^18` (real `|x| > 1`), ensuring all remaining work is in `[0, 1]`.
 * 3. Repeatedly applies the half-angle identity
 *    `arctan(u) = 2 * arctan(u / (1 + sqrt(1 + u^2)))` until `u <= 1/64`.
 * 4. Evaluates the alternating Taylor series `sum_{k>=0} (-1)^k * u^(2k+1) / (2k+1)`
 *    iteratively with 12 extra decimal guard digits (`10^30` working scale), then
 *    rescales by `2^k` and rounds to nearest `10^-18`.
 *
 * @param {bigint} x - Input value in fixed-point representation scaled by `10n ** 18n`
 *   (i.e. `x` represents the real number `x / 10^18`).
 * @returns {bigint} `arctan(x / 10^18)` in radians, scaled by `10n ** 18n` and rounded
 *   to the nearest integer (in `[-1570796326794896619n, 1570796326794896619n]`).
 * @throws {TypeError} If `x` is not a `bigint`.
 */
export function arctanBigIntIterative(x) {
	if (typeof x !== 'bigint') {
		throw new TypeError(
			`arctanBigIntIterative expects a BigInt fixed-point input scaled by 10^18, received ${typeof x}`
		)
	}

	if (x === 0n) {
		return 0n
	}

	const negative = x < 0n
	const absX = negative ? -x : x

	let inverted = false
	let u
	if (absX > SCALE) {
		inverted = true
		u = (WORK_SCALE * SCALE + (absX >> 1n)) / absX
	} else {
		u = absX * GUARD
	}

	let angleWork = 0n
	if (u > 0n) {
		let halvings = 0n
		const w2 = WORK_SCALE * WORK_SCALE
		while (u > REDUCTION_THRESHOLD) {
			const denom = WORK_SCALE + isqrt(w2 + u * u)
			u = (u * WORK_SCALE + (denom >> 1n)) / denom
			halvings += 1n
		}

		const u2 = u * u
		let power = u
		let sum = u
		let n = 1n
		let sign = -1n
		while (power > 0n) {
			power = (power * u2 + (w2 >> 1n)) / w2
			const odd = 2n * n + 1n
			const term = (power + (odd >> 1n)) / odd
			if (term === 0n) {
				break
			}
			sum += sign * term
			sign = -sign
			n += 1n
		}

		angleWork = sum << halvings
	}

	if (inverted) {
		angleWork = PI_HALF_WORK - angleWork
	}

	const rounded = (angleWork + HALF_GUARD) / GUARD
	return negative ? -rounded : rounded
}
