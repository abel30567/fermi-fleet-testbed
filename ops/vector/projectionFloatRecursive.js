/**
 * Computes the orthogonal vector projection of `u` onto `v`:
 *
 *   proj_v(u) = ((u · v) / (v · v)) * v
 *
 * over arrays of finite IEEE-754 float64 Numbers using recursive
 * divide-and-conquer helpers for validation, dot products, magnitude scaling,
 * and scalar-vector multiplication.
 *
 * @param {number[]} u - The vector being projected (non-empty array of finite numbers).
 * @param {number[]} v - The non-zero target vector to project onto (same length as `u`).
 * @returns {number[]} The projection of `u` onto `v`.
 * @throws {TypeError} If `u` or `v` is not an Array or contains non-number elements.
 * @throws {RangeError} If `u` or `v` is empty, lengths differ, elements are non-finite, or `v` is the zero vector.
 */
export function projectionFloatRecursive(u, v) {
	if (!Array.isArray(u)) {
		throw new TypeError('First argument "u" must be an Array')
	}
	if (!Array.isArray(v)) {
		throw new TypeError('Second argument "v" must be an Array')
	}
	if (u.length === 0 || v.length === 0) {
		throw new RangeError('Input vectors must be non-empty')
	}
	if (u.length !== v.length) {
		throw new RangeError(
			`Input vectors must have equal length (got ${u.length} and ${v.length})`
		)
	}

	const n = u.length
	validateVectorRecursive(u, 'u', 0, n)
	validateVectorRecursive(v, 'v', 0, n)

	const maxV = maxAbsRecursive(v, 0, n)
	if (maxV === 0) {
		throw new RangeError('Target vector "v" must be non-zero')
	}

	const uv = dotProductRecursive(u, v, 0, n)
	const vv = dotProductRecursive(v, v, 0, n)

	const out = new Array(n)

	if (vv > 0 && Number.isFinite(vv) && Number.isFinite(uv)) {
		const scalar = uv / vv
		scaleVectorRecursive(v, scalar, 0, n, out)
		return out
	}

	// Overflow/underflow-safe fallback using scale invariance: proj_{v}(u) = proj_{v/maxV}(u).
	const vNorm = new Array(n)
	scaleVectorRecursive(v, 1 / maxV, 0, n, vNorm)
	const vvNorm = dotProductRecursive(vNorm, vNorm, 0, n)

	const maxU = maxAbsRecursive(u, 0, n)
	if (maxU === 0) {
		scaleVectorRecursive(vNorm, 0, 0, n, out)
		return out
	}

	const uNorm = new Array(n)
	scaleVectorRecursive(u, 1 / maxU, 0, n, uNorm)
	const uvNorm = dotProductRecursive(uNorm, vNorm, 0, n)
	const scalar = (uvNorm / vvNorm) * maxU
	scaleVectorRecursive(vNorm, scalar, 0, n, out)
	return out
}

/**
 * Recursively validates that every element in `vec[start..end)` is a finite number.
 *
 * @param {number[]} vec
 * @param {string} name
 * @param {number} start
 * @param {number} end
 */
function validateVectorRecursive(vec, name, start, end) {
	if (end - start === 1) {
		const val = vec[start]
		if (typeof val !== 'number') {
			throw new TypeError(
				`Element ${name}[${start}] must be a number (got ${typeof val})`
			)
		}
		if (!Number.isFinite(val)) {
			throw new RangeError(
				`Element ${name}[${start}] must be a finite number (got ${val})`
			)
		}
		return
	}
	const mid = start + ((end - start) >>> 1)
	validateVectorRecursive(vec, name, start, mid)
	validateVectorRecursive(vec, name, mid, end)
}

/**
 * Recursively computes the maximum absolute value in `vec[start..end)` via divide-and-conquer.
 *
 * @param {number[]} vec
 * @param {number} start
 * @param {number} end
 * @returns {number}
 */
function maxAbsRecursive(vec, start, end) {
	if (end - start === 1) {
		return Math.abs(vec[start])
	}
	const mid = start + ((end - start) >>> 1)
	const left = maxAbsRecursive(vec, start, mid)
	const right = maxAbsRecursive(vec, mid, end)
	return left >= right ? left : right
}

/**
 * Recursively computes the dot product of `a[start..end)` and `b[start..end)`
 * using pairwise divide-and-conquer summation.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @param {number} start
 * @param {number} end
 * @returns {number}
 */
function dotProductRecursive(a, b, start, end) {
	if (end - start === 1) {
		return a[start] * b[start]
	}
	const mid = start + ((end - start) >>> 1)
	return (
		dotProductRecursive(a, b, start, mid) +
		dotProductRecursive(a, b, mid, end)
	)
}

/**
 * Recursively multiplies `vec[start..end)` by `scalar` and writes into `out[start..end)`
 * via divide-and-conquer, normalizing `-0` to `0`.
 *
 * @param {number[]} vec
 * @param {number} scalar
 * @param {number} start
 * @param {number} end
 * @param {number[]} out
 */
function scaleVectorRecursive(vec, scalar, start, end, out) {
	if (end - start === 1) {
		const value = scalar * vec[start]
		out[start] = value === 0 ? 0 : value
		return
	}
	const mid = start + ((end - start) >>> 1)
	scaleVectorRecursive(vec, scalar, start, mid, out)
	scaleVectorRecursive(vec, scalar, mid, end, out)
}
