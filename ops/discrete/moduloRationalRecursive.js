/**
 * Exact rational modulo over `{ num: bigint, den: bigint }` values in lowest terms,
 * implemented via recursive divide-and-conquer binary long division and recursive
 * Euclidean GCD reduction.
 */

/**
 * Validates that a value is a rational object `{ num: bigint, den: bigint }` with non-zero denominator.
 *
 * @param {unknown} value - Candidate rational object.
 * @param {string} label - Parameter name for error messages.
 * @throws {TypeError} If `value` is not a plain object with `bigint` `num` and `den` fields.
 * @throws {RangeError} If `value.den` is `0n`.
 */
function validateRational(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be an object with BigInt properties { num, den }`)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label}.num and ${label}.den must be BigInts`)
	}
	if (den === 0n) {
		throw new RangeError(`${label}.den must not be zero`)
	}
}

/**
 * Recursively finds an upper bound `shift` (a power of two) such that `(divisor << shift) > dividend`.
 *
 * @param {bigint} dividend - Non-negative integer (`dividend >= divisor`).
 * @param {bigint} divisor - Positive integer.
 * @param {bigint} shift - Current power-of-two shift candidate (`>= 1n`).
 * @returns {bigint} Upper shift bound where `(divisor << shift) > dividend`.
 */
function findUpperShiftRecursive(dividend, divisor, shift) {
	if ((divisor << shift) > dividend) {
		return shift
	}
	return findUpperShiftRecursive(dividend, divisor, shift << 1n)
}

/**
 * Recursively binary-searches `[low, high)` for the largest `shift` with `(divisor << shift) <= dividend`.
 *
 * @param {bigint} dividend - Non-negative integer.
 * @param {bigint} divisor - Positive integer.
 * @param {bigint} low - Inclusive lower bound (`(divisor << low) <= dividend`).
 * @param {bigint} high - Exclusive upper bound (`(divisor << high) > dividend`).
 * @returns {bigint} Maximum shift `s` such that `(divisor << s) <= dividend < (divisor << (s + 1n))`.
 */
function binarySearchShiftRecursive(dividend, divisor, low, high) {
	if (high - low <= 1n) {
		return low
	}
	const mid = (low + high) >> 1n
	if ((divisor << mid) <= dividend) {
		return binarySearchShiftRecursive(dividend, divisor, mid, high)
	}
	return binarySearchShiftRecursive(dividend, divisor, low, mid)
}

/**
 * Divide-and-conquer binary long division over the quotient bit range `[0, maxShift]`.
 * Splits the quotient bits in half at each recursion level (stack depth O(log(bitLength(quotient)))).
 *
 * Precondition: `0n <= dividend < (divisor << (maxShift + 1n))` and `divisor > 0n`.
 *
 * @param {bigint} dividend - Non-negative integer dividend.
 * @param {bigint} divisor - Positive integer divisor.
 * @param {bigint} maxShift - Non-negative upper bound on the quotient's highest set bit.
 * @returns {{ quotient: bigint, remainder: bigint }}
 */
function divModBoundedRecursive(dividend, divisor, maxShift) {
	if (dividend < divisor) {
		return { quotient: 0n, remainder: dividend }
	}
	if (maxShift === 0n) {
		return { quotient: 1n, remainder: dividend - divisor }
	}
	const mid = (maxShift + 1n) >> 1n
	const high = divModBoundedRecursive(dividend, divisor << mid, maxShift - mid)
	const low = divModBoundedRecursive(high.remainder, divisor, mid - 1n)
	return {
		quotient: (high.quotient << mid) | low.quotient,
		remainder: low.remainder,
	}
}

/**
 * Computes `{ quotient, remainder }` for non-negative `dividend` and positive `divisor`
 * using recursive divide-and-conquer binary long division (no built-in `/` or `%`).
 *
 * @param {bigint} dividend - Non-negative integer dividend.
 * @param {bigint} divisor - Positive integer divisor.
 * @returns {{ quotient: bigint, remainder: bigint }}
 */
function divModNonNegativeRecursive(dividend, divisor) {
	if (dividend < divisor) {
		return { quotient: 0n, remainder: dividend }
	}
	const upperShift = findUpperShiftRecursive(dividend, divisor, 1n)
	const maxShift = binarySearchShiftRecursive(dividend, divisor, upperShift >> 1n, upperShift)
	return divModBoundedRecursive(dividend, divisor, maxShift)
}

