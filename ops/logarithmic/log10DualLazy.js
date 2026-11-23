/**
 * Computes the base-10 logarithm over a stream of dual numbers `{ v, d }`,
 * propagating forward-mode first derivatives lazily via a generator.
 *
 * For each dual number x = v + d·ε (with ε² = 0 and v > 0):
 *   log10(v + d·ε) = log10(v) + (d / (v · ln(10)))·ε
 *
 * The input iterable is validated eagerly when called, while individual
 * elements are pulled, validated, and transformed lazily on each iteration
 * step—supporting arbitrarily large or infinite streams and clean early
 * termination.
 *
 * @typedef {{ v: number, d: number }} Dual
 */

/**
 * Validates a single dual number and computes its base-10 logarithm.
 *
 * @param {unknown} item - Candidate dual number `{ v, d }`.
 * @param {number} index - Zero-based index of the item in the stream.
 * @returns {Dual} Transformed dual number `{ v, d }`.
 * @throws {TypeError} If `item` is not a dual object with numeric `v` and `d`.
 * @throws {RangeError} If `v` or `d` is non-finite, or if `v <= 0`.
 */
function computeLog10Dual(item, index) {
	if (item === null || typeof item !== 'object' || Array.isArray(item)) {
		throw new TypeError(
			`Element at index ${index} must be a dual number object { v, d }`
		)
	}

	const { v, d } = item

	if (typeof v !== 'number') {
		throw new TypeError(
			`Element at index ${index} must have a numeric "v" property`
		)
	}
	if (typeof d !== 'number') {
		throw new TypeError(
			`Element at index ${index} must have a numeric "d" property`
		)
	}
	if (!Number.isFinite(v)) {
		throw new RangeError(
			`Element at index ${index} has non-finite "v" (${v}); expected a finite positive number`
		)
	}
	if (!Number.isFinite(d)) {
		throw new RangeError(
			`Element at index ${index} has non-finite "d" (${d}); expected a finite number`
		)
	}
	if (v <= 0) {
		throw new RangeError(
			`Element at index ${index} has non-positive "v" (${v}); log10 is only defined for v > 0`
		)
	}

	const value = Math.log10(v)
	let derivative
	if (d === 0) {
		derivative = 0
	} else {
		const ratio = d / v
		derivative = Number.isFinite(ratio)
			? ratio * Math.LOG10E
			: (d * Math.LOG10E) / v
	}

	return { v: value, d: derivative }
}

/**
 * Internal generator that consumes `inputs` lazily and yields dual log10 values.
 *
 * @param {Iterable<Dual>} inputs
 * @returns {Generator<Dual, void, undefined>}
 */
function* log10DualGenerator(inputs) {
	let index = 0
	for (const item of inputs) {
		yield computeLog10Dual(item, index)
		index += 1
	}
}

/**
 * Lazily computes the base-10 logarithm of each dual number `{ v, d }` in an
 * iterable sequence, returning a generator of `{ v, d }` results.
 *
 * @param {Iterable<Dual>} inputs - Non-string iterable of dual numbers `{ v, d }` with `v > 0`.
 * @returns {Generator<Dual, void, undefined>} Lazy generator yielding `{ v, d }` dual numbers.
 * @throws {TypeError} Synchronously if `inputs` is not a non-string iterable; lazily if an element is not a valid `{ v, d }` object.
 * @throws {RangeError} Lazily if an element has non-finite `v`/`d` or non-positive `v <= 0`.
 */
export function log10DualLazy(inputs) {
	if (
		inputs === null ||
		inputs === undefined ||
		typeof inputs === 'string' ||
		typeof inputs[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			'inputs must be a non-string iterable of dual numbers { v, d }'
		)
	}

	return log10DualGenerator(inputs)
}
