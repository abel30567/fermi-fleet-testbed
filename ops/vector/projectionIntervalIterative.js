/**
 * @fileoverview Iterative vector projection over IEEE-754 interval arithmetic
 * with outward rounding guaranteeing rigorous enclosure.
 */

/**
 * A closed real interval represented as a 2-element tuple `[lo, hi]` with `lo <= hi`.
 * @typedef {[number, number]} Interval
 */

const _f64Buf = new ArrayBuffer(8)
const _f64View = new Float64Array(_f64Buf)
const _u64View = new BigUint64Array(_f64Buf)

/**
 * Returns the least IEEE-754 binary64 number strictly greater than `x`
 * (or `Infinity` if `x === Infinity`, `-Number.MAX_VALUE` if `x === -Infinity`).
 *
 * @param {number} x
 * @returns {number}
 */
function nextUp(x) {
	if (Number.isNaN(x) || x === Infinity) return x
	if (x === -Infinity) return -Number.MAX_VALUE
	if (x === 0) return Number.MIN_VALUE
	_f64View[0] = x
	if (x > 0) {
		_u64View[0] += 1n
	} else {
		_u64View[0] -= 1n
	}
	const r = _f64View[0]
	return r === 0 ? 0 : r
}

/**
 * Returns the greatest IEEE-754 binary64 number strictly less than `x`
 * (or `-Infinity` if `x === -Infinity`, `Number.MAX_VALUE` if `x === Infinity`).
 *
 * @param {number} x
 * @returns {number}
 */
function nextDown(x) {
	if (Number.isNaN(x) || x === -Infinity) return x
	if (x === Infinity) return Number.MAX_VALUE
	if (x === 0) return -Number.MIN_VALUE
	_f64View[0] = x
	if (x > 0) {
		_u64View[0] -= 1n
	} else {
		_u64View[0] += 1n
	}
	const r = _f64View[0]
	return r === 0 ? 0 : r
}

/**
 * Outward-rounded downward addition: returns a float `<= a + b`.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function addDown(a, b) {
	if (a === 0) return b === 0 ? 0 : b
	if (b === 0) return a === 0 ? 0 : a
	return nextDown(a + b)
}

/**
 * Outward-rounded upward addition: returns a float `>= a + b`.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function addUp(a, b) {
	if (a === 0) return b === 0 ? 0 : b
	if (b === 0) return a === 0 ? 0 : a
	return nextUp(a + b)
}

/**
 * Outward-rounded downward multiplication: returns a float `<= a * b`.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function mulDown(a, b) {
	if (a === 0 || b === 0) return 0
	const r = nextDown(a * b)
	if ((a > 0 && b > 0) || (a < 0 && b < 0)) {
		return r < 0 ? 0 : r
	}
	return r
}

/**
 * Outward-rounded upward multiplication: returns a float `>= a * b`.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function mulUp(a, b) {
	if (a === 0 || b === 0) return 0
	const r = nextUp(a * b)
	if ((a > 0 && b < 0) || (a < 0 && b > 0)) {
		return r > 0 ? 0 : r
	}
	return r
}

/**
 * Outward-rounded downward division `a / b` for positive divisor `b > 0`.
 * Returns a float `<= a / b`.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function divDownPos(a, b) {
	if (a === 0) return 0
	if (b === Infinity) {
		return a > 0 ? 0 : -Number.MIN_VALUE
	}
	const r = nextDown(a / b)
	if (a > 0) {
		return r < 0 ? 0 : r
	}
	return r
}

/**
 * Outward-rounded upward division `a / b` for positive divisor `b > 0`.
 * Returns a float `>= a / b`.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function divUpPos(a, b) {
	if (a === 0) return 0
	if (b === Infinity) {
		return a < 0 ? 0 : Number.MIN_VALUE
	}
	const r = nextUp(a / b)
	if (a < 0) {
		return r > 0 ? 0 : r
	}
	return r
}

/**
 * Interval multiplication `[a, b] * [c, d]` with outward rounding.
 *
 * @param {Interval} x
 * @param {Interval} y
 * @returns {Interval}
 */
function ivMul(x, y) {
	const [a, b] = x
	const [c, d] = y
	const lo = Math.min(mulDown(a, c), mulDown(a, d), mulDown(b, c), mulDown(b, d))
	const hi = Math.max(mulUp(a, c), mulUp(a, d), mulUp(b, c), mulUp(b, d))
	return [lo === 0 ? 0 : lo, hi === 0 ? 0 : hi]
}

/**
 * Tight interval squaring `[a, b]^2` with outward rounding.
 * Avoids the dependency problem of `ivMul(x, x)` so the lower bound is always `>= 0`.
 *
 * @param {Interval} x
 * @returns {Interval}
 */
