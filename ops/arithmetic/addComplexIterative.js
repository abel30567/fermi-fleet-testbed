/**
 * @typedef {{ re: number, im: number }} Complex
 * A complex number represented in rectangular form `re + im * i`.
 */

/**
 * Validates that a value is a finite complex number object `{ re, im }`.
 *
 * @param {unknown} value - Value to validate.
 * @param {number} index - Zero-based position of the value for error reporting.
 * @throws {TypeError} If `value` is not a non-null, non-array object with numeric `re` and `im` properties.
 * @throws {RangeError} If `value.re` or `value.im` is not a finite number (`NaN`, `Infinity`, or `-Infinity`).
 */
function assertComplex(value, index) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`Expected complex object { re, im } at index ${index}`);
	}
	if (typeof value.re !== 'number' || typeof value.im !== 'number') {
		throw new TypeError(`Expected numeric 're' and 'im' properties at index ${index}`);
	}
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		throw new RangeError(`Expected finite 're' and 'im' values at index ${index}`);
	}
}

/**
 * Adds complex numbers represented as `{ re, im }` objects using a
 * straightforward iterative accumulation loop.
 *
 * Supports either:
 * - One or more `{ re, im }` arguments: `addComplexIterative(a, b, ...)`
 * - A single array of `{ re, im }` objects: `addComplexIterative([z1, z2, ...])`
 *
 * An empty array returns the additive identity `{ re: 0, im: 0 }`.
 * Signed zeros (`-0`) in the result are normalized to `0`. Input objects and
 * arrays are never mutated.
 *
 * @param {...(Complex|Complex[])} args - Complex numbers to sum, or a single array of complex numbers.
 * @returns {Complex} The complex sum `{ re, im }`.
 * @throws {TypeError} If called with no arguments, or if any operand is not a valid `{ re, im }` object with numeric components.
 * @throws {RangeError} If any component is non-finite (`NaN`, `Infinity`, `-Infinity`) or if the accumulated sum overflows finite floating-point range.
 */
export function addComplexIterative(...args) {
	if (args.length === 0) {
		throw new TypeError('addComplexIterative requires at least one complex number or an array of complex numbers');
	}

	const operands = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;

	let re = 0;
	let im = 0;

	for (let i = 0; i < operands.length; i += 1) {
		const z = operands[i];
		assertComplex(z, i);
		re += z.re;
		im += z.im;
	}

	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Complex sum overflowed finite floating-point range');
	}

	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	};
}
