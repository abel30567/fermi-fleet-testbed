/**
 * Fixed-point scale factor: 10^18 (18 decimal places of precision).
 * All fixed-point BigInt values represent `realValue * SCALE`.
 * @type {bigint}
 */
export const SCALE = 10n ** 18n

const GUARD = 10n ** 12n
const WORK_SCALE = SCALE * GUARD // 10^30 internal fixed-point precision
const DEFAULT_STEPS = 4000n
const DEFAULT_DECAY_CUTOFF = 50n // e^-50 ≈ 1.9e-22 < 10^-18
const EXP_REFRESH_INTERVAL = 64n
const VALID_METHODS = new Set(['auto', 'boole', 'simpson', 'trapezoidal'])

/**
 * Exact BigInt division with round-half-away-from-zero for positive denominator.
 *
 * @param {bigint} num - Numerator.
 * @param {bigint} den - Strictly positive denominator.
 * @returns {bigint} Rounded quotient.
 */
function divRound(num, den) {
	if (num >= 0n) {
		return (2n * num + den) / (2n * den)
	}
	return -((2n * -num + den) / (2n * den))
}

/**
 * Iteratively computes exp(-x) at internal fixed-point scale WORK_SCALE (10^30),
 * using power-of-two range reduction, Taylor series, and iterative squaring.
 *
 * @param {bigint} xWork - Non-negative exponent x scaled by WORK_SCALE.
 * @returns {bigint} exp(-x) scaled by WORK_SCALE.
 */
function expNegWork(xWork) {
	if (xWork <= 0n) return WORK_SCALE
	// e^(-70) ≈ 3.98e-31 < 0.5 * 10^-30
	if (xWork >= 70n * WORK_SCALE) return 0n

	let k = 0n
	let pow2 = 1n
	const quarter = WORK_SCALE >> 2n
	while (xWork > quarter * pow2) {
		k += 1n
		pow2 <<= 1n
	}

	const extra = 1_000_000n
	const extScale = WORK_SCALE * extra
	const rExt = divRound(xWork * extra, pow2)

	let sum = extScale
	let term = extScale
	let n = 1n
	while (term !== 0n) {
		term = divRound(-term * rExt, n * extScale)
		sum += term
		n += 1n
	}

	let val = divRound(sum, extra)
	for (let i = 0n; i < k; i += 1n) {
		val = divRound(val * val, WORK_SCALE)
	}
	return val
}

/**
 * Selects the quadrature rule and validates step count compatibility.
 *
 * @param {string} method - Requested quadrature method.
 * @param {bigint} steps - Number of subintervals.
 * @returns {{ rule: 'boole' | 'simpson' | 'trapezoidal', factorNum: bigint, factorDen: bigint }}
 */
function resolveQuadrature(method, steps) {
	if (method === 'boole') {
		if (steps % 4n !== 0n) {
			throw new RangeError('steps must be a positive multiple of 4n for method "boole"')
		}
		return { rule: 'boole', factorNum: 2n, factorDen: 45n }
	}
	if (method === 'simpson') {
		if (steps % 2n !== 0n) {
			throw new RangeError('steps must be a positive even BigInt for method "simpson"')
		}
		return { rule: 'simpson', factorNum: 1n, factorDen: 3n }
	}
	if (method === 'trapezoidal') {
		return { rule: 'trapezoidal', factorNum: 1n, factorDen: 2n }
	}
	// method === 'auto'
	if (steps % 4n === 0n) {
		return { rule: 'boole', factorNum: 2n, factorDen: 45n }
	}
	if (steps % 2n === 0n) {
		return { rule: 'simpson', factorNum: 1n, factorDen: 3n }
	}
	return { rule: 'trapezoidal', factorNum: 1n, factorDen: 2n }
}

/**
 * Returns the Newton-Cotes quadrature weight for grid index k in [0, steps].
 *
 * @param {'boole' | 'simpson' | 'trapezoidal'} rule - Selected rule.
 * @param {bigint} k - Current grid index.
 * @param {bigint} steps - Total subintervals.
 * @returns {bigint} Quadrature weight.
 */
function quadratureWeight(rule, k, steps) {
	if (rule === 'boole') {
		if (k === 0n || k === steps) return 7n
		const mod = k % 4n
		if (mod === 0n) return 14n
		if (mod === 2n) return 12n
		return 32n
	}
	if (rule === 'simpson') {
		if (k === 0n || k === steps) return 1n
		return k % 2n === 0n ? 2n : 4n
	}
	return k === 0n || k === steps ? 1n : 2n
}