function ivSquare(x) {
	const [a, b] = x
	if (a <= 0 && b >= 0) {
		const hi = Math.max(mulUp(a, a), mulUp(b, b))
		return [0, hi === 0 ? 0 : hi]
	}
	if (a > 0) {
		return [mulDown(a, a), mulUp(b, b)]
	}
	// b < 0
	return [mulDown(b, b), mulUp(a, a)]
}

/**
 * Interval division `[a, b] / [c, d]` for strictly positive divisor `c > 0`,
 * with outward rounding.
 *
 * @param {Interval} num
 * @param {Interval} den
 * @returns {Interval}
 */
function ivDivPos(num, den) {
	const [a, b] = num
	const [c, d] = den
	const lo = a >= 0 ? divDownPos(a, d) : divDownPos(a, c)
	const hi = b >= 0 ? divUpPos(b, c) : divUpPos(b, d)
	return [lo === 0 ? 0 : lo, hi === 0 ? 0 : hi]
}

/**
 * Validates that `vec` is a non-empty array of valid finite `[lo, hi]` intervals.
 *
 * @param {unknown} vec
 * @param {string} name
 * @returns {void}
 */
function validateIntervalVector(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an array of [lo, hi] intervals`)
	}
	if (vec.length === 0) {
		throw new RangeError(`${name} must be non-empty`)
	}
	for (let i = 0; i < vec.length; i++) {
		const iv = vec[i]
		if (!Array.isArray(iv) || iv.length !== 2) {
			throw new TypeError(`${name}[${i}] must be a 2-element [lo, hi] array`)
		}
		const [lo, hi] = iv
		if (typeof lo !== 'number' || typeof hi !== 'number') {
			throw new TypeError(`${name}[${i}] bounds must be numbers`)
		}
		if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
			throw new RangeError(`${name}[${i}] bounds must be finite numbers`)
		}
		if (lo > hi) {
			throw new RangeError(`${name}[${i}] has inverted bounds (${lo} > ${hi})`)
		}
	}
}

/**
 * Computes the vector projection of interval vector `u` onto interval vector `v`:
 *
 * `proj_v(u) = ((u · v) / (v · v)) * v`
 *
 * over `[lo, hi]` interval arithmetic with IEEE-754 outward rounding (`nextDown` /
 * `nextUp`), using straightforward iterative loops. Every component of the returned
 * interval vector is guaranteed to enclose the exact real projection for all point
 * vectors `u_pt ∈ u` and `v_pt ∈ v`.
 *
 * Uses exact interval squaring when accumulating `v · v` so components whose
 * intervals cross zero do not introduce negative lower bounds.
 *
 * @param {ReadonlyArray<Interval>} u - Source interval vector to project.
 * @param {ReadonlyArray<Interval>} v - Target interval vector to project onto.
 * @returns {Interval[]} Projected interval vector of the same length as `u` and `v`.
 * @throws {TypeError} If `u` or `v` is not an array of numeric `[lo, hi]` pairs.
 * @throws {RangeError} If `u` or `v` is empty, their lengths differ, any bound is
 *   non-finite or inverted (`lo > hi`), or the enclosure of `v · v` contains zero.
 */
export function projectionIntervalIterative(u, v) {
	validateIntervalVector(u, 'u')
	validateIntervalVector(v, 'v')

	const n = u.length
	if (v.length !== n) {
		throw new RangeError(`Vector length mismatch: u has length ${n}, v has length ${v.length}`)
	}

	// Accumulate u · v and v · v iteratively with outward rounding.
	let uvLo = 0
	let uvHi = 0
	let vvLo = 0
	let vvHi = 0

	for (let i = 0; i < n; i++) {
		const [pLo, pHi] = ivMul(u[i], v[i])
		uvLo = addDown(uvLo, pLo)
		uvHi = addUp(uvHi, pHi)

		const [sLo, sHi] = ivSquare(v[i])
		vvLo = addDown(vvLo, sLo)
		vvHi = addUp(vvHi, sHi)
	}

	if (vvLo <= 0) {
		throw new RangeError(
			'Target vector squared norm interval (v · v) contains zero; projection is undefined'
		)
	}

	// Compute scalar factor (u · v) / (v · v).
	const scalar = ivDivPos([uvLo, uvHi], [vvLo, vvHi])

	// Scale each component of v iteratively.
	/** @type {Interval[]} */
	const result = new Array(n)
	for (let i = 0; i < n; i++) {
		result[i] = ivMul(scalar, v[i])
	}

	return result
}
