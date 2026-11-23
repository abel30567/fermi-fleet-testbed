/**
 * Computes the falling factorial (discrete permutations) P(n, k) over dual numbers
 * { v, d }, carrying a forward-mode derivative alongside the primal value, using a
 * recursive divide-and-conquer product tree with exact Gamma-digamma derivatives.
 *
 * For non-negative integer k:
 *   P(n, k) = prod_{i=0}^{k-1} (n - i)
 *
 * More generally, via analytic continuation:
 *   P(n, k) = Gamma(n + 1) / Gamma(n - k + 1)
 * with exact total differential:
 *   dP = (dP/dn) * n.d + (dP/dk) * k.d
 *      = P(n, k) * ((psi(n + 1) - psi(n - k + 1)) * n.d + psi(n - k + 1) * k.d)
 * and exact limiting derivative when n - k + 1 is a non-positive integer -m:
 *   P(n, k) = 0,  dP = (-1)^m * m! * Gamma(n + 1) * (n.d - k.d).
 *
 * @typedef {{ v: number, d: number }} Dual
 *
 * @param {Dual} n - Total count (dual number with finite n.v >= 0 and finite n.d).
 * @param {Dual} k - Selection count (dual number with finite k.v >= 0 and finite k.d).
 * @returns {Dual} Dual number { v, d } representing P(n, k) and its forward derivative.
 * @throws {TypeError} If n or k is not a dual number object { v, d } with numeric fields.
 * @throws {RangeError} If v or d is non-finite, or if n.v < 0 or k.v < 0.
 */
export function permutationsDualRecursive(n, k) {
	validateDual(n, 'n')
	validateDual(k, 'k')

	if (n.v < 0) {
		throw new RangeError('n.v must be non-negative')
	}
	if (k.v < 0) {
		throw new RangeError('k.v must be non-negative')
	}

	// Base case: P(n, 0) = 1, dP/dn = 0, dP/dk = psi(n + 1)
	if (k.v === 0) {
		const d = k.d === 0 ? 0 : digammaRecursive(n.v + 1) * k.d
		return { v: 1, d: normalizeZero(d) }
	}

	const x = n.v - k.v + 1
	const isZeroPole = x <= 0 && Number.isInteger(x)

	// Integer k: recursive divide-and-conquer dual product tree (O(log k) stack depth)
	if (Number.isInteger(k.v) && k.v <= 10000) {
		if (isZeroPole) {
			if (n.d === k.d) {
				return { v: 0, d: 0 }
			}
			// At n - k + 1 = -m (m >= 0 integer), dP/dk = -dP/dn, so total derivative
			// equals the dual product derivative evaluated with effective tangent (n.d - k.d).
			const prod = fallingProductDual({ v: n.v, d: n.d - k.d }, 0, k.v)
			return { v: 0, d: normalizeZero(prod.d) }
		}

		const prod = fallingProductDual(n, 0, k.v)
		const d = k.d === 0 ? prod.d : prod.d + prod.v * digammaRecursive(x) * k.d
		return { v: normalizeZero(prod.v), d: normalizeZero(d) }
	}

	// Non-integer k (or very large integer k): Gamma / digamma analytic continuation
	if (isZeroPole) {
		if (n.d === k.d) {
			return { v: 0, d: 0 }
		}
		const m = -x
		const sign = m % 2 === 0 ? 1 : -1
		const mag = Math.exp(logGammaPositive(n.v + 1) + logGammaPositive(m + 1))
		const d = sign * mag * (n.d - k.d)
		return { v: 0, d: normalizeZero(d) }
	}

	const logGammaN1 = logGammaPositive(n.v + 1)
	const { logAbs: logGammaX, sign: signX } = logGammaSign(x)
	const v = signX * Math.exp(logGammaN1 - logGammaX)

	let d = 0
	if (n.d !== 0 || k.d !== 0) {
		const psiN1 = n.d === 0 ? 0 : digammaRecursive(n.v + 1)
		const psiX = digammaRecursive(x)
		d = v * (psiN1 * n.d - psiX * (n.d - k.d))
	}

	return { v: normalizeZero(v), d: normalizeZero(d) }
}

/**
 * Validates that an argument is a dual number { v, d } with finite numeric fields.
 *
 * @param {unknown} value
 * @param {string} name
 */