/**
 * Computes the unilateral Laplace transform:
 *
 *     F(s) = L{f}(s) = integral from 0 to infinity of f(t) * exp(-s * t) dt
 *
 * using pure BigInt fixed-point arithmetic (scaled by 10^18) and a straightforward
 * iterative Newton-Cotes quadrature loop (Composite Boole's rule by default, with
 * Composite Simpson's and Composite Trapezoidal rules also supported).
 *
 * Fixed-point convention:
 * - Every real number x is represented as a BigInt `round(x * 10^18)` (`SCALE = 10n ** 18n`).
 * - The integrand callback `fn(t)` receives `t` scaled by `10^18` and must return `f(t)`
 *   scaled by `10^18`.
 * - The transform parameter `s`, optional `upperBound`, and the returned value `F(s)` are
 *   all BigInt values scaled by `10^18`.
 * - Internal exponential and accumulation math runs at 10^30 precision (12 guard digits)
 *   before rounding back to 10^18.
 *
 * @param {(t: bigint) => bigint} fn - Time-domain function taking fixed-point t (scaled by 10^18)
 *   and returning fixed-point f(t) (scaled by 10^18).
 * @param {bigint} s - Non-negative Laplace parameter scaled by 10^18. Must be strictly positive
 *   (`s > 0n`) when `options.upperBound` is omitted.
 * @param {object} [options] - Optional numerical integration settings.
 * @param {bigint} [options.upperBound] - Finite integration upper limit T scaled by 10^18
 *   (must be `>= 0n`). Defaults to `ceil(50 * 10^36 / s)` so that `exp(-s * T) <= exp(-50) < 10^-21`.
 * @param {bigint} [options.steps=4000n] - Number of uniform subintervals (positive BigInt).
 *   Must be divisible by 4n for `'boole'` or by 2n for `'simpson'`.
 * @param {'auto' | 'boole' | 'simpson' | 'trapezoidal'} [options.method='auto'] - Quadrature rule.
 *   `'auto'` selects `'boole'` when `steps % 4n === 0n`, `'simpson'` when `steps % 2n === 0n`,
 *   and `'trapezoidal'` otherwise.
 * @returns {bigint} Approximate Laplace transform F(s) scaled by 10^18.
 * @throws {TypeError} If any argument or callback return value has an invalid type.
 * @throws {RangeError} If any numeric parameter is out of its valid domain.
 */
export function laplaceTransformBigIntIterative(fn, s, options = {}) {
	if (typeof fn !== 'function') {
		throw new TypeError('fn must be a function')
	}
	if (typeof s !== 'bigint') {
		throw new TypeError('s must be a BigInt')
	}
	if (s < 0n) {
		throw new RangeError('s must be non-negative')
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object')
	}

	const { upperBound: rawUpperBound, steps = DEFAULT_STEPS, method = 'auto' } = options

	if (typeof steps !== 'bigint') {
		throw new TypeError('options.steps must be a BigInt')
	}
	if (steps < 1n) {
		throw new RangeError('options.steps must be >= 1n')
	}

	if (typeof method !== 'string') {
		throw new TypeError('options.method must be a string')
	}
	if (!VALID_METHODS.has(method)) {
		throw new RangeError(
			`options.method must be one of: ${Array.from(VALID_METHODS).join(', ')}`
		)
	}

	const { rule, factorNum, factorDen } = resolveQuadrature(method, steps)

	let upperBound
	if (rawUpperBound === undefined) {
		if (s === 0n) {
			throw new RangeError('s must be > 0n when options.upperBound is not provided')
		}
		// T = ceil(50 / s_real) in SCALE units = ceil(50 * SCALE^2 / s)
		upperBound = (DEFAULT_DECAY_CUTOFF * SCALE * SCALE + s - 1n) / s
	} else {
		if (typeof rawUpperBound !== 'bigint') {
			throw new TypeError('options.upperBound must be a BigInt')
		}
		if (rawUpperBound < 0n) {
			throw new RangeError('options.upperBound must be >= 0n')
		}
		upperBound = rawUpperBound
	}

	if (upperBound === 0n) {
		return 0n
	}

	// Step decay factor exp(-s * h) at WORK_SCALE
	const shWork = divRound(s * upperBound * GUARD, steps * SCALE)
	const stepDecay = s === 0n ? WORK_SCALE : expNegWork(shWork)

	let weightedSum = 0n
	let expVal = WORK_SCALE

	for (let k = 0n; k <= steps; k += 1n) {
		const t = divRound(k * upperBound, steps)
		const ft = fn(t)
		if (typeof ft !== 'bigint') {
			throw new TypeError('fn(t) must return a BigInt')
		}

		if (s > 0n && k > 0n) {
			if (k % EXP_REFRESH_INTERVAL === 0n) {
				const stWork = divRound(s * k * upperBound * GUARD, steps * SCALE)
				expVal = expNegWork(stWork)
			} else {
				expVal = divRound(expVal * stepDecay, WORK_SCALE)
			}
		}

		const w = quadratureWeight(rule, k, steps)
		weightedSum += w * ft * expVal
	}

	const numerator = weightedSum * factorNum * upperBound
	const denominator = factorDen * steps * SCALE * WORK_SCALE
	return divRound(numerator, denominator)
}
