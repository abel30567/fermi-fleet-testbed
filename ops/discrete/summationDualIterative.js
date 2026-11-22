/**
 * @typedef {{ v: number, d: number }} Dual
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} dual
 * @param {string} label
 * @throws {TypeError} If `dual` is not a non-null non-array object with numeric `v` and `d`.
 * @throws {RangeError} If `v` or `d` is not finite (`NaN`, `Infinity`, or `-Infinity`).
 */
function validateDual(dual, label) {
	if (dual === null || typeof dual !== 'object' || Array.isArray(dual)) {
		throw new TypeError(`${label} must be a dual number object { v, d }`)
	}
	const { v, d } = dual
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(`${label} must have numeric "v" and "d" properties`)
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(`${label} must have finite "v" and "d" properties`)
	}
}

/**
 * Validates that a bound is a safe integer.
 *
 * @param {unknown} bound
 * @param {string} name
 * @throws {TypeError} If `bound` is not a number.
 * @throws {RangeError} If `bound` is not a safe integer.
 */
function validateSafeInteger(bound, name) {
	if (typeof bound !== 'number') {
		throw new TypeError(`${name} must be a safe integer`)
	}
	if (!Number.isSafeInteger(bound)) {
		throw new RangeError(`${name} must be a safe integer`)
	}
}

/**
 * Computes a discrete summation over dual numbers `{ v, d }` carrying a
 * forward-mode derivative (`d`) alongside the primal value (`v`), using a
 * straightforward iterative loop.
 *
 * For dual numbers `a_k = v_k + d_k * ε` (with `ε² = 0`), addition is
 * component-wise:
 *   `Σ (v_k + d_k * ε) = (Σ v_k) + (Σ d_k) * ε`
 *
 * Supports two call forms:
 * 1. `summationDualIterative(terms)` — iteratively sums an iterable (such as an
 *    Array, Set, or generator) of dual numbers `{ v, d }`.
 * 2. `summationDualIterative(termFn, start, end, param?)` — evaluates
 *    `termFn(k, param)` for each integer `k` from `start` to `end` inclusive
 *    and iteratively accumulates the returned dual numbers.
 *
 * By convention, an empty iterable or an empty range (`start > end`) returns
 * the additive identity `{ v: 0, d: 0 }`.
 *
 * @param {Iterable<Dual> | ((k: number, param?: Dual) => Dual)} source
 *   An iterable of dual numbers, or a term function returning a dual number for
 *   each integer index `k`.
 * @param {number} [start]
 *   Inclusive safe-integer lower bound (required when `source` is a function).
 * @param {number} [end]
 *   Inclusive safe-integer upper bound (required when `source` is a function).
 * @param {Dual} [param]
 *   Optional dual number parameter passed as the second argument to `termFn`.
 * @returns {Dual} The accumulated dual sum `{ v, d }`.
 * @throws {TypeError} If arguments have invalid types or any term is not a dual object `{ v, d }`.
 * @throws {RangeError} If bounds are not safe integers or any dual component is non-finite.
 */
export function summationDualIterative(source, start, end, param) {
	if (typeof source === 'function') {
		validateSafeInteger(start, 'start')
		validateSafeInteger(end, 'end')
		if (param !== undefined) {
			validateDual(param, 'param')
		}

		let v = 0
		let d = 0
		for (let k = start; k <= end; k += 1) {
			const term = param === undefined ? source(k) : source(k, param)
			validateDual(term, `term at index ${k}`)
			v += term.v
			d += term.d
		}
		return { v, d }
	}

	if (
		source === null ||
		typeof source !== 'object' ||
		typeof source[Symbol.iterator] !== 'function'
	) {
		throw new TypeError('source must be an iterable of dual numbers or a term function')
	}
	if (start !== undefined || end !== undefined || param !== undefined) {
		throw new TypeError('unexpected extra arguments when summing an iterable')
	}

	let v = 0
	let d = 0
	let index = 0
	for (const term of source) {
		validateDual(term, `term at index ${index}`)
		v += term.v
		d += term.d
		index += 1
	}
	return { v, d }
}
