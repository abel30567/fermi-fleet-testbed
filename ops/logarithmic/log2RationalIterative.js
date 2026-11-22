/**
 * Computes the greatest common divisor of two BigInt values iteratively.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative GCD of `a` and `b`.
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const remainder = x % y
		x = y
		y = remainder
	}
	return x
}

/**
 * Reduces a rational number `num / den` to lowest terms with `den > 0n`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function reduceRational(num, den) {
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	if (n === 0n) {
		return { num: 0n, den: 1n }
	}
	const divisor = gcd(n, d)
	return { num: n / divisor, den: d / divisor }
}

/**
 * Returns the bit length of a strictly positive BigInt.
 *
 * @param {bigint} n Strictly positive BigInt.
 * @returns {number}
 */
function bitLength(n) {
	return n.toString(2).length
}

/**
 * Computes the base-2 logarithm (`log2`) of a strictly positive exact rational
 * `{ num: bigint, den: bigint }` using an iterative range-reduction and
 * repeated-squaring binary-fraction algorithm.
 *
 * - For exact powers of 2 (e.g. `1`, `2`, `8`, `1/4`), returns the exact
 *   integer rational `{ num: k, den: 1n }`.
 * - For all other strictly positive rationals, reduces the input to `m` in
 *   `(1, 2)` and iteratively extracts binary fractional digits to produce a
 *   reduced rational `{ num, den }` (with `den > 0n` and `gcd(|num|, den) === 1n`)
 *   accurate to within `2^(-precisionBits)`.
 *
 * @param {{ num: bigint, den: bigint }} value Strictly positive rational number.
 * @param {number} [precisionBits=64] Positive integer number of binary fractional bits of precision.
 * @returns {{ num: bigint, den: bigint }} Reduced exact or high-precision rational approximation of `log2(value)`.
 * @throws {TypeError} If `value` is not an object with BigInt `num` and `den`, or if `precisionBits` is not a number.
 * @throws {RangeError} If `value.den === 0n`, `value <= 0`, or `precisionBits` is not a positive safe integer.
 */
export function log2RationalIterative(value, precisionBits = 64) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError('Input rational must be a non-null object with BigInt num and den')
	}
	if (typeof value.num !== 'bigint' || typeof value.den !== 'bigint') {
		throw new TypeError('Rational num and den must both be BigInt values')
	}
	if (typeof precisionBits !== 'number') {
		throw new TypeError('precisionBits must be a number')
	}
	if (!Number.isSafeInteger(precisionBits) || precisionBits < 1) {
		throw new RangeError('precisionBits must be a positive safe integer')
	}
	if (value.den === 0n) {
		throw new RangeError('Rational denominator must be non-zero')
	}

	const { num, den } = reduceRational(value.num, value.den)
	if (num <= 0n) {
		throw new RangeError('Input rational must be strictly positive (> 0)')
	}

	// Range reduction: find integer k such that 1 <= (num / den) * 2^(-k) < 2.
	let k = bitLength(num) - bitLength(den)
	if (k >= 0) {
		if (num < (den << BigInt(k))) {
			k -= 1
		}
	} else if ((num << BigInt(-k)) < den) {
		k -= 1
	}

	let mNum
	let mDen
	if (k >= 0) {
		mNum = num
		mDen = den << BigInt(k)
	} else {
		mNum = num << BigInt(-k)
		mDen = den
	}

	// Exact power of 2: (num / den) === 2^k
	if (mNum === mDen) {
		return { num: BigInt(k), den: 1n }
	}

	// Iterative binary-fraction extraction via repeated squaring in scaled fixed-point.
	// Using workBits = 2 * precisionBits + 32 ensures accumulated rounding error stays << 2^(-precisionBits).
	const workBits = BigInt(precisionBits * 2 + 32)
	const scale = 1n << workBits
	const halfScale = scale >> 1n
	const twoScale = scale << 1n

	let u = ((mNum << workBits) + (mDen >> 1n)) / mDen
	let fracBits = 0n

	for (let i = 0; i <= precisionBits; i++) {
		u = (u * u + halfScale) >> workBits
		fracBits <<= 1n
		if (u >= twoScale) {
			fracBits |= 1n
			u >>= 1n
		}
	}

	// Round the extra guard bit to nearest
	const roundedFrac = (fracBits + 1n) >> 1n
	const totalNum = (BigInt(k) << BigInt(precisionBits)) + roundedFrac
	const totalDen = 1n << BigInt(precisionBits)

	return reduceRational(totalNum, totalDen)
}
