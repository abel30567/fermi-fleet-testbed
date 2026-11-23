/**
 * High and low parts of ln(2) for Cody-Waite range reduction.
 * LN2_HI has the top 33 bits of ln(2) so k * LN2_HI is exact for |k| <= 2^20.
 */
const LN2_HI = 0.6931471803691238
const LN2_LO = 1.9082149292705877e-10

const POW2_STEPS = [256, 128, 64, 32, 16, 8, 4, 2, 1]
const POW2_POS = POW2_STEPS.map((s) => 2 ** s)
const POW2_NEG = POW2_STEPS.map((s) => 2 ** -s)
const TWO_512 = 2 ** 512
const TWO_NEG_512 = 2 ** -512

/**
 * Normalize -0 to +0.
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Decompose a positive finite number a into m * 2^exp with m in [sqrt(1/2), sqrt(2)].
 * Uses only exact power-of-2 multiplications (zero rounding error).
 * @param {number} a
 * @returns {{ m: number, exp: number }}
 */
function frexpCentered(a) {
	let m = a
	let exp = 0

	while (m >= TWO_512) {
		m *= TWO_NEG_512
		exp += 512
	}
	while (m < TWO_NEG_512) {
		m *= TWO_512
		exp -= 512
	}

	for (let i = 0; i < POW2_STEPS.length; i++) {
		const s = POW2_STEPS[i]
		if (m >= POW2_POS[i]) {
			m *= POW2_NEG[i]
			exp += s
		} else if (m < POW2_NEG[i]) {
			m *= POW2_POS[i]
			exp -= s
		}
	}

	if (m >= Math.SQRT2) {
		m *= 0.5
		exp += 1
	} else if (m < Math.SQRT1_2) {
		m *= 2
		exp -= 1
	}

	return { m, exp }
}

/**
 * Scale x by 2^exp using exact power-of-2 steps.
 * @param {number} x
 * @param {number} exp
 * @returns {number}
 */
function ldexp(x, exp) {
	if (x === 0 || exp === 0) return x
	let result = x
	let e = exp

	while (e >= 512) {
		result *= TWO_512
		e -= 512
		if (!Number.isFinite(result)) return result
	}
	while (e <= -512) {
		result *= TWO_NEG_512
		e += 512
		if (result === 0) return 0
	}

	if (e > 0) {
		for (let i = 0; i < POW2_STEPS.length && e > 0; i++) {
			if (e >= POW2_STEPS[i]) {
				result *= POW2_POS[i]
				e -= POW2_STEPS[i]
			}
		}
	} else if (e < 0) {
		let rem = -e
		for (let i = 0; i < POW2_STEPS.length && rem > 0; i++) {
			if (rem >= POW2_STEPS[i]) {
				result *= POW2_NEG[i]
				rem -= POW2_STEPS[i]
			}
		}
	}

	return result
}

/**
 * Compute ln(m) for m in [sqrt(1/2), sqrt(2)] via the artanh series:
 *   ln(m) = 2 * sum_{k=0..inf} t^(2k+1) / (2k+1), where t = (m - 1) / (m + 1).
 * Because |t| <= 3 - 2*sqrt(2) ~= 0.1716, t^2 < 0.03 and the series reaches
 * IEEE-754 double precision in ~10 terms.
 * @param {number} m
 * @returns {number}
 */
function lnReducedSeries(m) {
	if (m === 1) return 0
	const t = (m - 1) / (m + 1)
	const t2 = t * t
	let term = t
	let sum = t

	for (let k = 1; k <= 30; k++) {
		term *= t2
		const contrib = term / (2 * k + 1)
		sum += contrib
		if (Math.abs(contrib) <= Math.abs(sum) * 1e-17) break
	}

	return 2 * sum
}

/**
 * Compute exp(z) via Cody-Waite range reduction and the Maclaurin series:
 *   exp(r) = sum_{k=0..inf} r^k / k!, with |r| <= ln(2)/2.
 * @param {number} z
 * @returns {number}
 */
function expSeries(z) {
	if (z === 0) return 1
	if (z > 709.782712893384) return Infinity
	if (z < -745.1332191019412) return 0

	const k = Math.round(z / Math.LN2)
	const r = z - k * LN2_HI - k * LN2_LO

	let sum = 1
	let term = 1
	for (let i = 1; i <= 30; i++) {
		term = (term * r) / i
		sum += term
		if (Math.abs(term) <= Math.abs(sum) * 1e-17) break
	}

	return ldexp(sum, k)
}

/**
 * Compute a^(1/n) for a > 0 and finite non-zero n using range-reduced
 * log/exp series: a = m * 2^exp => a^(1/n) = 2^q * exp((ln(m) + rem*ln(2)) / n).
 * Also returns ln(a) to avoid recomputation when n is a dual number.
 * @param {number} a
 * @param {number} n
 * @returns {{ value: number, lnA: number }}
 */
function nthRootPositiveSeries(a, n) {
	const { m, exp } = frexpCentered(a)
	const lnM = lnReducedSeries(m)
	const lnA = exp * LN2_HI + (lnM + exp * LN2_LO)

	const qCandidate = Math.round(exp / n)
	if (Number.isSafeInteger(qCandidate) && Math.abs(qCandidate) <= 1075) {
		const remExp = exp - qCandidate * n
		const z = (remExp * LN2_HI + (lnM + remExp * LN2_LO)) / n
		return { value: ldexp(expSeries(z), qCandidate), lnA }
	}

	return { value: expSeries(lnA / n), lnA }
}

/**
 * Compute (a * b) / (c * d) without spurious intermediate overflow or underflow.
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @param {number} d
 * @returns {number}
 */
