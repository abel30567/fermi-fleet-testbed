/**
 * @typedef {Object} ComplexNumber
 * @property {number} re - Real part (IEEE-754 float64).
 * @property {number} im - Imaginary part (IEEE-754 float64).
 */

/**
 * @typedef {Object} FourierTransformOptions
 * @property {boolean} [inverse=false] - When true, computes the inverse DFT (scaled by 1/N).
 */

const TWO_PI = 2 * Math.PI;

/**
 * Normalizes `-0` to `0` while leaving all other float64 numbers unchanged.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value;
}

/**
 * Validates that a value is a finite IEEE-754 float64 number.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
function assertFiniteNumber(value, label) {
	if (typeof value !== 'number') {
		throw new TypeError(`${label} must be a number`);
	}
	if (!Number.isFinite(value)) {
		throw new RangeError(`${label} must be a finite IEEE-754 float64 number`);
	}
	return value;
}

/**
 * Computes the Discrete Fourier Transform (or inverse DFT) over IEEE-754 float64
 * numbers using a straightforward iterative O(N^2) nested-loop algorithm.
 *
 * Forward transform (`inverse: false`):
 *   X[k] = sum_{n=0}^{N-1} x[n] * exp(-i * 2 * pi * k * n / N)
 *
 * Inverse transform (`inverse: true`):
 *   x[n] = (1 / N) * sum_{k=0}^{N-1} X[k] * exp(+i * 2 * pi * k * n / N)
 *
 * Works for any non-negative input length N (not restricted to powers of two).
 *
 * @param {Array<number | ComplexNumber> | Float64Array} signal - Input sequence of real float64 numbers or `{ re, im }` complex numbers.
 * @param {FourierTransformOptions} [options] - Optional transform configuration.
 * @returns {ComplexNumber[]} Transformed sequence of complex numbers `{ re, im }`.
 * @throws {TypeError} If `signal` is not an Array/Float64Array, contains non-numeric elements, or `options` is invalid.
 * @throws {RangeError} If any numeric sample component is `NaN`, `Infinity`, or `-Infinity`.
 */
export function fourierTransformFloatIterative(signal, options) {
	const isArray = Array.isArray(signal);
	const isFloat64Array = signal instanceof Float64Array;
	if (!isArray && !isFloat64Array) {
		throw new TypeError('signal must be an Array or Float64Array');
	}

	let inverse = false;
	if (options !== undefined) {
		if (options === null || typeof options !== 'object' || Array.isArray(options)) {
			throw new TypeError('options must be a plain object');
		}
		if (options.inverse !== undefined) {
			if (typeof options.inverse !== 'boolean') {
				throw new TypeError('options.inverse must be a boolean');
			}
			inverse = options.inverse;
		}
	}

	const n = signal.length;
	const inRe = new Float64Array(n);
	const inIm = new Float64Array(n);

	for (let i = 0; i < n; i++) {
		const sample = signal[i];
		if (typeof sample === 'number') {
			inRe[i] = assertFiniteNumber(sample, `signal[${i}]`);
			inIm[i] = 0;
		} else if (sample !== null && typeof sample === 'object' && !Array.isArray(sample)) {
			inRe[i] = assertFiniteNumber(sample.re, `signal[${i}].re`);
			inIm[i] = assertFiniteNumber(sample.im, `signal[${i}].im`);
		} else {
			throw new TypeError(`signal[${i}] must be a number or a { re, im } complex object`);
		}
	}

	if (n === 0) {
		return [];
	}

	const sign = inverse ? 1 : -1;
	const scale = inverse ? 1 / n : 1;
	const baseAngle = TWO_PI / n;
	const result = new Array(n);

	for (let k = 0; k < n; k++) {
		let sumRe = 0;
		let sumIm = 0;
		const kAngle = baseAngle * k;

		for (let t = 0; t < n; t++) {
			const angle = kAngle * t;
			const cos = Math.cos(angle);
			const sin = Math.sin(angle);
			const a = inRe[t];
			const b = inIm[t];

			// (a + i*b) * (cos + i*sign*sin)
			sumRe += a * cos - sign * b * sin;
			sumIm += b * cos + sign * a * sin;
		}

		result[k] = {
			re: normalizeZero(sumRe * scale),
			im: normalizeZero(sumIm * scale),
		};
	}

	return result;
}