/**
 * Computes the greatest common divisor of two non-negative BigInts via recursive Euclidean reduction.
 *
 * @param {bigint} x - Non-negative integer.
 * @param {bigint} y - Non-negative integer.
 * @returns {bigint} Greatest common divisor `gcd(x, y) >= 0n`.
 */
function gcdRecursive(x, y) {
	if (y === 0n) {
		return x
	}
	const { remainder } = divModNonNegativeRecursive(x, y)
	return gcdRecursive(y, remainder)
}

/**
 * Normalizes a rational `(num, den)` to lowest terms with strictly positive denominator.
 * Zero is normalized to `{ num: 0n, den: 1n }`.
 *
 * @param {bigint} num - Numerator.
 * @param {bigint} den - Non-zero denominator.
 * @returns {{ num: bigint, den: bigint }} Reduced rational with `den > 0n`.
 */
function reduceRationalRecursive(num, den) {
	const normNum = den < 0n ? -num : num
	const normDen = den < 0n ? -den : den
	if (normNum === 0n) {
		return { num: 0n, den: 1n }
	}
	const absNum = normNum < 0n ? -normNum : normNum
	const g = gcdRecursive(absNum, normDen)
	const { quotient: reducedAbsNum } = divModNonNegativeRecursive(absNum, g)
	const { quotient: reducedDen } = divModNonNegativeRecursive(normDen, g)
	return {
		num: normNum < 0n ? -reducedAbsNum : reducedAbsNum,
		den: reducedDen,
	}
}

/**
 * Computes the exact floored rational modulo `a mod b = a - b * floor(a / b)`.
 *
 * Both `a` and `b` are exact rationals represented as `{ num: bigint, den: bigint }`.
 * Inputs need not be pre-reduced and may have negative denominators; the returned
 * rational is always normalized to lowest terms with `den > 0n` (and `{ num: 0n, den: 1n }`
 * when the remainder is zero).
 *
 * Floored modulo satisfies:
 * - `a = q * b + r` where `q = floor(a / b)` is an integer
 * - `0 <= r < b` when `b > 0`, and `b < r <= 0` when `b < 0`
 * - In all cases, `0 <= |r| < |b|`
 *
 * Internally, inputs are reduced via recursive Euclidean GCD, scaled to a common positive
 * denominator, and divided using recursive divide-and-conquer binary long division over
 * the scaled BigInt numerators before reducing the resulting remainder to lowest terms.
 *
 * @param {{ num: bigint, den: bigint }} a - Dividend rational (`a.den !== 0n`).
 * @param {{ num: bigint, den: bigint }} b - Divisor rational (`b.num !== 0n`, `b.den !== 0n`).
 * @returns {{ num: bigint, den: bigint }} Exact remainder `a mod b` in lowest terms with `den > 0n`.
 * @throws {TypeError} If `a` or `b` is not an object with `bigint` `num` and `den` fields.
 * @throws {RangeError} If `a.den === 0n`, `b.den === 0n`, or `b.num === 0n`.
 */
export function moduloRationalRecursive(a, b) {
	validateRational(a, 'a')
	validateRational(b, 'b')
	if (b.num === 0n) {
		throw new RangeError('divisor b must not be zero')
	}

	const ra = reduceRationalRecursive(a.num, a.den)
	const rb = reduceRationalRecursive(b.num, b.den)

	if (ra.num === 0n) {
		return { num: 0n, den: 1n }
	}

	// Scale to common positive denominator: a = scaledA / commonDen, b = scaledB / commonDen
	const scaledA = ra.num * rb.den
	const scaledB = rb.num * ra.den
	const commonDen = ra.den * rb.den

	const absA = scaledA < 0n ? -scaledA : scaledA
	const absB = scaledB < 0n ? -scaledB : scaledB

	const { remainder: remMag } = divModNonNegativeRecursive(absA, absB)
	if (remMag === 0n) {
		return { num: 0n, den: 1n }
	}

	const sameSign = (scaledA > 0n) === (scaledB > 0n)
	const adjustedMag = sameSign ? remMag : absB - remMag
	const remainderNum = scaledB > 0n ? adjustedMag : -adjustedMag

	return reduceRationalRecursive(remainderNum, commonDen)
}
