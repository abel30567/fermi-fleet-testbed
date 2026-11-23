/**
 * Fixed-point scaling factor (10^18) used for non-integer BigInt division results.
 * @type {bigint}
 */
export const SCALE = 10n ** 18n

/**
 * Computes the bit length of a non-negative BigInt.
 *
 * @param {bigint} n - Non-negative BigInt integer.
 * @returns {number} Number of bits required to represent `n` (0 for `0n`).
 */
function bitLength(n) {
	if (n === 0n) return 0
	return n.toString(2).length
}

/**
 * Computes the exact integer quotient `floor(numerator / denominator)` for positive
 * BigInt values using the Euler-product factorization of the geometric series:
 *
 *   1 / (1 - r) = sum_{j=0}^{inf} r^j = prod_{m=0}^{inf} (1 + r^(2^m))
 *
 * Normalizing `denominator = 2^k * (1 - r)` with `0 < r < 1/2` gives quadratic
 * convergence in `O(log(precision))` iterations without using the `/` operator.
 * A final remainder adjustment guarantees bit-exactness.
 *
 * @param {bigint} numerator - Positive dividend.
 * @param {bigint} denominator - Positive divisor.
 * @returns {bigint} Exact floor quotient `floor(numerator / denominator)`.
 */
function dividePositiveSeries(numerator, denominator) {
	if (numerator < denominator) return 0n
	if (denominator === 1n) return numerator

	// Exact closed form for powers of two: denominator = 2^p
	if ((denominator & (denominator - 1n)) === 0n) {
		return numerator >> BigInt(bitLength(denominator) - 1)
	}

	const dBits = bitLength(denominator)
	const nBits = bitLength(numerator)
	const k = BigInt(dBits)

	// Maximum bit length of floor(numerator / denominator), plus 64 guard bits
	const qBits = BigInt(nBits - (dBits - 1))
	const W = qBits + 64n
	const one = 1n << W

	// r = (2^k - denominator) / 2^k, represented in Q0.W fixed-point
	const diff = (1n << k) - denominator
	const rFixed = W >= k ? diff << (W - k) : diff >> (k - W)

	// Evaluate prod_{m=0}^{M-1} (1 + r^(2^m)) in Q2.W fixed-point
	let prod = one
	let term = rFixed
	while (term > 0n) {
		prod = (prod * (one + term)) >> W
		term = (term * term) >> W
	}

	// Approximate quotient q ≈ (numerator / 2^k) * (1 / (1 - r))
	let q = (numerator * prod) >> (W + k)

	// Exact remainder correction guarantees 0 <= numerator - q * denominator < denominator
	let rem = numerator - q * denominator
	while (rem >= denominator) {
		q += 1n
		rem -= denominator
	}
	while (rem < 0n) {
		q -= 1n
		rem += denominator
	}

	return q
}

/**
 * Divides two exact BigInt integers and returns the result as a fixed-point BigInt
 * scaled by `10^18`, truncated toward zero.
 *
 * Because division is scale-invariant (`(a * S) / (b * S) === a / b`), this function
 * works identically whether `a` and `b` are unscaled exact integers or both already
 * scaled by `10^18`.
 *
 * Uses the Euler-product geometric series identity `1 / (1 - r) = prod_{m>=0} (1 + r^(2^m))`
 * with exact remainder verification, avoiding floating-point precision loss.
 *
 * @param {bigint} a - The dividend (exact BigInt).
 * @param {bigint} b - The non-zero divisor (exact BigInt).
 * @returns {bigint} Fixed-point quotient `trunc((a / b) * 10^18)`.
 * @throws {TypeError} If either `a` or `b` is not a `bigint`.
 * @throws {RangeError} If `b` is `0n` (division by zero).
 */
export function divideBigIntSeries(a, b) {
	if (typeof a !== 'bigint') {
		throw new TypeError(`Expected dividend 'a' to be a bigint, got ${typeof a}`)
	}
	if (typeof b !== 'bigint') {
		throw new TypeError(`Expected divisor 'b' to be a bigint, got ${typeof b}`)
	}
	if (b === 0n) {
		throw new RangeError('Division by zero')
	}
	if (a === 0n) {
		return 0n
	}

	const negative = (a < 0n) !== (b < 0n)
	const absA = a < 0n ? -a : a
	const absB = b < 0n ? -b : b

	const quotient = dividePositiveSeries(absA * SCALE, absB)
	return negative ? -quotient : quotient
}