function validateDual(value, name) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${name} must be a dual number object { v, d }`)
	}
	if (typeof value.v !== 'number' || typeof value.d !== 'number') {
		throw new TypeError(`${name}.v and ${name}.d must be numbers`)
	}
	if (!Number.isFinite(value.v) || !Number.isFinite(value.d)) {
		throw new RangeError(`${name}.v and ${name}.d must be finite numbers`)
	}
}

/**
 * Normalizes -0 to +0.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Multiplies two dual numbers: (a.v + a.d*e)(b.v + b.d*e).
 *
 * @param {{ v: number, d: number }} a
 * @param {{ v: number, d: number }} b
 * @returns {{ v: number, d: number }}
 */
function dualMul(a, b) {
	return {
		v: a.v * b.v,
		d: a.v * b.d + a.d * b.v,
	}
}

/**
 * Recursive divide-and-conquer product tree for prod_{i=lo}^{hi-1} (n - i) over dual numbers.
 *
 * @param {{ v: number, d: number }} n
 * @param {number} lo - Inclusive lower offset.
 * @param {number} hi - Exclusive upper offset.
 * @returns {{ v: number, d: number }}
 */
function fallingProductDual(n, lo, hi) {
	const count = hi - lo
	if (count <= 0) {
		return { v: 1, d: 0 }
	}
	if (count === 1) {
		return { v: n.v - lo, d: n.d }
	}
	const mid = lo + Math.floor(count / 2)
	const left = fallingProductDual(n, lo, mid)
	const right = fallingProductDual(n, mid, hi)
	return dualMul(left, right)
}

const LANCZOS_G = 7
const LANCZOS_COEFFS = [
	0.99999999999980993,
	676.5203681218851,
	-1259.1392167224028,
	771.32342877765313,
	-176.61502916214059,
	12.507343278686905,
	-0.13857109526572012,
	9.9843695780195716e-6,
	1.5056327351493116e-7,
]

/**
 * Computes ln(Gamma(x)) for x > 0 using recursive shift + Lanczos approximation.
 *
 * @param {number} x
 * @returns {number}
 */
function logGammaPositive(x) {
	if (x < 0.5) {
		return logGammaPositive(x + 1) - Math.log(x)
	}
	const z = x - 1
	let sum = LANCZOS_COEFFS[0]
	for (let i = 1; i < LANCZOS_COEFFS.length; i++) {
		sum += LANCZOS_COEFFS[i] / (z + i)
	}
	const t = z + LANCZOS_G + 0.5
	return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum)
}

/**
 * Computes ln(|Gamma(x)|) and sign(Gamma(x)) for any real x not a non-positive integer.
 *
 * @param {number} x
 * @returns {{ logAbs: number, sign: number }}
 */
function logGammaSign(x) {
	if (x > 0) {
		return { logAbs: logGammaPositive(x), sign: 1 }
	}
	const q = Math.floor(x)
	const r = x - q
	const sign = q % 2 === 0 ? 1 : -1
	const logAbs = Math.log(Math.PI) - Math.log(Math.sin(Math.PI * r)) - logGammaPositive(1 - x)
	return { logAbs, sign }
}

/**
 * Computes the digamma function psi(x) = Gamma'(x) / Gamma(x) for real x not a
 * non-positive integer, using reflection for x < 0, recursive recurrence shift
 * to x >= 12, and the Bernoulli asymptotic expansion.
 *
 * @param {number} x
 * @returns {number}
 */
function digammaRecursive(x) {
	if (x < 0) {
		const r = x - Math.floor(x)
		return digammaRecursive(1 - x) - (Math.PI * Math.cos(Math.PI * r)) / Math.sin(Math.PI * r)
	}
	if (x < 12) {
		return digammaRecursive(x + 1) - 1 / x
	}
	const inv = 1 / x
	const inv2 = inv * inv
	return (
		Math.log(x) -
		0.5 * inv -
		inv2 *
			(1 / 12 -
				inv2 *
					(1 / 120 -
						inv2 *
							(1 / 252 -
								inv2 *
									(1 / 240 -
										inv2 *
											(1 / 132 -
												inv2 * (691 / 32760 - inv2 * (1 / 12)))))))
	)
}
