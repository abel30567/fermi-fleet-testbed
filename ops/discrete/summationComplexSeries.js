/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Normalizes signed zero (`-0`) to `+0` on a finite number.
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Validates that a value is a finite complex number `{ re, im }`.
 * @param {unknown} value
 * @param {string} name
 * @returns {Complex}
 */
function validateComplex(value, name) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${name} must be a complex object { re, im }`)
	}
	const { re, im } = /** @type {{ re: unknown, im: unknown }} */ (value)
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${name}.re and ${name}.im must be numbers`)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${name}.re and ${name}.im must be finite numbers`)
	}
	return { re, im }
}

/**
 * Multiplies two complex numbers.
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function cMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

/**
 * Divides complex number `a` by non-zero complex number `b` using Smith's
 * scaling algorithm to avoid intermediate overflow/underflow.
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function cDiv(a, b) {
	if (Math.abs(b.re) >= Math.abs(b.im)) {
		const ratio = b.im / b.re
		const denom = b.re + b.im * ratio
		return {
			re: (a.re + a.im * ratio) / denom,
			im: (a.im - a.re * ratio) / denom,
		}
	}
	const ratio = b.re / b.im
	const denom = b.im + b.re * ratio
	return {
		re: (a.re * ratio + a.im) / denom,
		im: (a.im * ratio - a.re) / denom,
	}
}

/**
 * Computes `z^exp` for a non-negative safe integer `exp` via binary
 * exponentiation in O(log exp) complex multiplications.
 * @param {Complex} z
 * @param {number} exp
 * @returns {Complex}
 */
function cPowInt(z, exp) {
	let resRe = 1
	let resIm = 0
	let baseRe = z.re
	let baseIm = z.im
	let e = exp

	while (e > 0) {
		if (e % 2 === 1) {
			const nextRe = resRe * baseRe - resIm * baseIm
			const nextIm = resRe * baseIm + resIm * baseRe
			resRe = nextRe
			resIm = nextIm
		}
		e = Math.floor(e / 2)
		if (e > 0) {
			const sqRe = baseRe * baseRe - baseIm * baseIm
			const sqIm = 2 * baseRe * baseIm
			baseRe = sqRe
			baseIm = sqIm
		}
	}

	return { re: resRe, im: resIm }
}

/**
 * Evaluates G_n(1 + u) = sum_{k=0}^{n-1} (1 + u)^k via the binomial Taylor
 * series sum_{j=0}^{n-1} C(n, j + 1) u^j, avoiding catastrophic cancellation
 * when n * |u| <= 0.5.
 * @param {number} n
 * @param {Complex} u
 * @returns {Complex}
 */
function geometricNearOne(n, u) {
	let sumRe = n
	let sumIm = 0
	let termRe = n
	let termIm = 0

	for (let j = 0; j < n - 1; j++) {
		const scale = (n - j - 1) / (j + 2)
		const nextRe = scale * (termRe * u.re - termIm * u.im)
		const nextIm = scale * (termRe * u.im + termIm * u.re)
		termRe = nextRe
		termIm = nextIm
		sumRe += termRe
		sumIm += termIm
		if (Math.hypot(termRe, termIm) <= 1e-17 * Math.hypot(sumRe, sumIm)) {
			break
		}
	}

	return { re: sumRe, im: sumIm }
}

/**
 * Evaluates H_n(1 + u) = sum_{k=0}^{n-1} k (1 + u)^k via the binomial Taylor
 * identity (1 + u) * sum_{m=0}^{n-2} (m + 1) C(n, m + 2) u^m, avoiding
 * catastrophic cancellation when n * |u| <= 0.5.
 * @param {number} n
 * @param {Complex} r
 * @param {Complex} u
 * @returns {Complex}
 */
function weightedNearOne(n, r, u) {
	const c2 = n % 2 === 0 ? (n / 2) * (n - 1) : n * ((n - 1) / 2)
	let sumRe = c2
	let sumIm = 0
	let termRe = c2
	let termIm = 0

	for (let m = 0; m < n - 2; m++) {
		const scale = ((m + 2) * (n - m - 2)) / ((m + 1) * (m + 3))
		const nextRe = scale * (termRe * u.re - termIm * u.im)
		const nextIm = scale * (termRe * u.im + termIm * u.re)
		termRe = nextRe
		termIm = nextIm
		sumRe += termRe
		sumIm += termIm
		if (Math.hypot(termRe, termIm) <= 1e-17 * Math.hypot(sumRe, sumIm)) {
			break
		}
	}

	return cMul(r, { re: sumRe, im: sumIm })
}

/**
 * Computes the discrete summation of a finite or convergent infinite complex
 * arithmetico-geometric series:
 *
 *   S_n = sum_{k=0}^{n-1} (a + k * d) * r^k
 *
 * where `a`, `r`, and `d` are complex numbers represented as `{ re, im }`.
 *
 * Special cases covered seamlessly:
 * - Complex geometric series (`d = { re: 0, im: 0 }`): `sum_{k=0}^{n-1} a * r^k`
 * - Complex arithmetic series (`r = { re: 1, im: 0 }`): `sum_{k=0}^{n-1} (a + k * d)`
 * - Infinite convergent series (`n = Infinity`, `|r| < 1`): `a / (1 - r) + d * r / (1 - r)^2`
 *
 * Algorithm & Identities:
 * - For `r = 1`: exact arithmetic closed form `n * a + (n * (n - 1) / 2) * d`.
 * - For `n = Infinity` with `|r| < 1`: exact closed form `(a * (1 - r) + d * r) / (1 - r)^2`
 *   evaluated via Smith's complex division algorithm.
 * - For finite `n >= 2` and `r != 1`:
 *   - When `n * |r - 1| <= 0.5`, evaluates the binomial Taylor series in `u = r - 1`:
 *       G_n(1 + u) = sum_{j=0}^{n-1} C(n, j + 1) * u^j
 *       H_n(1 + u) = (1 + u) * sum_{m=0}^{n-2} (m + 1) * C(n, m + 2) * u^m
 *     eliminating catastrophic cancellation near `r = 1`.
 *   - Otherwise uses the exact O(log n) closed-form identities with binary
 *     exponentiation for `r^(n-1)`:
 *       G_n(r) = (r^n - 1) / (r - 1)
 *       H_n(r) = r * (n * r^(n-1) - G_n(r)) / (r - 1)
 *     and combines `S_n = a * G_n(r) + d * H_n(r)`.
 *
 * @param {Complex} a Initial complex term at k = 0 as `{ re, im }`.
 * @param {Complex} r Complex common ratio as `{ re, im }`.
 * @param {number} n Number of terms: a non-negative safe integer, or `Infinity` when `|r| < 1`.
 * @param {Complex} [d={ re: 0, im: 0 }] Optional complex arithmetic step as `{ re, im }`.
 * @returns {Complex} The complex sum `{ re, im }`.
 * @throws {TypeError} If `a`, `r`, or `d` is not a `{ re, im }` object with numeric fields, or if `n` is not a number.
 * @throws {RangeError} If any complex component is non-finite, `n` is negative/non-integer/unsafe, `n === Infinity` with `|r| >= 1`, or the result overflows finite IEEE-754 doubles.
 */
export function summationComplexSeries(a, r, n, d = { re: 0, im: 0 }) {
	const aVal = validateComplex(a, 'a')
	const rVal = validateComplex(r, 'r')
	const dVal = validateComplex(d, 'd')

	if (typeof n !== 'number') {
		throw new TypeError('n must be a number')
	}

	if (n === Infinity) {
		if (Math.hypot(rVal.re, rVal.im) >= 1) {
			throw new RangeError('Infinite complex series requires |r| < 1 for convergence')
		}
		const hasA = aVal.re !== 0 || aVal.im !== 0
		const hasD = dVal.re !== 0 || dVal.im !== 0
		if (!hasA && !hasD) {
			return { re: 0, im: 0 }
		}
		const oneMinusR = { re: 1 - rVal.re, im: -rVal.im }
		let re = 0
		let im = 0
		if (hasA) {
			const gInf = cDiv(aVal, oneMinusR)
			re += gInf.re
			im += gInf.im
		}
		if (hasD) {
			const dr = cMul(dVal, rVal)
			const hInf = cDiv(cDiv(dr, oneMinusR), oneMinusR)
			re += hInf.re
			im += hInf.im
		}
		if (!Number.isFinite(re) || !Number.isFinite(im)) {
			throw new RangeError('Series sum overflows finite floating-point representation')
		}
		return { re: normalizeZero(re), im: normalizeZero(im) }
	}

	if (!Number.isSafeInteger(n) || n < 0) {
		throw new RangeError('n must be a non-negative safe integer or Infinity')
	}

	if (n === 0) {
		return { re: 0, im: 0 }
	}

	const hasA = aVal.re !== 0 || aVal.im !== 0
	const hasD = dVal.re !== 0 || dVal.im !== 0
	if (!hasA && !hasD) {
		return { re: 0, im: 0 }
	}

	if (n === 1 || (rVal.re === 0 && rVal.im === 0)) {
		return { re: normalizeZero(aVal.re), im: normalizeZero(aVal.im) }
	}

	// Exact closed form for r = 1 (complex arithmetic series)
	if (rVal.re === 1 && rVal.im === 0) {
		const tri = n % 2 === 0 ? (n / 2) * (n - 1) : n * ((n - 1) / 2)
		const re = (hasA ? n * aVal.re : 0) + (hasD ? tri * dVal.re : 0)
		const im = (hasA ? n * aVal.im : 0) + (hasD ? tri * dVal.im : 0)
		if (!Number.isFinite(re) || !Number.isFinite(im)) {
			throw new RangeError('Series sum overflows finite floating-point representation')
		}
		return { re: normalizeZero(re), im: normalizeZero(im) }
	}

	const u = { re: rVal.re - 1, im: rVal.im }
	const uAbs = Math.hypot(u.re, u.im)

	let re = 0
	let im = 0

	if (n * uAbs <= 0.5) {
		if (hasA) {
			const g = geometricNearOne(n, u)
			const term = cMul(aVal, g)
			re += term.re
			im += term.im
		}
		if (hasD) {
			const h = weightedNearOne(n, rVal, u)
			const term = cMul(dVal, h)
			re += term.re
			im += term.im
		}
	} else {
		const rPowNm1 = cPowInt(rVal, n - 1)
		const rPowN = cMul(rPowNm1, rVal)
		const g = cDiv({ re: rPowN.re - 1, im: rPowN.im }, u)

		if (hasA) {
			const term = cMul(aVal, g)
			re += term.re
			im += term.im
		}
		if (hasD) {
			const diff = { re: n * rPowNm1.re - g.re, im: n * rPowNm1.im - g.im }
			const h = cMul(rVal, cDiv(diff, u))
			const term = cMul(dVal, h)
			re += term.re
			im += term.im
		}
	}

	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Series sum overflows finite floating-point representation')
	}

	return { re: normalizeZero(re), im: normalizeZero(im) }
}
