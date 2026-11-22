/**
 * @typedef {{ v: number, d: number }} DualNumber
 * A forward-mode dual number `v + d*ε` (with `ε² = 0`), where `v` is the
 * primal value and `d` is the first-order derivative.
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric fields.
 *
 * @param {unknown} value - The element to validate.
 * @param {string} vectorName - Parameter name (`'a'` or `'b'`) for error reporting.
 * @param {number} index - Element index in the vector.
 * @throws {TypeError} If the element is not a non-null object with numeric `v` and `d` properties.
 * @throws {RangeError} If `v` or `d` is not a finite number (`NaN`, `Infinity`, or `-Infinity`).
 */
function assertValidDual(value, vectorName, index) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(
			`Expected ${vectorName}[${index}] to be a dual number object { v, d }`
		)
	}
	if (typeof value.v !== 'number' || typeof value.d !== 'number') {
		throw new TypeError(
			`Expected ${vectorName}[${index}].v and ${vectorName}[${index}].d to be numbers`
		)
	}
	if (!Number.isFinite(value.v) || !Number.isFinite(value.d)) {
		throw new RangeError(
			`Expected ${vectorName}[${index}].v and ${vectorName}[${index}].d to be finite numbers`
		)
	}
}

/**
 * Computes the dot product of two vectors of dual numbers `{ v, d }` using
 * a straightforward iterative accumulation.
 *
 * For two dual vectors `a` and `b` of length `n`:
 * - Primal value: `v = Σ (a[i].v * b[i].v)`
 * - Forward derivative (product rule): `d = Σ (a[i].v * b[i].d + a[i].d * b[i].v)`
 *
 * Empty vectors `([], [])` return `{ v: 0, d: 0 }`.
 *
 * @param {ReadonlyArray<DualNumber>} a - First input vector of dual numbers.
 * @param {ReadonlyArray<DualNumber>} b - Second input vector of dual numbers.
 * @returns {DualNumber} The resulting dual dot product `{ v, d }`.
 * @throws {TypeError} If `a` or `b` is not an array, or if any element is not a valid dual object `{ v, d }` with numeric components.
 * @throws {RangeError} If `a` and `b` have different lengths, or if any dual component is non-finite.
 */
export function dotProductDualIterative(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('Expected first argument "a" to be an array of dual numbers')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Expected second argument "b" to be an array of dual numbers')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Vector length mismatch: a has length ${a.length}, b has length ${b.length}`
		)
	}

	let sumV = 0
	let sumD = 0

	for (let i = 0; i < a.length; i += 1) {
		const ai = a[i]
		const bi = b[i]
		assertValidDual(ai, 'a', i)
		assertValidDual(bi, 'b', i)

		sumV += ai.v * bi.v
		sumD += ai.v * bi.d + ai.d * bi.v
	}

	return { v: sumV, d: sumD }
}
