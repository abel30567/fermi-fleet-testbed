/**
 * Interval-arithmetic derivative evaluator with IEEE-754 outward rounding.
 *
 * Uses bit-level IEEE-754 `nextDown`/`nextUp` combined with error-free
 * transformations (Knuth's TwoSum and Dekker's TwoProd) in normal ranges to
 * guarantee mathematically sound enclosure of polynomial derivatives over
 * interval domains and interval coefficients.
 *
 * @module ops/calculus/derivativeIntervalIterative
 */

const _f64 = new Float64Array(1)
const _u64 = new BigUint64Array(_f64.buffer)
const DEKKER_SPLIT = 134217729 // 2^27 + 1
const DEKKER_MAX_OPERAND = 1e150
const DEKKER_MIN_PRODUCT = 1e-270
const MAX_SUBDIVISIONS = 1_000_000

/**
 * Normalizes `-0` to `+0`.
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Returns the smallest IEEE-754 binary64 number strictly greater than `x`.
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
 * Returns the largest IEEE-754 binary64 number strictly less than `x`.
 * @param {number} x
 * @returns {number}
 */
function nextDown(x) {
	if (Number.isNaN(x) || x === -Infinity) return x
	if (x === Infinity) return Number.MAX_VALUE
	if (x === 0) return -Number.MIN_VALUE
	_f64[0] = x
	if (x > 0) {
		_u64[0] -= 1n
	} else {
		_u64[0] += 1n
	}
	return normalizeZero(_f64[0])
}

/**
 * Downward-rounded sum: returns a float `r <= a + b` (in exact real arithmetic).
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function addDown(a, b) {
	if (a === 0) return normalizeZero(b)
	if (b === 0) return normalizeZero(a)
	const s = a + b
	if (!Number.isFinite(s)) {
		if (s === Infinity) {
			return a === Infinity || b === Infinity ? Infinity : Number.MAX_VALUE
		}
		return -Infinity
	}
	const v = s - a
	const err = a - (s - v) + (b - v)
	if (!Number.isFinite(err)) return nextDown(s)
	return err < 0 ? nextDown(s) : normalizeZero(s)
}

/**
 * Upward-rounded sum: returns a float `r >= a + b` (in exact real arithmetic).
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function addUp(a, b) {
	if (a === 0) return normalizeZero(b)
	if (b === 0) return normalizeZero(a)
	const s = a + b
	if (!Number.isFinite(s)) {
		if (s === -Infinity) {
			return a === -Infinity || b === -Infinity ? -Infinity : -Number.MAX_VALUE
		}
		return Infinity
	}
	const v = s - a
	const err = a - (s - v) + (b - v)
	if (!Number.isFinite(err)) return nextUp(s)
	return err > 0 ? nextUp(s) : normalizeZero(s)
}

/**
 * Computes exact multiplication residual `err = a * b - fl(a * b)` via Dekker's
 * TwoProd when inputs and product lie in the safe normal range, or `NaN` if
 * outside that range.
 * @param {number} a
 * @param {number} b
 * @param {number} p
 * @returns {number}
 */
function twoProdError(a, b, p) {
	if (
		Math.abs(a) > DEKKER_MAX_OPERAND ||
		Math.abs(b) > DEKKER_MAX_OPERAND ||
		Math.abs(p) < DEKKER_MIN_PRODUCT
	) {
		return NaN
	}
	const ca = DEKKER_SPLIT * a
	const ahi = ca - (ca - a)
	const alo = a - ahi

	const cb = DEKKER_SPLIT * b
	const bhi = cb - (cb - b)
	const blo = b - bhi

	return ahi * bhi - p + ahi * blo + alo * bhi + alo * blo
}

