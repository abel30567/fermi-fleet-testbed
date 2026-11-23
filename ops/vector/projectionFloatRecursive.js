/**
 * Recursively validates that every element in `vec[lo..hi)` is a finite IEEE-754 float64 number.
 *
 * @param {number[]} vec
 * @param {string} name
 * @param {number} lo
 * @param {number} hi
 */
function validateFiniteRecursive(vec, name, lo, hi) {
	if (hi - lo === 1) {
		const value = vec[lo]
		if (typeof value !== 'number' || !Number.isFinite(value)) {
			throw new TypeError(`${name}[${lo}] must be a finite number`)
		}
		return
	}
	const mid = lo + ((hi - lo) >>> 1)
	validateFiniteRecursive(vec, name, lo, mid)
	validateFiniteRecursive(vec, name, mid, hi)
}

/**
 * Computes the dot product of `u[lo..hi)` and `v[lo..hi)` using divide-and-conquer
 * pairwise summation.
 *
 * @param {number[]} u
 * @param {number[]} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
function dotRecursive(u, v, lo, hi) {
	if (hi - lo === 1) {
		return u[lo] * v[lo]
	}
	const mid = lo + ((hi - lo) >>> 1)
	return dotRecursive(u, v, lo, mid) + dotRecursive(u, v, mid, hi)
}

/**
 * Computes the maximum absolute value in `vec[lo..hi)` using divide-and-conquer recursion.
 *
 * @param {number[]} vec
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
function maxAbsRecursive(vec, lo, hi) {
	if (hi - lo === 1) {
		return Math.abs(vec[lo])
	}
	const mid = lo + ((hi - lo) >>> 1)
	const left = maxAbsRecursive(vec, lo, mid)
	const right = maxAbsRecursive(vec, mid, hi)
	return left >= right ? left : right
}

/**
 * Scales `vec[lo..hi)` by `scalar` into `out[lo..hi)` using divide-and-conquer recursion.
 * Normalizes `-0` to `+0`.
 *
 * @param {number[]} vec
 * @param {number} scalar
 * @param {number[]} out
 * @param {number} lo
 * @param {number} hi
 */
function scaleRecursive(vec, scalar, out, lo, hi) {
	if (hi - lo === 1) {
		const value = vec[lo] * scalar
		out[lo] = value === 0 ? 0 : value
		return
	}
	const mid = lo + ((hi - lo) >>> 1)
	scaleRecursive(vec, scalar, out, lo, mid)
	scaleRecursive(vec, scalar, out, mid, hi)
}

/**
 * Divides `vec[lo..hi)` by `divisor` into `out[lo..hi)` using divide-and-conquer recursion.
 *
 * @param {number[]} vec
 * @param {number} divisor
 * @param {number[]} out
 * @param {number} lo
 * @param {number} hi
 */
function divideRecursive(vec, divisor, out, lo, hi) {
	if (hi - lo === 1) {
		out[lo] = vec[lo] / divisor
		return
	}
	const mid = lo + ((hi - lo) >>> 1)
	divideRecursive(vec, divisor, out, lo, mid)
	divideRecursive(vec, divisor, out, mid, hi)
}

/**
 * Fills `out[lo..hi)` with `+0` using divide-and-conquer recursion.
 *
 * @param {number[]} out
 * @param {number} lo
 * @param {number} hi
 */
function fillZeroRecursive(out, lo, hi) {
	if (hi - lo === 1) {
		out[lo] = 0
		return
	}
	const mid = lo + ((hi - lo) >>> 1)
	fillZeroRecursive(out, lo, mid)
	fillZeroRecursive(out, mid, hi)
}

/**
 * Scales `vec[lo..hi)` by `factor1` then `factor2` into `out[lo..hi)` using divide-and-conquer
 * recursion to avoid intermediate overflow/underflow.
 *
 * @param {number[]} vec
 * @param {number} factor1
 * @param {number} factor2
 * @param {number[]} out
 * @param {number} lo
 * @param {number} hi
 */
function scaleTwoStepRecursive(vec, factor1, factor2, out, lo, hi) {
	if (hi - lo === 1) {
		const value = (vec[lo] * factor1) * factor2
		out[lo] = value === 0 ? 0 : value
		return
	}
	const mid = lo + ((hi - lo) >>> 1)
	scaleTwoStepRecursive(vec, factor1, factor2, out, lo, mid)
	scaleTwoStepRecursive(vec, factor1, factor2, out, mid, hi)
}

/**
 * Computes the vector projection of `a` onto non-zero vector `b`:
 * `proj_b(a) = ((a · b) / (b · b)) * b`
 * over IEEE-754 float64 numbers using recursive divide-and-conquer dot products and scaling.
 *
 * @param {number[]} a - Source vector of finite float64 numbers.
 * @param {number[]} b - Non-zero target vector of finite float64 numbers (same length as `a`).
 * @returns {number[]} The projected vector `proj_b(a)`.
 * @throws {TypeError} If `a` or `b` is not an array or contains non-finite / non-number elements.
 * @throws {RangeError} If `a` and `b` are empty, have different lengths, or `b` has zero magnitude.
 */
export function projectionFloatRecursive(a, b) {
	if (!Array.isArray(a) || !Array.isArray(b)) {
		throw new TypeError('Both a and b must be arrays of finite numbers')
	}
	const n = a.length
	if (n !== b.length) {
		throw new RangeError(`Vector length mismatch: a has length ${n}, b has length ${b.length}`)
	}
	if (n === 0) {
		throw new RangeError('Vectors must be non-empty')
	}

	validateFiniteRecursive(a, 'a', 0, n)
	validateFiniteRecursive(b, 'b', 0, n)

	const maxAbsB = maxAbsRecursive(b, 0, n)
	if (maxAbsB === 0) {
		throw new RangeError('Target vector b must have non-zero magnitude')
	}

	const ab = dotRecursive(a, b, 0, n)
	const bb = dotRecursive(b, b, 0, n)

	const out = new Array(n)
	if (bb > 0 && Number.isFinite(bb) && Number.isFinite(ab)) {
		const scalar = ab / bb
		scaleRecursive(b, scalar, out, 0, n)
		return out
	}

	// Overflow/underflow-safe fallback using recursive normalization.
	const maxAbsA = maxAbsRecursive(a, 0, n)
	if (maxAbsA === 0) {
		fillZeroRecursive(out, 0, n)
		return out
	}

	const aNorm = new Array(n)
	const bNorm = new Array(n)
	divideRecursive(a, maxAbsA, aNorm, 0, n)
	divideRecursive(b, maxAbsB, bNorm, 0, n)

	const abNorm = dotRecursive(aNorm, bNorm, 0, n)
	const bbNorm = dotRecursive(bNorm, bNorm, 0, n)
	const unitFactor = abNorm / bbNorm

	scaleTwoStepRecursive(bNorm, unitFactor, maxAbsA, out, 0, n)
	return out
}
