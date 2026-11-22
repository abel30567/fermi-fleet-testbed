/**
 * Computes the discrete summation of an iterable of complex numbers `{ re, im }`
 * using a straightforward iterative loop.
 *
 * For an empty iterable, returns the additive identity `{ re: 0, im: 0 }`.
 *
 * @param {Iterable<{ re: number, im: number }>} values - Iterable of complex numbers.
 * @returns {{ re: number, im: number }} The complex sum `{ re, im }`.
 * @throws {TypeError} If `values` is not a non-string iterable, or if any element is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If any `re` or `im` component is non-finite (`NaN`, `Infinity`, `-Infinity`), or if the sum overflows finite numbers.
 */
export function summationComplexIterative(values) {
	if (
		values === null ||
		values === undefined ||
		typeof values === 'string' ||
		typeof values[Symbol.iterator] !== 'function'
	) {
		throw new TypeError('values must be an iterable of complex numbers { re, im }')
	}

	let re = 0
	let im = 0
	let index = 0

	for (const z of values) {
		if (z === null || typeof z !== 'object' || Array.isArray(z)) {
			throw new TypeError(`Element at index ${index} must be an object { re, im }`)
		}
		if (typeof z.re !== 'number' || typeof z.im !== 'number') {
			throw new TypeError(`Element at index ${index} must have numeric re and im properties`)
		}
		if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
			throw new RangeError(`Element at index ${index} must have finite re and im values`)
		}

		re += z.re
		im += z.im

		if (!Number.isFinite(re) || !Number.isFinite(im)) {
			throw new RangeError(`Complex summation overflowed finite number range at index ${index}`)
		}

		index += 1
	}

	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	}
}
