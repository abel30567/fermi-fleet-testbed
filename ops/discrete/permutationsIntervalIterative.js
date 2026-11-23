/**
 * @fileoverview Discrete permutations P(n, k) over interval arithmetic on [lo, hi]
 * with outward rounding guaranteeing sound enclosure, using a straightforward
 * iterative implementation.
 *
 * For non-negative integers n and k, the number of k-permutations of n elements is:
 *   P(n, k) = n! / (n - k)! = prod_{i = 0}^{k - 1} (n - i)   for 0 <= k <= n
 *   P(n, k) = 0                                               for k > n >= 0
 *
 * Over integer intervals N = [nLo, nHi] and K = [kLo, kHi]:
 * - P(n, k) is monotonically non-decreasing in n for every fixed k >= 0.
 * - For fixed n >= 0, P(n, k) is monotonically non-decreasing in k for 0 <= k <= n
 *   and equals 0 for k > n.
 * Therefore:
 * - Minimum over N x K is 0 if kHi > nLo, else P(nLo, kLo).
 * - Maximum over N x K is 0 if kLo > nHi, else P(nHi, min(kHi, nHi)).
 *
 * Outward rounding uses exact IEEE-754 binary64 directed multiplication (via
 * scaled Veltkamp-Dekker error-free transformation and bit-level nextDown/nextUp),
 * guaranteeing outLo <= P(n, k) <= outHi for all (n, k) in N x K.
 */

const F64 = new Float64Array(1)
const U64 = new BigUint64Array(F64.buffer)

// Veltkamp splitting factor for IEEE-754 binary64: 2^27 + 1
const VELTKAMP_SPLIT = 134217729
// Power-of-two scaling to prevent overflow in Dekker TwoProduct for large normal floats
const SCALE_THRESHOLD = 2 ** 450
const SCALE_DOWN = 2 ** -512

/**
 * Returns the smallest IEEE-754 binary64 number strictly greater than a non-negative x.
 *
 * @param {number} x - Non-negative number.
 * @returns {number} Next representable float64 toward +Infinity.
 */
function nextUpNonNegative(x) {
	if (x === Infinity) return Infinity
	if (x === 0) return Number.MIN_VALUE
	F64[0] = x
	U64[0] += 1n
	return F64[0]
}

/**
 * Returns the largest IEEE-754 binary64 number strictly less than a positive x.
 *
 * @param {number} x - Positive number.
 * @returns {number} Next representable float64 toward -Infinity.
 */
function nextDownPositive(x) {
	if (x === Infinity) return Number.MAX_VALUE
	F64[0] = x
	U64[0] -= 1n
	return F64[0]
}

/**
 * Computes the exact rounding residual `a * b - fl(a * b)` for positive finite
 * operands `a >= 1` and `b >= 1` whose IEEE-754 product `a * b` is finite.
 *
 * Power-of-two scaling preserves all significand bits and rounding direction
 * while eliminating any possibility of intermediate overflow or underflow in
 * Dekker's TwoProduct.
 *
 * @param {number} a - Finite number >= 1.
 * @param {number} b - Finite number >= 1.
 * @returns {number} Residual having the exact sign of `a * b - fl(a * b)`.
 */
function exactMulErrorSign(a, b) {
	const aScaled = a >= SCALE_THRESHOLD ? a * SCALE_DOWN : a
	const bScaled = b >= SCALE_THRESHOLD ? b * SCALE_DOWN : b

	const p = aScaled * bScaled

	const ca = VELTKAMP_SPLIT * aScaled
	const aHi = ca - (ca - aScaled)
	const aLo = aScaled - aHi

	const cb = VELTKAMP_SPLIT * bScaled
	const bHi = cb - (cb - bScaled)
	const bLo = bScaled - bHi

	return (((aHi * bHi - p) + aHi * bLo) + aLo * bHi) + aLo * bLo
}

/**
 * Multiplies two finite numbers >= 1 with IEEE-754 rounding toward -Infinity.
 *
 * @param {number} a - Finite number >= 1.
 * @param {number} b - Finite number >= 1.
 * @returns {number} Largest float64 <= exact a * b.
 */
function mulDown(a, b) {
	const p = a * b
	if (!Number.isFinite(p)) return Number.MAX_VALUE
	return exactMulErrorSign(a, b) < 0 ? nextDownPositive(p) : p
}

/**
 * Multiplies two finite numbers >= 1 with IEEE-754 rounding toward +Infinity.
 *
 * @param {number} a - Finite number >= 1.
 * @param {number} b - Finite number >= 1.
 * @returns {number} Smallest float64 >= exact a * b (or Infinity on overflow).
 */