/**
 * Downward-rounded product: returns a float `r <= a * b` (in exact real arithmetic).
 * Treats `0 * (±Infinity)` as `0` because all represented real values are finite.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function mulDown(a, b) {
	if (a === 0 || b === 0) return 0
	const p = a * b
	if (!Number.isFinite(p)) {
		if (p === Infinity) {
			return !Number.isFinite(a) || !Number.isFinite(b)
				? Infinity
				: Number.MAX_VALUE
		}
		return -Infinity
	}
	if (p === 0) {
		return (a > 0) === (b > 0) ? 0 : -Number.MIN_VALUE
	}
	if (
		Number.isSafeInteger(a) &&
		Number.isSafeInteger(b) &&
		Math.abs(p) <= Number.MAX_SAFE_INTEGER
	) {
		return normalizeZero(p)
	}
	const err = twoProdError(a, b, p)
	if (!Number.isFinite(err)) return nextDown(p)
	return err < 0 ? nextDown(p) : normalizeZero(p)
}

/**
 * Upward-rounded product: returns a float `r >= a * b` (in exact real arithmetic).
 * Treats `0 * (±Infinity)` as `0` because all represented real values are finite.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function mulUp(a, b) {
	if (a === 0 || b === 0) return 0
	const p = a * b
	if (!Number.isFinite(p)) {
		if (p === -Infinity) {
			return !Number.isFinite(a) || !Number.isFinite(b)
				? -Infinity
				: -Number.MAX_VALUE
		}
		return Infinity
	}
	if (p === 0) {
		return (a > 0) === (b > 0) ? Number.MIN_VALUE : 0
	}
	if (
		Number.isSafeInteger(a) &&
		Number.isSafeInteger(b) &&
		Math.abs(p) <= Number.MAX_SAFE_INTEGER
	) {
		return normalizeZero(p)
	}
	const err = twoProdError(a, b, p)
	if (!Number.isFinite(err)) return nextUp(p)
	return err > 0 ? nextUp(p) : normalizeZero(p)
}

/**
 * Outward-rounded interval addition `[a, b] + [c, d]`.
 * @param {[number, number]} iv1
 * @param {[number, number]} iv2
 * @returns {[number, number]}
 */
function intervalAdd(iv1, iv2) {
	return [addDown(iv1[0], iv2[0]), addUp(iv1[1], iv2[1])]
}

/**
 * Outward-rounded interval multiplication `[a, b] * [c, d]`.
 * @param {[number, number]} iv1
 * @param {[number, number]} iv2
 * @returns {[number, number]}
 */
function intervalMul(iv1, iv2) {
	const [a, b] = iv1
	const [c, d] = iv2
	const lo = Math.min(
		mulDown(a, c),
		mulDown(a, d),
		mulDown(b, c),
		mulDown(b, d),
	)
	const hi = Math.max(mulUp(a, c), mulUp(a, d), mulUp(b, c), mulUp(b, d))
	return [normalizeZero(lo), normalizeZero(hi)]
}

/**
 * Validates and normalizes an interval `[lo, hi]`.
 * @param {unknown} value
 * @param {string} name
 * @returns {[number, number]}
 */
function parseInterval(value, name) {
	if (!Array.isArray(value)) {
		throw new TypeError(`${name} must be a 2-element array [lo, hi]`)
	}
	if (value.length !== 2) {
		throw new RangeError(`${name} must have length 2, got ${value.length}`)
	}
	const [lo, hi] = value
	if (typeof lo !== 'number' || typeof hi !== 'number') {
		throw new TypeError(`${name} bounds must be numbers`)
	}
	if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
		throw new RangeError(`${name} bounds must be finite numbers`)
	}
	if (lo > hi) {
		throw new RangeError(`${name} must satisfy lo <= hi, got [${lo}, ${hi}]`)
	}
	return [normalizeZero(lo), normalizeZero(hi)]
}

/**
 * Validates and normalizes a polynomial coefficient (finite number or `[lo, hi]`).
 * @param {unknown} value
 * @param {number} index
 * @returns {[number, number]}
 */
function parseCoeff(value, index) {
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw new RangeError(`coeffs[${index}] must be a finite number`)
		}
		const v = normalizeZero(value)
		return [v, v]
	}
	return parseInterval(value, `coeffs[${index}]`)
}

/**
 * Evaluates a polynomial with interval coefficients at an interval `x`
 * using iterative Horner's scheme with outward rounding.
 * @param {Array<[number, number]>} coeffs
 * @param {[number, number]} x
 * @returns {[number, number]}
 */
function hornerInterval(coeffs, x) {
	let acc = coeffs[coeffs.length - 1]
	for (let i = coeffs.length - 2; i >= 0; i--) {
		acc = intervalAdd(intervalMul(acc, x), coeffs[i])
	}
	return [normalizeZero(acc[0]), normalizeZero(acc[1])]
}

