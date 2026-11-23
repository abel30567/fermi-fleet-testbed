/**
 * @typedef {{ v: number, d: number }} DualNumber
 * A forward-mode dual number `v + d * ε` (with `ε² = 0`), where `v` is the
 * primal value and `d` is the forward-mode derivative.
 */

/**
 * @typedef {{ re: DualNumber, im: DualNumber }} ComplexDualNumber
 * A complex number whose real and imaginary components are dual numbers.
 */

/**
 * @typedef {object} FourierTransformOptions
 * @property {boolean} [inverse=false]
 *   When `true`, computes the inverse Discrete Fourier Transform (IDFT) using
 *   positive exponent `+2πikn/N`.
 * @property {'standard'|'unitary'|'none'} [normalization='standard']
 *   Scaling convention:
 *   - `'standard'`: scale by `1` for forward DFT and `1 / N` for inverse DFT.
 *   - `'unitary'`: scale by `1 / Math.sqrt(N)` for both forward and inverse DFT.
 *   - `'none'`: scale by `1` for both forward and inverse DFT.
 */

/**
 * Normalizes `-0` to `+0`.
 *
 * @param {number} x
 * @returns {number}
 */
function cleanZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Adds two dual numbers: `(a.v + a.d ε) + (b.v + b.d ε)`.
 *
 * @param {DualNumber} a
 * @param {DualNumber} b
 * @returns {DualNumber}
 */
function dualAdd(a, b) {
	return { v: a.v + b.v, d: a.d + b.d }
}

/**
 * Subtracts two dual numbers: `(a.v + a.d ε) - (b.v + b.d ε)`.
 *
 * @param {DualNumber} a
 * @param {DualNumber} b
 * @returns {DualNumber}
 */
function dualSub(a, b) {
	return { v: a.v - b.v, d: a.d - b.d }
}

/**
 * Multiplies two dual numbers: `(a.v + a.d ε) * (b.v + b.d ε)`.
 *
 * @param {DualNumber} a
 * @param {DualNumber} b
 * @returns {DualNumber}
 */
function dualMul(a, b) {
	return {
		v: a.v * b.v,
		d: a.v * b.d + a.d * b.v,
	}
}

/**
 * Scales a dual number by a finite real constant.
 *
 * @param {DualNumber} a
 * @param {number} factor
 * @returns {DualNumber}
 */
function dualScale(a, factor) {
	return {
		v: cleanZero(a.v * factor),
		d: cleanZero(a.d * factor),
	}
}

/**
 * Validates that `value` is a dual number `{ v, d }` with finite numeric fields.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {DualNumber}
 */
