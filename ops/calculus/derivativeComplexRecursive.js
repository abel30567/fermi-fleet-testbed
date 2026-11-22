/**
 * @typedef {Object} Complex
 * @property {number} re - Real part (finite number).
 * @property {number} im - Imaginary part (finite number).
 */

/**
 * @typedef {Object} DerivativeComplexOptions
 * @property {number} [h] - Initial step radius (> 0). Defaults to `1e-2` for first derivatives,
 *   or an order-adapted radius for higher-order derivatives.
 * @property {number} [maxDepth=10] - Maximum recursion depth for Richardson step-halving (integer 0..30).
 * @property {number} [tolerance=1e-12] - Convergence tolerance (> 0), applied as a combined
 *   absolute/relative threshold `tolerance * max(1, |estimate|)`.
 * @property {number} [order=1] - Derivative order (positive integer 1..12).
 */

/**
 * Normalizes `-0` to `+0`.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Normalizes a complex object to `{ re, im }` without `-0`.
 *
 * @param {Complex} c
 * @returns {Complex}
 */
function normalizeComplex(c) {
	return {
		re: normalizeZero(c.re),
		im: normalizeZero(c.im),
	}
}

/**
 * Validates that a value is a complex object `{ re, im }` with finite numeric components.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Complex}
 * @throws {TypeError} If `value` is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is not a finite number.
 */
