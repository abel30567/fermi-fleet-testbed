/**
 * @typedef {{ v: number, d: number }} DualNumber
 * A dual number representing `v + d * ε` (with `ε² = 0`), where `v` is the
 * primal value and `d` is the forward-mode derivative (tangent).
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric fields.
 *
 * @param {unknown} elem - Element to validate.
 * @param {string} name - Parameter name for error diagnostics.
 * @param {number} index - Element index within the vector.
 * @throws {TypeError} If the element is not a non-null plain/record object with numeric `v` and `d`.
 * @throws {RangeError} If `v` or `d` is not a finite number (`NaN`, `Infinity`, or `-Infinity`).
 */
function validateDual(elem, name, index) {
	if (elem === null || typeof elem !== 'object' || Array.isArray(elem)) {
		throw new TypeError(`${name}[${index}] must be a dual number object { v, d }`)
	}
	const { v, d } = /** @type {{ v: unknown, d: unknown }} */ (elem)
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(`${name}[${index}] must have numeric properties v and d`)
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(`${name}[${index}] properties v and d must be finite numbers`)
	}
}

/**
 * Recursively adds slices `[start, end)` of dual-number vectors `a` and `b`
 * into `out` using divide-and-conquer.
 *
 * @param {readonly DualNumber[]} a - First dual-number vector.
 * @param {readonly DualNumber[]} b - Second dual-number vector.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @param {DualNumber[]} out - Preallocated output vector.
 */
function addRange(a, b, start, end, out) {
	const len = end - start
	if (len <= 0) {
		return
	}
	if (len === 1) {
		const ai = a[start]
		const bi = b[start]
		validateDual(ai, 'a', start)
		validateDual(bi, 'b', start)
		out[start] = {
			v: ai.v + bi.v,
			d: ai.d + bi.d,
		}
		return
	}
	const mid = start + (len >>> 1)
	addRange(a, b, start, mid, out)
	addRange(a, b, mid, end, out)
}

/**
 * Computes the element-wise sum of two vectors of dual numbers `{ v, d }`
 * using a recursive divide-and-conquer strategy.
 *
 * For each index `i`, `(a[i].v + a[i].d·ε) + (b[i].v + b[i].d·ε)` yields
 * `{ v: a[i].v + b[i].v, d: a[i].d + b[i].d }`, propagating forward-mode
 * derivatives linearly alongside primal values in `O(n)` time and `O(log n)`
 * recursion depth.
 *
 * @param {readonly DualNumber[]} a - First input vector of dual numbers `{ v, d }`.
 * @param {readonly DualNumber[]} b - Second input vector of dual numbers `{ v, d }`.
 * @returns {DualNumber[]} A new vector containing the component-wise dual-number sums.
 * @throws {TypeError} If `a` or `b` is not an Array, or any element is not a valid `{ v, d }` object with numeric fields.
 * @throws {RangeError} If `a` and `b` have different lengths, or any `v`/`d` value is non-finite.
 */
export function vectorAddDualRecursive(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument "a" must be an Array of dual numbers { v, d }')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument "b" must be an Array of dual numbers { v, d }')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Vector length mismatch: a has length ${a.length}, b has length ${b.length}`
		)
	}

	const n = a.length
	if (n === 0) {
		return []
	}

	const out = new Array(n)
	addRange(a, b, 0, n, out)
	return out
}
