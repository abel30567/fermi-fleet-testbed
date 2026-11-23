/**
 * Validates that a value is a complex number object `{ re, im }` with finite numeric parts.
 *
 * @param {unknown} value - Value to validate.
 * @param {string} label - Vector name for error messages.
 * @param {number} index - Element index for error messages.
 * @returns {{ re: number, im: number }} Validated complex number.
 * @throws {TypeError} If value is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is not a finite number.
 */
function assertComplex(value, label, index) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(`${label}[${index}] must be an object with numeric { re, im } properties`);
	}
	const { re, im } = value;
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${label}[${index}] must have numeric re and im properties`);
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${label}[${index}] must have finite re and im values`);
	}
	return { re, im };
}

/**
 * Computes the bilinear dot product of two complex vectors iteratively.
 *
 * Each vector element is a complex number represented as `{ re, im }`.
 * For vectors `a` and `b` of length `n`, computes:
 *
 *   sum_{k=0}^{n-1} (a[k].re + i * a[k].im) * (b[k].re + i * b[k].im)
 *
 * @param {Array<{ re: number, im: number }>} a - First vector of complex numbers.
 * @param {Array<{ re: number, im: number }>} b - Second vector of complex numbers.
 * @returns {{ re: number, im: number }} The complex dot product `{ re, im }`.
 * @throws {TypeError} If `a` or `b` is not an array, or any element is not a valid `{ re, im }` object.
 * @throws {RangeError} If `a` and `b` have different lengths, or any component is non-finite.
 */
export function dotProductComplexIterative(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument must be an array of complex numbers');
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument must be an array of complex numbers');
	}
	if (a.length !== b.length) {
		throw new RangeError(`Vector lengths must match (received ${a.length} and ${b.length})`);
	}

	let re = 0;
	let im = 0;

	for (let i = 0; i < a.length; i++) {
		const ca = assertComplex(a[i], 'a', i);
		const cb = assertComplex(b[i], 'b', i);

		re += ca.re * cb.re - ca.im * cb.im;
		im += ca.re * cb.im + ca.im * cb.re;
	}

	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	};
}
