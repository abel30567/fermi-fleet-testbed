/**
 * Forward-mode automatic differentiation sine (`sin`) over dual numbers `{ v, d }`,
 * with lazy generator-based streaming for iterable inputs.
 *
 * A dual number `x = v + d·ε` (with `ε² = 0`) is represented as `{ v, d }`, where
 * `v` is the primal value and `d` is the tangent (derivative) component.
 *
 * Applying sine to a dual number yields:
 *   `sin(v + d·ε) = sin(v) + (d · cos(v))·ε`
 *
 * @module ops/trigonometric/sinDualLazy
 */

/**
 * @typedef {object} DualNumber
 * @property {number} v - Primal value (finite real number, in radians).
 * @property {number} d - Forward-mode derivative / tangent value (finite real number).
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric fields.
 *
 * @param {unknown} dual - Candidate dual number object.
 * @param {number} [index] - Optional stream index for clearer error messages.
 * @returns {DualNumber} The validated dual number.
 * @throws {TypeError} If `dual` is not a non-null plain-like object with numeric `v` and `d`.
 * @throws {RangeError} If `dual.v` or `dual.d` is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
function validateDual(dual, index) {
	const prefix = index === undefined ? 'sinDualLazy' : `sinDualLazy (index ${index})`

	if (typeof dual !== 'object' || dual === null || Array.isArray(dual)) {
		throw new TypeError(`${prefix}: expected dual number object { v, d }`)
	}

	const { v, d } = dual
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(`${prefix}: dual number properties "v" and "d" must be numbers`)
	}

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(`${prefix}: dual number properties "v" and "d" must be finite numbers`)
	}

	return dual
}

/**
 * Evaluates `sin` on a single validated dual number without mutating it.
 *
 * @param {DualNumber} dual - Validated dual number `{ v, d }`.
 * @returns {DualNumber} Resulting dual number `{ v: sin(v), d: d * cos(v) }`.
 */
function computeSinDual(dual) {
	return {
		v: Math.sin(dual.v),
		d: dual.d * Math.cos(dual.v),
	}
}

/**
 * Lazily consumes an iterable of dual numbers, validating and transforming one element per `.next()`.
 *
 * @param {Iterable<DualNumber>} iterable - Source iterable of dual numbers.
 * @returns {Generator<DualNumber, void, undefined>} Lazy generator of transformed dual numbers.
 */
function* sinDualGenerator(iterable) {
	let index = 0
	for (const item of iterable) {
		const valid = validateDual(item, index)
		index += 1
		yield computeSinDual(valid)
	}
}

/**
 * Computes the trigonometric sine of a dual number `{ v, d }` or lazily streams
 * sine over an iterable sequence of dual numbers using a generator.
 *
 * - When given an iterable (e.g. Array, Generator, Set, custom iterable; strings are rejected),
 *   returns a lazy `Generator<DualNumber>` that pulls, validates, and transforms elements
 *   one at a time on demand (supporting infinite streams and early termination).
 * - When given a single dual number `{ v, d }`, validates and returns `{ v: sin(v), d: d * cos(v) }`.
 *
 * @param {DualNumber | Iterable<DualNumber>} input - A single dual number `{ v, d }` or an iterable of dual numbers.
 * @returns {DualNumber | Generator<DualNumber, void, undefined>} Transformed dual number or lazy generator of dual numbers.
 * @throws {TypeError} If `input` is nullish, a primitive (including string), or an invalid dual number.
 * @throws {RangeError} If a dual number contains non-finite `v` or `d`.
 */
export function sinDualLazy(input) {
	if (input === null || input === undefined) {
		throw new TypeError('sinDualLazy: expected a dual number { v, d } or an iterable of dual numbers')
	}

	if (typeof input === 'string') {
		throw new TypeError('sinDualLazy: strings are not valid dual number iterables')
	}

	if (typeof input !== 'object') {
		throw new TypeError('sinDualLazy: expected a dual number { v, d } or an iterable of dual numbers')
	}

	if (typeof input[Symbol.iterator] === 'function') {
		return sinDualGenerator(input)
	}

	return computeSinDual(validateDual(input))
}
