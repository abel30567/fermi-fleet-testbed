/**
 * @fileoverview Lazy, streaming Discrete Fourier Transform (DFT) over exact BigInt
 * integers using fixed-point BigInt arithmetic scaled by 10^18 (by default).
 *
 * All trigonometric twiddle factors are computed in pure arbitrary-precision
 * BigInt arithmetic (Machin's formula for pi + octant-reduced Taylor series)
 * with adaptive guard digits, achieving full 10^-18 fixed-point precision even
 * for arbitrarily large BigInt inputs and irrational frequencies.
 *
 * @module ops/advanced/fourierTransformBigIntLazy
 */

/**
 * Default fixed-point scale factor: 10^18.
 * @type {bigint}
 */
export const FIXED_POINT_SCALE = 10n ** 18n

/**
 * Complex number represented in fixed-point BigInt coordinates.
 * @typedef {{ re: bigint, im: bigint }} BigIntComplex
 */

/**
 * Input sample accepted by `fourierTransformBigIntLazy`: either a real BigInt
 * or a complex object with a BigInt `re` field and optional BigInt `im` field.
 * @typedef {bigint | { re: bigint, im?: bigint }} BigIntSample
 */

/**
 * Configuration options for `fourierTransformBigIntLazy`.
 * @typedef {Object} FourierTransformOptions
 * @property {boolean} [inverse=false] - Compute the inverse DFT (positive exponent and 1/N normalization).
 * @property {boolean} [inputScaled=false] - Treat input samples as already scaled by `scale` rather than exact integers.
 * @property {number} [maxLength] - Maximum number of samples to lazily consume from the input iterable (enables infinite streams).
 * @property {bigint} [scale=10n**18n] - Positive BigInt fixed-point scale factor for output values (and input values if `inputScaled` is true).
 * @property {Iterable<number|bigint>} [bins] - Optional lazy iterable of specific frequency bin indices `k` in `[0, N - 1]` to compute on demand.
 */

/**
 * Symmetric round-half-away-from-zero division for BigInt with `den > 0n`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {bigint}
 */
function roundDiv(num, den) {
	const q = num / den
	const r = num % den
	if (num >= 0n) {
		return r * 2n >= den ? q + 1n : q
	}
	return -r * 2n >= den ? q - 1n : q
}

/**
 * Computes floor(log10(|n|)) + 1 for a non-zero BigInt, or 1 for 0n.
 *
 * @param {bigint} n
 * @returns {number}
 */
function decimalDigits(n) {
	const abs = n < 0n ? -n : n
	return abs.toString().length
}

/**
 * Computes arctan(1 / q) scaled by `scale` using pure BigInt Taylor series.
 *
 * @param {bigint} q
 * @param {bigint} scale
 * @returns {bigint}
 */
function arctanInv(q, scale) {
	const q2 = q * q
	let power = scale / q
	let sum = power
	let j = 1n
	while (power > 0n) {
		power /= q2
		const term = power / (2n * j + 1n)
		if (term === 0n) break
		sum = j % 2n === 1n ? sum - term : sum + term
		j += 1n
	}
	return sum
}

/** Cache of pi scaled by 10^digits for reuse across calls. */
const piCache = new Map()

/**
 * Computes pi scaled by 10^digits using Machin's formula:
 * pi / 4 = 4 * arctan(1 / 5) - arctan(1 / 239).
 *
 * @param {number} digits
 * @returns {bigint}
 */
function getPiScaled(digits) {
	const cached = piCache.get(digits)
	if (cached !== undefined) return cached

	const guard = 10n ** 8n
	const workScale = 10n ** BigInt(digits) * guard
	const piExtra = 4n * (4n * arctanInv(5n, workScale) - arctanInv(239n, workScale))
	const pi = roundDiv(piExtra, guard)
	piCache.set(digits, pi)
	return pi
}

// Pre-warm cache for the common precision tier (48 decimal digits).
getPiScaled(48)

/**
 * Computes (cos(u), sin(u)) for u in [0, pi/4], where `u` is scaled by `workScale`.
 *
 * @param {bigint} u
 * @param {bigint} workScale
 * @returns {{ cos: bigint, sin: bigint }}
 */
