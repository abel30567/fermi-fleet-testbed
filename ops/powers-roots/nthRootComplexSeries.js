const HALF_PI = Math.PI / 2
const TWO_PI = 2 * Math.PI
const INV_SQRT2 = Math.SQRT1_2
const SQRT2 = Math.SQRT2
const SUBNORMAL_THRESHOLD = 2.2250738585072014e-308 // 2^-1022
const SUBNORMAL_SCALE = 18014398509481984 // 2^54
const BINOMIAL_RADIUS_SQ = 0.0625 // 0.25^2

/**
 * Normalize -0 to +0.
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Extract normalized mantissa in [1/sqrt(2), sqrt(2)] and binary exponent exp
 * such that x = mant * 2^exp for any positive finite x.
 * @param {number} x
 * @returns {{ mant: number, exp: number }}
 */
function frexpCentered(x) {
	let exp = 0
	let mant = x
	if (mant < SUBNORMAL_THRESHOLD) {
		mant *= SUBNORMAL_SCALE
		exp -= 54
	}
	const e = Math.floor(Math.log2(mant))
	mant *= Math.pow(2, -e)
	exp += e
	while (mant >= 2) {
		mant *= 0.5
		exp += 1
	}
	while (mant < 1) {
		mant *= 2
		exp -= 1
	}
	if (mant > SQRT2) {
		mant *= 0.5
		exp += 1
	} else if (mant < INV_SQRT2) {
		mant *= 2
		exp -= 1
	}
	return { mant, exp }
}

/**
 * Compute ln(m) for m in [1/sqrt(2), sqrt(2)] using the Mercator/atanh series:
 * ln(m) = 2 * sum_{j=0}^\infty u^(2j+1) / (2j+1), where u = (m - 1) / (m + 1).
 * @param {number} m
 * @returns {number}
 */
function lnSeries(m) {
	const u = (m - 1) / (m + 1)
	if (u === 0) return 0
	const u2 = u * u
	let power = u
	let sum = u
	for (let denom = 3; denom <= 51; denom += 2) {
		power *= u2
		const term = power / denom
		sum += term
		if (Math.abs(term) <= Number.EPSILON * Math.abs(sum)) {
			break
		}
	}
	return 2 * sum
}

/**
 * Compute exp(x) for |x| <= 1 using the Maclaurin series:
 * exp(x) = sum_{j=0}^\infty x^j / j!.
 * @param {number} x
 * @returns {number}
 */
function expSeries(x) {
	if (x === 0) return 1
	let sum = 1
	let term = 1
	for (let j = 1; j <= 40; j += 1) {
		term *= x / j
		sum += term
		if (Math.abs(term) <= Number.EPSILON * Math.abs(sum)) {
			break
		}
	}
	return sum
}

/**
 * Compute cos(angle) and sin(angle) using quadrant reduction to [-pi/4, pi/4]
 * followed by Maclaurin series evaluation.
 * @param {number} angle
 * @returns {{ cos: number, sin: number }}
 */
function sinCosSeries(angle) {
	let a = angle % TWO_PI
	if (a > Math.PI) {
		a -= TWO_PI
	} else if (a <= -Math.PI) {
		a += TWO_PI
	}

	const octant = Math.round(a / HALF_PI)
	const r = a - octant * HALF_PI
	const r2 = r * r

	// cos(r) = sum_{j=0}^\infty (-1)^j r^(2j) / (2j)!
	let cosVal = 1
	let cosTerm = 1
	for (let j = 1; j <= 16; j += 1) {
		cosTerm *= -r2 / ((2 * j - 1) * (2 * j))
		cosVal += cosTerm
		if (Math.abs(cosTerm) <= Number.EPSILON * Math.abs(cosVal)) {
			break
		}
	}

	// sin(r) = sum_{j=0}^\infty (-1)^j r^(2j+1) / (2j+1)!
	let sinVal = r
	let sinTerm = r
	if (r !== 0) {
		for (let j = 1; j <= 16; j += 1) {
			sinTerm *= -r2 / ((2 * j) * (2 * j + 1))
			sinVal += sinTerm
			if (Math.abs(sinTerm) <= Number.EPSILON * Math.abs(sinVal)) {
				break
			}
		}
	}

	const quadrant = ((octant % 4) + 4) % 4
	switch (quadrant) {
		case 0:
			return { cos: normalizeZero(cosVal), sin: normalizeZero(sinVal) }
		case 1:
			return { cos: normalizeZero(-sinVal), sin: normalizeZero(cosVal) }
		case 2:
			return { cos: normalizeZero(-cosVal), sin: normalizeZero(-sinVal) }
		default:
			return { cos: normalizeZero(sinVal), sin: normalizeZero(-cosVal) }
	}
}

/**
 * Compute principal (1 + w)^(1/n) for |w| <= 0.25 using the generalized
 * complex binomial series:
 * (1 + w)^(1/n) = sum_{j=0}^\infty C(1/n, j) * w^j.
 * @param {number} wRe
 * @param {number} wIm
 * @param {number} n
 * @returns {{ re: number, im: number }}
 */
