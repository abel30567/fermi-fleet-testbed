const SCALE = 10n ** 18n
const FRAC_BITS = 80
const FRAC_BITS_BIG = BigInt(FRAC_BITS)
const PRECISION_BITS = 180n
const TWO = 1n << (PRECISION_BITS + 1n)
const HALF_FRAC_UNIT = 1n << (FRAC_BITS_BIG - 1n)
const CHUNK_64 = 1n << 64n

/**
 * Computes the base-2 logarithm of a positive BigInt using a straightforward
 * iterative algorithm, returning a fixed-point BigInt scaled by `10^18`.
 *
 * Algorithm:
 * 1. Computes the integer part `k = floor(log2(x))` via iterative bit-shifts.
 *    If `x` is an exact power of 2, returns `k * 10^18` immediately.
 * 2. Normalizes the mantissa `m = x / 2^k` in `[1, 2)` into binary fixed-point
 *    representation with 180 fractional guard bits (`PRECISION_BITS`).
 * 3. Extracts 80 binary fractional bits of `log2(m)` via iterative squaring:
 *    each iteration squares `m`; if `m >= 2`, emits bit `1` and halves `m`,
 *    otherwise emits bit `0`.
 * 4. Scales the binary fractional part to `10^18` with round-to-nearest and
 *    adds it to `k * 10^18`.
 *
 * @param {bigint} x - A strictly positive BigInt integer (`x > 0n`).
 * @returns {bigint} Fixed-point approximation of `log2(x) * 10^18`, rounded to
 *   the nearest integer.
 * @throws {TypeError} If `x` is not a BigInt.
 * @throws {RangeError} If `x <= 0n`.
 */
export function log2BigIntIterative(x) {
	if (typeof x !== 'bigint') {
		throw new TypeError(`Expected a BigInt argument, received ${typeof x}`)
	}
	if (x <= 0n) {
		throw new RangeError('Argument x must be greater than 0n')
	}

	// Step 1: Integer part floor(log2(x)) via iterative bit-shifts
	let intPart = 0n
	let temp = x
	while (temp >= CHUNK_64) {
		temp >>= 64n
		intPart += 64n
	}
	while (temp > 1n) {
		temp >>= 1n
		intPart += 1n
	}

	// Exact power of 2 has zero fractional part
	if ((x & (x - 1n)) === 0n) {
		return intPart * SCALE
	}

	// Step 2: Normalize m = x / 2^intPart into fixed-point with PRECISION_BITS fractional bits
	const shift = intPart - PRECISION_BITS
	let m = shift > 0n ? x >> shift : x << -shift

	// Step 3: Extract FRAC_BITS binary fractional bits of log2(m) via iterative squaring
	let fracBits = 0n
	for (let i = 0; i < FRAC_BITS; i++) {
		m = (m * m) >> PRECISION_BITS
		fracBits <<= 1n
		if (m >= TWO) {
			m >>= 1n
			fracBits |= 1n
		}
	}

	// Step 4: Convert binary fraction to 10^18 fixed-point with round-to-nearest
	const fracPart = (fracBits * SCALE + HALF_FRAC_UNIT) >> FRAC_BITS_BIG
	return intPart * SCALE + fracPart
}
