const SCALE = 10n ** 18n
const WORK_BITS = 128n
const WORK_ONE = 1n << WORK_BITS
const WORK_TWO = 1n << (WORK_BITS + 1n)
const FRAC_BITS = 112n
const FRAC_HALF = 1n << (FRAC_BITS - 1n)

/**
 * Computes the base-2 logarithm of a positive BigInt using an iterative
 * binary-reduction and repeated-squaring algorithm.
 *
 * Returns a fixed-point BigInt scaled by 10^18 (i.e. round(log2(x) * 10^18)).
 * Exact powers of two return exact multiples of 10^18.
 *
 * @param {bigint} x - Strictly positive BigInt input (x > 0n).
 * @returns {bigint} Base-2 logarithm of `x`, scaled by 10^18.
 * @throws {TypeError} If `x` is not a BigInt.
 * @throws {RangeError} If `x` is less than or equal to 0n.
 */
export function log2BigIntIterative(x) {
	if (typeof x !== 'bigint') {
		throw new TypeError(`Expected a BigInt argument, received ${typeof x}`)
	}
	if (x <= 0n) {
		throw new RangeError('log2BigIntIterative requires a strictly positive BigInt (> 0n)')
	}

	// Step 1: Iteratively compute integer part k = floor(log2(x))
	let intPart = 0n
	let rem = x
	let step = 1n
	while ((rem >> step) > 0n) {
		step <<= 1n
	}
	while (step > 0n) {
		if ((rem >> step) > 0n) {
			rem >>= step
			intPart += step
		}
		step >>= 1n
	}

	// Fast path for exact powers of two: x === 2^intPart
	if ((x & (x - 1n)) === 0n) {
		return intPart * SCALE
	}

	// Step 2: Normalize mantissa m = x / 2^intPart into fixed-point [WORK_ONE, WORK_TWO)
	let mantissa
	if (intPart <= WORK_BITS) {
		mantissa = x << (WORK_BITS - intPart)
	} else {
		mantissa = x >> (intPart - WORK_BITS)
	}

	// Step 3: Iteratively extract fractional bits of log2(m) via repeated squaring
	let frac = 0n
	for (let i = 0n; i < FRAC_BITS; i += 1n) {
		frac <<= 1n
		mantissa = (mantissa * mantissa) >> WORK_BITS
		if (mantissa >= WORK_TWO) {
			mantissa >>= 1n
			frac |= 1n
		}
	}

	// Step 4: Convert fractional bits from scale 2^FRAC_BITS to scale 10^18 (round half up)
	const fracScaled = (frac * SCALE + FRAC_HALF) >> FRAC_BITS
	return intPart * SCALE + fracScaled
}
