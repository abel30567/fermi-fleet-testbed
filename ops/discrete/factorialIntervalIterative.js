/**
 * @fileoverview Discrete factorial over interval arithmetic with outward rounding.
 *
 * Computes the tightest IEEE-754 binary64 interval enclosure `[loOut, hiOut]`
 * containing `n!` for every integer `n` in `[lo, hi]`, using straightforward
 * iterative exact BigInt multiplication followed by directed rounding
 * (`nextDown` / `nextUp`).
 */

const MAX_FINITE_FACTORIAL_N = 170

const _f64Buf = new ArrayBuffer(8)
const _f64View = new Float64Array(_f64Buf)
const _u64View = new BigUint64Array(_f64Buf)

/**
 * Returns the smallest IEEE-754 binary64 value strictly greater than `x`.
 *
 * @param {number} x
 * @returns {number}
 */
function nextUp(x) {
	if (Number.isNaN(x) || x === Infinity) return x
	if (x === 0) return Number.MIN_VALUE
	_f64View[0] = x
	if (x > 0) {
		_u64View[0] += 1n
	} else {
		_u64View[0] -= 1n
	}
	return _f64View[0]
}

/**
 * Returns the largest IEEE-754 binary64 value strictly less than `x`.
 *
 * @param {number} x
 * @returns {number}
 */
function nextDown(x) {
	if (Number.isNaN(x) || x === -Infinity) return x
	if (x === 0) return -Number.MIN_VALUE
	_f64View[0] = x
	if (x > 0) {
		_u64View[0] -= 1n
	} else {
		_u64View[0] += 1n
	}
	return _f64View[0]
}

/**
 * Rounds an exact non-negative BigInt (<= 170!) downward to the greatest
 * IEEE-754 binary64 number `<= value`.
 *
 * @param {bigint} value - Exact positive integer <= 170!.
 * @returns {number}
 */
function roundDownBigInt(value) {
	const approx = Number(value)
	// For value <= 170! < Number.MAX_VALUE, approx is finite and exact as an integer.
	if (BigInt(approx) > value) {
		return nextDown(approx)
	}
	return approx
}

/**
 * Rounds an exact non-negative BigInt (<= 170!) upward to the smallest
 * IEEE-754 binary64 number `>= value`.
 *
 * @param {bigint} value - Exact positive integer <= 170!.
 * @returns {number}
 */
function roundUpBigInt(value) {
	const approx = Number(value)
	if (BigInt(approx) < value) {
		return nextUp(approx)
	}
	return approx
}

/**
 * Validates that `interval` is a 2-element array `[lo, hi]` of non-negative
 * finite integers with `lo <= hi`.
 *
 * @param {unknown} interval
 * @returns {[number, number]}
 */
function validateInterval(interval) {
	if (!Array.isArray(interval) || interval.length !== 2) {
		throw new TypeError('interval must be a 2-element array [lo, hi]')
	}
	const [lo, hi] = interval
	if (typeof lo !== 'number' || typeof hi !== 'number') {
		throw new TypeError('interval endpoints must be numbers')
	}
	if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
		throw new RangeError('interval endpoints must be finite numbers')
	}
	if (!Number.isInteger(lo) || !Number.isInteger(hi)) {
		throw new RangeError('interval endpoints must be integers')
	}
	if (lo < 0 || hi < 0) {
		throw new RangeError('interval endpoints must be non-negative integers')
	}
	if (lo > hi) {
		throw new RangeError(`inverted interval: lo (${lo}) must be <= hi (${hi})`)
	}
	return [lo, hi]
}

/**
 * Computes the discrete factorial over an integer interval `[lo, hi]` using an
 * iterative algorithm with outward rounding.
 *
 * Because `n!` is monotonically non-decreasing for integers `n >= 0` (with
 * `0! = 1` and `1! = 1`), the exact image of `[lo, hi]` is enclosed by
 * `[RD(lo!), RU(hi!)]`, where `RD` rounds toward `-Infinity` and `RU` rounds
 * toward `+Infinity`.
 *
 * Iterative multiplication is performed in exact `BigInt` arithmetic up to
 * `min(hi, 170)` and then directed-rounded with IEEE-754 `nextDown`/`nextUp`,
 * guaranteeing strict enclosure (`loOut <= n! <= hiOut` for every integer
 * `n` in `[lo, hi]`) even beyond `n = 22` where IEEE-754 binary64 loses
 * precision. For `hi > 170`, `hi!` exceeds `Number.MAX_VALUE` and rounds upward
 * to `Infinity` (and if `lo > 170`, `lo!` rounds downward to `Number.MAX_VALUE`).
 *
 * @param {[number, number]} interval - Non-negative integer interval `[lo, hi]` with `lo <= hi`.
 * @returns {[number, number]} Outward-rounded IEEE-754 binary64 interval `[loOut, hiOut]`
 *   enclosing `{ n! | n ∈ ℤ, lo <= n <= hi }`.
 * @throws {TypeError} If `interval` is not a 2-element array of numbers.
 * @throws {RangeError} If endpoints are non-finite, non-integer, negative, or `lo > hi`.
 *
 * @example
 * factorialIntervalIterative([0, 1])   // [1, 1]
 * factorialIntervalIterative([3, 5])   // [6, 120]
 * factorialIntervalIterative([23, 23]) // [2.5852016738884974e+22, 2.585201673888498e+22]
 * factorialIntervalIterative([0, 171]) // [1, Infinity]
 */
export function factorialIntervalIterative(interval) {
	const [lo, hi] = validateInterval(interval)

	// Both endpoints overflow IEEE-754 binary64 (171! > Number.MAX_VALUE):
	// largest float64 <= lo! is Number.MAX_VALUE, smallest float64 >= hi! is Infinity.
	if (lo > MAX_FINITE_FACTORIAL_N) {
		return [Number.MAX_VALUE, Infinity]
	}

	const hiOverflows = hi > MAX_FINITE_FACTORIAL_N
	const limit = hiOverflows ? lo : hi

	let acc = 1n
	let loFact = lo <= 1 ? 1n : 0n
	let hiFact = hi <= 1 ? 1n : 0n

	for (let k = 2; k <= limit; k++) {
		acc *= BigInt(k)
		if (k === lo) loFact = acc
		if (!hiOverflows && k === hi) hiFact = acc
	}

	const loOut = roundDownBigInt(loFact)
	const hiOut = hiOverflows ? Infinity : roundUpBigInt(hiFact)

	return [loOut, hiOut]
}