function binomialPrincipalRoot(wRe, wIm, n) {
	const invN = 1 / n
	let sumRe = 1
	let sumIm = 0
	let termRe = 1
	let termIm = 0

	for (let j = 1; j <= 80; j += 1) {
		const coeff = (invN - (j - 1)) / j
		const nextRe = coeff * (termRe * wRe - termIm * wIm)
		const nextIm = coeff * (termRe * wIm + termIm * wRe)
		termRe = nextRe
		termIm = nextIm
		sumRe += termRe
		sumIm += termIm

		const termNormSq = termRe * termRe + termIm * termIm
		const sumNormSq = sumRe * sumRe + sumIm * sumIm
		if (termNormSq <= 1e-34 * sumNormSq) {
			break
		}
	}

	return { re: normalizeZero(sumRe), im: normalizeZero(sumIm) }
}

/**
 * Compute the n-th root of a complex number z = { re, im } using a combination
 * of series and closed-form identities:
 * - For the principal root (k ≡ 0 mod n) with |z - 1| <= 0.25, evaluates the
 *   generalized complex binomial series (1 + w)^(1/n).
 * - Otherwise, uses binary-scaled polar decomposition and De Moivre's / Euler's
 *   identity z_k = r^(1/n) * exp(i * (arg(z) + 2*pi*k) / n), with r^(1/n)
 *   computed via the Mercator ln series + Taylor exp series and exp(i*phi)
 *   computed via quadrant-reduced Maclaurin cos/sin series.
 *
 * @param {{ re: number, im: number }} z - Complex radicand with finite re and im.
 * @param {number} n - Positive safe integer root degree (n >= 1).
 * @param {number} [k=0] - Safe integer root branch index (0 gives the principal root).
 * @returns {{ re: number, im: number }} The k-th complex n-th root as { re, im }.
 * @throws {TypeError} If z is not an object with numeric re/im, or n/k are not numbers.
 * @throws {RangeError} If re/im are non-finite, n is not a safe integer >= 1, or k is not a safe integer.
 */
export function nthRootComplexSeries(z, n, k = 0) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('z must be a complex number object { re, im }')
	}
	if (typeof z.re !== 'number' || typeof z.im !== 'number') {
		throw new TypeError('z.re and z.im must be numbers')
	}
	if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
		throw new RangeError('z.re and z.im must be finite numbers')
	}
	if (typeof n !== 'number') {
		throw new TypeError('n must be a number')
	}
	if (!Number.isSafeInteger(n) || n < 1) {
		throw new RangeError('n must be a positive safe integer (>= 1)')
	}
	if (typeof k !== 'number') {
		throw new TypeError('k must be a number')
	}
	if (!Number.isSafeInteger(k)) {
		throw new RangeError('k must be a safe integer')
	}

	const re = normalizeZero(z.re)
	const im = normalizeZero(z.im)

	if (re === 0 && im === 0) {
		return { re: 0, im: 0 }
	}
	if (n === 1) {
		return { re, im }
	}

	const kMod = ((k % n) + n) % n

	// Direct generalized binomial series for principal root near 1
	const wRe = re - 1
	const wIm = im
	if (kMod === 0 && wRe * wRe + wIm * wIm <= BINOMIAL_RADIUS_SQ) {
		return binomialPrincipalRoot(wRe, wIm, n)
	}

	// Scale (re, im) by a power of 2 to avoid overflow/underflow in hypot
	let scaleExp = 0
	let sr = re
	let si = im
	let maxAbs = Math.max(Math.abs(sr), Math.abs(si))
	if (maxAbs < SUBNORMAL_THRESHOLD) {
		sr *= SUBNORMAL_SCALE
		si *= SUBNORMAL_SCALE
		scaleExp -= 54
		maxAbs = Math.max(Math.abs(sr), Math.abs(si))
	}
	const shift = Math.floor(Math.log2(maxAbs))
	const invPow2 = Math.pow(2, -shift)
	sr *= invPow2
	si *= invPow2
	scaleExp += shift

	const scaledR = Math.hypot(sr, si)
	const { mant, exp: mantExp } = frexpCentered(scaledR)
	const totalExp = scaleExp + mantExp

	// r^(1/n) = 2^q * exp((rem * ln(2) + ln(mant)) / n)
	const qRaw = Math.round(totalExp / n)
	const q = normalizeZero(qRaw)
	const rem = totalExp - q * n
	const exponentArg = (rem * Math.LN2 + lnSeries(mant)) / n
	const rootR = expSeries(exponentArg) * Math.pow(2, q)

	// Principal argument in (-pi, pi] (im already normalized so -0 becomes +0)
	const theta = Math.atan2(im, re)
	const phi = (theta + TWO_PI * kMod) / n
	const { cos, sin } = sinCosSeries(phi)

	return {
		re: normalizeZero(rootR * cos),
		im: normalizeZero(rootR * sin),
	}
}
