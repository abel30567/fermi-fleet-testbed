/**
 * @typedef {{ re: number, im: number }} Complex
 *   A complex number represented by finite real (`re`) and imaginary (`im`) parts.
 *
 * @typedef {{ z: Complex, fz: Complex }} ComplexSample
 *   A pre-evaluated contour sample pairing a complex path point `z` with its integrand value `fz = f(z)`.
 *
 * @typedef {{ initial?: Complex }} IntegralOptions
 *   Optional configuration for `integralComplexLazy`.
 */

/**
 * Normalizes `-0` to `0`.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Validates that a value is a complex number `{ re, im }` with finite numeric components.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Complex}
 */
function validateComplex(value, label) {
	if (typeof value !== 'object' || value === null) {
		throw new TypeError(`${label} must be a non-null complex object { re, im }`)
	}
	const { re, im } = /** @type {{ re: unknown, im: unknown }} */ (value)
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${label} must have numeric "re" and "im" properties`)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${label} must have finite "re" and "im" values`)
	}
	return { re, im }
}

/**
 * Validates that a value is a non-string iterable.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Iterable<unknown>}
 */
function validateIterable(value, label) {
	if (
		value === null ||
		value === undefined ||
		typeof value === 'string' ||
		typeof (/** @type {any} */ (value))[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(`${label} must be a non-string iterable`)
	}
	return /** @type {Iterable<unknown>} */ (value)
}

/**
 * Validates optional configuration `{ initial }`.
 *
 * @param {unknown} options
 * @returns {{ initial: Complex }}
 */
function validateOptions(options) {
	if (options === undefined) {
		return { initial: { re: 0, im: 0 } }
	}
	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('options must be a plain object when provided')
	}
	const { initial } = /** @type {{ initial?: unknown }} */ (options)
	if (initial === undefined) {
		return { initial: { re: 0, im: 0 } }
	}
	return { initial: validateComplex(initial, 'options.initial') }
}

/**
 * Validates a `{ z, fz }` sample object.
 *
 * @param {unknown} sample
 * @param {number} index
 * @returns {ComplexSample}
 */
function validateSample(sample, index) {
	if (typeof sample !== 'object' || sample === null) {
		throw new TypeError(`samples[${index}] must be a non-null object { z, fz }`)
	}
	const { z, fz } = /** @type {{ z: unknown, fz: unknown }} */ (sample)
	return {
		z: validateComplex(z, `samples[${index}].z`),
		fz: validateComplex(fz, `samples[${index}].fz`),
	}
}

/**
 * Internal generator performing cumulative complex trapezoidal integration with
 * Neumaier compensated summation for improved floating-point accuracy on long contours.
 *
 * @param {((z: Complex) => Complex) | null} fn
 * @param {Iterable<unknown>} source
 * @param {Complex} initial
 * @returns {Generator<Complex, void, void>}
 */
function* integrateStream(fn, source, initial) {
	let sumRe = initial.re
	let sumIm = initial.im
	let compRe = 0
	let compIm = 0

	/** @type {Complex | null} */
	let prevZ = null
	/** @type {Complex | null} */
	let prevF = null
	let index = 0

	for (const item of source) {
		/** @type {Complex} */
		let currZ
		/** @type {Complex} */
		let currF

		if (fn !== null) {
			currZ = validateComplex(item, `path[${index}]`)
			currF = validateComplex(fn(currZ), `fn(path[${index}])`)
		} else {
			const sample = validateSample(item, index)
			currZ = sample.z
			currF = sample.fz
		}

		if (prevZ === null || prevF === null) {
			prevZ = currZ
			prevF = currF
			index += 1
			yield {
				re: normalizeZero(sumRe),
				im: normalizeZero(sumIm),
			}
			continue
		}

		const dzRe = currZ.re - prevZ.re
		const dzIm = currZ.im - prevZ.im
		const avgRe = 0.5 * (prevF.re + currF.re)
		const avgIm = 0.5 * (prevF.im + currF.im)

		// Complex trapezoidal increment: 0.5 * (f(z_k) + f(z_{k+1})) * (z_{k+1} - z_k)
		const stepRe = avgRe * dzRe - avgIm * dzIm
		const stepIm = avgRe * dzIm + avgIm * dzRe

		const nextSumRe = sumRe + stepRe
		compRe +=
			Math.abs(sumRe) >= Math.abs(stepRe)
				? sumRe - nextSumRe + stepRe
				: stepRe - nextSumRe + sumRe
		sumRe = nextSumRe

		const nextSumIm = sumIm + stepIm
		compIm +=
			Math.abs(sumIm) >= Math.abs(stepIm)
				? sumIm - nextSumIm + stepIm
				: stepIm - nextSumIm + sumIm
		sumIm = nextSumIm

		const totalRe = sumRe + compRe
		const totalIm = sumIm + compIm

		if (!Number.isFinite(totalRe) || !Number.isFinite(totalIm)) {
			throw new RangeError(
				`Complex integral overflowed to a non-finite value at index ${index}`
			)
		}

		prevZ = currZ
		prevF = currF
		index += 1

		yield {
			re: normalizeZero(totalRe),
			im: normalizeZero(totalIm),
		}
	}
}