function cosSinSmallAngle(u, workScale) {
	if (u === 0n) {
		return { cos: workScale, sin: 0n }
	}

	const scale2 = workScale * workScale
	const u2 = u * u

	// cos(u) = sum_{j>=0} (-1)^j u^(2j) / (2j)!
	let cosTerm = workScale
	let cosSum = cosTerm
	for (let j = 1n; ; j += 1n) {
		cosTerm = (cosTerm * u2) / (scale2 * (2n * j - 1n) * (2n * j))
		if (cosTerm === 0n) break
		cosSum = j % 2n === 1n ? cosSum - cosTerm : cosSum + cosTerm
	}

	// sin(u) = sum_{j>=0} (-1)^j u^(2j+1) / (2j+1)!
	let sinTerm = u
	let sinSum = sinTerm
	for (let j = 1n; ; j += 1n) {
		sinTerm = (sinTerm * u2) / (scale2 * (2n * j) * (2n * j + 1n))
		if (sinTerm === 0n) break
		sinSum = j % 2n === 1n ? sinSum - sinTerm : sinSum + sinTerm
	}

	return { cos: cosSum, sin: sinSum }
}

/**
 * Computes (cos(2*pi*m/N), sin(2*pi*m/N)) scaled by `trigScale` using exact
 * integer octant reduction so cardinal angles (0, pi/2, pi, 3*pi/2) are exact.
 *
 * @param {bigint} m - Integer in [0, N - 1].
 * @param {bigint} N - Positive integer length.
 * @param {bigint} twoPiExtra - 2*pi scaled by `trigScale * extraGuard`.
 * @param {bigint} extraScale - `trigScale * extraGuard`.
 * @param {bigint} extraGuard - Guard factor to divide out after Taylor series.
 * @returns {{ cos: bigint, sin: bigint }}
 */
function trigForFraction(m, N, twoPiExtra, extraScale, extraGuard) {
	const m8 = 8n * m
	let cosExtra
	let sinExtra

	if (m8 <= N) {
		const u = roundDiv(twoPiExtra * m, N)
		const { cos, sin } = cosSinSmallAngle(u, extraScale)
		cosExtra = cos
		sinExtra = sin
	} else if (m8 <= 2n * N) {
		const u = roundDiv(twoPiExtra * (N - 4n * m), 4n * N)
		const { cos, sin } = cosSinSmallAngle(u, extraScale)
		cosExtra = sin
		sinExtra = cos
	} else if (m8 <= 3n * N) {
		const u = roundDiv(twoPiExtra * (4n * m - N), 4n * N)
		const { cos, sin } = cosSinSmallAngle(u, extraScale)
		cosExtra = -sin
		sinExtra = cos
	} else if (m8 <= 4n * N) {
		const u = roundDiv(twoPiExtra * (N - 2n * m), 2n * N)
		const { cos, sin } = cosSinSmallAngle(u, extraScale)
		cosExtra = -cos
		sinExtra = sin
	} else if (m8 <= 5n * N) {
		const u = roundDiv(twoPiExtra * (2n * m - N), 2n * N)
		const { cos, sin } = cosSinSmallAngle(u, extraScale)
		cosExtra = -cos
		sinExtra = -sin
	} else if (m8 <= 6n * N) {
		const u = roundDiv(twoPiExtra * (3n * N - 4n * m), 4n * N)
		const { cos, sin } = cosSinSmallAngle(u, extraScale)
		cosExtra = -sin
		sinExtra = -cos
	} else if (m8 <= 7n * N) {
		const u = roundDiv(twoPiExtra * (4n * m - 3n * N), 4n * N)
		const { cos, sin } = cosSinSmallAngle(u, extraScale)
		cosExtra = sin
		sinExtra = -cos
	} else {
		const u = roundDiv(twoPiExtra * (N - m), N)
		const { cos, sin } = cosSinSmallAngle(u, extraScale)
		cosExtra = cos
		sinExtra = -sin
	}

	return {
		cos: roundDiv(cosExtra, extraGuard),
		sin: roundDiv(sinExtra, extraGuard),
	}
}

/**
 * Validates that a value is a non-string iterable.
 *
 * @param {unknown} value
 * @param {string} name
 */
function assertIterable(value, name) {
	if (
		value === null ||
		value === undefined ||
		typeof value === 'string' ||
		typeof value[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(`${name} must be a non-string iterable`)
	}
}

/**
 * Validates and normalizes an individual sample to `{ re: bigint, im: bigint }`.
 *
 * @param {unknown} value
 * @param {number} index
 * @returns {BigIntComplex}
 */
function normalizeSample(value, index) {
	if (typeof value === 'bigint') {
		return { re: value, im: 0n }
	}
	if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
		const { re, im = 0n } = value
		if (typeof re !== 'bigint') {
			throw new TypeError(
				`Sample at index ${index} must have a bigint 're' property`,
			)
		}
		if (typeof im !== 'bigint') {
			throw new TypeError(
				`Sample at index ${index} must have a bigint 'im' property when provided`,
			)
		}
		return { re, im }
	}
	throw new TypeError(
		`Sample at index ${index} must be a bigint or { re: bigint, im?: bigint }`,
	)
}

