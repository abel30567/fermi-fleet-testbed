/**
 * @typedef {Object} DualNumber
 * @property {number} v - The primal value part.
 * @property {number} d - The forward-mode derivative (tangent) part.
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} item - Candidate dual number.
 * @param {string} name - Parameter name for diagnostic messages.
 * @param {number} index - Element index within the array.
 * @throws {TypeError} If the element is not an object with numeric `v` and `d` properties.
 * @throws {RangeError} If `v` or `d` is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
function validateDual(item, name, index) {
	if (item === null || typeof item !== 'object' || Array.isArray(item)) {
		throw new TypeError(`${name}[${index}] must be a dual number object { v, d }`)
	}
	const { v, d } = item
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(`${name}[${index}] must have numeric properties "v" and "d"`)
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(`${name}[${index}] must have finite "v" and "d" values`)
	}
}

/**
 * Validates an input array of dual numbers.
 *
 * @param {unknown} arr - Candidate array of dual numbers.
 * @param {string} name - Parameter name for diagnostic messages.
 * @throws {TypeError} If `arr` is not an Array or contains invalid dual objects.
 * @throws {RangeError} If any element has non-finite `v` or `d`.
 */
function validateDualArray(arr, name) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`${name} must be an array of dual numbers { v, d }`)
	}
	for (let i = 0; i < arr.length; i++) {
		validateDual(arr[i], name, i)
	}
}

/**
 * Computes the discrete linear convolution of two sequences of dual numbers `{ v, d }`
 * using a straightforward iterative nested loop.
 *
 * Each element represents a dual number `v + d * ε` with `ε² = 0`, carrying a
 * forward-mode derivative `d` alongside its primal value `v`.
 *
 * For input arrays `a` (length `m`) and `b` (length `n`):
 * - If `m === 0` or `n === 0`, returns `[]`.
 * - Otherwise, returns an array of length `m + n - 1` where
 *   `(a * b)[k] = Σ_{i} a[i] · b[k - i]` using dual multiplication
 *   `(v1, d1) · (v2, d2) = (v1 * v2, v1 * d2 + d1 * v2)` and component-wise addition.
 *
 * Time complexity: `O(m * n)`. Space complexity: `O(m + n)`.
 *
 * @param {DualNumber[]} a - First sequence of dual numbers.
 * @param {DualNumber[]} b - Second sequence of dual numbers.
 * @returns {DualNumber[]} Discrete linear convolution `a * b` as an array of dual numbers.
 * @throws {TypeError} If `a` or `b` is not an array or contains invalid dual number objects.
 * @throws {RangeError} If any dual number contains non-finite `v` or `d`.
 */
export function convolutionDualIterative(a, b) {
	validateDualArray(a, 'a')
	validateDualArray(b, 'b')

	const m = a.length
	const n = b.length

	if (m === 0 || n === 0) {
		return []
	}

	const outLen = m + n - 1
	const result = new Array(outLen)
	for (let k = 0; k < outLen; k++) {
		result[k] = { v: 0, d: 0 }
	}

	for (let i = 0; i < m; i++) {
		const ai = a[i]
		const av = ai.v
		const ad = ai.d
		for (let j = 0; j < n; j++) {
			const bj = b[j]
			const cell = result[i + j]
			cell.v += av * bj.v
			cell.d += av * bj.d + ad * bj.v
		}
	}

	return result
}
