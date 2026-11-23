/**
 * Computes the discrete product of a sequence of complex numbers using a
 * straightforward iterative implementation.
 *
 * Each complex number is represented as an object `{ re, im }` with finite
 * real (`re`) and imaginary (`im`) numeric components. The empty product
 * returns the multiplicative identity `{ re: 1, im: 0 }`.
 *
 * Complex multiplication step:
 *   `(a + bi)(c + di) = (ac - bd) + (ad + bc)i`
 *
 * @param {Array<{ re: number, im: number }>} values - Array of complex numbers to multiply.
 * @returns {{ re: number, im: number }} The resulting complex product `{ re, im }`.
 * @throws {TypeError} If `values` is not an array, or any element is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If any element's `re` or `im` property is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
export function productComplexIterative(values) {
	if (!Array.isArray(values)) {
		throw new TypeError('values must be an array of complex numbers { re, im }')
	}

	let re = 1
	let im = 0

	for (let i = 0; i < values.length; i++) {
		if (!(i in values)) {
			throw new TypeError(`values[${i}] must be a complex number object { re, im }`)
		}

		const item = values[i]
		if (item === null || typeof item !== 'object' || Array.isArray(item)) {
			throw new TypeError(`values[${i}] must be a complex number object { re, im }`)
		}

		const { re: itemRe, im: itemIm } = item
		if (typeof itemRe !== 'number' || typeof itemIm !== 'number') {
			throw new TypeError(`values[${i}].re and values[${i}].im must be numbers`)
		}

		if (!Number.isFinite(itemRe) || !Number.isFinite(itemIm)) {
			throw new RangeError(`values[${i}].re and values[${i}].im must be finite numbers`)
		}

		const nextRe = re * itemRe - im * itemIm
		const nextIm = re * itemIm + im * itemRe
		re = nextRe
		im = nextIm
	}

	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	}
}
