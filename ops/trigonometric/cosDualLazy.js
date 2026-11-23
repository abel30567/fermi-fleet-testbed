/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal value (finite real number).
 * @property {number} d - Forward-mode derivative / tangent component (finite real number).
 */

/**
 * Validates that a value is a dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} dual - Value to validate.
 * @returns {DualNumber} The validated dual number.
 * @throws {TypeError} If `dual` is not an object with numeric `v` and `d` properties.
 * @throws {RangeError} If `v` or `d` is `NaN` or not finite (`±Infinity`).
 */
function validateDual(dual) {
	if (dual === null || typeof dual !== 'object' || Array.isArray(dual)) {
		throw new TypeError('Expected a dual number object { v, d }')
	}

	const { v, d } = dual

	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('Dual number properties "v" and "d" must be numbers')
	}

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('Dual number properties "v" and "d" must be finite numbers')
	}

	return dual
}

/**
 * Computes the trigonometric cosine of a single dual number `{ v, d }`.
 *
 * For a dual number `x = v + dε` (where `ε² = 0`):
 * `cos(v + dε) = cos(v) - sin(v) * d * ε`
 *
 * @param {DualNumber} dual - Validated dual number.
 * @returns {DualNumber} Resulting dual number `{ v: cos(v), d: -sin(v) * d }`.
 */
function cosDualScalar(dual) {
	const { v, d } = validateDual(dual)
	const value = Math.cos(v)
	const deriv = -Math.sin(v) * d

	return {
		v: value === 0 ? 0 : value,
		d: deriv === 0 ? 0 : deriv,
	}
}

/**
 * Internal generator that lazily maps `cos` over an iterable of dual numbers.
 *
 * @param {Iterable<DualNumber>} iterable - Source iterable of dual numbers.
 * @returns {Generator<DualNumber, void, undefined>} Lazy stream of cosine dual numbers.
 */
function* cosDualStream(iterable) {
	for (const item of iterable) {
		yield cosDualScalar(item)
	}
}

/**
 * Computes the trigonometric cosine over dual numbers `{ v, d }` carrying a
 * forward-mode derivative alongside the primal value.
 *
 * - When given a single dual number `{ v, d }`, returns the resulting dual number
 *   `{ v: Math.cos(v), d: -Math.sin(v) * d }`.
 * - When given an iterable sequence of dual numbers (Array, Generator, Set, or
 *   any non-string object implementing `Symbol.iterator`), returns a lazy
 *   `Generator` that pulls, validates, and transforms one element at a time on
 *   demand without buffering the sequence.
 *
 * @overload
 * @param {DualNumber} input - A single dual number `{ v, d }`.
 * @returns {DualNumber} Cosine dual number `{ v, d }`.
 *
 * @overload
 * @param {Iterable<DualNumber>} input - A sequence/iterable of dual numbers.
 * @returns {Generator<DualNumber, void, undefined>} Lazy generator yielding cosine dual numbers.
 *
 * @param {DualNumber | Iterable<DualNumber>} input - Dual number or iterable of dual numbers.
 * @returns {DualNumber | Generator<DualNumber, void, undefined>}
 * @throws {TypeError} If `input` is not a dual number or non-string iterable, or if an element is invalid.
 * @throws {RangeError} If any dual number has non-finite (`NaN`, `±Infinity`) components.
 */
export function cosDualLazy(input) {
	if (input === null || typeof input !== 'object') {
		throw new TypeError('Expected a dual number { v, d } or an iterable of dual numbers')
	}

	if (typeof input[Symbol.iterator] === 'function') {
		return cosDualStream(input)
	}

	return cosDualScalar(input)
}
