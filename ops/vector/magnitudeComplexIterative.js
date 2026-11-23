/**
 * Computes the Euclidean magnitude (L2 norm) of a vector of complex numbers
 * represented as `{ re, im }` objects, using a straightforward scaled
 * iterative accumulation that avoids intermediate overflow and underflow.
 *
 * For a complex vector `v = [z_0, z_1, ..., z_{n-1}]` where `z_k = re_k + i * im_k`:
 *   ||v||_2 = sqrt(sum_{k=0}^{n-1} (re_k^2 + im_k^2))
 *
 * @param {ReadonlyArray<{ re: number, im: number }>} vector
 *   Array of complex numbers, each with finite numeric `re` and `im` properties.
 * @returns {number} Non-negative Euclidean magnitude of the complex vector (`0` for an empty vector).
 * @throws {TypeError} If `vector` is not an array, contains a hole/non-object element,
 *   or an element's `re` or `im` property is not a number.
 * @throws {RangeError} If any element's `re` or `im` property is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
export function magnitudeComplexIterative(vector) {
	if (!Array.isArray(vector)) {
		throw new TypeError('vector must be an array of { re, im } complex objects')
	}

	let scale = 0
	let sumSq = 0

	for (let i = 0; i < vector.length; i++) {
		if (!(i in vector)) {
			throw new TypeError(`vector[${i}] must be a { re, im } object, got sparse hole`)
		}

		const item = vector[i]
		if (item === null || typeof item !== 'object' || Array.isArray(item)) {
			throw new TypeError(`vector[${i}] must be a non-null { re, im } object`)
		}

		const { re, im } = item
		if (typeof re !== 'number') {
			throw new TypeError(`vector[${i}].re must be a number`)
		}
		if (typeof im !== 'number') {
			throw new TypeError(`vector[${i}].im must be a number`)
		}
		if (!Number.isFinite(re)) {
			throw new RangeError(`vector[${i}].re must be a finite number`)
		}
		if (!Number.isFinite(im)) {
			throw new RangeError(`vector[${i}].im must be a finite number`)
		}

		const absRe = Math.abs(re)
		if (absRe !== 0) {
			if (scale < absRe) {
				const ratio = scale / absRe
				sumSq = 1 + sumSq * ratio * ratio
				scale = absRe
			} else {
				const ratio = absRe / scale
				sumSq += ratio * ratio
			}
		}

		const absIm = Math.abs(im)
		if (absIm !== 0) {
			if (scale < absIm) {
				const ratio = scale / absIm
				sumSq = 1 + sumSq * ratio * ratio
				scale = absIm
			} else {
				const ratio = absIm / scale
				sumSq += ratio * ratio
			}
		}
	}

	if (scale === 0) {
		return 0
	}

	return scale * Math.sqrt(sumSq)
}
