/**
 * @typedef {Object} Complex
 * @property {number} re - Real part (finite number).
 * @property {number} im - Imaginary part (finite number).
 */

/**
 * Validates that a value is a finite complex number object `{ re, im }`.
 *
 * @param {unknown} value - Candidate complex number.
 * @param {string} label - Label used in error messages.
 * @throws {TypeError} If `value` is not a plain object with numeric `re` and `im`.
 * @throws {RangeError} If `re` or `im` is not a finite number.
 */
function assertComplex(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be a complex number object { re, im }`);
	}
	const { re, im } = /** @type {Record<string, unknown>} */ (value);
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${label}.re and ${label}.im must be numbers`);
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${label}.re and ${label}.im must be finite numbers`);
	}
}

/**
 * Validates that a value is a 3D vector of complex numbers.
 *
 * @param {unknown} vec - Candidate 3D complex vector.
 * @param {string} name - Parameter name used in error messages.
 * @throws {TypeError} If `vec` is not an Array or contains invalid complex elements.
 * @throws {RangeError} If `vec` does not have length 3 or contains non-finite numbers.
 */
function assertComplexVector3(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an Array of 3 complex numbers`);
	}
	if (vec.length !== 3) {
		throw new RangeError(`${name} must have length 3, received ${vec.length}`);
	}
	for (let i = 0; i < 3; i++) {
		assertComplex(vec[i], `${name}[${i}]`);
	}
}

/**
 * Normalizes `-0` to `+0`.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x;
}

/**
 * Multiplies two complex numbers: `(a.re + i*a.im) * (b.re + i*b.im)`.
 *
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	};
}

/**
 * Subtracts two complex numbers: `a - b`.
 *
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function complexSub(a, b) {
	return {
		re: normalizeZero(a.re - b.re),
		im: normalizeZero(a.im - b.im),
	};
}

/**
 * Computes the 3D vector cross product `a × b` over complex numbers `{ re, im }`
 * using a straightforward iterative loop over the cyclic component indices.
 *
 * Uses the standard bilinear cross product over C^3:
 * `c[k] = a[(k + 1) % 3] * b[(k + 2) % 3] - a[(k + 2) % 3] * b[(k + 1) % 3]`
 * for `k = 0, 1, 2`.
 *
 * @param {readonly Complex[]} a - First 3D complex vector.
 * @param {readonly Complex[]} b - Second 3D complex vector.
 * @returns {[Complex, Complex, Complex]} The resulting 3D complex cross product vector.
 * @throws {TypeError} If either input is not an Array or any element is not a valid `{ re, im }` object.
 * @throws {RangeError} If either input does not have length 3 or contains non-finite numbers.
 */
export function crossProductComplexIterative(a, b) {
	assertComplexVector3(a, 'a');
	assertComplexVector3(b, 'b');

	/** @type {Complex[]} */
	const result = new Array(3);
	for (let k = 0; k < 3; k++) {
		const i = (k + 1) % 3;
		const j = (k + 2) % 3;
		const firstTerm = complexMul(a[i], b[j]);
		const secondTerm = complexMul(a[j], b[i]);
		result[k] = complexSub(firstTerm, secondTerm);
	}

	return /** @type {[Complex, Complex, Complex]} */ (result);
}
