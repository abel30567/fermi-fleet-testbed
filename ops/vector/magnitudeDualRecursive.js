/**
 * @typedef {{ v: number, d: number }} DualNumber
 * A forward-mode dual number `v + d*ε` (with `ε² = 0`), where `v` is the
 * primal value and `d` is the first-order derivative (tangent).
 */

/**
 * Validates that the input is a non-empty array of finite dual numbers `{ v, d }`.
 *
 * @param {unknown} vec - Candidate input vector.
 * @throws {TypeError} If `vec` is not an array or any element is not an object with numeric `v` and `d`.
 * @throws {RangeError} If `vec` is empty or any `v` or `d` is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
function validateDualVector(vec) {
	if (!Array.isArray(vec)) {
		throw new TypeError('vec must be an array of dual numbers { v, d }')
	}
	if (vec.length === 0) {
		throw new RangeError('vec must be a non-empty array')
	}

	for (let i = 0; i < vec.length; i++) {
		const el = vec[i]
		if (el === null || typeof el !== 'object' || Array.isArray(el)) {
			throw new TypeError(`vec[${i}] must be a dual number object { v, d }`)
		}
		if (typeof el.v !== 'number') {
			throw new TypeError(`vec[${i}].v must be a number`)
		}
		if (!Number.isFinite(el.v)) {
			throw new RangeError(`vec[${i}].v must be a finite number`)
		}
		if (typeof el.d !== 'number') {
			throw new TypeError(`vec[${i}].d must be a number`)
		}
		if (!Number.isFinite(el.d)) {
			throw new RangeError(`vec[${i}].d must be a finite number`)
		}
	}
}

/**
 * Recursively computes the dual sum of squares over the slice `vec[start..end)`
 * using pairwise divide-and-conquer summation.
 *
 * For a single dual element `x = v + d*ε`:
 *   `x² = v² + (2 * v * d) * ε`
 *
 * @param {ReadonlyArray<DualNumber>} vec - Validated non-empty dual vector.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {DualNumber} Sum of squares `{ v, d }` for the slice.
 */
function sumOfSquaresRecursive(vec, start, end) {
	if (end - start === 1) {
		const { v, d } = vec[start]
		return {
			v: v * v,
			d: 2 * v * d,
		}
	}

	const mid = (start + end) >>> 1
	const left = sumOfSquaresRecursive(vec, start, mid)
	const right = sumOfSquaresRecursive(vec, mid, end)

	return {
		v: left.v + right.v,
		d: left.d + right.d,
	}
}

/**
 * Computes the Euclidean magnitude (`sqrt(sum(x_i²))`) of a vector of dual numbers
 * `{ v, d }` using a recursive divide-and-conquer sum of squares followed by a
 * dual square root.
 *
 * Let `s = sum(x_i²)` in dual arithmetic (`s.v = sum(v_i²)`, `s.d = sum(2 * v_i * d_i)`).
 * Then the dual magnitude is:
 * - `v = sqrt(s.v)`
 * - `d = s.d / (2 * sqrt(s.v))` when `s.v > 0`
 *
 * Zero-vector derivative handling:
 * - When `s.v === 0` and `s.d === 0` (which holds whenever all `v_i === 0`),
 *   the function returns `{ v: 0, d: 0 }`. Note that at the origin the Euclidean
 *   norm is non-differentiable along non-zero tangents, and `d = 0` follows the
 *   standard forward-mode AD subgradient convention rather than producing `0 / 0 = NaN`.
 * - When `s.v === 0` and `s.d !== 0` (e.g., subnormal components whose squares
 *   underflow to `0` while `2 * v_i * d_i` remains non-zero), the derivative is
 *   undefined and `d` is returned as `NaN`.
 *
 * @param {ReadonlyArray<DualNumber>} vec - Non-empty vector of finite dual numbers `{ v, d }`.
 * @returns {DualNumber} Euclidean magnitude as a dual number `{ v, d }`.
 * @throws {TypeError} If `vec` is not an array or any element is not a valid `{ v, d }` object with numeric fields.
 * @throws {RangeError} If `vec` is empty or any `v` or `d` is non-finite.
 */
export function magnitudeDualRecursive(vec) {
	validateDualVector(vec)

	const sumSq = sumOfSquaresRecursive(vec, 0, vec.length)
	const mag = Math.sqrt(sumSq.v)

	let deriv
	if (sumSq.v === 0) {
		deriv = sumSq.d === 0 ? 0 : Number.NaN
	} else {
		deriv = sumSq.d / (2 * mag)
	}

	return {
		v: mag,
		d: deriv === 0 ? 0 : deriv,
	}
}