function validateComplex(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be an object with numeric re and im properties`)
	}
	const { re, im } = /** @type {Record<string, unknown>} */ (value)
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${label}.re and ${label}.im must be numbers`)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${label}.re and ${label}.im must be finite numbers`)
	}
	return { re, im }
}

/**
 * Complex addition.
 *
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function cAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

/**
 * Complex subtraction.
 *
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function cSub(a, b) {
	return { re: a.re - b.re, im: a.im - b.im }
}

/**
 * Complex multiplication.
 *
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function cMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

/**
 * Scales a complex number by a real scalar.
 *
 * @param {Complex} a
 * @param {number} scalar
 * @returns {Complex}
 */
function cScale(a, scalar) {
	return { re: a.re * scalar, im: a.im * scalar }
}

/**
 * Euclidean modulus `|a|` of a complex number.
 *
 * @param {Complex} a
 * @returns {number}
 */
function cAbs(a) {
	return Math.hypot(a.re, a.im)
}

/**
 * Computes `n!` recursively.
 *
 * @param {number} n
 * @returns {number}
 */
function factorial(n) {
	if (n <= 1) return 1
	return n * factorial(n - 1)
}

/**
 * Returns the smallest power of 2 strictly greater than `order` and at least 4.
 *
 * @param {number} order
 * @param {number} [size=4]
 * @returns {number}
 */
function stencilSizeForOrder(order, size = 4) {
	if (size > order) return size
	return stencilSizeForOrder(order, size * 2)
}

/**
 * Returns the `M`-th root of unity `exp(2 * pi * i * k / M)` with exact axis values
 * when `k` is a multiple of `M / 4`.
 *
 * @param {number} k
 * @param {number} M - Power of 2 >= 4.
 * @returns {Complex}
 */
function unitRoot(k, M) {
	const idx = ((k % M) + M) % M
	const quarter = M / 4
	if (idx % quarter === 0) {
		const q = idx / quarter
		if (q === 0) return { re: 1, im: 0 }
		if (q === 1) return { re: 0, im: 1 }
		if (q === 2) return { re: -1, im: 0 }
		return { re: 0, im: -1 }
	}
	const angle = (2 * Math.PI * idx) / M
	return { re: Math.cos(angle), im: Math.sin(angle) }
}

/**
 * Divide-and-conquer pairwise summation of the discrete Cauchy contour integral
 * over indices `[start, end)` on a circle of radius `r` centered at `z`.
 *
 * @param {(w: Complex) => Complex} f
 * @param {Complex} z
 * @param {number} r
 * @param {number} order
 * @param {number} M
 * @param {number} start
 * @param {number} end
 * @returns {Complex}
 */
function sumCauchyCircle(f, z, r, order, M, start, end) {
	if (end - start === 1) {
		const j = start
		const dir = unitRoot(j, M)
		const samplePoint = {
			re: z.re + r * dir.re,
			im: z.im + r * dir.im,
		}
		const sampleValue = validateComplex(f(samplePoint), 'f(z)')
		const weight = unitRoot(-order * j, M)
		return cMul(sampleValue, weight)
	}
	const mid = (start + end) >>> 1
	const left = sumCauchyCircle(f, z, r, order, M, start, mid)
	const right = sumCauchyCircle(f, z, r, order, M, mid, end)
	return cAdd(left, right)
}

/**
 * Evaluates the `M`-point discrete Cauchy contour derivative estimate of order `order`
 * at `z` with radius `r`. Its asymptotic error expansion is `O(r^M) + O(r^(2M)) + ...`.
 *
 * @param {(w: Complex) => Complex} f
 * @param {Complex} z
 * @param {number} r
 * @param {number} order
 * @param {number} M
 * @param {number} orderFactorial
 * @returns {Complex}
 */
function cauchyStencil(f, z, r, order, M, orderFactorial) {
	const sum = sumCauchyCircle(f, z, r, order, M, 0, M)
	const denom = M * Math.pow(r, order)
	const estimate = cScale(sum, orderFactorial / denom)
	if (!Number.isFinite(estimate.re) || !Number.isFinite(estimate.im)) {
		throw new RangeError('Derivative estimate overflowed to a non-finite complex value')
	}
	return estimate
}

/**
 * Recursively constructs one row of the Richardson extrapolation table from the
 * previous row and the newly computed base estimate `R(n, 0)`.
 *
 * Uses the cancellation-resistant recurrence:
 *   `R(n, k) = R(n, k - 1) + (R(n, k - 1) - R(n - 1, k - 1)) / (factor^k - 1)`
 *
 * @param {Complex[]} prevRow - Previous Richardson row `R(n - 1, 0..n - 1)`.
 * @param {Complex} current - Current entry `R(n, k)`.
 * @param {number} factor - Error reduction factor per halving (`2^M`).
 * @param {number} col - Current column index `k`.
 * @param {Complex[]} rowAcc - Accumulated entries of row `n`.
 * @param {Complex} rowBest - Best estimate found in this row so far.
 * @param {number} rowBestErr - Error estimate associated with `rowBest`.
 * @returns {{ row: Complex[], rowBest: Complex, rowBestErr: number }}
 */
function extrapolateRow(prevRow, current, factor, col, rowAcc, rowBest, rowBestErr) {
	if (col >= prevRow.length) {
		return { row: rowAcc, rowBest, rowBestErr }
	}
	const prev = prevRow[col]
	const power = Math.pow(factor, col + 1)
	const denom = power - 1
	const next = Number.isFinite(denom) && denom > 0
		? cAdd(current, cScale(cSub(current, prev), 1 / denom))
		: current

	const err = Math.max(cAbs(cSub(next, current)), cAbs(cSub(next, prev)))
	const nextBest = err <= rowBestErr ? next : rowBest
	const nextBestErr = err <= rowBestErr ? err : rowBestErr

	rowAcc.push(next)
	return extrapolateRow(prevRow, next, factor, col + 1, rowAcc, nextBest, nextBestErr)
}

/**
 * Computes the complex derivative `f'(z)` (or higher-order derivative `f^(order)(z)`)
 * of a holomorphic function `f` at a complex point `z = { re, im }`.
 *
 * Algorithm:
 * Uses a recursive divide-and-conquer discrete Cauchy contour stencil combined with
 * recursive Richardson extrapolation (Romberg-style step halving). For `order = 1`,
 * the base 4-point symmetric complex stencil averages central differences along the
 * real and imaginary axes:
 *   `D(r) = (f(z + r) - f(z - r) - i * (f(z + ir) - f(z - ir))) / (4r)`
 * whose truncation error is `O(r^4) + O(r^8) + ...`. Each recursive step halves `r`
 * and applies recursive Richardson extrapolation with factor `2^M` (`16` for `order = 1`)
 * while tracking the best Ridders-style error bound to prevent floating-point roundoff
 * degradation.
 *
 * @param {(z: Complex) => Complex} f - Holomorphic complex function mapping `{ re, im }` to `{ re, im }`.
 * @param {Complex} z - Evaluation point `{ re, im }` with finite numeric parts.
 * @param {DerivativeComplexOptions} [options] - Optional configuration parameters.
 * @returns {Complex} The complex derivative `{ re, im }` (with `-0` normalized to `0`).
 * @throws {TypeError} If `f` is not a function, `z` or `f(w)` is not a valid complex object,
 *   or any option has an invalid type.
 * @throws {RangeError} If `z` or `f(w)` has non-finite components, options are out of range,
 *   or the numerical evaluation overflows/underflows.
 */
