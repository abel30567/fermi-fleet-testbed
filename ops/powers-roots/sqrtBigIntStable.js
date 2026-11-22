const SCALE = 10n ** 18n
const SCALE_SQ = SCALE * SCALE

/**
 * Returns the exact bit length of a strictly positive BigInt.
 *
 * Uses base-16 conversion to avoid allocating 4x larger binary strings
 * for very large integers.
 *
 * @param {bigint} value - Positive BigInt (> 0n).
 * @returns {number} Number of bits required to represent `value`.
 */
function bitLength(value) {
	const hex = value.toString(16)
	const leadingBits = 32 - Math.clz32(Number.parseInt(hex[0], 16))
	return (hex.length - 1) * 4 + leadingBits
}

/**
 * Computes the exact integer floor square root `floor(sqrt(m))` for `m >= 0n`
 * using bit-length-seeded Newton-Raphson (Heron's method) with an explicit
 * invariant verification step.
 *
 * @param {bigint} m - Non-negative BigInt radicand.
 * @returns {bigint} Largest integer `q` such that `q * q <= m`.
 */
function isqrtFloor(m) {
	if (m < 2n) {
		return m
	}

	// Seed strictly above sqrt(m): since 2^(b-1) <= m < 2^b,
	// x0 = 2^floor((b + 1) / 2) >= 2^(b / 2) > sqrt(m).
	const shift = BigInt((bitLength(m) + 1) >> 1)
	let x = 1n << shift
	let next = (x + m / x) >> 1n

	// Starting strictly above sqrt(m), integer Heron iteration decreases
	// monotonically until next >= x, at which point x === floor(sqrt(m)).
	while (next < x) {
		x = next
		next = (x + m / x) >> 1n
	}

	// Defensive exact-bracket verification: guarantee x^2 <= m < (x + 1)^2.
	while ((x + 1n) * (x + 1n) <= m) {
		x += 1n
	}
	while (x * x > m) {
		x -= 1n
	}

	return x
}

/**
 * Computes a numerically stable fixed-point square root of a non-negative
 * `BigInt`, returning the nearest `BigInt` to `sqrt(n) * 10^18`.
 *
 * The computation evaluates the exact integer square root of `n * 10^36`
 * via bit-length-seeded Newton-Raphson without any IEEE-754 floating-point
 * intermediates (avoiding overflow above `2^1024` and precision loss above
 * `2^53`), and rounds to the nearest integer using the exact algebraic
 * midpoint condition `n * 10^36 - q^2 > q` (equivalent to
 * `sqrt(n * 10^36) > q + 1/2`, since no integer square root can fall on an
 * exact half-integer).
 *
 * Error bound:
 * - Exact (`0` error) when `n` is a perfect square.
 * - Strictly `< 0.5` ULP at `10^-18` scale for all `n >= 0n`, i.e.,
 *   `(2r - 1)^2 < 4 * n * 10^36 < (2r + 1)^2` for all `n > 0n`.
 *
 * @param {bigint} n - Non-negative BigInt radicand.
 * @returns {bigint} Fixed-point `round(sqrt(n) * 10^18)`.
 * @throws {TypeError} If `n` is not a `bigint`.
 * @throws {RangeError} If `n` is negative (`n < 0n`).
 */
export function sqrtBigIntStable(n) {
	if (typeof n !== 'bigint') {
		throw new TypeError(`Expected a BigInt argument, received ${n === null ? 'null' : typeof n}`)
	}
	if (n < 0n) {
		throw new RangeError('Cannot compute square root of a negative BigInt')
	}
	if (n === 0n) {
		return 0n
	}

	const scaled = n * SCALE_SQ
	const q = isqrtFloor(scaled)
	const remainder = scaled - q * q

	// Exact nearest-integer rounding:
	// sqrt(scaled) > q + 1/2  <=>  scaled > q^2 + q + 1/4  <=>  remainder > q.
	return remainder > q ? q + 1n : q
}
