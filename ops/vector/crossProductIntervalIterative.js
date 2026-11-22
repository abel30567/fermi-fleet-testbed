/**
 * @fileoverview 3D vector cross product over interval arithmetic `[lo, hi]`
 * with IEEE-754 outward rounding guaranteeing mathematical enclosure.
 *
 * Uses a straightforward iterative component computation across the three
 * cyclic index triples `(j, k) = ((i + 1) % 3, (i + 2) % 3)` for `i = 0, 1, 2`,
 * applying IEEE-754 outward-rounded interval multiplication and subtraction
 * at every step so that for any real vectors `u ∈ a` and `v ∈ b`, the true
 * cross product `u × v` is guaranteed to lie componentwise within the returned
 * interval vector.
 */

const _f64 = new Float64Array(1)
const _u64 = new BigUint64Array(_f64.buffer)

/**
 * Veltkamp splitting constant `2^27 + 1` for Dekker's exact binary64 product.
 */
const SPLITTER = 134217729

/**
 * Thresholds bounding the safe exact domain for Dekker's `TwoProd` where no
 * intermediate value can overflow or suffer subnormal underflow.
 */
const DEKKER_MAX_OPERAND = 1e299
const DEKKER_MAX_PRODUCT = 1e307
const DEKKER_MIN_PRODUCT = 1e-290

/**
 * Normalize `-0` to `+0`.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Return the smallest IEEE-754 binary64 number strictly greater than `x`.
 *
 * @param {number} x
 * @returns {number}
 */
function nextUp(x) {
	if (Number.isNaN(x) || x === Infinity) return x
	if (x === -Infinity) return -Number.MAX_VALUE
	if (x === 0) return Number.MIN_VALUE
	_f64[0] = x
	if (x > 0) {
		_u64[0] += 1n
	} else {
		_u64[0] -= 1n
	}
	return normalizeZero(_f64[0])
}

/**
 * Return the largest IEEE-754 binary64 number strictly less than `x`.
 *
 * @param {number} x
 * @returns {number}
 */
function nextDown(x) {
	return normalizeZero(-nextUp(-x))
}

/**
 * Compute a lower bound `<= a * b` (directed rounding toward `-Infinity`)
 * using exact Dekker error analysis with IEEE-754 `nextDown` fallback.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function mulDown(a, b) {
	if (a === 0 || b === 0) return 0
	const p = a * b
	if (!Number.isFinite(p)) {
		if (p === Infinity) return Number.MAX_VALUE
		return p
	}
	if (p === 0) {
		// Nonzero product underflowed to zero
		const positive = (a > 0) === (b > 0)
		return positive ? 0 : -Number.MIN_VALUE
	}
	const absP = Math.abs(p)
	if (
		Math.abs(a) <= DEKKER_MAX_OPERAND &&
		Math.abs(b) <= DEKKER_MAX_OPERAND &&
		absP >= DEKKER_MIN_PRODUCT &&
		absP <= DEKKER_MAX_PRODUCT
	) {
		const ca = SPLITTER * a
		const ahi = ca - (ca - a)
		const alo = a - ahi
		const cb = SPLITTER * b
		const bhi = cb - (cb - b)
		const blo = b - bhi
		const err = (ahi * bhi - p + ahi * blo + alo * bhi) + alo * blo
		return err < 0 ? nextDown(p) : normalizeZero(p)
	}
	return nextDown(p)
}

/**
 * Compute an upper bound `>= a * b` (directed rounding toward `+Infinity`)
 * using exact Dekker error analysis with IEEE-754 `nextUp` fallback.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function mulUp(a, b) {
	if (a === 0 || b === 0) return 0
	const p = a * b
	if (!Number.isFinite(p)) {
		if (p === -Infinity) return -Number.MAX_VALUE
		return p
	}
	if (p === 0) {
		// Nonzero product underflowed to zero
		const positive = (a > 0) === (b > 0)
		return positive ? Number.MIN_VALUE : 0
	}
	const absP = Math.abs(p)
	if (
		Math.abs(a) <= DEKKER_MAX_OPERAND &&
		Math.abs(b) <= DEKKER_MAX_OPERAND &&
		absP >= DEKKER_MIN_PRODUCT &&
		absP <= DEKKER_MAX_PRODUCT
	) {
		const ca = SPLITTER * a
		const ahi = ca - (ca - a)
		const alo = a - ahi
		const cb = SPLITTER * b
		const bhi = cb - (cb - b)
		const blo = b - bhi
		const err = (ahi * bhi - p + ahi * blo + alo * bhi) + alo * blo
		return err > 0 ? nextUp(p) : normalizeZero(p)
	}
	return nextUp(p)
}

/**
 * Compute a lower bound `<= a - b` (directed rounding toward `-Infinity`)
 * using Knuth's TwoDiff error-free transformation with IEEE-754 `nextDown` fallback.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function subDown(a, b) {
	const s = a - b
	if (!Number.isFinite(a) || !Number.isFinite(b)) {
		return normalizeZero(s)
	}
	if (!Number.isFinite(s)) {
		if (s === Infinity) return Number.MAX_VALUE
		return s
	}
	const v = s - a
	const err = (a - (s - v)) - (b + v)
	if (Number.isFinite(err)) {
		return err < 0 ? nextDown(s) : normalizeZero(s)
	}
	return nextDown(s)
}

/**
 * Compute an upper bound `>= a - b` (directed rounding toward `+Infinity`)
 * using Knuth's TwoDiff error-free transformation with IEEE-754 `nextUp` fallback.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function subUp(a, b) {
	const s = a - b
	if (!Number.isFinite(a) || !Number.isFinite(b)) {
		return normalizeZero(s)
	}
	if (!Number.isFinite(s)) {
		if (s === -Infinity) return -Number.MAX_VALUE
		return s
	}
	const v = s - a
	const err = (a - (s - v)) - (b + v)
	if (Number.isFinite(err)) {
		return err > 0 ? nextUp(s) : normalizeZero(s)
	}
	return nextUp(s)
}

/**
 * Multiply two intervals `[xLo, xHi]` and `[yLo, yHi]` with outward rounding.
 *
 * @param {[number, number]} x
 * @param {[number, number]} y
 * @returns {[number, number]}
 */
