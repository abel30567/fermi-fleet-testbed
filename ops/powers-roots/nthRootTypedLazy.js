/**
 * Lazily computes the element-wise real n-th root over Float64Array inputs
 * or lazy numeric iterables (generators / custom sequences).
 *
 * @module ops/powers-roots/nthRootTypedLazy
 */

/**
 * Checks whether a value is a valid lazy iterable sequence accepted by
 * `nthRootTypedLazy`: either a `Float64Array` or a non-Array, non-string,
 * non-other-ArrayBufferView iterable object (such as a Generator or custom
 * `[Symbol.iterator]` object).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidSequence(value) {
	if (value instanceof Float64Array) {
		return true
	}
	if (value === null || typeof value !== 'object') {
		return false
	}
	if (Array.isArray(value) || ArrayBuffer.isView(value)) {
		return false
	}
	return typeof value[Symbol.iterator] === 'function'
}

/**
 * Returns true if `n` is a safe odd integer (the only IEEE-754 float64
 * integers that are odd; all integers with |n| >= 2^53 are even).
 *
 * @param {number} n
 * @returns {boolean}
 */
function isOddInteger(n) {
	return Number.isSafeInteger(n) && Math.abs(n % 2) === 1
}

/**
 * Computes the principal positive real k-th root of a finite positive number x,
 * with a guarded Newton-Raphson refinement step for safe integer degrees to
 * eliminate 1-ULP `Math.pow(x, 1 / k)` rounding errors on exact powers.
 *
 * @param {number} x - Positive finite radicand (x > 0).
 * @param {number} k - Positive finite degree (k > 0).
 * @returns {number}
 */
function positiveNthRoot(x, k) {
	if (k === 1) return x
	if (k === 2) return Math.sqrt(x)
	if (k === 3) return Math.cbrt(x)

	const r = Math.pow(x, 1 / k)
	if (
		Number.isSafeInteger(k) &&
		k > 3 &&
		r > 0 &&
		Number.isFinite(r)
	) {
		const rPowKm1 = Math.pow(r, k - 1)
		if (rPowKm1 > 0 && Number.isFinite(rPowKm1)) {
			const refined = ((k - 1) * r + x / rPowKm1) / k
			if (refined > 0 && Number.isFinite(refined)) {
				return refined
			}
		}
	}
	return r
}

/**
 * Computes the real n-th root of a single float64 value `x` with degree `n`.
 *
 * Semantics:
 * - Throws `RangeError` when `n === 0` (including `-0`).
 * - Returns `NaN` if `x` or `n` is `NaN`.
 * - For `x < 0`: returns the real negative root when `n` is an odd integer,
 *   and `NaN` for even integer or non-integer degrees.
 * - Preserves IEEE-754 signed zero and infinity semantics.
 *
 * @param {number} x - Radicand.
 * @param {number} n - Root degree (must be non-zero).
 * @returns {number}
 */
function computeNthRoot(x, n) {
	if (n === 0) {
		throw new RangeError('Degree n must be non-zero')
	}
	if (Number.isNaN(x) || Number.isNaN(n)) {
		return NaN
	}

	// Infinite degree: lim_{n -> ±∞} x^(1/n) = 1 for finite x > 0; NaN otherwise.
	if (!Number.isFinite(n)) {
		if (x > 0 && Number.isFinite(x)) {
			return 1
		}
		return NaN
	}

	if (n === 1) return x
	if (n === -1) return 1 / x

	// Zero radicands (+0 and -0)
	if (x === 0) {
		const isNegZero = Object.is(x, -0)
		const odd = isOddInteger(n)
		if (n > 0) {
			return isNegZero && odd ? -0 : 0
		}
		return isNegZero && odd ? -Infinity : Infinity
	}

	// Infinite radicands (+Infinity and -Infinity)
	if (!Number.isFinite(x)) {
		if (x > 0) {
			return n > 0 ? Infinity : 0
		}
		if (isOddInteger(n)) {
			return n > 0 ? -Infinity : -0
		}
		return NaN
	}

	// Negative finite radicands
	if (x < 0) {
		if (!isOddInteger(n)) {
			return NaN
		}
		if (n === 3) return Math.cbrt(x)
		if (n === -3) return 1 / Math.cbrt(x)
		const absRoot = positiveNthRoot(-x, Math.abs(n))
		return n > 0 ? -absRoot : -1 / absRoot
	}

	// Positive finite radicands
	if (n > 0) {
		return positiveNthRoot(x, n)
	}
	return 1 / positiveNthRoot(x, -n)
}

/**
 * Safely closes an iterator if it exposes a `.return()` method.
 *
 * @param {Iterator<unknown> | null} iter
 */
function closeIterator(iter) {
	if (iter !== null && typeof iter.return === 'function') {
		iter.return()
	}
}

