/**
 * Complex discrete convolution via the Cauchy product of formal power series
 * and the spectral (DFT / radix-2 Cooley-Tukey FFT) convolution theorem.
 *
 * Given two complex sequences `a = [a_0, ..., a_{M-1}]` and `b = [b_0, ..., b_{N-1}]`
 * represented as `{ re, im }` objects, their linear discrete convolution corresponds
 * to the Cauchy product of their generating polynomials:
 *
 *   A(z) = sum_{j=0}^{M-1} a_j z^j,   B(z) = sum_{k=0}^{N-1} b_k z^k
 *   (A * B)(z) = sum_{n=0}^{M+N-2} c_n z^n,   c_n = sum_{j+k=n} a_j b_k
 *
 * Equivalently, by the discrete convolution theorem (spectral identity), zero-padding
 * both sequences to length `L >= M + N - 1` yields:
 *
 *   c = IDFT_L( DFT_L(a) .* DFT_L(b) )
 *
 * @module ops/advanced/convolutionComplexSeries
 */

const VALID_MODES = new Set(['full', 'same', 'valid', 'circular']);
const VALID_METHODS = new Set(['auto', 'cauchy', 'spectral']);
const SPECTRAL_PRODUCT_THRESHOLD = 256;

/**
 * Validate that a value is a non-empty array of finite complex numbers `{ re, im }`.
 *
 * @param {unknown} seq - Candidate complex sequence.
 * @param {string} name - Parameter name for diagnostic error messages.
 * @returns {Array<{ re: number, im: number }>}
 */
function validateComplexSequence(seq, name) {
	if (!Array.isArray(seq)) {
		throw new TypeError(`${name} must be an array of complex numbers { re, im }`);
	}
	if (seq.length === 0) {
		throw new RangeError(`${name} must be a non-empty array`);
	}
	for (let i = 0; i < seq.length; i++) {
		const z = seq[i];
		if (z === null || typeof z !== 'object' || Array.isArray(z)) {
			throw new TypeError(`${name}[${i}] must be a complex number object { re, im }`);
		}
		if (typeof z.re !== 'number' || typeof z.im !== 'number') {
			throw new TypeError(`${name}[${i}].re and ${name}[${i}].im must be numbers`);
		}
		if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
			throw new RangeError(`${name}[${i}].re and ${name}[${i}].im must be finite numbers`);
		}
	}
	return seq;
}

/**
 * Validate and normalize the optional configuration object.
 *
 * @param {unknown} options - Candidate options object.
 * @returns {{ mode: 'full' | 'same' | 'valid' | 'circular', method: 'auto' | 'cauchy' | 'spectral' }}
 */
function validateOptions(options) {
	if (options === undefined) {
		return { mode: 'full', method: 'auto' };
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object');
	}

	const { mode = 'full', method = 'auto' } = options;

	if (typeof mode !== 'string') {
		throw new TypeError('options.mode must be a string');
	}
	if (!VALID_MODES.has(mode)) {
		throw new RangeError(`options.mode must be one of: full, same, valid, circular (got "${mode}")`);
	}

	if (typeof method !== 'string') {
		throw new TypeError('options.method must be a string');
	}
	if (!VALID_METHODS.has(method)) {
		throw new RangeError(`options.method must be one of: auto, cauchy, spectral (got "${method}")`);
	}

	return { mode, method };
}

/**
 * Compute the smallest power of two greater than or equal to `n`.
 *
 * @param {number} n - Positive integer.
 * @returns {number}
 */
function nextPowerOfTwo(n) {
	let p = 1;
	while (p < n) {
		p *= 2;
	}
	return p;
}

/**
 * Normalize `-0` to `0` for clean output representation.
 *
 * @param {number} x
 * @returns {number}
 */
function cleanZero(x) {
	return x === 0 ? 0 : x;
}

/**
 * Convert parallel real/imaginary typed arrays into `{ re, im }` objects.
 *
 * @param {Float64Array} re
 * @param {Float64Array} im
 * @param {number} length
 * @returns {Array<{ re: number, im: number }>}
 */
function toComplexArray(re, im, length) {
	const result = new Array(length);
	for (let i = 0; i < length; i++) {
		result[i] = { re: cleanZero(re[i]), im: cleanZero(im[i]) };
	}
	return result;
}

/**
 * In-place iterative radix-2 Cooley-Tukey FFT / IFFT.
 *
 * @param {Float64Array} re - Real parts (length must be a power of two).
 * @param {Float64Array} im - Imaginary parts (same length as `re`).
 * @param {boolean} invert - `false` for forward DFT, `true` for inverse DFT.
 */