function safeProdDiv(a, b, c, d) {
	if (a === 0 || b === 0) return 0
	const quick = (a / c) * (b / d)
	if (Number.isFinite(quick) && quick !== 0) return quick
	const sign =
		(a < 0 ? -1 : 1) * (b < 0 ? -1 : 1) * (c < 0 ? -1 : 1) * (d < 0 ? -1 : 1)
	const fa = frexpCentered(Math.abs(a))
	const fb = frexpCentered(Math.abs(b))
	const fc = frexpCentered(Math.abs(c))
	const fd = frexpCentered(Math.abs(d))
	const mant = (fa.m * fb.m) / (fc.m * fd.m)
	const exp = fa.exp + fb.exp - fc.exp - fd.exp
	return sign * ldexp(mant, exp)
}

/**
 * Validate a dual number object { v, d }.
 * @param {unknown} obj
 * @param {string} name
 * @returns {{ v: number, d: number }}
 */
function validateDual(obj, name) {
	if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
		throw new TypeError(`${name} must be a dual number object { v, d }`)
	}
	const { v, d } = obj
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(`${name}.v and ${name}.d must be numbers`)
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(`${name}.v and ${name}.d must be finite numbers`)
	}
	return { v, d }
}

/**
 * Validate the root degree n, accepting either a finite non-zero number
 * or a dual number object { v, d } with finite non-zero v.
 * @param {unknown} n
 * @returns {{ nv: number, nd: number }}
 */
function validateRootDegree(n) {
	if (typeof n === 'number') {
		if (!Number.isFinite(n)) {
			throw new RangeError('n must be a finite number')
		}
		if (n === 0) {
			throw new RangeError('n must be non-zero')
		}
		return { nv: n, nd: 0 }
	}
	if (n !== null && typeof n === 'object' && !Array.isArray(n)) {
		const { v, d } = validateDual(n, 'n')
		if (v === 0) {
			throw new RangeError('n.v must be non-zero')
		}
		return { nv: v, nd: d }
	}
	throw new TypeError('n must be a finite non-zero number or a dual number object { v, d }')
}

/**
 * Compute the real nth root of a dual number x = { v, d } (representing v + d*eps, eps^2 = 0),
 * carrying the exact forward-mode derivative alongside the value.
 *
 * Uses a range-reduced artanh-logarithm and Maclaurin-exponential series for the primal value
 * y_v = v^(1/n) = exp(ln(v) / n), combined with the exact truncated dual binomial series
 * (v + d*eps)^(1/n) = v^(1/n) * (1 + (d / (n * v)) * eps).
 *
 * When `n` is itself a dual number { v: nv, d: nd } with nd !== 0 (requires x.v > 0), applies
 * the full logarithmic derivative:
 *   y_d = y_v * (x.d / (nv * x.v) - (nd * ln(x.v)) / (nv * nv)).
 *
 * @param {{ v: number, d: number }} x - Input dual number with finite real value `v` and derivative `d`.
 * @param {number | { v: number, d: number }} n - Non-zero root degree (scalar or dual number).
 * @returns {{ v: number, d: number }} Dual number representing x^(1/n).
 * @throws {TypeError} If `x` is not a dual number object or `n` is not a number or dual number.
 * @throws {RangeError} If inputs are non-finite, `n` is zero, or the real root/derivative is undefined on the domain.
 */
export function nthRootDualSeries(x, n) {
	const { v, d } = validateDual(x, 'x')
	const { nv, nd } = validateRootDegree(n)

	if (v === 0) {
		if (nv < 0) {
			throw new RangeError('Negative root of zero is undefined (division by zero)')
		}
		if (nd !== 0) {
			throw new RangeError('Derivative with respect to root degree n is undefined at x.v = 0')
		}
		if (nv === 1) {
			return { v: 0, d: normalizeZero(d) }
		}
		if (nv < 1) {
			// x^(1/nv) with 1/nv > 1 has derivative (1/nv) * 0^(1/nv - 1) * d = 0
			return { v: 0, d: 0 }
		}
		if (d === 0) {
			return { v: 0, d: 0 }
		}
		throw new RangeError('Derivative of nthRoot is undefined at x.v = 0 for n > 1 when x.d !== 0')
	}

	if (v < 0) {
		if (nd !== 0) {
			throw new RangeError('Root with non-zero degree derivative is undefined for negative x.v')
		}
		if (!Number.isInteger(nv) || Math.abs(nv) % 2 !== 1) {
			throw new RangeError('Real nth root of a negative number requires an odd integer n')
		}
		if (nv === 1) {
			return { v: normalizeZero(v), d: normalizeZero(d) }
		}
		if (nv === -1) {
			const yv = 1 / v
			const yd = -d / (v * v)
			return { v: normalizeZero(yv), d: normalizeZero(yd) }
		}
		const { value } = nthRootPositiveSeries(-v, nv)
		const yv = -value
		const yd = safeProdDiv(yv, d, nv, v)
		return { v: normalizeZero(yv), d: normalizeZero(yd) }
	}

	// v > 0
	if (nv === 1 && nd === 0) {
		return { v: normalizeZero(v), d: normalizeZero(d) }
	}
	if (nv === -1 && nd === 0) {
		const yv = 1 / v
		const yd = safeProdDiv(-1, d, v, v)
		return { v: normalizeZero(yv), d: normalizeZero(yd) }
	}

	const { value: yv, lnA } = nthRootPositiveSeries(v, nv)
	let yd = safeProdDiv(yv, d, nv, v)
	if (nd !== 0 && lnA !== 0) {
		yd -= safeProdDiv(yv, nd, nv, nv) * lnA
	}

	return { v: normalizeZero(yv), d: normalizeZero(yd) }
}