/**
 * Lazily computes the cumulative complex contour/path integral using the composite
 * trapezoidal rule over complex numbers represented as `{ re, im }`.
 *
 * Supports two call signatures:
 * 1. `integralComplexLazy(fn, path, options?)` — evaluates `fn(z)` lazily for each
 *    complex point `z` in the iterable `path`.
 * 2. `integralComplexLazy(samples, options?)` — lazily consumes an iterable of
 *    pre-evaluated `{ z, fz }` complex sample objects.
 *
 * For input sequence `z_0, z_1, ..., z_{n-1}` (with values `f_k = f(z_k)`), the
 * returned generator yields running partial integrals `I_0, I_1, ..., I_{n-1}`:
 * - Empty input (0 points) yields nothing.
 * - First point `z_0` yields `{ re: initial.re, im: initial.im }` (default `{ re: 0, im: 0 }`).
 * - Each subsequent point `z_{k+1}` adds `0.5 * (f_k + f_{k+1}) * (z_{k+1} - z_k)`
 *   using complex multiplication and Neumaier compensated summation, and yields the
 *   updated `{ re, im }` partial integral.
 *
 * Each call to `.next()` pulls at most one element from the input iterable, enabling
 * O(1) memory streaming and safe consumption of infinite generators. Top-level
 * arguments are validated eagerly when `integralComplexLazy` is invoked; individual
 * elements are validated lazily as they are consumed.
 *
 * @overload
 * @param {(z: Complex) => Complex} fn - Complex integrand evaluated lazily at each contour point.
 * @param {Iterable<Complex>} path - Iterable of complex contour points `{ re, im }`.
 * @param {IntegralOptions} [options] - Optional configuration (`{ initial }`).
 * @returns {Generator<Complex, void, void>} Generator yielding cumulative complex integrals `{ re, im }`.
 *
 * @overload
 * @param {Iterable<ComplexSample>} samples - Iterable of pre-evaluated `{ z, fz }` complex samples.
 * @param {IntegralOptions} [options] - Optional configuration (`{ initial }`).
 * @returns {Generator<Complex, void, void>} Generator yielding cumulative complex integrals `{ re, im }`.
 *
 * @param {((z: Complex) => Complex) | Iterable<ComplexSample>} fnOrSamples
 * @param {Iterable<Complex> | IntegralOptions} [pathOrOptions]
 * @param {IntegralOptions} [maybeOptions]
 * @returns {Generator<Complex, void, void>}
 */
export function integralComplexLazy(fnOrSamples, pathOrOptions, maybeOptions) {
	if (typeof fnOrSamples === 'function') {
		const path = validateIterable(pathOrOptions, 'path')
		const { initial } = validateOptions(maybeOptions)
		return integrateStream(fnOrSamples, path, initial)
	}

	if (fnOrSamples === null || fnOrSamples === undefined) {
		throw new TypeError(
			'First argument must be an integrand function or a non-string iterable of { z, fz } samples'
		)
	}

	const samples = validateIterable(fnOrSamples, 'samples')
	const { initial } = validateOptions(pathOrOptions)
	return integrateStream(null, samples, initial)
}
