/**
 * @typedef {{ v: number, d: number }} Dual
 * A dual number representing `v + d*ε` (with `ε² = 0`), where `v` is the
 * primal value and `d` is the forward-mode first derivative.
 */

/**
 * Validate a single dual number `{ v, d }` and ensure `v` lies in the closed
 * arcsine domain `[-1, 1]` with finite numeric components.
 *
 * @param {unknown} dual
 * @returns {Dual}
 * @throws {TypeError} If `dual` is not an object with numeric `v` and `d` properties.
 * @throws {RangeError} If `v` or `d` is non-finite (NaN / ±Infinity) or `v` is outside `[-1, 1]`.
 */
function validateDual(dual) {
	if (dual === null || typeof dual !== 'object' || Array.isArray(dual)) {
		throw new TypeError('Expected a dual number object { v, d }')
	}
	if (!('v' in dual) || !('d' in dual)) {
		throw new TypeError('Dual number object must have both "v" and "d" properties')
	}
	const { v, d } = dual
	if (typeof v !== 'number') {
		throw new TypeError(`Dual number "v" must be a number, got ${typeof v}`)
	}
	if (typeof d !== 'number') {
		throw new TypeError(`Dual number "d" must be a number, got ${typeof d}`)
	}
	if (!Number.isFinite(v)) {
		throw new RangeError(`Dual number "v" must be finite, got ${v}`)
	}
	if (!Number.isFinite(d)) {
		throw new RangeError(`Dual number "d" must be finite, got ${d}`)
	}
	if (v < -1 || v > 1) {
		throw new RangeError(`Dual number "v" must be in [-1, 1] for arcsin, got ${v}`)
	}
	return { v, d }
}

/**
 * Evaluate `arcsin` on a single validated dual number `{ v, d }`.
 *
 * Uses `(1 - v) * (1 + v)` rather than `1 - v * v` to avoid catastrophic
 * cancellation when `|v|` is close to `1`.
 *
 * At the domain boundaries `v = ±1`, `sqrt((1 - v) * (1 + v)) === 0`, so:
 * - `d > 0` yields `d: Infinity`
 * - `d < 0` yields `d: -Infinity`
 * - `d === 0` yields `d: NaN` (indeterminate `0 / 0`)
 *
 * @param {Dual} dual
 * @returns {Dual}
 */
function evalArcsinDual(dual) {
	const { v, d } = validateDual(dual)
	const denom = Math.sqrt((1 - v) * (1 + v))
	return {
		v: Math.asin(v),
		d: d / denom,
	}
}

/**
 * Check whether a value is a non-string iterable sequence.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isIterableSequence(value) {
	return (
		value !== null &&
		typeof value === 'object' &&
		typeof value[Symbol.iterator] === 'function'
	)
}

/**
 * Internal lazy generator transforming an iterable of dual numbers via `arcsin`.
 *
 * @param {Iterable<Dual>} source
 * @returns {Generator<Dual, void, undefined>}
 */
function* arcsinDualGenerator(source) {
	for (const item of source) {
		yield evalArcsinDual(item)
	}
}

/**
 * Compute the trigonometric inverse sine (`arcsin`) over dual numbers `{ v, d }`
 * carrying forward-mode derivatives alongside primal values:
 *
 *   arcsin(v + d·ε) = arcsin(v) + (d / √((1 - v)(1 + v)))·ε
 *
 * Supports both:
 * - **Streaming / lazy sequences**: When given any iterable of dual numbers
 *   (e.g. a generator, Array, Set, or custom iterable), returns a generator
 *   that pulls and evaluates elements lazily one at a time on demand, and
 *   closes the upstream iterator cleanly on early termination.
 * - **Single dual number**: When given a single `{ v, d }` object, validates
 *   and returns the resulting `{ v, d }` dual number directly.
 *
 * @overload
 * @param {Dual} input - A single dual number `{ v, d }` with `v ∈ [-1, 1]`.
 * @returns {Dual} The transformed dual number `{ v, d }`.
 *
 * @overload
 * @param {Iterable<Dual>} input - An iterable sequence of dual numbers `{ v, d }`.
 * @returns {Generator<Dual, void, undefined>} A lazy generator yielding `{ v, d }` dual numbers.
 *
 * @param {Dual | Iterable<Dual>} input
 * @returns {Dual | Generator<Dual, void, undefined>}
 * @throws {TypeError} If `input` is neither a dual number `{ v, d }` nor an iterable sequence,
 *   or if an element is not a valid `{ v, d }` dual number.
 * @throws {RangeError} If any dual number has non-finite components or `v` outside `[-1, 1]`.
 */
export function arcsinDualLazy(input) {
	if (input === null || typeof input !== 'object') {
		throw new TypeError('Expected a dual number { v, d } or an iterable of dual numbers')
	}
	if (isIterableSequence(input)) {
		return arcsinDualGenerator(input)
	}
	return evalArcsinDual(input)
}