function validateDual(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be a dual number object { v, d }`)
	}
	const { v, d } = value
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(`${label} must have numeric 'v' and 'd' properties`)
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(`${label} 'v' and 'd' must be finite numbers`)
	}
	return { v, d }
}

/**
 * Validates and normalizes an input element into a `ComplexDualNumber`.
 * Accepts either a real dual number `{ v, d }` or a complex dual number
 * `{ re: { v, d }, im: { v, d } }`.
 *
 * @param {unknown} element
 * @param {number} index
 * @returns {ComplexDualNumber}
 */
function validateSignalElement(element, index) {
	const label = `signal[${index}]`
	if (typeof element !== 'object' || element === null || Array.isArray(element)) {
		throw new TypeError(
			`${label} must be a dual number { v, d } or complex dual number { re, im }`,
		)
	}

	const hasComplexKeys = 're' in element || 'im' in element
	const hasDualKeys = 'v' in element || 'd' in element

	if (hasComplexKeys && hasDualKeys) {
		throw new TypeError(
			`${label} cannot mix real dual keys { v, d } and complex dual keys { re, im }`,
		)
	}

	if (hasComplexKeys) {
		return {
			re: validateDual(element.re, `${label}.re`),
			im: validateDual(element.im, `${label}.im`),
		}
	}

	return {
		re: validateDual(element, label),
		im: { v: 0, d: 0 },
	}
}

/**
 * Validates the options object and returns resolved option values.
 *
 * @param {unknown} options
 * @returns {{ inverse: boolean, normalization: 'standard'|'unitary'|'none' }}
 */
function validateOptions(options) {
	if (options === undefined) {
		return { inverse: false, normalization: 'standard' }
	}
	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('options must be a plain object when provided')
	}

	const { inverse = false, normalization = 'standard' } = options

	if (typeof inverse !== 'boolean') {
		throw new TypeError('options.inverse must be a boolean')
	}
	if (typeof normalization !== 'string') {
		throw new TypeError('options.normalization must be a string')
	}
	if (
		normalization !== 'standard' &&
		normalization !== 'unitary' &&
		normalization !== 'none'
	) {
		throw new RangeError(
			"options.normalization must be one of 'standard', 'unitary', or 'none'",
		)
	}

	return { inverse, normalization }
}

/**
 * Computes the Discrete Fourier Transform (or inverse DFT) of a sequence of
 * dual numbers `{ v, d }` (or complex dual numbers `{ re: { v, d }, im: { v, d } }`)
 * using a straightforward iterative O(N²) implementation.
 *
 * Each element carries a forward-mode derivative `d` alongside its primal value `v`:
 *
 *   X[k] = scale * Σ_{n=0}^{N-1} x[n] * exp(±i * 2π * k * n / N)
 *
 * where the exponent sign is `-` for the forward DFT (`inverse: false`) and `+`
 * for the inverse DFT (`inverse: true`). Arithmetic is performed over dual
 * numbers so that every output frequency bin returns both its complex value and
 * its exact forward-mode complex derivative.
 *
 * @param {Array<DualNumber | ComplexDualNumber>} signal
 *   Input sequence of real dual numbers `{ v, d }` or complex dual numbers
 *   `{ re: { v, d }, im: { v, d } }`. May be empty.
 * @param {FourierTransformOptions} [options]
 *   Optional transform configuration.
 * @returns {ComplexDualNumber[]}
 *   Array of length `signal.length` containing complex dual frequency bins
 *   `{ re: { v, d }, im: { v, d } }`.
 * @throws {TypeError} If `signal` is not an array, contains sparse holes or
 *   malformed elements, or if `options` has invalid types.
 * @throws {RangeError} If any dual component is non-finite (`NaN`, `±Infinity`),
 *   or if `options.normalization` is unrecognized.
 */
export function fourierTransformDualIterative(signal, options) {
	if (!Array.isArray(signal)) {
		throw new TypeError('signal must be an array of dual numbers')
	}

	const { inverse, normalization } = validateOptions(options)
	const n = signal.length

	const normalized = new Array(n)
	for (let i = 0; i < n; i++) {
		if (!(i in signal)) {
			throw new TypeError(`signal[${i}] must not be a sparse array hole`)
		}
		normalized[i] = validateSignalElement(signal[i], i)
	}

	if (n === 0) {
		return []
	}

	const angleSign = inverse ? 1 : -1
	const twoPiOverN = (2 * Math.PI) / n

	let scale = 1
	if (normalization === 'standard') {
		scale = inverse ? 1 / n : 1
	} else if (normalization === 'unitary') {
		scale = 1 / Math.sqrt(n)
	}

	const result = new Array(n)

	for (let k = 0; k < n; k++) {
		let sumRe = { v: 0, d: 0 }
		let sumIm = { v: 0, d: 0 }

		for (let j = 0; j < n; j++) {
			const angle = angleSign * twoPiOverN * k * j
			const twiddleRe = { v: Math.cos(angle), d: 0 }
			const twiddleIm = { v: Math.sin(angle), d: 0 }

			const x = normalized[j]
			// Complex dual product: (x.re + i * x.im) * (twiddleRe + i * twiddleIm)
			const prodRe = dualSub(
				dualMul(x.re, twiddleRe),
				dualMul(x.im, twiddleIm),
			)
			const prodIm = dualAdd(
				dualMul(x.re, twiddleIm),
				dualMul(x.im, twiddleRe),
			)

			sumRe = dualAdd(sumRe, prodRe)
			sumIm = dualAdd(sumIm, prodIm)
		}

		result[k] = {
			re: dualScale(sumRe, scale),
			im: dualScale(sumIm, scale),
		}
	}

	return result
}
