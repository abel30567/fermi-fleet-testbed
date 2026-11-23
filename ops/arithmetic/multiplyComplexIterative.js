/**
 * Validate that a value is a complex number object `{ re, im }` with finite numeric components.
 *
 * @param {unknown} value - Value to validate.
 * @param {number} index - Operand index for error reporting.
 * @returns {{ re: number, im: number }} The validated complex number.
 * @throws {TypeError} If `value` is not a plain-like object with finite numeric `re` and `im`.
 */
function validateComplex(value, index) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`Expected a complex number object { re, im } at index ${index}`);
	}
	if (typeof value.re !== 'number' || !Number.isFinite(value.re)) {
		throw new TypeError(`Expected a finite number for "re" at index ${index}`);
	}
	if (typeof value.im !== 'number' || !Number.isFinite(value.im)) {
		throw new TypeError(`Expected a finite number for "im" at index ${index}`);
	}
	return value;
}

/**
 * Normalize negative zero (`-0`) to positive zero (`0`).
 *
 * @param {number} n - Numeric component.
 * @returns {number} Normalized number.
 */
function normalizeZero(n) {
	return n === 0 ? 0 : n;
}

/**
 * Multiply complex numbers `{ re, im }` using a straightforward iterative implementation.
 *
 * Accepts either variadic complex number arguments (`multiplyComplexIterative(a, b, ...)`)
 * or a single array of complex numbers (`multiplyComplexIterative([a, b, ...])`).
 * An empty array returns the multiplicative identity `{ re: 1, im: 0 }`.
 *
 * @param {...({ re: number, im: number } | Array<{ re: number, im: number }>)} args
 *   Complex numbers to multiply, or a single array of complex numbers.
 * @returns {{ re: number, im: number }} The product as a new complex number object `{ re, im }`.
 * @throws {TypeError} If called with no arguments or if any operand is not a valid `{ re, im }` object with finite numbers.
 */
export function multiplyComplexIterative(...args) {
	if (args.length === 0) {
		throw new TypeError('multiplyComplexIterative requires at least one complex number or an array of complex numbers');
	}

	const factors = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;

	let re = 1;
	let im = 0;

	for (let i = 0; i < factors.length; i += 1) {
		const factor = validateComplex(factors[i], i);
		const nextRe = re * factor.re - im * factor.im;
		const nextIm = re * factor.im + im * factor.re;
		re = nextRe;
		im = nextIm;
	}

	return {
		re: normalizeZero(re),
		im: normalizeZero(im),
	};
}