function fftInPlace(re, im, invert) {
	const n = re.length;
	if (n <= 1) {
		return;
	}

	// Bit-reversal permutation
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >>> 1;
		for (; (j & bit) !== 0; bit >>>= 1) {
			j ^= bit;
		}
		j ^= bit;
		if (i < j) {
			let tmp = re[i];
			re[i] = re[j];
			re[j] = tmp;
			tmp = im[i];
			im[i] = im[j];
			im[j] = tmp;
		}
	}

	// Precompute exact roots of unity for all butterfly stages to avoid trig drift
	const halfN = n >>> 1;
	const twiddleRe = new Float64Array(halfN);
	const twiddleIm = new Float64Array(halfN);
	const angleStep = (invert ? 2 : -2) * Math.PI / n;
	for (let k = 0; k < halfN; k++) {
		const angle = angleStep * k;
		twiddleRe[k] = Math.cos(angle);
		twiddleIm[k] = Math.sin(angle);
	}

	// Cooley-Tukey butterfly stages
	for (let len = 2; len <= n; len <<= 1) {
		const halfLen = len >>> 1;
		const tableStep = n / len;
		for (let i = 0; i < n; i += len) {
			for (let j = 0; j < halfLen; j++) {
				const twIdx = j * tableStep;
				const wRe = twiddleRe[twIdx];
				const wIm = twiddleIm[twIdx];

				const uIdx = i + j;
				const vIdx = uIdx + halfLen;

				const uRe = re[uIdx];
				const uIm = im[uIdx];
				const vRe = re[vIdx] * wRe - im[vIdx] * wIm;
				const vIm = re[vIdx] * wIm + im[vIdx] * wRe;

				re[uIdx] = uRe + vRe;
				im[uIdx] = uIm + vIm;
				re[vIdx] = uRe - vRe;
				im[vIdx] = uIm - vIm;
			}
		}
	}

	if (invert) {
		const invN = 1 / n;
		for (let i = 0; i < n; i++) {
			re[i] *= invN;
			im[i] *= invN;
		}
	}
}

/**
 * Full linear convolution using the Cauchy product of formal power series.
 *
 * @param {Array<{ re: number, im: number }>} a
 * @param {Array<{ re: number, im: number }>} b
 * @returns {{ re: Float64Array, im: Float64Array, length: number }}
 */
function cauchyLinearBuffers(a, b) {
	const m = a.length;
	const n = b.length;
	const length = m + n - 1;
	const outRe = new Float64Array(length);
	const outIm = new Float64Array(length);

	for (let j = 0; j < m; j++) {
		const aRe = a[j].re;
		const aIm = a[j].im;
		if (aRe === 0 && aIm === 0) {
			continue;
		}
		for (let k = 0; k < n; k++) {
			const bRe = b[k].re;
			const bIm = b[k].im;
			const idx = j + k;
			outRe[idx] += aRe * bRe - aIm * bIm;
			outIm[idx] += aRe * bIm + aIm * bRe;
		}
	}

	return { re: outRe, im: outIm, length };
}

/**
 * Circular convolution of length `max(a.length, b.length)` via the Cauchy product
 * reduced modulo `L`.
 *
 * @param {Array<{ re: number, im: number }>} a
 * @param {Array<{ re: number, im: number }>} b
 * @returns {Array<{ re: number, im: number }>}
 */
function cauchyCircular(a, b) {
	const m = a.length;
	const n = b.length;
	const length = Math.max(m, n);
	const outRe = new Float64Array(length);
	const outIm = new Float64Array(length);

	for (let j = 0; j < m; j++) {
		const aRe = a[j].re;
		const aIm = a[j].im;
		if (aRe === 0 && aIm === 0) {
			continue;
		}
		for (let k = 0; k < n; k++) {
			const bRe = b[k].re;
			const bIm = b[k].im;
			const idx = (j + k) % length;
			outRe[idx] += aRe * bRe - aIm * bIm;
			outIm[idx] += aRe * bIm + aIm * bRe;
		}
	}

	return toComplexArray(outRe, outIm, length);
}

/**
 * Pointwise spectral convolution of length `fftLen` (power of two).
 *
 * @param {Array<{ re: number, im: number }>} a
 * @param {Array<{ re: number, im: number }>} b
 * @param {number} fftLen - Power-of-two transform size >= max(a.length, b.length).
 * @returns {{ re: Float64Array, im: Float64Array }}
 */
function spectralConvolvePowerOfTwo(a, b, fftLen) {
	const aRe = new Float64Array(fftLen);
	const aIm = new Float64Array(fftLen);
	const bRe = new Float64Array(fftLen);
	const bIm = new Float64Array(fftLen);

	for (let i = 0; i < a.length; i++) {
		aRe[i] = a[i].re;
		aIm[i] = a[i].im;
	}
	for (let i = 0; i < b.length; i++) {
		bRe[i] = b[i].re;
		bIm[i] = b[i].im;
	}

	fftInPlace(aRe, aIm, false);
	fftInPlace(bRe, bIm, false);

	const cRe = new Float64Array(fftLen);
	const cIm = new Float64Array(fftLen);
	for (let i = 0; i < fftLen; i++) {
		cRe[i] = aRe[i] * bRe[i] - aIm[i] * bIm[i];
		cIm[i] = aRe[i] * bIm[i] + aIm[i] * bRe[i];
	}

	fftInPlace(cRe, cIm, true);
	return { re: cRe, im: cIm };
}

