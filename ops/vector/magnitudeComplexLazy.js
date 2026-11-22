/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Lazily validates each complex `{ re, im }` element from an iterable and
 * yields its real and imaginary components one at a time in O(1) memory.
 *
 * @param {Iterable<Complex>} vector - Iterable sequence of complex `{ re, im }` objects.
 * @yields {number} Validated finite real or imaginary component.
 * @throws {TypeError} If any yielded element is not a `{ re, im }` object with numeric fields.
 * @throws {RangeError} If any `re` or `im` component is `NaN` or non-finite (`±Infinity`).
 */
function* streamValidatedComponents(vector) {
	let index = 0
	for (const element of vector) {
		if (element === null || typeof element !== 'object') {
			throw new TypeError(
				`Expected complex object { re, im } at index ${index}, got ${element === null ? 'null' : typeof element}`
			)
		}

		const { re, im } = element
		if (typeof re !== 'number' || typeof im !== 'number') {
			throw new TypeError(
				`Expected numeric { re, im } properties at index ${index}, got { re: ${typeof re}, im: ${typeof im} }`
			)
		}

		if (!Number.isFinite(re) || !Number.isFinite(im)) {
			throw new RangeError(
				`Expected finite { re, im } components at index ${index}, got { re: ${re}, im: ${im} }`
			)
		}

		yield re
		yield im
		index += 1
	}
}

/**
 * Computes the Euclidean (L2) magnitude of a complex vector
 * `||v||_2 = sqrt(sum_k (re_k^2 + im_k^2))` by lazily streaming elements from
 * an iterable in a single pass and O(1) memory.
 *
 * Uses Hammarling's dynamically scaled sum-of-squares algorithm with Neumaier
 * compensated summation to avoid spurious intermediate overflow and underflow
 * across the full IEEE-754 double-precision range.
 *
 * @param {Iterable<Complex>} vector - Iterable of complex numbers represented as `{ re, im }`.
 * @returns {number} Non-negative Euclidean magnitude of the vector (`0` for an empty or zero vector).
 * @throws {TypeError} If `vector` is not a valid iterable (or is a string), or any element lacks numeric `{ re, im }`.
 * @throws {RangeError} If any `re` or `im` component is `NaN` or non-finite (`±Infinity`).
 */
export function magnitudeComplexLazy(vector) {
	if (
		vector === null ||
		vector === undefined ||
		typeof vector === 'string' ||
		typeof vector[Symbol.iterator] !== 'function'
	) {
		throw new TypeError('Expected vector to be an iterable of complex { re, im } objects')
	}

	let scale = 0
	let sumsq = 0
	let comp = 0

	for (const component of streamValidatedComponents(vector)) {
		const absVal = Math.abs(component)
		if (absVal === 0) {
			continue
		}

		if (scale < absVal) {
			const ratio = scale / absVal
			const r2 = ratio * ratio
			const rescaled = sumsq * r2 + comp * r2
			const total = 1 + rescaled
			comp = 1 >= rescaled ? (1 - total) + rescaled : (rescaled - total) + 1
			sumsq = total
			scale = absVal
		} else {
			const ratio = absVal / scale
			const term = ratio * ratio
			const total = sumsq + term
			comp += sumsq >= term ? (sumsq - total) + term : (term - total) + sumsq
			sumsq = total
		}
	}

	if (scale === 0) {
		return 0
	}

	return scale * Math.sqrt(sumsq + comp)
}
