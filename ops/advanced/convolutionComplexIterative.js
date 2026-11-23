/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Validates that a value is an array of finite complex numbers `{ re, im }`.
 *
 * @param {unknown} seq
 * @param {string} name
 * @throws {TypeError} If `seq` is not an array or contains a non-complex entry.
 * @throws {RangeError} If any `re` or `im` component is not a finite number.
 */
function validateComplexSequence(seq, name) {
	if (!Array.isArray(seq)) {
		throw new TypeError(`${name} must be an array of { re, im } complex numbers`);
	}
	for (let i = 0; i < seq.length; i++) {
		const el = seq[i];
		if (el === null || typeof el !== 'object' || Array.isArray(el)) {
			throw new TypeError(`${name}[${i}] must be an object with numeric re and im properties`);
		}
		if (typeof el.re !== 'number' || typeof el.im !== 'number') {
			throw new TypeError(`${name}[${i}].re and ${name}[${i}].im must be numbers`);
		}
		if (!Number.isFinite(el.re) || !Number.isFinite(el.im)) {
			throw new RangeError(`${name}[${i}].re and ${name}[${i}].im must be finite numbers`);
		}
	}
}

/**
 * Computes the discrete linear convolution of two complex-valued sequences
 * using a straightforward iterative O(M * N) algorithm.
 *
 * Given sequences `a` (length M) and `b` (length N) of `{ re, im }` complex
 * numbers, returns an array `c` of length `M + N - 1` (or `[]` if either input
 * is empty) where:
 *
 *   c[k] = sum_{i + j = k} a[i] * b[j]
 *
 * Input arrays and their elements are not mutated.
 *
 * @param {readonly Complex[]} a - First complex sequence.
 * @param {readonly Complex[]} b - Second complex sequence.
 * @returns {Complex[]} The discrete linear convolution of `a` and `b`.
 * @throws {TypeError} If either input is not an array of `{ re, im }` objects with numeric fields.
 * @throws {RangeError} If any complex component is `NaN`, `Infinity`, or `-Infinity`.
 */
export function convolutionComplexIterative(a, b) {
	validateComplexSequence(a, 'a');
	validateComplexSequence(b, 'b');

	const lenA = a.length;
	const lenB = b.length;
	if (lenA === 0 || lenB === 0) {
		return [];
	}

	const outLen = lenA + lenB - 1;
	const outRe = new Float64Array(outLen);
	const outIm = new Float64Array(outLen);

	for (let i = 0; i < lenA; i++) {
		const ar = a[i].re;
		const ai = a[i].im;
		for (let j = 0; j < lenB; j++) {
			const br = b[j].re;
			const bi = b[j].im;
			const k = i + j;
			outRe[k] += ar * br - ai * bi;
			outIm[k] += ar * bi + ai * br;
		}
	}

	const result = new Array(outLen);
	for (let k = 0; k < outLen; k++) {
		result[k] = {
			re: outRe[k] === 0 ? 0 : outRe[k],
			im: outIm[k] === 0 ? 0 : outIm[k],
		};
	}

	return result;
}
