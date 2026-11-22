/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Compute the greatest common divisor of two BigInts using the iterative
 * Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative GCD of a and b.
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Reduce a rational num/den to lowest terms with strictly positive denominator.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function reduceRational(num, den) {
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcd(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Compute the bit length of a non-negative BigInt.
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function bitLength(n) {
	if (n === 0n) return 0n
	const hex = n.toString(16)
	let lead = parseInt(hex[0], 16)
	let leadBits = 0
	while (lead > 0) {
		leadBits += 1
		lead >>= 1
	}
	return BigInt((hex.length - 1) * 4 + leadBits)
}

/**
 * Compute a scaled fixed-point approximation of 2 * atanh(absA / b) using the
 * iterative Taylor series:
 *   2 * atanh(y) = 2 * sum_{j >= 0} y^(2j+1) / (2j + 1)
 *
 * Assumes 0 <= absA < b and scale > 0.
 *
 * @param {bigint} absA - Non-negative numerator of y.
 * @param {bigint} b - Positive denominator of y (strictly greater than absA).
 * @param {bigint} scale - Fixed-point scaling factor (2^workBits).
 * @returns {bigint} Scaled fixed-point value of 2 * atanh(absA / b).
 */
function twoAtanhScaled(absA, b, scale) {
	if (absA === 0n) return 0n
	const a2 = absA * absA
	const b2 = b * b
	let term = (2n * absA * scale) / b
	let sum = term
	let denom = 1n
	while (term > 0n) {
		term = (term * a2) / b2
		denom += 2n
		const contrib = term / denom
		if (contrib === 0n) break
		sum += contrib
	}
	return sum
}

/**
 * Symmetrically round a signed BigInt divided by 2^shift to nearest integer.
 *
 * @param {bigint} value
 * @param {bigint} shift
 * @returns {bigint}
 */
function roundShiftRight(value, shift) {
	if (shift === 0n) return value
	const negative = value < 0n
	const absVal = negative ? -value : value
	const half = 1n << (shift - 1n)
	const rounded = (absVal + half) >> shift
	return negative ? -rounded : rounded
}

/**
 * Compute the natural logarithm ln(x) of a strictly positive exact rational
 * x = { num: BigInt, den: BigInt }, returning an exact rational in lowest terms
 * with den > 0n.
 *
 * Returns exact `{ num: 0n, den: 1n }` when x = 1. For x != 1, uses symmetry
 * `ln(1/x) = -ln(x)`, binary range reduction `x = 2^k * m` with `m in [2/3, 4/3)`,
 * and a straightforward iterative `2 * atanh((m - 1) / (m + 1))` series
 * evaluated in high-precision scaled BigInt arithmetic.
 *
 * @param {Rational} x - Strictly positive rational `{ num: BigInt, den: BigInt }`.
 * @param {number} [precisionBits=128] - Target binary precision in bits (default 128, ~38.5 decimal digits).
 * @returns {Rational} Reduced rational `{ num: BigInt, den: BigInt }` with `den > 0n`.
 * @throws {TypeError} If `x` is not a `{ num: BigInt, den: BigInt }` object or `precisionBits` is not a number.
 * @throws {RangeError} If `x.den === 0n`, `x <= 0`, or `precisionBits` is not a positive safe integer.
 */
export function lnRationalIterative(x, precisionBits = 128) {
	if (x === null || typeof x !== 'object') {
		throw new TypeError('Expected a rational object { num: BigInt, den: BigInt }')
	}
	if (typeof x.num !== 'bigint' || typeof x.den !== 'bigint') {
		throw new TypeError('Rational num and den must both be BigInt values')
	}
	if (typeof precisionBits !== 'number') {
		throw new TypeError('precisionBits must be a number')
	}
	if (!Number.isSafeInteger(precisionBits) || precisionBits < 1) {
		throw new RangeError('precisionBits must be a positive safe integer')
	}
	if (x.den === 0n) {
		throw new RangeError('Rational denominator cannot be zero')
	}

	// Normalize sign so denominator is strictly positive
	let num = x.num
	let den = x.den
	if (den < 0n) {
		num = -num
		den = -den
	}

	if (num <= 0n) {
		throw new RangeError('ln is only defined for strictly positive rationals')
	}

	// Exact identity: ln(1) = 0
	if (num === den) {
		return { num: 0n, den: 1n }
	}

	// Reduce input to simplify subsequent arithmetic
	const g = gcd(num, den)
	num /= g
	den /= g

	// Enforce exact symmetry ln(1/x) = -ln(x) by mapping 0 < x < 1 to 1/x > 1
	let negate = false
	if (num < den) {
		negate = true
		const tmp = num
		num = den
		den = tmp
	}

	// Range-reduce x = num / den > 1 as x = 2^k * (mNum / mDen) with m in [2/3, 4/3)
	let k = bitLength(num) - bitLength(den)
	let mNum = num
	let mDen = den << k

	if (3n * mNum >= 4n * mDen) {
		mDen <<= 1n
		k += 1n
	} else if (3n * mNum < 2n * mDen) {
		mNum <<= 1n
		k -= 1n
	}

	// Compute y = (m - 1) / (m + 1) = (mNum - mDen) / (mNum + mDen)
	const yNum = mNum - mDen
	const yDen = mNum + mDen
	const yNeg = yNum < 0n
	const yAbs = yNeg ? -yNum : yNum

	// For values very close to 1 (k === 0), boost output fractional bits so we
	// preserve at least precisionBits significant bits and never underflow to 0.
	let effBits = BigInt(precisionBits)
	if (k === 0n && yAbs > 0n) {
		const leadShift = bitLength(yDen) - bitLength(yAbs)
		if (leadShift > 0n) {
			effBits += leadShift
		}
	}

	// Choose guard bits to absorb iterative truncation and multiplication by k
	const guardBits = 32n + bitLength(effBits) + bitLength(k)
	const workScale = 1n << (effBits + guardBits)

	// ln(m) = 2 * atanh(y)
	let lnMScaled = twoAtanhScaled(yAbs, yDen, workScale)
	if (yNeg) {
		lnMScaled = -lnMScaled
	}

	// ln(2) = 2 * atanh(1/3), needed only when k > 0
	let totalScaled = lnMScaled
	if (k > 0n) {
		const ln2Scaled = twoAtanhScaled(1n, 3n, workScale)
		totalScaled += k * ln2Scaled
	}

	const rounded = roundShiftRight(totalScaled, guardBits)
	const signedNum = negate ? -rounded : rounded
	const outDen = 1n << effBits

	return reduceRational(signedNum, outDen)
}
