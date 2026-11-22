const COMPONENTS = ['re', 'im'];

/**
 * Validates that a value is a finite complex number object `{ re, im }`.
 *
 * @param {unknown} value - Candidate complex number object.
 * @param {string} label - Parameter label used in error messages.
 * @throws {TypeError} If `value` is not a non-null plain/object or its `re`/`im` parts are not numbers.
 * @throws {RangeError} If `value.re` or `value.im` is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
function validateComplex(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be a non-null complex number object with { re, im }`);
	}

	for (let i = 0; i < COMPONENTS.length; i++) {
		const key = COMPONENTS[i];
		const part = value[key];
		if (typeof part !== 'number') {
			throw new TypeError(`${label}.${key} must be a number`);
		}
		if (!Number.isFinite(part)) {
			throw new RangeError(`${label}.${key} must be a finite number`);
		}
	}
}

/**
 * Normalizes `-0` to `+0` while leaving all other numbers unchanged.
 *
 * @param {number} value - Finite numeric value.
 * @returns {number} Canonicalized number with `-0` converted to `0`.
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value;
}

/**
 * Subtracts one or more complex numbers from an initial complex number iteratively.
 *
 * Each complex number is represented as an object `{ re, im }` with finite real (`re`)
 * and imaginary (`im`) numeric components. Given `(a, b, ...rest)`, computes
 * `((a - b) - rest[0]) - ...` left-to-right without mutating any input object.
 * Negative zero (`-0`) components in the result are normalized to `0`.
 *
 * @param {{ re: number, im: number }} a - The minuend complex number.
 * @param {{ re: number, im: number }} b - The first subtrahend complex number.
 * @param {...{ re: number, im: number }} rest - Optional additional subtrahend complex numbers.
 * @returns {{ re: number, im: number }} A new complex number representing the iterative difference.
 * @throws {TypeError} If any argument is missing, not a non-null non-array object, or has non-numeric `re`/`im`.
 * @throws {RangeError} If any `re`/`im` component is non-finite (`NaN`, `±Infinity`) or subtraction overflows.
 */
export function subtractComplexIterative(a, b, ...rest) {
	validateComplex(a, 'a');
	validateComplex(b, 'b');

	const subtrahends = [b, ...rest];
	let re = a.re;
	let im = a.im;

	for (let i = 0; i < subtrahends.length; i++) {
		const term = subtrahends[i];
		if (i > 0) {
			validateComplex(term, `argument[${i + 1}]`);
		}

		const nextRe = re - term.re;
		const nextIm = im - term.im;

		if (!Number.isFinite(nextRe) || !Number.isFinite(nextIm)) {
			throw new RangeError('Complex subtraction resulted in a non-finite value');
		}

		re = normalizeZero(nextRe);
		im = normalizeZero(nextIm);
	}

	return { re, im };
}