/**
 * Internal generator for element-wise lazy n-th root over a Float64Array or
 * lazy iterable of numbers with a broadcast scalar degree.
 *
 * @param {Float64Array | Iterable<number>} radicands
 * @param {number} degree
 * @returns {Generator<number, void, undefined>}
 */
function* generateScalarDegree(radicands, degree) {
	if (radicands instanceof Float64Array) {
		for (let i = 0; i < radicands.length; i++) {
			yield computeNthRoot(radicands[i], degree)
		}
		return
	}

	const rIter = radicands[Symbol.iterator]()
	let rDone = false
	try {
		while (true) {
			const rNext = rIter.next()
			if (rNext.done) {
				rDone = true
				return
			}
			const x = rNext.value
			if (typeof x !== 'number') {
				throw new TypeError(`Expected numeric radicand, received ${typeof x}`)
			}
			yield computeNthRoot(x, degree)
		}
	} finally {
		if (!rDone) {
			closeIterator(rIter)
		}
	}
}

/**
 * Internal generator for element-wise lazy n-th root over paired Float64Array
 * or lazy iterable inputs.
 *
 * @param {Float64Array | Iterable<number>} radicands
 * @param {Float64Array | Iterable<number>} degrees
 * @returns {Generator<number, void, undefined>}
 */
function* generatePaired(radicands, degrees) {
	if (radicands instanceof Float64Array && degrees instanceof Float64Array) {
		for (let i = 0; i < radicands.length; i++) {
			yield computeNthRoot(radicands[i], degrees[i])
		}
		return
	}

	const rIter = radicands[Symbol.iterator]()
	const dIter = degrees[Symbol.iterator]()
	let rDone = false
	let dDone = false

	try {
		while (true) {
			const rNext = rIter.next()
			rDone = Boolean(rNext.done)
			const dNext = dIter.next()
			dDone = Boolean(dNext.done)

			if (rDone && dDone) {
				return
			}
			if (rDone !== dDone) {
				throw new RangeError('Length mismatch between radicands and degrees sequences')
			}

			const x = rNext.value
			const n = dNext.value
			if (typeof x !== 'number') {
				throw new TypeError(`Expected numeric radicand, received ${typeof x}`)
			}
			if (typeof n !== 'number') {
				throw new TypeError(`Expected numeric degree, received ${typeof n}`)
			}

			yield computeNthRoot(x, n)
		}
	} finally {
		let closeError = null
		if (!rDone) {
			try {
				closeIterator(rIter)
			} catch (err) {
				closeError = err
			}
		}
		if (!dDone) {
			closeIterator(dIter)
		}
		if (closeError !== null) {
			throw closeError
		}
	}
}

/**
 * Lazily computes the element-wise real n-th root (`x^(1/n)`) over
 * `Float64Array` inputs or lazy numeric iterables (such as generators).
 *
 * Performs eager validation on top-level input types, scalar zero degree,
 * and mismatched `Float64Array` lengths, then returns a `Generator<number>`
 * that pulls inputs and computes each root on demand without allocating an
 * intermediate output buffer.
 *
 * @param {Float64Array | Iterable<number>} radicands - `Float64Array` or lazy
 *   iterable of numeric radicands (plain Arrays, strings, and non-Float64Array
 *   TypedArrays are rejected).
 * @param {number | Float64Array | Iterable<number>} degrees - Either a scalar
 *   non-zero degree broadcast across all radicands, or a `Float64Array` / lazy
 *   iterable of per-element degrees with the same length as `radicands`.
 * @returns {Generator<number, void, undefined>} A lazy generator yielding each
 *   computed float64 n-th root.
 * @throws {TypeError} If `radicands` or `degrees` is not a supported type, or
 *   if a lazy iterable yields a non-numeric value.
 * @throws {RangeError} If a degree is `0` (or `-0`), or if `radicands` and
 *   `degrees` have different lengths.
 */
export function nthRootTypedLazy(radicands, degrees) {
	if (!isValidSequence(radicands)) {
		throw new TypeError(
			'radicands must be a Float64Array or a lazy numeric iterable (plain Arrays, strings, and other TypedArrays are not allowed)'
		)
	}

	if (typeof degrees === 'number') {
		if (degrees === 0) {
			throw new RangeError('Degree n must be non-zero')
		}
		return generateScalarDegree(radicands, degrees)
	}

	if (!isValidSequence(degrees)) {
		throw new TypeError(
			'degrees must be a number, a Float64Array, or a lazy numeric iterable (plain Arrays, strings, and other TypedArrays are not allowed)'
		)
	}

	if (
		radicands instanceof Float64Array &&
		degrees instanceof Float64Array &&
		radicands.length !== degrees.length
	) {
		throw new RangeError(
			`Length mismatch: radicands has length ${radicands.length}, degrees has length ${degrees.length}`
		)
	}

	return generatePaired(radicands, degrees)
}
