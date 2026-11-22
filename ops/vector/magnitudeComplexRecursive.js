/**
 * Validates that a value is a complex number object `{ re, im }` with finite numeric parts.
 *
 * @param {unknown} value - Candidate complex number.
 * @param {number} index - Element index within the vector for diagnostics.
 * @throws {TypeError} If the element is not a non-null non-array object or `re`/`im` are not numbers.
 * @throws {RangeError} If `re` or `im` is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
function validateComplexElement(value, index) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(
			`Expected complex object { re, im } at index ${index}`
		)
	}
	const { re, im } = value
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(
			`Complex element at index ${index} must have numeric "re" and "im" properties`
		)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(
			`Complex element at index ${index} must have finite "re" and "im" properties`
		)
	}
}

/**
 * Recursively computes the scaled sum of squared moduli for `vector[start..end)`
 * using divide-and-conquer pairwise summation.
 *
 * Invariant: returns `{ scale, sumSq }` such that
 * `scale^2 * sumSq = sum_{k=start}^{end-1} (|vector[k].re|^2 + |vector[k].im|^2)`
 * with `scale >= 0` and either `scale === 0 && sumSq === 0` or `sumSq >= 1`.
 *
 * @param {Array<{ re: number, im: number }>} vector - Validated complex vector.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {{ scale: number, sumSq: number }} Scaled sum of squares representation.
 */
function scaledSumSqRecursive(vector, start, end) {
	const len = end - start
	if (len <= 0) {
		return { scale: 0, sumSq: 0 }
	}
	if (len === 1) {
		const { re, im } = vector[start]
		const absRe = Math.abs(re)
		const absIm = Math.abs(im)
		const scale = absRe >= absIm ? absRe : absIm
		if (scale === 0) {
			return { scale: 0, sumSq: 0 }
		}
		const rRe = absRe / scale
		const rIm = absIm / scale
		return { scale, sumSq: rRe * rRe + rIm * rIm }
	}

	const mid = start + Math.floor(len / 2)
	const left = scaledSumSqRecursive(vector, start, mid)
	const right = scaledSumSqRecursive(vector, mid, end)

	if (left.scale === 0) {
		return right
	}
	if (right.scale === 0) {
		return left
	}

	if (left.scale >= right.scale) {
		const ratio = right.scale / left.scale
		return {
			scale: left.scale,
			sumSq: left.sumSq + ratio * ratio * right.sumSq,
		}
	}

	const ratio = left.scale / right.scale
	return {
		scale: right.scale,
		sumSq: right.sumSq + ratio * ratio * left.sumSq,
	}
}

/**
 * Computes the Euclidean magnitude (L2 norm) of a complex vector using a
 * scaled recursive divide-and-conquer algorithm.
 *
 * For a vector `v = [z_0, ..., z_{n-1}]` where `z_k = { re, im }`, the
 * magnitude is defined as:
 * `||v||_2 = sqrt(sum_{k=0}^{n-1} (z_k.re^2 + z_k.im^2))`.
 *
 * Algorithm:
 * Splits the vector recursively in half (depth `O(log n)`), computing a scaled
 * sum-of-squares pair `{ scale, sumSq }` for each half and merging them under
 * the larger scale. This achieves pairwise-summation accuracy (`O(eps * log n)`)
 * while preventing spurious intermediate overflow and underflow.
 *
 * Conventions:
 * - An empty vector `[]` has magnitude `0`.
 * - The returned magnitude is always a non-negative real number (`+0`, never `-0`).
 *
 * @param {Array<{ re: number, im: number }>} vector - Array of complex numbers `{ re, im }`.
 * @returns {number} Euclidean magnitude (L2 norm) of `vector`.
 * @throws {TypeError} If `vector` is not an array, or any element is not a `{ re, im }` object with numeric `re` and `im`.
 * @throws {RangeError} If any element's `re` or `im` is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
export function magnitudeComplexRecursive(vector) {
	if (!Array.isArray(vector)) {
		throw new TypeError('Expected vector to be an Array of complex numbers')
	}

	for (let i = 0; i < vector.length; i++) {
		validateComplexElement(vector[i], i)
	}

	if (vector.length === 0) {
		return 0
	}

	const { scale, sumSq } = scaledSumSqRecursive(vector, 0, vector.length)
	if (scale === 0) {
		return 0
	}

	const result = scale * Math.sqrt(sumSq)
	return result === 0 ? 0 : result
}
