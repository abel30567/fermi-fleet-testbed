/**
 * Computes the Euclidean magnitude (L2 norm) of a complex vector iteratively.
 *
 * Each element of the vector is a complex number object `{ re, im }` with
 * finite numeric real and imaginary parts. Uses a single-pass scaled
 * sum-of-squares iteration to avoid intermediate overflow and underflow.
 *
 * @param {Array<{ re: number, im: number }>} vector - Array of complex numbers `{ re, im }`.
 * @returns {number} The non-negative Euclidean norm `sqrt(sum(|z_k|^2))`. Returns `0` for an empty vector.
 * @throws {TypeError} If `vector` is not an array, any element is not a plain-like object, or `re`/`im` is not a number.
 * @throws {RangeError} If any `re` or `im` component is not finite (`NaN`, `Infinity`, or `-Infinity`).
 */
export function magnitudeComplexIterative(vector) {
	if (!Array.isArray(vector)) {
		throw new TypeError('vector must be an array of { re, im } complex numbers');
	}

	let scale = 0;
	let sumSq = 1;

	for (let i = 0; i < vector.length; i++) {
		const item = vector[i];
		if (item === null || typeof item !== 'object' || Array.isArray(item)) {
			throw new TypeError(`vector[${i}] must be an object with numeric re and im properties`);
		}

		const { re, im } = item;
		if (typeof re !== 'number' || typeof im !== 'number') {
			throw new TypeError(`vector[${i}].re and vector[${i}].im must be numbers`);
		}
		if (!Number.isFinite(re) || !Number.isFinite(im)) {
			throw new RangeError(`vector[${i}].re and vector[${i}].im must be finite numbers`);
		}

		const absRe = Math.abs(re);
		if (absRe > 0) {
			if (scale < absRe) {
				const ratio = scale / absRe;
				sumSq = 1 + sumSq * ratio * ratio;
				scale = absRe;
			} else {
				const ratio = absRe / scale;
				sumSq += ratio * ratio;
			}
		}

		const absIm = Math.abs(im);
		if (absIm > 0) {
			if (scale < absIm) {
				const ratio = scale / absIm;
				sumSq = 1 + sumSq * ratio * ratio;
				scale = absIm;
			} else {
				const ratio = absIm / scale;
				sumSq += ratio * ratio;
			}
		}
	}

	return scale === 0 ? 0 : scale * Math.sqrt(sumSq);
}