/**
 * Full linear convolution using the spectral convolution theorem (FFT).
 *
 * @param {Array<{ re: number, im: number }>} a
 * @param {Array<{ re: number, im: number }>} b
 * @returns {{ re: Float64Array, im: Float64Array, length: number }}
 */
function spectralLinearBuffers(a, b) {
	const length = a.length + b.length - 1;
	const fftLen = nextPowerOfTwo(length);
	const { re, im } = spectralConvolvePowerOfTwo(a, b, fftLen);
	return { re, im, length };
}

/**
 * Circular convolution of length `L = max(a.length, b.length)` via the spectral
 * convolution theorem. For power-of-two `L`, applies the size-`L` FFT directly;
 * for arbitrary `L`, folds the zero-padded spectral linear convolution modulo `L`
 * using the exact identity `(a (*) b)[n] = (a * b)[n] + (a * b)[n + L]`.
 *
 * @param {Array<{ re: number, im: number }>} a
 * @param {Array<{ re: number, im: number }>} b
 * @returns {Array<{ re: number, im: number }>}
 */
function spectralCircular(a, b) {
	const length = Math.max(a.length, b.length);
	if ((length & (length - 1)) === 0) {
		const { re, im } = spectralConvolvePowerOfTwo(a, b, length);
		return toComplexArray(re, im, length);
	}

	const linear = spectralLinearBuffers(a, b);
	const outRe = new Float64Array(length);
	const outIm = new Float64Array(length);
	for (let i = 0; i < linear.length; i++) {
		const idx = i % length;
		outRe[idx] += linear.re[i];
		outIm[idx] += linear.im[i];
	}
	return toComplexArray(outRe, outIm, length);
}

/**
 * Compute the discrete convolution of two complex sequences `{ re, im }` using
 * the Cauchy power-series product and/or the spectral (FFT) convolution identity.
 *
 * Modes:
 * - `'full'` (default): Complete discrete linear convolution of length `a.length + b.length - 1`.
 * - `'same'`: Central segment of `'full'` having length `a.length`, starting at
 *   `Math.floor((b.length - 1) / 2)`.
 * - `'valid'`: Only fully overlapping terms with no zero-padding, length
 *   `Math.abs(a.length - b.length) + 1`, starting at `Math.min(a.length, b.length) - 1`.
 * - `'circular'`: Cyclic convolution of length `Math.max(a.length, b.length)` with
 *   the shorter input zero-padded on the right.
 *
 * Methods:
 * - `'auto'` (default): Uses `'cauchy'` when `a.length * b.length <= 256` and `'spectral'`
 *   otherwise.
 * - `'cauchy'`: Direct Cauchy product of formal power series (`O(M * N)`).
 * - `'spectral'`: Radix-2 Cooley-Tukey FFT convolution identity (`O(L log L)`).
 *
 * @param {Array<{ re: number, im: number }>} a - First complex input sequence (non-empty).
 * @param {Array<{ re: number, im: number }>} b - Second complex input sequence (non-empty).
 * @param {{
 *   mode?: 'full' | 'same' | 'valid' | 'circular',
 *   method?: 'auto' | 'cauchy' | 'spectral'
 * }} [options] - Optional convolution mode and algorithm selection.
 * @returns {Array<{ re: number, im: number }>} Resulting convolved complex sequence.
 * @throws {TypeError} If inputs or options have invalid types.
 * @throws {RangeError} If sequences are empty, contain non-finite values, or options have invalid values.
 */
export function convolutionComplexSeries(a, b, options) {
	validateComplexSequence(a, 'a');
	validateComplexSequence(b, 'b');
	const { mode, method } = validateOptions(options);

	const useSpectral =
		method === 'spectral' ||
		(method === 'auto' && a.length * b.length > SPECTRAL_PRODUCT_THRESHOLD);

	if (mode === 'circular') {
		return useSpectral ? spectralCircular(a, b) : cauchyCircular(a, b);
	}

	const linear = useSpectral ? spectralLinearBuffers(a, b) : cauchyLinearBuffers(a, b);

	if (mode === 'full') {
		return toComplexArray(linear.re, linear.im, linear.length);
	}

	let start;
	let outLen;
	if (mode === 'same') {
		start = Math.floor((b.length - 1) / 2);
		outLen = a.length;
	} else {
		// mode === 'valid'
		start = Math.min(a.length, b.length) - 1;
		outLen = Math.abs(a.length - b.length) + 1;
	}

	const result = new Array(outLen);
	for (let i = 0; i < outLen; i++) {
		result[i] = {
			re: cleanZero(linear.re[start + i]),
			im: cleanZero(linear.im[start + i]),
		};
	}
	return result;
}
