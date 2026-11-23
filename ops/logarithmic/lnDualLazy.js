/**
 * @typedef {Object} Dual
 * @property {number} v - Primal value (must be finite and strictly positive for ln).
 * @property {number} d - Forward-mode derivative (tangent / dual part; must be finite).
 */

/**
 * Validate a single dual number `{ v, d }` for the real natural logarithm domain.
 *
 * @param {unknown} item - Candidate dual number object.
 * @returns {Dual} Validated `{ v, d }` values.
 * @throws {TypeError} If `item` is not a plain-like object with numeric `v` and `d`.
 * @throws {RangeError} If `v` or `d` is non-finite, or if `v <= 0`.
 */
function validateDual(item) {
	if (typeof item !== 'object' || item === null || Array.isArray(item)) {
		throw new TypeError('lnDualLazy: each dual number must be a non-null object { v, d }')
	}

	const { v, d } = item

	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('lnDualLazy: dual number properties v and d must be numbers')
	}

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('lnDualLazy: dual number properties v and d must be finite numbers')
	}

	if (v <= 0) {
		throw new RangeError(`lnDualLazy: primal value v must be strictly positive (> 0), got ${v}`)
	}

	return { v, d }
}

/**
 * Compute the natural logarithm of a single validated dual number.
 *
 * For `x = v + d*ε` (with `ε² = 0` and `v > 0`):
 * `ln(v + d*ε) = ln(v) + (d / v)*ε`.
 *
 * @param {Dual} dual - Input dual number `{ v, d }`.
 * @returns {Dual} Resulting dual number `{ v: Math.log(v), d: d / v }`.
 */
function computeLnDual(dual) {
	const { v, d } = validateDual(dual)
	const outV = Math.log(v)
	const rawD = d / v
	return {
		v: outV === 0 ? 0 : outV,
		d: rawD === 0 ? 0 : rawD,
	}
}

/**
 * Internal lazy generator that consumes an iterable of dual numbers one at a time.
 *
 * @param {Iterable<Dual>} iterable - Source sequence of dual numbers.
 * @returns {Generator<Dual, void, void>} Lazy stream of transformed dual numbers.
 */
function* lnDualGenerator(iterable) {
	for (const item of iterable) {
		yield computeLnDual(item)
	}
}

/**
 * Natural logarithm (`ln`) over dual numbers `{ v, d }` carrying a forward-mode
 * derivative alongside the primal value, using a lazy generator-based implementation
 * when given an iterable sequence.
 *
 * For a dual number `x = v + d*ε` (`ε² = 0`, `v > 0`):
 * - Primal value: `Math.log(v)`
 * - Derivative: `d / v`
 *
 * Input modes:
 * - **Iterable sequence** (`Array`, `Generator`, `Set`, custom `[Symbol.iterator]`):
 *   returns a `Generator<Dual>` that consumes elements lazily, validating and
 *   transforming each item only when pulled via `.next()` / `for...of`.
 * - **Single dual number** (`{ v, d }`): validates and returns the transformed `{ v, d }`.
 *
 * @param {Dual | Iterable<Dual>} input - A dual number `{ v, d }` or an iterable of dual numbers.
 * @returns {Dual | Generator<Dual, void, void>} A dual number for scalar input, or a lazy generator for iterable input.
 * @throws {TypeError} If `input` is neither a dual number `{ v, d }` nor a non-string iterable, or if any element has non-numeric `v`/`d`.
 * @throws {RangeError} If any dual number has non-finite `v`/`d` or non-positive `v <= 0`.
 */
export function lnDualLazy(input) {
	if (input === null || typeof input !== 'object') {
		throw new TypeError('lnDualLazy: input must be a dual number { v, d } or an iterable of dual numbers')
	}

	if (typeof input[Symbol.iterator] === 'function') {
		return lnDualGenerator(input)
	}

	if ('v' in input || 'd' in input) {
		return computeLnDual(input)
	}

	throw new TypeError('lnDualLazy: input must be a dual number { v, d } or an iterable of dual numbers')
}
