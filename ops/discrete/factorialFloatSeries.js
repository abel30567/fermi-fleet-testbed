/**
 * High-precision double-double constants (hi + lo) for ln(2) and 0.5 * ln(2*pi).
 * Computed to >106-bit accuracy so compensated range reduction preserves full
 * IEEE-754 float64 precision across the entire finite factorial domain (0..170).
 */
const LN2 = [0.6931471805599453, 2.3190468138462996e-17]
const HALF_LN_2PI = [0.9189385332046728, -3.8782941580672414e-17]

/**
 * Exact rational coefficients c_k = B_{2k} / (2k * (2k - 1)) for k = 1..10
 * in Stirling's asymptotic Bernoulli series for ln(n!):
 *   ln(n!) ~ (n + 1/2) * ln(n) - n + (1/2) * ln(2*pi) + sum_{k>=1} c_k / n^(2k-1)
 */
const STIRLING_COEFFS = [
	[1, 12],
	[-1, 360],
	[1, 1260],
	[-1, 1680],
	[1, 1188],
	[-691, 360360],
	[1, 156],
	[-3617, 122400],
	[43867, 244188],
	[-174611, 125400],
]

/** Largest non-negative integer whose factorial is exact in IEEE-754 float64. */
const EXACT_FLOAT64_MAX_N = 22

/** Largest non-negative integer whose factorial is finite in IEEE-754 float64. */
const FINITE_FLOAT64_MAX_N = 170

/** Veltkamp splitting constant (2^27 + 1) for IEEE-754 float64. */
const VELTKAMP_SPLIT = 134217729

function twoSum(a, b) {
	const s = a + b
	const bb = s - a
	const e = (a - (s - bb)) + (b - bb)
	return [s, e]
}

function quickTwoSum(a, b) {
	const s = a + b
	const e = b - (s - a)
	return [s, e]
}

function split(a) {
	const c = VELTKAMP_SPLIT * a
	const hi = c - (c - a)
	const lo = a - hi
	return [hi, lo]
}

function twoProd(a, b) {
	const p = a * b
	const [ah, al] = split(a)
	const [bh, bl] = split(b)
	const e = ((ah * bh - p) + ah * bl + al * bh) + al * bl
	return [p, e]
}

function ddAdd(a, b) {
	const [s1, s2] = twoSum(a[0], b[0])
	const [t1, t2] = twoSum(a[1], b[1])
	const [c1, c2] = quickTwoSum(s1, s2 + t1)
	return quickTwoSum(c1, c2 + t2)
}

function ddSub(a, b) {
	return ddAdd(a, [-b[0], -b[1]])
}

function ddMul(a, b) {
	const [p1, p2] = twoProd(a[0], b[0])
	return quickTwoSum(p1, p2 + a[0] * b[1] + a[1] * b[0])
}

function ddDiv(a, b) {
	const q1 = a[0] / b[0]
	const r1 = ddSub(a, ddMul([q1, 0], b))
	const q2 = r1[0] / b[0]
	const r2 = ddSub(r1, ddMul([q2, 0], b))
	const q3 = r2[0] / b[0]
	const [s1, s2] = quickTwoSum(q1, q2)
	return ddAdd([s1, s2], [q3, 0])
}

/**
 * Computes ln(n) in double-double precision via binary argument reduction
 * n = 2^e * m (m in [sqrt(2)/2, sqrt(2)]) and the odd atanh power series:
 *   ln(m) = 2 * sum_{j=0}^{inf} u^(2j+1) / (2j+1),  u = (m - 1) / (m + 1).
 */
function ddLn(n) {
	let e = 0
	let m = n
	while (m >= Math.SQRT2) {
		m *= 0.5
		e += 1
	}
	while (m < Math.SQRT1_2) {
		m *= 2
		e -= 1
	}
	const u = ddDiv([m - 1, 0], [m + 1, 0])
	const u2 = ddMul(u, u)
	let term = u
	let sum = u
	for (let k = 3; k <= 35; k += 2) {
		term = ddMul(term, u2)
		const contrib = ddDiv(term, [k, 0])
		sum = ddAdd(sum, contrib)
		if (Math.abs(contrib[0]) < 1e-34) break
	}
	const lnM = [sum[0] * 2, sum[1] * 2]
	return ddAdd(lnM, ddMul([e, 0], LN2))
}