export function derivativeComplexRecursive(f, z, options = {}) {
	if (typeof f !== 'function') {
		throw new TypeError('Expected f to be a function')
	}
	const point = validateComplex(z, 'z')

	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('Expected options to be an object')
	}

	const {
		h: rawH,
		maxDepth = 10,
		tolerance = 1e-12,
		order = 1,
	} = options

	if (typeof order !== 'number') {
		throw new TypeError('Expected options.order to be a number')
	}
	if (!Number.isInteger(order) || order < 1 || order > 12) {
		throw new RangeError('Expected options.order to be an integer between 1 and 12')
	}

	if (typeof maxDepth !== 'number') {
		throw new TypeError('Expected options.maxDepth to be a number')
	}
	if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 30) {
		throw new RangeError('Expected options.maxDepth to be an integer between 0 and 30')
	}

	if (typeof tolerance !== 'number') {
		throw new TypeError('Expected options.tolerance to be a number')
	}
	if (!Number.isFinite(tolerance) || tolerance <= 0) {
		throw new RangeError('Expected options.tolerance to be a finite positive number')
	}

	const M = stencilSizeForOrder(order)
	const initialH = rawH === undefined
		? (order === 1 ? 1e-2 : Math.min(0.25, Math.pow(Number.EPSILON, 1 / (order + M)) * 10))
		: rawH

	if (typeof initialH !== 'number') {
		throw new TypeError('Expected options.h to be a number')
	}
	if (!Number.isFinite(initialH) || initialH <= 0) {
		throw new RangeError('Expected options.h to be a finite positive number')
	}
	if (Math.pow(initialH, order) === 0 || !Number.isFinite(Math.pow(initialH, order))) {
		throw new RangeError('options.h causes underflow or overflow for the requested derivative order')
	}

	const orderFactorial = factorial(order)
	const factor = Math.pow(2, M)

	/**
	 * Recursively refines the Richardson table by halving `step`.
	 *
	 * @param {number} depth
	 * @param {number} step
	 * @param {Complex[] | null} prevRow
	 * @param {Complex | null} best
	 * @param {number} bestErr
	 * @returns {Complex}
	 */
	function refine(depth, step, prevRow, best, bestErr) {
		const baseEstimate = cauchyStencil(f, point, step, order, M, orderFactorial)

		if (depth === 0 || prevRow === null) {
			if (maxDepth === 0) {
				return normalizeComplex(baseEstimate)
			}
			const nextStep = step / 2
			if (nextStep === 0 || Math.pow(nextStep, order) === 0) {
				return normalizeComplex(baseEstimate)
			}
			return refine(1, nextStep, [baseEstimate], baseEstimate, Infinity)
		}

		const { row, rowBest, rowBestErr } = extrapolateRow(
			prevRow,
			baseEstimate,
			factor,
			0,
			[baseEstimate],
			baseEstimate,
			Infinity,
		)

		const improved = rowBestErr <= bestErr
		const nextBest = improved ? rowBest : /** @type {Complex} */ (best)
		const nextBestErr = improved ? rowBestErr : bestErr

		const targetTol = tolerance * Math.max(1, cAbs(nextBest))
		if (nextBestErr <= targetTol) {
			return normalizeComplex(nextBest)
		}

		const diagDiff = cAbs(cSub(row[depth], prevRow[depth - 1]))
		if (depth >= 2 && !improved && Number.isFinite(nextBestErr) && diagDiff >= 2 * nextBestErr) {
			return normalizeComplex(nextBest)
		}

		if (depth >= maxDepth) {
			return normalizeComplex(nextBest)
		}

		const nextStep = step / 2
		if (nextStep === 0 || Math.pow(nextStep, order) === 0) {
			return normalizeComplex(nextBest)
		}

		return refine(depth + 1, nextStep, row, nextBest, nextBestErr)
	}

	return refine(0, initialH, null, null, Infinity)
}
