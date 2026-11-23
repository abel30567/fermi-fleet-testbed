/**
 * @typedef {{ v: number, d: number }} Dual
 * A dual number representing a primal value `v` and its forward-mode derivative `d`.
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} item - The candidate dual number.
 * @param {string} vectorName - Parameter name for error diagnostics.
 * @param {number} index - Element index within the vector.
 * @throws {TypeError} If `item` is not a non-null plain-like object or `v`/`d` is not a number.
 * @throws {RangeError} If `v` or `d` is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
function assertDual(item, vectorName, index) {
	if (typeof item !== 'object' || item === null || Array.isArray(item)) {
		throw new TypeError(`${vectorName}[${index}] must be a dual number object { v, d }`)
	}
	const { v, d } = item
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(`${vectorName}[${index}] must have numeric properties v and d`)
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(`${vectorName}[${index}] must have finite v and d values`)
	}
}

/**
 * Computes the vector dot product over dual numbers `{ v, d }` using a
 * straightforward iterative algorithm, propagating forward-mode derivatives
 * via the product rule:
 *
 *   v = sum_i (a[i].v * b[i].v)
 *   d = sum_i (a[i].v * b[i].d + a[i].d * b[i].v)
 *
 * @param {Dual[]} a - First vector of dual numbers.
 * @param {Dual[]} b - Second vector of dual numbers (must match length of `a`).
 * @returns {Dual} The resulting dual number `{ v, d }`.
 * @throws {TypeError} If `a` or `b` is not an Array, or any element is not a valid dual number.
 * @throws {RangeError} If `a` and `b` have different lengths, or any dual component is non-finite.
 */
export function dotProductDualIterative(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument a must be an array of dual numbers')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument b must be an array of dual numbers')
	}
	if (a.length !== b.length) {
		throw new RangeError(`Vector length mismatch: a.length (${a.length}) !== b.length (${b.length})`)
	}

	let v = 0
	let d = 0

	for (let i = 0; i < a.length; i++) {
		const ai = a[i]
		const bi = b[i]
		assertDual(ai, 'a', i)
		assertDual(bi, 'b', i)

		v += ai.v * bi.v
		d += ai.v * bi.d + ai.d * bi.v
	}

	return { v, d }
}
