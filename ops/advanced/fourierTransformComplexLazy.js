/**
 * @typedef {Object} Complex
 * @property {number} re - Real part (finite number).
 * @property {number} im - Imaginary part (finite number).
 */

/**
 * @typedef {Object} FourierTransformOptions
 * @property {boolean} [inverse=false] - When `true`, computes the inverse Discrete Fourier Transform (IDFT) scaled by `1 / N`.
 */

const TWO_PI = 2 * Math.PI;

/**
 * Validates that an input value is a finite complex number `{ re, im }`.
 *
 * @param {unknown} value - Candidate complex sample.
 * @param {number} index - Zero-based sample index for error reporting.
 * @returns {{ re: number, im: number }} Validated complex components.
 * @throws {TypeError} If the sample is not a non-null object or `re`/`im` are not numbers.
 * @throws {RangeError} If `re` or `im` is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
function validateComplex(value, index) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(
			`Sample at index ${index} must be a non-null complex object { re, im }.`,
		);
	}

	const { re, im } = /** @type {{ re: unknown, im: unknown }} */ (value);

	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(
			`Sample at index ${index} must have numeric "re" and "im" properties.`,
		);
	}

	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(
			`Sample at index ${index} must have finite "re" and "im" values.`,
		);
	}

	return { re, im };
}

/**
 * Validates options passed to {@link fourierTransformComplexLazy}.
 *
 * @param {unknown} options - Candidate options object.
 * @returns {{ inverse: boolean }} Normalized options.
 * @throws {TypeError} If `options` is not an object or `options.inverse` is not a boolean.
 */
function validateOptions(options) {
	if (options === undefined) {
		return { inverse: false };
	}

	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('Options must be a plain object when provided.');
	}

	const { inverse = false } = /** @type {{ inverse?: unknown }} */ (options);

	if (typeof inverse !== 'boolean') {
		throw new TypeError('Option "inverse" must be a boolean.');
	}

	return { inverse };
}

/**
 * Streaming, generator-based Discrete Fourier Transform (DFT) and Inverse DFT (IDFT)
 * over an iterable of complex samples represented as `{ re, im }`.
 *
 * Forward DFT (`inverse: false`, default):
 * ```
 * X[k] = sum_{n=0}^{N-1} x[n] * exp(-2πi * k * n / N),  for k = 0, ..., N - 1
 * ```
 *
 * Inverse DFT (`inverse: true`):
 * ```
 * x[n] = (1 / N) * sum_{k=0}^{N-1} X[k] * exp(+2πi * k * n / N),  for n = 0, ..., N - 1
 * ```
 *
 * Laziness behavior:
 * - Neither `signal` nor any transform computation is evaluated until iteration begins.
 * - On the first `.next()` call, `signal` is consumed in a single pass with fail-fast
 *   validation (because every DFT bin depends on all `N` samples).
 * - Each output bin `X[k]` (or `x[n]` for the inverse transform) is computed lazily on
 *   demand when requested. Consuming only the first `m` bins computes only `O(m * N)`
 *   operations instead of `O(N^2)`.
 *
 * @param {Iterable<Complex>} signal - Iterable sequence of `{ re, im }` complex samples.
 * @param {FourierTransformOptions} [options] - Optional transform configuration.
 * @yields {Complex} Next frequency bin `X[k]` (or time-domain sample `x[n]` when `inverse: true`).
 * @throws {TypeError} If `signal` is not an iterable, `options` is invalid, or any sample lacks numeric `re`/`im`.
 * @throws {RangeError} If any sample has non-finite (`NaN`, `Infinity`, `-Infinity`) components.
 */
export function* fourierTransformComplexLazy(signal, options = undefined) {
	if (
		signal == null ||
		typeof signal === 'string' ||
		typeof signal[Symbol.iterator] !== 'function'
	) {
		throw new TypeError('Signal must be an iterable of complex objects { re, im }.');
	}

	const { inverse } = validateOptions(options);

	/** @type {number[]} */
	const reSamples = [];
	/** @type {number[]} */
	const imSamples = [];

	let index = 0;
	for (const sample of signal) {
		const { re, im } = validateComplex(sample, index);
		reSamples.push(re);
		imSamples.push(im);
		index += 1;
	}

	const nCount = reSamples.length;
	if (nCount === 0) {
		return;
	}

	const sign = inverse ? 1 : -1;
	const scale = inverse ? 1 / nCount : 1;
	const baseStep = (sign * TWO_PI) / nCount;

	for (let k = 0; k < nCount; k += 1) {
		let sumRe = 0;
		let sumIm = 0;
		const kStep = baseStep * k;

		for (let n = 0; n < nCount; n += 1) {
			const angle = kStep * n;
			const cosA = Math.cos(angle);
			const sinA = Math.sin(angle);
			const xRe = reSamples[n];
			const xIm = imSamples[n];

			// (xRe + i * xIm) * (cosA + i * sinA)
			sumRe += xRe * cosA - xIm * sinA;
			sumIm += xRe * sinA + xIm * cosA;
		}

		const outRe = sumRe * scale;
		const outIm = sumIm * scale;

		yield {
			re: outRe === 0 ? 0 : outRe,
			im: outIm === 0 ? 0 : outIm,
		};
	}
}