/**
 * Computes a guaranteed interval enclosure of the derivative of a polynomial
 * `p(x) = sum_{k=0}^{n} c_k * x^k` over an interval `x = [lo, hi]` using
 * outward-rounded IEEE-754 interval arithmetic and a straightforward iterative
 * algorithm.
 *
 * Each coefficient `c_k` may be provided either as a finite number (representing
 * the degenerate point interval `[c_k, c_k]`) or as a finite interval `[lo, hi]`.
 *
 * The derivative coefficients are formed iteratively via the power rule
 * `d_k = (k + 1) * c_{k+1}` (repeated `order` times) using outward-rounded
 * interval multiplication. The resulting polynomial is then evaluated over `x`
 * using iterative Horner's method. When `options.subdivisions > 1`, `[lo, hi]`
 * is iteratively partitioned into contiguous subintervals with shared endpoints
 * (guaranteeing gapless coverage) and the interval hull of the subinterval
 * evaluations is returned to reduce dependency overestimation.
 *
 * @param {Array<number | [number, number]>} coeffs
 *   Non-empty array of polynomial coefficients `[c_0, c_1, ..., c_n]` in
 *   ascending degree order. Each element is a finite number or `[lo, hi]`.
 * @param {[number, number]} x
 *   Evaluation domain interval `[lo, hi]` with finite numbers and `lo <= hi`.
 * @param {object} [options]
 *   Optional configuration.
 * @param {number} [options.order=1]
 *   Non-negative integer derivative order (`0` evaluates `p(x)`, `1` evaluates
 *   `p'(x)`, `2` evaluates `p''(x)`, etc.).
 * @param {number} [options.subdivisions=1]
 *   Positive integer number of contiguous subintervals (`1..1_000_000`) used
 *   to tighten the enclosure via iterative subdivision.
 * @returns {[number, number]}
 *   Outward-rounded interval `[lo, hi]` guaranteed to enclose
 *   `{ p^(order)(t) : t in x, c_k in coeffs[k] }`.
 * @throws {TypeError} If argument types are invalid.
 * @throws {RangeError} If bounds are non-finite, `lo > hi`, `coeffs` is empty,
 *   or option values are out of range.
 */
export function derivativeIntervalIterative(coeffs, x, options) {
	if (!Array.isArray(coeffs)) {
		throw new TypeError('coeffs must be an array')
	}
	if (coeffs.length === 0) {
		throw new RangeError('coeffs must be a non-empty array')
	}

	const parsedCoeffs = new Array(coeffs.length)
	for (let i = 0; i < coeffs.length; i++) {
		parsedCoeffs[i] = parseCoeff(coeffs[i], i)
	}

	const domain = parseInterval(x, 'x')

	let order = 1
	let subdivisions = 1

	if (options !== undefined) {
		if (
			typeof options !== 'object' ||
			options === null ||
			Array.isArray(options)
		) {
			throw new TypeError('options must be a plain object')
		}
		if (options.order !== undefined) {
			if (typeof options.order !== 'number') {
				throw new TypeError('options.order must be a number')
			}
			if (!Number.isInteger(options.order) || options.order < 0) {
				throw new RangeError('options.order must be a non-negative integer')
			}
			order = options.order
		}
		if (options.subdivisions !== undefined) {
			if (typeof options.subdivisions !== 'number') {
				throw new TypeError('options.subdivisions must be a number')
			}
			if (
				!Number.isInteger(options.subdivisions) ||
				options.subdivisions < 1 ||
				options.subdivisions > MAX_SUBDIVISIONS
			) {
				throw new RangeError(
					`options.subdivisions must be an integer in [1, ${MAX_SUBDIVISIONS}]`,
				)
			}
			subdivisions = options.subdivisions
		}
	}

	// Iteratively apply the power rule `order` times.
	let derivCoeffs = parsedCoeffs
	for (let d = 0; d < order; d++) {
		if (derivCoeffs.length <= 1) {
			return [0, 0]
		}
		const nextCoeffs = new Array(derivCoeffs.length - 1)
		for (let k = 1; k < derivCoeffs.length; k++) {
			nextCoeffs[k - 1] = intervalMul([k, k], derivCoeffs[k])
		}
		derivCoeffs = nextCoeffs
	}

	// Constant derivative does not depend on x.
	if (derivCoeffs.length === 1) {
		return [normalizeZero(derivCoeffs[0][0]), normalizeZero(derivCoeffs[0][1])]
	}

	const [lo, hi] = domain
	if (subdivisions === 1 || lo === hi) {
		return hornerInterval(derivCoeffs, domain)
	}

	// Iteratively partition [lo, hi] into contiguous subintervals and compute their hull.
	const span = hi - lo
	const finiteSpan = Number.isFinite(span)
	let prev = lo
	let hullLo = Infinity
	let hullHi = -Infinity

	for (let s = 1; s <= subdivisions; s++) {
		let next
		if (s === subdivisions) {
			next = hi
		} else {
			const t = s / subdivisions
			next = finiteSpan ? lo + span * t : lo * (1 - t) + hi * t
			if (next < prev) next = prev
			if (next > hi) next = hi
		}
		const sub = hornerInterval(derivCoeffs, [prev, next])
		if (sub[0] < hullLo) hullLo = sub[0]
		if (sub[1] > hullHi) hullHi = sub[1]
		prev = next
	}

	return [normalizeZero(hullLo), normalizeZero(hullHi)]
}