/**
 * Validates and normalizes a bin index `k` to a BigInt in `[0, N - 1]`.
 *
 * @param {unknown} rawK
 * @param {bigint} N
 * @returns {bigint}
 */
function normalizeBinIndex(rawK, N) {
	let k
	if (typeof rawK === 'bigint') {
		k = rawK
	} else if (typeof rawK === 'number') {
		if (!Number.isInteger(rawK) || !Number.isSafeInteger(rawK)) {
			throw new RangeError(`Bin index must be a safe integer, got ${rawK}`)
		}
		k = BigInt(rawK)
	} else {
		throw new TypeError(`Bin index must be an integer number or bigint`)
	}

	if (k < 0n || k >= N) {
		throw new RangeError(
			`Bin index ${k} out of range for transform length ${N}`,
		)
	}
	return k
}

/**
 * Validates options eagerly before returning the lazy generator.
 *
 * @param {FourierTransformOptions | undefined} options
 */
function validateOptions(options) {
	if (options === undefined) {
		return {
			inverse: false,
			inputScaled: false,
			maxLength: undefined,
			scale: FIXED_POINT_SCALE,
			bins: undefined,
		}
	}
	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('options must be a plain object')
	}

	const {
		inverse = false,
		inputScaled = false,
		maxLength = undefined,
		scale = FIXED_POINT_SCALE,
		bins = undefined,
	} = options

	if (typeof inverse !== 'boolean') {
		throw new TypeError('options.inverse must be a boolean')
	}
	if (typeof inputScaled !== 'boolean') {
		throw new TypeError('options.inputScaled must be a boolean')
	}
	if (maxLength !== undefined) {
		if (typeof maxLength !== 'number') {
			throw new TypeError('options.maxLength must be a number')
		}
		if (!Number.isInteger(maxLength) || maxLength < 0 || !Number.isSafeInteger(maxLength)) {
			throw new RangeError('options.maxLength must be a non-negative safe integer')
		}
	}
	if (typeof scale !== 'bigint') {
		throw new TypeError('options.scale must be a bigint')
	}
	if (scale <= 0n) {
		throw new RangeError('options.scale must be a positive bigint')
	}
	if (bins !== undefined) {
		assertIterable(bins, 'options.bins')
	}

	return { inverse, inputScaled, maxLength, scale, bins }
}

/**
 * Internal generator performing deferred input consumption and lazy per-bin DFT evaluation.
 *
 * @param {Iterable<BigIntSample>} samples
 * @param {{ inverse: boolean, inputScaled: boolean, maxLength: number|undefined, scale: bigint, bins: Iterable<number|bigint>|undefined }} config
 * @returns {Generator<BigIntComplex, void, undefined>}
 */
