const DECIMAL_RE = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/
const MAX_EXPONENT = 100000

/**
 * Divide two BigInts with round-half-to-even rounding.
 *
 * @param {bigint} num - Numerator.
 * @param {bigint} den - Positive denominator.
 * @returns {bigint}
 */
function divRoundHalfEven(num, den) {
	const neg = num < 0n
	const absNum = neg ? -num : num
	const q = absNum / den
	const r = absNum % den
	const twiceR = r * 2n
	let rounded = q
	if (twiceR > den || (twiceR === den && (q & 1n) === 1n)) {
		rounded = q + 1n
	}
	return neg ? -rounded : rounded
}

/**
 * Parse and validate a decimal string into its normalized components.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {{ sign: bigint, digits: string, exp10: number, magnitude: number }}
 */
function parseDecimalParts(value, label) {
	if (typeof value !== 'string') {
		throw new TypeError(`${label} must be a decimal string`)
	}
	const match = DECIMAL_RE.exec(value)
	if (!match) {
		throw new RangeError(`${label} is not a valid decimal string: ${JSON.stringify(value)}`)
	}
	const sign = match[1] === '-' ? -1n : 1n
	const intPart = match[2] ?? ''
	const fracPart = match[3] ?? match[4] ?? ''
	const exp = match[5] !== undefined ? Number(match[5]) : 0
	if (!Number.isSafeInteger(exp) || Math.abs(exp) > MAX_EXPONENT) {
		throw new RangeError(`${label} exponent out of supported range: ${JSON.stringify(value)}`)
	}
	const rawDigits = intPart + fracPart
	const trimmed = rawDigits.replace(/^0+/, '')
	if (trimmed.length === 0) {
		return { sign: 1n, digits: '', exp10: 0, magnitude: 0 }
	}
	const exp10 = exp - fracPart.length
	const magnitude = Math.max(0, trimmed.length + exp10)
	return { sign, digits: trimmed, exp10, magnitude }
}

/**
 * Convert parsed decimal parts into a fixed-point BigInt scaled by 10^scaleDigits.
 *
 * @param {{ sign: bigint, digits: string, exp10: number }} parts
 * @param {number} scaleDigits
 * @returns {bigint}
 */
function partsToScaledBigInt(parts, scaleDigits) {
	if (parts.digits.length === 0) {
		return 0n
	}
	const shift = scaleDigits + parts.exp10
	const mag = BigInt(parts.digits)
	if (shift >= 0) {
		return parts.sign * mag * (10n ** BigInt(shift))
	}
	const drop = -shift
	if (drop > parts.digits.length + 1) {
		return 0n
	}
	const rounded = divRoundHalfEven(mag, 10n ** BigInt(drop))
	return parts.sign * rounded
}

/**
 * Format a fixed-point BigInt (scaled by 10^precision) as a canonical decimal string.
 *
 * @param {bigint} scaledValue
 * @param {number} precision
 * @returns {string}
 */
function formatDecimal(scaledValue, precision) {
	if (scaledValue === 0n) {
		return precision === 0 ? '0' : `0.${'0'.repeat(precision)}`
	}
	const neg = scaledValue < 0n
	const digits = (neg ? -scaledValue : scaledValue).toString()
	if (precision === 0) {
		return neg ? `-${digits}` : digits
	}
	const padded = digits.padStart(precision + 1, '0')
	const splitIdx = padded.length - precision
	const intPart = padded.slice(0, splitIdx)
	const fracPart = padded.slice(splitIdx)
	return `${neg ? '-' : ''}${intPart}.${fracPart}`
}

/**
 * Compute scale * arctan(1 / m) iteratively using Taylor series.
 *
 * @param {number} m
 * @param {bigint} scale
 * @returns {bigint}
 */
function arctanReciprocal(m, scale) {
	const mBig = BigInt(m)
	const m2 = mBig * mBig
	let power = scale / mBig
	let sum = 0n
	let k = 0n
	let add = true
	while (power > 0n) {
		const term = power / (2n * k + 1n)
		if (term === 0n) break
		sum = add ? sum + term : sum - term
		power /= m2
		k += 1n
		add = !add
	}
	return sum
}

/**
 * Compute scale * pi using Machin's formula: pi/4 = 4*atan(1/5) - atan(1/239).
 *
 * @param {bigint} scale
 * @returns {bigint}
 */