function intervalMul(x, y) {
	const [xLo, xHi] = x
	const [yLo, yHi] = y
	const lo = Math.min(
		mulDown(xLo, yLo),
		mulDown(xLo, yHi),
		mulDown(xHi, yLo),
		mulDown(xHi, yHi),
	)
	const hi = Math.max(
		mulUp(xLo, yLo),
		mulUp(xLo, yHi),
		mulUp(xHi, yLo),
		mulUp(xHi, yHi),
	)
	return [normalizeZero(lo), normalizeZero(hi)]
}

/**
 * Subtract interval `y` from interval `x` (`x - y`) with outward rounding.
 *
 * @param {[number, number]} x
 * @param {[number, number]} y
 * @returns {[number, number]}
 */
function intervalSub(x, y) {
	const lo = subDown(x[0], y[1])
	const hi = subUp(x[1], y[0])
	return [normalizeZero(lo), normalizeZero(hi)]
}

/**
 * Validate that `vec` is a 3D interval vector: an array of 3 `[lo, hi]`
 * intervals with finite numeric bounds satisfying `lo <= hi`.
 *
 * @param {unknown} vec
 * @param {string} name
 */
function validateIntervalVector3(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an array of 3 [lo, hi] intervals`)
	}
	if (vec.length !== 3) {
		throw new RangeError(`${name} must have length 3, got ${vec.length}`)
	}
	for (let i = 0; i < 3; i++) {
		const interval = vec[i]
		if (!Array.isArray(interval)) {
			throw new TypeError(`${name}[${i}] must be a [lo, hi] interval array`)
		}
		if (interval.length !== 2) {
			throw new RangeError(
				`${name}[${i}] must have length 2, got ${interval.length}`,
			)
		}
		const [lo, hi] = interval
		if (typeof lo !== 'number' || typeof hi !== 'number') {
			throw new TypeError(`${name}[${i}] bounds must be numbers`)
		}
		if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
			throw new RangeError(`${name}[${i}] bounds must be finite numbers`)
		}
		if (lo > hi) {
			throw new RangeError(
				`${name}[${i}] has inverted bounds: lo (${lo}) > hi (${hi})`,
			)
		}
	}
}

/**
 * Compute the 3D vector cross product `a × b` over interval arithmetic using
 * a straightforward iterative loop over the three components with IEEE-754
 * outward rounding (`nextDown` / `nextUp`) on every interval multiplication
 * and subtraction to guarantee mathematical enclosure.
 *
 * For `i = 0, 1, 2`, with cyclic indices `j = (i + 1) % 3` and `k = (i + 2) % 3`:
 * `result[i] = (a[j] ⊗ b[k]) ⊖ (a[k] ⊗ b[j])`.
 *
 * @typedef {[number, number]} Interval
 * @typedef {[Interval, Interval, Interval]} IntervalVector3
 *
 * @param {IntervalVector3} a - First 3D interval vector `[[lo, hi], [lo, hi], [lo, hi]]`.
 * @param {IntervalVector3} b - Second 3D interval vector `[[lo, hi], [lo, hi], [lo, hi]]`.
 * @returns {IntervalVector3} Outward-rounded 3D interval vector enclosing `{ u × v : u ∈ a, v ∈ b }`.
 * @throws {TypeError} If `a` or `b` is not an array of arrays of numbers.
 * @throws {RangeError} If `a` or `b` is not 3D, an interval does not have length 2,
 *   any bound is non-finite (`NaN`, `±Infinity`), or any interval has `lo > hi`.
 */
export function crossProductIntervalIterative(a, b) {
	validateIntervalVector3(a, 'a')
	validateIntervalVector3(b, 'b')

	/** @type {IntervalVector3} */
	const result = new Array(3)
	for (let i = 0; i < 3; i++) {
		const j = (i + 1) % 3
		const k = (i + 2) % 3
		const prod1 = intervalMul(a[j], b[k])
		const prod2 = intervalMul(a[k], b[j])
		result[i] = intervalSub(prod1, prod2)
	}
	return result
}