function* fourierTransformGenerator(samples, config) {
	const { inverse, inputScaled, maxLength, scale, bins } = config

	// Lazily consume input samples only when iteration begins, honoring maxLength.
	const buffer = []
	let maxAbs = 0n

	if (maxLength === undefined || maxLength > 0) {
		const iterator = samples[Symbol.iterator]()
		let exhausted = false
		try {
			while (maxLength === undefined || buffer.length < maxLength) {
				const step = iterator.next()
				if (step.done) {
					exhausted = true
					break
				}
				const sample = normalizeSample(step.value, buffer.length)
				const absRe = sample.re < 0n ? -sample.re : sample.re
				const absIm = sample.im < 0n ? -sample.im : sample.im
				if (absRe > maxAbs) maxAbs = absRe
				if (absIm > maxAbs) maxAbs = absIm
				buffer.push(sample)
			}
		} finally {
			if (!exhausted && typeof iterator.return === 'function') {
				iterator.return()
			}
		}
	}

	const len = buffer.length
	const N = BigInt(len)

	if (len === 0) {
		// If explicit bin indices were provided, validate lazily (any bin index is out of range for N=0).
		if (bins !== undefined) {
			const binIter = bins[Symbol.iterator]()
			let binExhausted = false
			try {
				const step = binIter.next()
				if (step.done) {
					binExhausted = true
				} else {
					normalizeBinIndex(step.value, 0n)
				}
			} finally {
				if (!binExhausted && typeof binIter.return === 'function') {
					binIter.return()
				}
			}
		}
		return
	}

	// Determine internal precision dynamically so results are accurate to the last ULP of `scale`
	// even for very large BigInt inputs or large N.
	const scaleDigits = decimalDigits(scale)
	const inputDigits = inputScaled
		? Math.max(0, decimalDigits(maxAbs) - scaleDigits + 1)
		: decimalDigits(maxAbs)
	const nDigits = decimalDigits(N)
	const trigDigits = Math.max(36, scaleDigits + inputDigits + nDigits + 12)
	const extraGuardDigits = 12
	const piDigits = Math.max(48, trigDigits + extraGuardDigits)

	const trigScale = 10n ** BigInt(trigDigits)
	const extraGuard = 10n ** BigInt(extraGuardDigits)
	const extraScale = trigScale * extraGuard
	const piExtra =
		piDigits === trigDigits + extraGuardDigits
			? getPiScaled(piDigits)
			: roundDiv(getPiScaled(piDigits), 10n ** BigInt(piDigits - (trigDigits + extraGuardDigits)))
	const twoPiExtra = 2n * piExtra

	// Exact denominator for converting accumulated sum back to fixed-point scaled by `scale`.
	// If inputScaled is false: sum is scaled by `trigScale`; multiply by `scale`, divide by `trigScale` (and `N` if inverse).
	// If inputScaled is true:  sum is scaled by `scale * trigScale`; divide by `trigScale` (and `N` if inverse).
	const outDen = inverse ? trigScale * N : trigScale
	const outNumScale = inputScaled ? 1n : scale

	/** Lazy memoized trig table keyed by `m = (k * n) % N`. */
	const trigCache = new Map()
	const getTrig = (m) => {
		let entry = trigCache.get(m)
		if (entry === undefined) {
			entry = trigForFraction(m, N, twoPiExtra, extraScale, extraGuard)
			trigCache.set(m, entry)
		}
		return entry
	}

	const computeBin = (k) => {
		let sumRe = 0n
		let sumIm = 0n

		for (let n = 0; n < len; n += 1) {
			const { re: a, im: b } = buffer[n]
			if (a === 0n && b === 0n) continue

			const m = (k * BigInt(n)) % N
			const { cos, sin } = getTrig(m)

			if (inverse) {
				// (a + i*b) * (cos + i*sin) = (a*cos - b*sin) + i*(b*cos + a*sin)
				sumRe += a * cos - b * sin
				sumIm += b * cos + a * sin
			} else {
				// (a + i*b) * (cos - i*sin) = (a*cos + b*sin) + i*(b*cos - a*sin)
				sumRe += a * cos + b * sin
				sumIm += b * cos - a * sin
			}
		}

		return {
			re: roundDiv(sumRe * outNumScale, outDen),
			im: roundDiv(sumIm * outNumScale, outDen),
		}
	}

	if (bins !== undefined) {
		const binIter = bins[Symbol.iterator]()
		let binExhausted = false
		try {
			while (true) {
				const step = binIter.next()
				if (step.done) {
					binExhausted = true
					break
				}
				const k = normalizeBinIndex(step.value, N)
				yield computeBin(k)
			}
		} finally {
			if (!binExhausted && typeof binIter.return === 'function') {
				binIter.return()
			}
		}
		return
	}

	for (let k = 0n; k < N; k += 1n) {
		yield computeBin(k)
	}
}

/**
 * Computes the Discrete Fourier Transform (or inverse DFT) over exact BigInt
 * inputs using a lazy, streaming generator-based implementation.
 *
 * Input consumption is deferred until the returned generator is iterated, and
 * output frequency bins are computed one at a time on demand. Output values are
 * fixed-point BigInt complex numbers `{ re, im }` scaled by `options.scale`
 * (default `10n ** 18n`), computed with pure BigInt arithmetic and adaptive
 * guard precision (no IEEE-754 floating-point loss).
 *
 * Forward DFT (`inverse: false`):
 *   X[k] = sum_{n=0}^{N-1} x[n] * exp(-i * 2*pi*k*n / N)
 *
 * Inverse DFT (`inverse: true`):
 *   x[n] = (1 / N) * sum_{k=0}^{N-1} X[k] * exp(+i * 2*pi*k*n / N)
 *
 * @param {Iterable<BigIntSample>} samples - Iterable of BigInt real samples or `{ re: bigint, im?: bigint }` complex samples.
 * @param {FourierTransformOptions} [options] - Optional transform configuration.
 * @returns {Generator<BigIntComplex, void, undefined>} Lazy generator yielding `{ re: bigint, im: bigint }` bins scaled by `scale`.
 * @throws {TypeError} If `samples`, `options`, or any yielded sample/bin index has an invalid type.
 * @throws {RangeError} If `maxLength`, `scale`, or any requested bin index is out of range.
 */
export function fourierTransformBigIntLazy(samples, options) {
	assertIterable(samples, 'samples')
	const config = validateOptions(options)
	return fourierTransformGenerator(samples, config)
}