function computePiScaled(scale) {
	const guard = 10n ** 6n
	const extScale = scale * guard
	const piExt = 4n * (4n * arctanReciprocal(5, extScale) - arctanReciprocal(239, extScale))
	return divRoundHalfEven(piExt, guard)
}

/**
 * Compute (cos(r), sin(r)) for 0 < r <= pi/4 iteratively via Taylor series.
 * Both r and returned values are scaled by extScale.
 *
 * @param {bigint} r
 * @param {bigint} extScale
 * @returns {{ cos: bigint, sin: bigint }}
 */
function cosSinOctant(r, extScale) {
	const r2 = (r * r) / extScale

	let cosSum = extScale
	let cosTerm = extScale
	let k = 1n
	while (true) {
		cosTerm = -((cosTerm * r2) / (extScale * (2n * k - 1n) * (2n * k)))
		if (cosTerm === 0n) break
		cosSum += cosTerm
		k += 1n
	}

	let sinSum = r
	let sinTerm = r
	k = 1n
	while (true) {
		sinTerm = -((sinTerm * r2) / (extScale * (2n * k) * (2n * k + 1n)))
		if (sinTerm === 0n) break
		sinSum += sinTerm
		k += 1n
	}

	return { cos: cosSum, sin: sinSum }
}

/**
 * Compute (cos(2*pi*m/N), sin(2*pi*m/N)) scaled by 10^workDigits using exact
 * integer quadrant/octant reduction and iterative Taylor series.
 *
 * @param {number} m - Integer index in [0, N).
 * @param {number} n - Transform length N > 0.
 * @param {bigint} piExt - pi scaled by 10^(workDigits + 8).
 * @param {bigint} workScale - 10^workDigits.
 * @param {bigint} extScale - 10^(workDigits + 8).
 * @param {bigint} extGuard - 10^8.
 * @returns {{ cos: bigint, sin: bigint }}
 */
function cosSinUnitFraction(m, n, piExt, workScale, extScale, extGuard) {
	if (m === 0) {
		return { cos: workScale, sin: 0n }
	}
	const m4 = 4 * m
	if (m4 === n) {
		return { cos: 0n, sin: workScale }
	}
	if (m4 === 2 * n) {
		return { cos: -workScale, sin: 0n }
	}
	if (m4 === 3 * n) {
		return { cos: 0n, sin: -workScale }
	}

	// Exact integer quadrant reduction: 4m = q*N + rem, where q in {0, 1, 2, 3}, 0 < rem < N.
	// Angle in quadrant: phi = (2*pi*rem)/(4*N) = (pi/2)*(rem/N) in (0, pi/2).
	const q = Math.floor(m4 / n)
	const rem = m4 - q * n

	// Octant reduction: map phi into (0, pi/4].
	const swap = 2 * rem > n
	const octRem = swap ? n - rem : rem
	const r = divRoundHalfEven(piExt * BigInt(octRem), BigInt(2 * n))
	const oct = cosSinOctant(r, extScale)

	const cosPhi = divRoundHalfEven(swap ? oct.sin : oct.cos, extGuard)
	const sinPhi = divRoundHalfEven(swap ? oct.cos : oct.sin, extGuard)

	if (q === 0) return { cos: cosPhi, sin: sinPhi }
	if (q === 1) return { cos: -sinPhi, sin: cosPhi }
	if (q === 2) return { cos: -cosPhi, sin: -sinPhi }
	return { cos: sinPhi, sin: -cosPhi }
}

/**
 * Compute the Discrete Fourier Transform (or Inverse DFT) over arbitrary-precision
 * decimal strings using a straightforward iterative O(N^2) algorithm and fixed-point
 * BigInt arithmetic (zero floating-point trig or external dependencies).
 *
 * Forward DFT (`inverse: false`, default):
 *   X[k] = sum_{n=0}^{N-1} x[n] * exp(-i * 2*pi*k*n / N)
 *
 * Inverse DFT (`inverse: true`):
 *   x[n] = (1/N) * sum_{k=0}^{N-1} X[k] * exp(+i * 2*pi*k*n / N)
 *
 * @param {Array<string | { re: string, im?: string }>} samples - Sequence of decimal string samples
 *   (interpreted as real values) or complex objects `{ re, im }` with decimal string components.
 * @param {number} [precision=20] - Non-negative integer number of fractional decimal digits in output.
 * @param {{ inverse?: boolean }} [options={}] - Optional configuration (`inverse: true` computes IDFT).
 * @returns {Array<{ re: string, im: string }>} Frequency-domain (or time-domain if inverse) bins formatted
 *   as canonical decimal strings rounded half-to-even to `precision` fractional digits.
 */
