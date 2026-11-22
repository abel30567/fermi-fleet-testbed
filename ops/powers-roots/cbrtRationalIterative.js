/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * @typedef {{ precisionBits?: number }} CbrtRationalOptions
 */

const DEFAULT_PRECISION_BITS = 128

/**
 * Computes the greatest common divisor of two non-negative BigInts iteratively.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
	while (b !== 0n) {
		const remainder = a % b
		a = b
		b = remainder
	}
	return a
}

/**
 * Computes the floor of the cube root of a non-negative BigInt using
 * iterative Newton's method: x_{k+1} = floor((2*x_k + floor(n / x_k^2)) / 3).
 *
 * @param {bigint} n - Non-negative integer.
 * @returns {bigint} Largest integer r such that r^3 <= n.
 */
function integerCbrtFloor(n) {
	if (n === 0n) return 0n
	if (n < 8n) return 1n

	const bitLength = n.toString(2).length
	let x = 1n << BigInt(Math.ceil(bitLength / 3))

	while (true) {
		const next = (2n * x + n / (x * x)) / 3n
		if (next >= x) {
			return x
		}
		x = next
	}
}

/**
 * Validates and normalizes the input rational and options.
 *
 * @param {Rational} rational
 * @param {CbrtRationalOptions | undefined} options
 * @returns {{ num: bigint, den: bigint, precisionBits: number }}
 */
function validateInputs(rational, options) {
	if (rational === null || typeof rational !== 'object' || Array.isArray(rational)) {
		throw new TypeError('rational must be an object with BigInt num and den properties')
	}

	const { num, den } = rational
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError('rational.num and rational.den must be BigInt values')
	}

	if (den === 0n) {
		throw new RangeError('rational.den must be non-zero')
	}

	let precisionBits = DEFAULT_PRECISION_BITS
	if (options !== undefined) {
		if (options === null || typeof options !== 'object' || Array.isArray(options)) {
			throw new TypeError('options must be a plain object when provided')
		}
		if (options.precisionBits !== undefined) {
			if (typeof options.precisionBits !== 'number') {
				throw new TypeError('options.precisionBits must be a number')
			}
			if (!Number.isSafeInteger(options.precisionBits) || options.precisionBits < 1) {
				throw new RangeError('options.precisionBits must be a positive safe integer')
			}
			precisionBits = options.precisionBits
		}
	}

	return { num, den, precisionBits }
}

/**
 * Computes the cube root of an exact rational number represented as
 * `{ num: BigInt, den: BigInt }`, returning a reduced rational in lowest terms
 * with a strictly positive denominator (`den > 0n`).
 *
 * - Supports negative, zero, and positive rationals (including unreduced inputs
 *   and negative denominators).
 * - Returns the exact rational cube root whenever the reduced input is a
 *   perfect cube.
 * - Otherwise uses iterative Newton's method on a dyadically scaled integer to
 *   produce a rounded rational approximation accurate to at least
 *   `precisionBits` significant bits (default: 128 bits, ~38 decimal digits).
 *
 * @param {Rational} rational - Exact rational input `{ num: BigInt, den: BigInt }`.
 * @param {CbrtRationalOptions} [options] - Optional approximation settings.
 * @param {number} [options.precisionBits=128] - Minimum significant bits of precision for irrational roots.
 * @returns {Rational} Exact or approximated cube root in lowest terms with `den > 0n`.
 * @throws {TypeError} If `rational` or `options` have invalid types.
 * @throws {RangeError} If `rational.den === 0n` or `options.precisionBits` is not a positive safe integer.
 */
export function cbrtRationalIterative(rational, options) {
	const { num: rawNum, den: rawDen, precisionBits } = validateInputs(rational, options)

	if (rawNum === 0n) {
		return { num: 0n, den: 1n }
	}

	// Normalize sign so denominator is positive, then reduce to lowest terms.
	let num = rawDen < 0n ? -rawNum : rawNum
	let den = rawDen < 0n ? -rawDen : rawDen

	const sign = num < 0n ? -1n : 1n
	const absNum = num < 0n ? -num : num
	const common = gcd(absNum, den)
	const p = absNum / common
	const q = den / common

	// Check for an exact rational cube root: since gcd(p, q) = 1,
	// p/q is a perfect cube iff both p and q are perfect integer cubes.
	const rp = integerCbrtFloor(p)
	const rq = integerCbrtFloor(q)
	if (rp * rp * rp === p && rq * rq * rq === q) {
		return { num: sign * rp, den: rq }
	}

	// Compute a dyadic scale 2^shift such that 2^shift * (p/q)^(1/3) >= 2^precisionBits.
	// Since 2^(a-1) <= p < 2^a and 2^(b-1) <= q < 2^b, (p/q)^(1/3) > 2^((a - b - 1) / 3).
	const numBits = p.toString(2).length
	const denBits = q.toString(2).length
	const shift = Math.max(0, precisionBits - Math.floor((numBits - denBits - 1) / 3))
	const shiftBig = BigInt(shift)

	const scaledNum = p << (3n * shiftBig)
	const m = integerCbrtFloor(scaledNum / q)

	// Round to nearest integer: (m + 1/2)^3 <= scaledNum / q iff q * (2m + 1)^3 <= 8 * scaledNum.
	const twoMPlus1 = 2n * m + 1n
	const roundUp = q * twoMPlus1 * twoMPlus1 * twoMPlus1 <= (scaledNum << 3n)
	const best = roundUp ? m + 1n : m

	const approxDen = 1n << shiftBig
	const g = gcd(best, approxDen)

	return {
		num: sign * (best / g),
		den: approxDen / g,
	}
}
