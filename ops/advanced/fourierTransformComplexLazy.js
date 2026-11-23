const VALID_NORMALIZATIONS = new Set(['inverse', 'unitary', 'none']);

/**
 * Validates that a value is a non-string iterable.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {void}
 */
function assertIterable(value, name) {
	if (
		value == null ||
		typeof value === 'string' ||
		typeof value[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(`${name} must be a non-string iterable`);
	}
}

/**
 * Validates and extracts a complex number `{ re, im }`.
 *
 * @param {unknown} value
 * @param {number} index
 * @returns {{ re: number, im: number }}
 */
function validateComplex(value, index) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(
			`Element at index ${index} must be a complex number object { re, im }`
		);
	}
	const { re, im } = value;
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(
			`Element at index ${index} must have numeric re and im properties`
		);
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(
			`Element at index ${index} must have finite re and im values`
		);
	}
	return { re, im };
}

/**
 * Validates a frequency value `k`.
 *
 * @param {unknown} value
 * @param {number} index
 * @returns {number}
 */
function validateFrequency(value, index) {
	if (typeof value !== 'number') {
		throw new TypeError(`Frequency at index ${index} must be a number`);
	}
	if (!Number.isFinite(value)) {
		throw new RangeError(`Frequency at index ${index} must be finite`);
	}
	return value;
}

/**
 * Computes a single DFT bin `X(k)` for buffered complex samples.
 *
 * @param {Array<{ re: number, im: number }>} samples
 * @param {number} k
 * @param {number} sign - `-1` for forward DFT, `+1` for inverse DFT.
 * @param {number} scale - Multiplicative normalization factor.
 * @returns {{ re: number, im: number }}
 */
function computeBin(samples, k, sign, scale) {
	const nLen = samples.length;
	let sumRe = 0;
	let sumIm = 0;

	if (k === 0) {
		for (let n = 0; n < nLen; n++) {
			sumRe += samples[n].re;
			sumIm += samples[n].im;
		}
	} else if (Number.isInteger(k)) {
		const kMod = ((k % nLen) + nLen) % nLen;
		if (kMod === 0) {
			for (let n = 0; n < nLen; n++) {
				sumRe += samples[n].re;
				sumIm += samples[n].im;
			}
		} else {
			const twoPiOverN = (2 * Math.PI) / nLen;
			for (let n = 0; n < nLen; n++) {
				const { re: xr, im: xi } = samples[n];
				const knMod = (kMod * n) % nLen;
				let cos;
				let sin;
				if (knMod === 0) {
					cos = 1;
					sin = 0;
				} else if (knMod * 4 === nLen) {
					cos = 0;
					sin = sign;
				} else if (knMod * 2 === nLen) {
					cos = -1;
					sin = 0;
				} else if (knMod * 4 === nLen * 3) {
					cos = 0;
					sin = -sign;
				} else {
					const angle = sign * twoPiOverN * knMod;
					cos = Math.cos(angle);
					sin = Math.sin(angle);
				}
				sumRe += xr * cos - xi * sin;
				sumIm += xr * sin + xi * cos;
			}
		}
	} else {
		const baseAngle = (sign * 2 * Math.PI * k) / nLen;
		for (let n = 0; n < nLen; n++) {
			const { re: xr, im: xi } = samples[n];
			const angle = baseAngle * n;
			const cos = Math.cos(angle);
			const sin = Math.sin(angle);
			sumRe += xr * cos - xi * sin;
			sumIm += xr * sin + xi * cos;
		}
	}

	const re = sumRe * scale;
	const im = sumIm * scale;
	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	};
}

/**
 * Computes the Discrete Fourier Transform (DFT) or Inverse DFT over a sequence
 * of complex numbers `{ re, im }`, returning a lazy generator that yields
 * frequency bins `{ re, im }` on demand.
 *
 * The input iterable is not consumed until iteration of the returned generator
 * begins, each element is validated as it is streamed in, and each output bin
 * is computed on demand as `.next()` is called. When `options.frequencies` is
 * provided, frequency indices are also consumed lazily one by one (supporting
 * arbitrary or infinite iterables).
 *
 * Mathematical definition for a sequence `x[0..N-1]`:
 * - Forward (`inverse = false`): `X[k] = sum_{n=0}^{N-1} x[n] * exp(-i * 2*pi*k*n / N)`
 * - Inverse (`inverse = true`):  `x[k] = (1/N) * sum_{n=0}^{N-1} X[n] * exp(+i * 2*pi*k*n / N)`
 *
 * @typedef {{ re: number, im: number }} Complex
 *
 * @typedef {object} FourierTransformOptions
 * @property {boolean} [inverse=false] - Compute the inverse DFT when `true`.
 * @property {'inverse'|'unitary'|'none'} [normalize='inverse'] - Normalization mode:
 *   `'inverse'` divides by `N` only when `inverse` is `true` (standard convention);
 *   `'unitary'` divides by `Math.sqrt(N)` for both forward and inverse transforms;
 *   `'none'` applies no scaling.
 * @property {Iterable<number>} [frequencies] - Optional iterable of finite real
 *   frequency indices `k` to evaluate lazily instead of `0..N-1`.
 *
 * @param {Iterable<Complex>} input - Iterable of complex numbers `{ re, im }`.
 * @param {FourierTransformOptions} [options={}] - Optional transform configuration.
 * @returns {Generator<Complex, void, undefined>} Lazy generator yielding `{ re, im }` bins.
 * @throws {TypeError} If `input` is not a non-string iterable, `options` is invalid,
 *   or any complex element or frequency has an invalid type.
 * @throws {RangeError} If any `re`, `im`, or frequency is non-finite (`NaN`/`Infinity`),
 *   or if `options.normalize` is not one of `'inverse'`, `'unitary'`, or `'none'`.
 */
export function fourierTransformComplexLazy(input, options = {}) {
	assertIterable(input, 'input');

	if (
		options === null ||
		typeof options !== 'object' ||
		Array.isArray(options)
	) {
		throw new TypeError('options must be a plain object');
	}

	const { inverse = false, normalize = 'inverse', frequencies } = options;

	if (typeof inverse !== 'boolean') {
		throw new TypeError('options.inverse must be a boolean');
	}
	if (typeof normalize !== 'string') {
		throw new TypeError('options.normalize must be a string');
	}
	if (!VALID_NORMALIZATIONS.has(normalize)) {
		throw new RangeError(
			`options.normalize must be one of "inverse", "unitary", or "none" (got "${normalize}")`
		);
	}
	if (frequencies !== undefined) {
		assertIterable(frequencies, 'options.frequencies');
	}

	return (function* generateTransform() {
		const samples = [];
		let index = 0;
		for (const item of input) {
			samples.push(validateComplex(item, index));
			index += 1;
		}

		const nLen = samples.length;
		if (nLen === 0) {
			return;
		}

		const sign = inverse ? 1 : -1;
		let scale = 1;
		if (normalize === 'inverse' && inverse) {
			scale = 1 / nLen;
		} else if (normalize === 'unitary') {
			scale = 1 / Math.sqrt(nLen);
		}

		if (frequencies !== undefined) {
			let freqIndex = 0;
			for (const freq of frequencies) {
				const k = validateFrequency(freq, freqIndex);
				freqIndex += 1;
				yield computeBin(samples, k, sign, scale);
			}
			return;
		}

		for (let k = 0; k < nLen; k++) {
			yield computeBin(samples, k, sign, scale);
		}
	})();
}