/**
 * Computes exp(r) in double-double precision for |r| <= ln(2)/2
 * via the Maclaurin series sum_{k=0}^{inf} r^k / k!.
 */
function ddExpSmall(r) {
	let sum = [1, 0]
	let term = [1, 0]
	for (let k = 1; k <= 30; k++) {
		term = ddDiv(ddMul(term, r), [k, 0])
		sum = ddAdd(sum, term)
		if (Math.abs(term[0]) < 1e-34) break
	}
	return sum
}

/**
 * Computes the discrete factorial n! over IEEE-754 float64 Numbers using
 * exact multiplicative identity for small integers and Stirling's asymptotic
 * Bernoulli series with compensated (double-double) arithmetic for larger
 * integers.
 *
 * Algorithm:
 * - For 0 <= n <= 22: computes n! = prod_{i=1}^{n} i directly in IEEE-754
 *   float64, where every factorial value is bit-exact.
 * - For 23 <= n <= 170: evaluates Stirling's asymptotic series for ln(n!)
 *     ln(n!) = (n + 1/2) * ln(n) - n + (1/2) * ln(2*pi)
 *              + sum_{k=1}^{10} B_{2k} / (2k * (2k - 1) * n^(2k-1))
 *   in double-double precision (using the atanh series for ln(n)), performs
 *   binary range reduction ln(n!) = k * ln(2) + r with |r| <= ln(2)/2,
 *   evaluates exp(r) via its Maclaurin series, and scales exactly by 2^k.
 *   This achieves correctly rounded (0-ULP) IEEE-754 float64 accuracy across
 *   the entire finite domain 0 <= n <= 170.
 * - For integer n > 170: returns Infinity since 171! > Number.MAX_VALUE.
 *
 * @param {number} n - Non-negative integer input.
 * @returns {number} The factorial n! as an IEEE-754 float64 Number (or Infinity for integer n > 170).
 * @throws {TypeError} If `n` is not of type `'number'`.
 * @throws {RangeError} If `n` is NaN, non-finite, negative, or not an integer.
 */
export function factorialFloatSeries(n) {
	if (typeof n !== 'number') {
		throw new TypeError(`Expected n to be a number, got ${typeof n}`)
	}
	if (!Number.isInteger(n) || n < 0) {
		throw new RangeError(`Expected n to be a non-negative integer, got ${n}`)
	}
	if (n <= EXACT_FLOAT64_MAX_N) {
		let prod = 1
		for (let i = 2; i <= n; i++) {
			prod *= i
		}
		return prod
	}
	if (n > FINITE_FLOAT64_MAX_N) {
		return Infinity
	}

	const lnN = ddLn(n)
	let logFact = ddAdd(
		ddSub(ddMul([n + 0.5, 0], lnN), [n, 0]),
		HALF_LN_2PI,
	)

	const invN = ddDiv([1, 0], [n, 0])
	const invN2 = ddMul(invN, invN)
	let pow = invN
	let prevMag = Infinity
	for (const [num, den] of STIRLING_COEFFS) {
		const coeff = ddDiv([num, 0], [den, 0])
		const term = ddMul(coeff, pow)
		const mag = Math.abs(term[0])
		if (mag > prevMag) break
		logFact = ddAdd(logFact, term)
		prevMag = mag
		if (mag < 1e-32) break
		pow = ddMul(pow, invN2)
	}

	const k = Math.round(logFact[0] / LN2[0])
	const r = ddSub(logFact, ddMul([k, 0], LN2))
	const expR = ddExpSmall(r)
	return (expR[0] + expR[1]) * (2 ** k)
}
