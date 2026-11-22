/**
 * @typedef {object} Complex
 * @property {number} re - Real component (must be a finite IEEE-754 number).
 * @property {number} im - Imaginary component (must be a finite IEEE-754 number).
 */

/**
 * Normalizes IEEE-754 negative zero (`-0`) to `+0`.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Validates that a value is a finite complex number object `{ re, im }`.
 *
 * @param {unknown} value - Candidate complex number.
 * @param {number} index - Zero-based index in the input iterable (for diagnostics).
 * @returns {Complex} Validated `{ re, im }` components.
 * @throws {TypeError} If `value` is not a plain-like object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is `NaN`, `Infinity`, or `-Infinity`.
 */
function validateComplex(value, index) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(
			`Expected complex number object { re, im } at index ${index}, received ${value === null ? 'null' : Array.isArray(value) ? 'Array' : typeof value}`
		)
	}

	const { re, im } = /** @type {Record<string, unknown>} */ (value)

	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(
			`Complex number at index ${index} must have numeric re and im properties (received re: ${typeof re}, im: ${typeof im})`
		)
	}

	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(
			`Complex number at index ${index} must have finite re and im values (received { re: ${re}, im: ${im} })`
		)
	}

	return { re, im }
}

/**
 * Lazily computes the discrete running partial products of an iterable of complex numbers.
 *
 * Consumes `factors` strictly on demand (one input element per `.next()` call) so finite
 * sequences, streaming sources, and infinite generators are all supported without buffering.
 *
 * For input sequence `z_0, z_1, ..., z_{k-1}`, yields partial products:
 * - `P_0 = z_0`
 * - `P_n = P_{n-1} * z_n` using exact complex multiplication:
 *   `re = a.re * b.re - a.im * b.im`
 *   `im = a.re * b.im + a.im * b.re`
 *
 * For an empty iterable, yields nothing (zero elements).
 * Each yielded value is a fresh `{ re, im }` object with `-0` normalized to `0`.
 *
 * Note: Because this is a generator function, argument validation occurs when iteration
 * begins (on the first `.next()` call).
 *
 * @param {Iterable<Complex>} factors - Iterable of complex numbers `{ re, im }`.
 * @yields {Complex} Running partial product `{ re, im }` after each consumed factor.
 * @throws {TypeError} If `factors` is not a non-string iterable or an element is not a valid `{ re, im }` object.
 * @throws {RangeError} If any component is non-finite (`NaN`/`Infinity`) or an intermediate product overflows finite IEEE-754 numbers.
 */
export function* productComplexLazy(factors) {
	if (
		factors == null ||
		typeof factors === 'string' ||
		typeof factors[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			'factors must be a non-string iterable of complex numbers { re, im }'
		)
	}

	let accRe = 1
	let accIm = 0
	let index = 0

	for (const factor of factors) {
		const { re, im } = validateComplex(factor, index)

		const nextRe = accRe * re - accIm * im
		const nextIm = accRe * im + accIm * re

		if (!Number.isFinite(nextRe) || !Number.isFinite(nextIm)) {
			throw new RangeError(
				`Complex partial product overflowed finite IEEE-754 range at index ${index}`
			)
		}

		accRe = normalizeZero(nextRe)
		accIm = normalizeZero(nextIm)
		index += 1

		yield { re: accRe, im: accIm }
	}
}
