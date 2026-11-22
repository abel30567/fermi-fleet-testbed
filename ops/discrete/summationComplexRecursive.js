/**
 * Normalizes signed zero (`-0`) to `+0`.
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
 * @param {unknown} value
 * @param {string} label
 * @returns {{ re: number, im: number }}
 * @throws {TypeError} If value is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is not a finite number.
 */
function validateComplex(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be a complex number object { re, im }`)
	}
	if (typeof value.re !== 'number' || typeof value.im !== 'number') {
		throw new TypeError(`${label}.re and ${label}.im must be numbers`)
	}
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		throw new RangeError(`${label}.re and ${label}.im must be finite numbers`)
	}
	return {
		re: normalizeZero(value.re),
		im: normalizeZero(value.im),
	}
}

/**
 * Adds two validated complex numbers, guarding against floating-point overflow and `-0`.
 *
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 * @throws {RangeError} If the sum overflows finite IEEE-754 range.
 */
function addComplex(a, b) {
	const re = a.re + b.re
	const im = a.im + b.im
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Complex summation overflowed finite numeric range')
	}
	return {
		re: normalizeZero(re),
		im: normalizeZero(im),
	}
}

/**
 * Validates an integer index bound for term-function summation.
 *
 * @param {unknown} value
 * @param {string} name
 * @throws {TypeError} If value is not a number.
 * @throws {RangeError} If value is not a safe integer.
 */
function validateSafeInteger(value, name) {
	if (typeof value !== 'number') {
		throw new TypeError(`${name} must be a number`)
	}
	if (!Number.isSafeInteger(value)) {
		throw new RangeError(`${name} must be a safe integer`)
	}
}

/**
 * Pairwise divide-and-conquer recursive summation over `terms[lo..hi]`.
 *
 * @param {Array<{ re: number, im: number }>} terms
 * @param {number} lo
 * @param {number} hi
 * @returns {{ re: number, im: number }}
 */
function sumArrayRange(terms, lo, hi) {
	if (lo === hi) {
		return validateComplex(terms[lo], `terms[${lo}]`)
	}
	const mid = lo + Math.floor((hi - lo) / 2)
	const left = sumArrayRange(terms, lo, mid)
	const right = sumArrayRange(terms, mid + 1, hi)
	return addComplex(left, right)
}

/**
 * Pairwise divide-and-conquer recursive summation of `termFn(k)` for integer `k` in `[lo, hi]`.
 *
 * @param {(k: number) => { re: number, im: number }} termFn
 * @param {number} lo
 * @param {number} hi
 * @returns {{ re: number, im: number }}
 */
function sumFunctionRange(termFn, lo, hi) {
	if (lo === hi) {
		return validateComplex(termFn(lo), `termFn(${lo})`)
	}
	const mid = lo + Math.floor((hi - lo) / 2)
	const left = sumFunctionRange(termFn, lo, mid)
	const right = sumFunctionRange(termFn, mid + 1, hi)
	return addComplex(left, right)
}

/**
 * Computes the discrete summation over complex numbers `{ re, im }` using
 * recursive pairwise divide-and-conquer summation.
 *
 * Supports two invocation forms:
 * 1. Array mode: `summationComplexRecursive(terms)` sums all elements of an
 *    array of complex numbers `{ re, im }`. An empty array returns `{ re: 0, im: 0 }`.
 * 2. Term-function mode: `summationComplexRecursive(termFn, start, end)` sums
 *    `termFn(k)` over all integers `k` in the inclusive interval `[start, end]`.
 *    When `start > end`, returns the empty sum `{ re: 0, im: 0 }` without invoking `termFn`.
 *
 * Algorithm:
 * Recursively partitions the index interval `[lo, hi]` at `mid = lo + Math.floor((hi - lo) / 2)`,
 * computes the complex sums of `[lo, mid]` and `[mid + 1, hi]`, and combines them.
 * This yields O(n) time, O(log n) call-stack depth, and O(eps * log n) worst-case
 * rounding error compared to O(eps * n) for naive sequential summation.
 *
 * @param {Array<{ re: number, im: number }> | ((k: number) => { re: number, im: number })} termsOrFn
 *   Either an array of complex number objects `{ re, im }` or a term generator function `termFn(k)`.
 * @param {number} [start]
 *   Inclusive lower integer bound (required when `termsOrFn` is a function; must be omitted for array mode).
 * @param {number} [end]
 *   Inclusive upper integer bound (required when `termsOrFn` is a function; must be omitted for array mode).
 * @returns {{ re: number, im: number }} The complex sum `{ re, im }` with `-0` normalized to `0`.
 * @throws {TypeError} If arguments have invalid types, extra arguments are supplied in array mode,
 *   or any complex term is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If bounds are not safe integers, `end - start` exceeds safe integer range,
 *   any complex component is non-finite (`NaN`/`Infinity`), or summation overflows finite range.
 */
export function summationComplexRecursive(termsOrFn, start, end) {
	if (Array.isArray(termsOrFn)) {
		if (start !== undefined || end !== undefined) {
			throw new TypeError(
				'summationComplexRecursive(terms) does not accept start/end bounds when given an array',
			)
		}
		if (termsOrFn.length === 0) {
			return { re: 0, im: 0 }
		}
		return sumArrayRange(termsOrFn, 0, termsOrFn.length - 1)
	}

	if (typeof termsOrFn === 'function') {
		validateSafeInteger(start, 'start')
		validateSafeInteger(end, 'end')
		if (start > end) {
			return { re: 0, im: 0 }
		}
		const span = end - start
		if (!Number.isSafeInteger(span)) {
			throw new RangeError('Summation range (end - start) must be a safe integer')
		}
		return sumFunctionRange(termsOrFn, start, end)
	}

	throw new TypeError(
		'First argument must be an array of complex numbers or a term function (k) => { re, im }',
	)
}