export function fourierTransformDecimalIterative(samples, precision = 20, options = {}) {
	if (!Array.isArray(samples)) {
		throw new TypeError('samples must be an array')
	}
	if (typeof precision !== 'number' || !Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError('precision must be a non-negative safe integer')
	}
	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('options must be a plain object')
	}
	const { inverse = false } = options
	if (typeof inverse !== 'boolean') {
		throw new TypeError('options.inverse must be a boolean')
	}

	const n = samples.length
	if (n === 0) {
		return []
	}

	// Parse and validate every sample before doing arithmetic so we know the max input magnitude.
	const parsed = new Array(n)
	let maxMagnitude = 0
	for (let i = 0; i < n; i++) {
		const sample = samples[i]
		let reParts
		let imParts
		if (typeof sample === 'string') {
			reParts = parseDecimalParts(sample, `samples[${i}]`)
			imParts = { sign: 1n, digits: '', exp10: 0, magnitude: 0 }
		} else if (typeof sample === 'object' && sample !== null && !Array.isArray(sample)) {
			reParts = parseDecimalParts(sample.re, `samples[${i}].re`)
			imParts =
				sample.im === undefined
					? { sign: 1n, digits: '', exp10: 0, magnitude: 0 }
					: parseDecimalParts(sample.im, `samples[${i}].im`)
		} else {
			throw new TypeError(`samples[${i}] must be a decimal string or a { re, im } object`)
		}
		if (reParts.magnitude > maxMagnitude) maxMagnitude = reParts.magnitude
		if (imParts.magnitude > maxMagnitude) maxMagnitude = imParts.magnitude
		parsed[i] = { reParts, imParts }
	}

	// Guard digits guarantee accuracy even for large N and large-magnitude inputs.
	const extraGuard = Math.max(20, Math.ceil(Math.log10(n + 1)) + 14)
	const workDigits = precision + maxMagnitude + extraGuard
	const workScale = 10n ** BigInt(workDigits)
	const extGuard = 10n ** 8n
	const extScale = workScale * extGuard

	const inputRe = new Array(n)
	const inputIm = new Array(n)
	for (let i = 0; i < n; i++) {
		inputRe[i] = partsToScaledBigInt(parsed[i].reParts, workDigits)
		inputIm[i] = partsToScaledBigInt(parsed[i].imParts, workDigits)
	}

	// Only compute pi if any angle is not an exact multiple of pi/2.
	const needsPi = !(n === 1 || n === 2 || n === 4)
	const piExt = needsPi ? computePiScaled(extScale) : 0n

	// Precompute trig table for angles 2*pi*m/N, m = 0..N-1.
	const cosTable = new Array(n)
	const sinTable = new Array(n)
	for (let m = 0; m < n; m++) {
		const trig = cosSinUnitFraction(m, n, piExt, workScale, extScale, extGuard)
		cosTable[m] = trig.cos
		sinTable[m] = trig.sin
	}

	// Products input * trig are at scale 10^(2 * workDigits); scale down to 10^precision.
	const downScale = 10n ** BigInt(2 * workDigits - precision)
	const finalDivisor = inverse ? downScale * BigInt(n) : downScale

	const result = new Array(n)
	for (let k = 0; k < n; k++) {
		let sumRe = 0n
		let sumIm = 0n
		for (let j = 0; j < n; j++) {
			const idx = (k * j) % n
			const a = inputRe[j]
			const b = inputIm[j]
			const c = cosTable[idx]
			const s = sinTable[idx]
			if (inverse) {
				// (a + bi)(cos + i*sin) = (a*cos - b*sin) + i*(a*sin + b*cos)
				sumRe += a * c - b * s
				sumIm += a * s + b * c
			} else {
				// (a + bi)(cos - i*sin) = (a*cos + b*sin) + i*(b*cos - a*sin)
				sumRe += a * c + b * s
				sumIm += b * c - a * s
			}
		}
		const outRe = divRoundHalfEven(sumRe, finalDivisor)
		const outIm = divRoundHalfEven(sumIm, finalDivisor)
		result[k] = {
			re: formatDecimal(outRe, precision),
			im: formatDecimal(outIm, precision),
		}
	}

	return result
}