function mulUp(a, b) {
	const p = a * b
	if (!Number.isFinite(p)) return Infinity
	return exactMulErrorSign(a, b) > 0 ? nextUpNonNegative(p) : p
}

/**
 * Validates that an argument is a non-negative safe integer interval `[lo, hi]`
 * with `0 <= lo <= hi`.
 *
 * @param {unknown} interval - Candidate interval.
 * @param {string} name - Parameter name for error diagnostics.
 * @returns {[number, number]} Normalized `[lo, hi]` with `-0` converted to `+0`.
 * @throws {TypeError} If the input is not a 2-element array of numbers.
 * @throws {RangeError} If bounds are non-finite, non-integer, unsafe, negative, or inverted.
 */
function validateIntegerInterval(interval, name) {
	if (!Array.isArray(interval) || interval.length !== 2) {
		throw new TypeError(`${name} must be a 2-element interval array [lo, hi]`)
	}
	const [rawLo, rawHi] = interval
	if (typeof rawLo !== 'number' || typeof rawHi !== 'number') {
		throw new TypeError(`${name} interval endpoints must be numbers`)
	}
	if (!Number.isFinite(rawLo) || !Number.isFinite(rawHi)) {
		throw new RangeError(`${name} interval endpoints must be finite numbers`)
	}
	if (!Number.isInteger(rawLo) || !Number.isInteger(rawHi)) {
		throw new RangeError(`${name} interval endpoints must be integers`)
	}
	if (!Number.isSafeInteger(rawLo) || !Number.isSafeInteger(rawHi)) {
		throw new RangeError(`${name} interval endpoints must be safe integers`)
	}
	if (rawLo < 0 || rawHi < 0) {
		throw new RangeError(`${name} interval endpoints must be non-negative`)
	}
	if (rawLo > rawHi) {
		throw new RangeError(`${name} interval must satisfy lo <= hi`)
	}
	return [rawLo === 0 ? 0 : rawLo, rawHi === 0 ? 0 : rawHi]
}

/**
 * Iteratively computes a guaranteed lower bound for P(n, k) where 0 <= k <= n.
 *
 * @param {number} n - Non-negative safe integer.
 * @param {number} k - Non-negative safe integer with k <= n.
 * @returns {number} Largest-possible iterative lower bound <= P(n, k).
 */
function permutationsDown(n, k) {
	let acc = 1
	for (let i = 0; i < k; i++) {
		acc = mulDown(acc, n - i)
		if (acc === Number.MAX_VALUE) break
	}
	return acc
}

/**
 * Iteratively computes a guaranteed upper bound for P(n, k) where 0 <= k <= n.
 *
 * @param {number} n - Non-negative safe integer.
 * @param {number} k - Non-negative safe integer with k <= n.
 * @returns {number} Smallest-possible iterative upper bound >= P(n, k) (or Infinity).
 */
function permutationsUp(n, k) {
	let acc = 1
	for (let i = 0; i < k; i++) {
		acc = mulUp(acc, n - i)
		if (acc === Infinity) break
	}
	return acc
}

/**
 * Computes discrete permutations P(n, k) over interval arithmetic on `[lo, hi]`
 * with outward rounding guaranteeing sound enclosure `[outLo, outHi]`, using a
 * straightforward iterative implementation.
 *
 * For every integer `n` in `[nInterval[0], nInterval[1]]` and every integer `k`
 * in `[kInterval[0], kInterval[1]]`, the returned interval `[outLo, outHi]`
 * satisfies `outLo <= P(n, k) <= outHi`. When the true value exceeds
 * `Number.MAX_VALUE`, outward rounding yields `Number.MAX_VALUE` for the lower
 * bound (if the minimum overflows) and `Infinity` for the upper bound.
 *
 * @param {[number, number]} nInterval - Non-negative safe integer interval `[nLo, nHi]` with `nLo <= nHi`.
 * @param {[number, number]} kInterval - Non-negative safe integer interval `[kLo, kHi]` with `kLo <= kHi`.
 * @returns {[number, number]} Outward-rounded enclosure `[outLo, outHi]` of `{ P(n, k) }`.
 * @throws {TypeError} If either argument is not a 2-element array of numbers.
 * @throws {RangeError} If any endpoint is non-finite, non-integer, unsafe, negative, or inverted (`lo > hi`).
 */
export function permutationsIntervalIterative(nInterval, kInterval) {
	const [nLo, nHi] = validateIntegerInterval(nInterval, 'nInterval')
	const [kLo, kHi] = validateIntegerInterval(kInterval, 'kInterval')

	const outLo = kHi > nLo ? 0 : permutationsDown(nLo, kLo)
	const outHi = kLo > nHi ? 0 : permutationsUp(nHi, Math.min(kHi, nHi))

	return [outLo, outHi]
}
