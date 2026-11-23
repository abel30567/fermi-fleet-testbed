/**
 * Computes the discrete summation of an array of complex numbers using a
 * straightforward iterative algorithm.
 *
 * Each complex number is represented as a plain object `{ re, im }` with
 * finite numeric real (`re`) and imaginary (`im`) parts.
 *
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Validates that a value is a complex number object `{ re, im }` with finite
 * numeric components.
 *
 * @param {unknown} value - Candidate complex number.
 * @param {number} index - Element index for error reporting.
 * @throws {TypeError} If `value` is not a non-null, non-array object with numeric `re` and `im`.
 * @throws {RangeError} If `re` or `im` is not finite (`NaN`, `Infinity`, or `-Infinity`).
 */
function assertComplex(value, index) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(
			`Expected complex number object { re, im } at index ${index}`
		);
	}
	const { re, im } = value;
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(
			`Expected numeric re and im properties at index ${index}`
		);
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(
			`Expected finite numeric re and im properties at index ${index}`
		);
	}
}

/**
 * Sums a sequence of complex numbers iteratively.
 *
 * Returns the additive identity `{ re: 0, im: 0 }` for an empty array.
 *
 * @param {readonly Complex[]} values - Array of complex numbers `{ re, im }`.
 * @returns {Complex} The discrete sum `{ re, im }`.
 * @throws {TypeError} If `values` is not an array or any element is not a valid `{ re, im }` object.
 * @throws {RangeError} If any element has a non-finite `re` or `im` component.
 */
export function summationComplexIterative(values) {
	if (!Array.isArray(values)) {
		throw new TypeError('Expected values to be an array of complex numbers { re, im }');
	}

	let reSum = 0;
	let imSum = 0;

	for (let i = 0; i < values.length; i++) {
		const term = values[i];
		assertComplex(term, i);
		reSum += term.re;
		imSum += term.im;
	}

	return {
		re: reSum === 0 ? 0 : reSum,
		im: imSum === 0 ? 0 : imSum,
	};
}
