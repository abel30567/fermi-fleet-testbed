/**
 * Computes the Euclidean (L2) magnitude (norm) of a complex vector.
 *
 * Given a complex vector `v = [z_0, z_1, ..., z_{n-1}]` where each element is
 * represented as `{ re, im }`, this evaluates the closed-form inner-product
 * norm identity:
 *
 *   ||v||_2 = sqrt(<v, v>) = sqrt(sum_{k=0}^{n-1} (re_k^2 + im_k^2))
 *
 * Uses maximum-component scaling (`scale * sqrt(sum((re_k / scale)^2 + (im_k / scale)^2))`)
 * to prevent intermediate overflow and underflow, combined with Neumaier
 * compensated summation to reduce floating-point rounding error across long
 * vectors.
 *
 * @param {Array<{ re: number, im: number }>} v - Vector of finite complex numbers.
 * @returns {number} Non-negative Euclidean magnitude of `v` (`0` for an empty or zero vector).
 * @throws {TypeError} If `v` is not an Array or any element is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If any element's `re` or `im` component is not finite (`NaN`, `Infinity`, or `-Infinity`).
 */
export function magnitudeComplexSeries(v) {
	if (!Array.isArray(v)) {
		throw new TypeError('Expected v to be an array of complex numbers { re, im }')
	}

	const n = v.length
	let scale = 0

	for (let i = 0; i < n; i++) {
		const z = v[i]
		if (z === null || typeof z !== 'object') {
			throw new TypeError(`Expected element at index ${i} to be an object { re, im }`)
		}
		const { re, im } = z
		if (typeof re !== 'number' || typeof im !== 'number') {
			throw new TypeError(`Expected finite numbers for re and im at index ${i}`)
		}
		if (!Number.isFinite(re) || !Number.isFinite(im)) {
			throw new RangeError(`Expected finite numbers for re and im at index ${i}`)
		}

		const absRe = Math.abs(re)
		const absIm = Math.abs(im)
		if (absRe > scale) scale = absRe
		if (absIm > scale) scale = absIm
	}

	if (scale === 0) {
		return 0
	}

	let sum = 0
	let compensation = 0

	for (let i = 0; i < n; i++) {
		const { re, im } = v[i]
		const r = re / scale
		const m = im / scale

		const r2 = r * r
		let t = sum + r2
		compensation += sum >= r2 ? (sum - t) + r2 : (r2 - t) + sum
		sum = t

		const m2 = m * m
		t = sum + m2
		compensation += sum >= m2 ? (sum - t) + m2 : (m2 - t) + sum
		sum = t
	}

	return scale * Math.sqrt(sum + compensation)
}
