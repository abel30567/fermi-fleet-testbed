const MAX_POWER = 20

/**
 * Greatest common divisor of two BigInts (non-negative result).
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function bigintGcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

/**
 * Reduced rational addition: (a/b) + (c/d).
 * @param {[bigint, bigint]} r1
 * @param {[bigint, bigint]} r2
 * @returns {[bigint, bigint]}
 */
function ratAdd([a, b], [c, d]) {
	const num = a * d + c * b
	const den = b * d
	const g = bigintGcd(num, den)
	return [num / g, den / g]
}

/**
 * Reduced rational multiplication: (a/b) * (c/d).
 * @param {[bigint, bigint]} r1
 * @param {[bigint, bigint]} r2
 * @returns {[bigint, bigint]}
 */
function ratMul([a, b], [c, d]) {
	const num = a * c
	const den = b * d
	const g = bigintGcd(num, den)
	return [num / g, den / g]
}

/**
 * Compute binomial coefficient C(n, k) as a BigInt.
 * @param {number} n
 * @param {number} k
 * @returns {bigint}
 */
function binomial(n, k) {
	if (k < 0 || k > n) return 0n
	const kk = Math.min(k, n - k)
	let res = 1n
	for (let i = 1; i <= kk; i++) {
		res = (res * BigInt(n - kk + i)) / BigInt(i)
	}
	return res
}

/**
 * Cached second Bernoulli numbers B_m^+ as exact reduced rationals [num, den].
 * B_0^+ = 1, B_1^+ = 1/2, B_2^+ = 1/6, B_3^+ = 0, B_4^+ = -1/30, ...
 * @type {Array<[bigint, bigint]>}
 */
const bernoulliPlusCache = [[1n, 1n]]

/**
 * Return the m-th second Bernoulli number B_m^+ as an exact reduced rational [num, den].
 * Uses the recurrence: sum_{k=0}^{m} C(m+1, k) * B_k^+ = m + 1.
 * @param {number} m
 * @returns {[bigint, bigint]}
 */
function bernoulliPlus(m) {
	while (bernoulliPlusCache.length <= m) {
		const idx = bernoulliPlusCache.length
		if (idx > 1 && idx % 2 === 1) {
			bernoulliPlusCache.push([0n, 1n])
			continue
		}
		/** @type {[bigint, bigint]} */
		let acc = [0n, 1n]
		for (let k = 0; k < idx; k++) {
			const c = binomial(idx + 1, k)
			acc = ratAdd(acc, ratMul([c, 1n], bernoulliPlusCache[k]))
		}
		// B_idx^+ = 1 - acc / (idx + 1)
		const divided = ratMul(acc, [1n, BigInt(idx + 1)])
		const val = ratAdd([1n, 1n], [-divided[0], divided[1]])
		bernoulliPlusCache.push(val)
	}
	return bernoulliPlusCache[m]
}

/**
 * Cache of Faulhaber polynomials for powers p >= 4.
 * Entry: { coeffs: bigint[], denom: bigint } where
 * S_p(n) = (sum_{j=0}^{p} coeffs[j] * n^{p + 1 - j}) / denom
 * with coeffs[0] corresponding to n^{p+1} down to coeffs[p] corresponding to n^1.
 * @type {Map<number, { coeffs: bigint[], denom: bigint }>}
 */
const faulhaberCache = new Map()

/**
 * Get the exact integer-coefficient Faulhaber polynomial for power p.
 * Formula: S_p(n) = (1 / (p + 1)) * sum_{j=0}^{p} C(p + 1, j) * B_j^+ * n^{p + 1 - j}.
 * @param {number} p
 * @returns {{ coeffs: bigint[], denom: bigint }}
 */
function getFaulhaberPoly(p) {
	let entry = faulhaberCache.get(p)
	if (entry) return entry

	/** @type {Array<[bigint, bigint]>} */
	const rationals = []
	let denom = 1n
	for (let j = 0; j <= p; j++) {
		const bj = bernoulliPlus(j)
		const factor = [binomial(p + 1, j), BigInt(p + 1)]
		const term = ratMul(factor, bj)
		rationals.push(term)
		const g = bigintGcd(denom, term[1])
		denom = (denom / g) * term[1]
	}

	const coeffs = rationals.map(([num, den]) => num * (denom / den))
	entry = { coeffs, denom }
	faulhaberCache.set(p, entry)
	return entry
}

/**
 * Evaluate the discrete power sum S_p(n) = sum_{k=1}^{n} k^p using closed-form
 * identities (exact for p = 0..3 fast paths, and exact Faulhaber-Bernoulli
 * polynomial evaluation via Horner's method for higher powers or large n).
 *
 * @param {number} n Non-negative safe integer upper limit.
 * @param {number} p Non-negative integer power in [0, MAX_POWER].
 * @returns {number}
 */
function evalDiscretePowerSum(n, p) {
	if (n === 0) return 0

	if (p === 0) {
		return n
	}

	if (p === 1) {
		// S_1(n) = n(n + 1) / 2; exact in float64 for n <= 134217727.
		if (n <= 134217727) {
			return n % 2 === 0 ? (n / 2) * (n + 1) : n * ((n + 1) / 2)
		}
		const bn = BigInt(n)
		return Number((bn * (bn + 1n)) / 2n)
	}

	if (p === 2) {
		// S_2(n) = n(n + 1)(2n + 1) / 6; exact in float64 for n <= 300000.
		if (n <= 300000) {
			let a = n
			let b = n + 1
			let c = 2 * n + 1
			if (a % 2 === 0) a /= 2
			else b /= 2
			if (a % 3 === 0) a /= 3
			else if (b % 3 === 0) b /= 3
			else c /= 3
			return a * b * c
		}
		const bn = BigInt(n)
		return Number((bn * (bn + 1n) * (2n * bn + 1n)) / 6n)
	}

	if (p === 3) {
		// Nicomachus's theorem: S_3(n) = (n(n + 1) / 2)^2; exact in float64 for n <= 13774.
		if (n <= 13774) {
			const t = n % 2 === 0 ? (n / 2) * (n + 1) : n * ((n + 1) / 2)
			return t * t
		}
		const bn = BigInt(n)
		const t = (bn * (bn + 1n)) / 2n
		return Number(t * t)
	}

	// General closed-form Faulhaber polynomial via Horner's method:
	// S_p(n) = ((((c_0 * n + c_1) * n + ... + c_p) * n) / denom)
	const { coeffs, denom } = getFaulhaberPoly(p)
	const bn = BigInt(n)
	let acc = 0n
	for (let j = 0; j < coeffs.length; j++) {
		acc = acc * bn + coeffs[j]
	}
	acc *= bn
	return Number(acc / denom)
}

/**
 * Validate a single upper-limit value n.
 * @param {number} n
 * @param {number} index
 */
function assertValidLimit(n, index) {
	if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > Number.MAX_SAFE_INTEGER) {
		throw new RangeError(
			`limits[${index}] must be a non-negative safe integer; received ${n}`
		)
	}
}

/**
 * Validate a power exponent p.
 * @param {number} p
 * @param {string} label
 */
function assertValidPower(p, label) {
	if (!Number.isFinite(p) || !Number.isInteger(p) || p < 0 || p > MAX_POWER) {
		throw new RangeError(
			`${label} must be an integer between 0 and ${MAX_POWER}; received ${p}`
		)
	}
}

/**
 * Computes discrete power summations element-wise over `Float64Array` inputs
 * using closed-form Faulhaber / Bernoulli series identities:
 *
 *   out[i] = sum_{k=1}^{limits[i]} k^{p_i}
 *
 * where `p_i` is either the scalar `power` (default `1`, yielding triangular
 * sums `n(n + 1) / 2`) or `power[i]` when a second `Float64Array` is supplied.
 * For `limits[i] === 0`, the empty sum evaluates to `0`.
 *
 * Uses closed-form identities for `p = 0..3` (including Nicomachus's theorem
 * for `p = 3`) and exact Faulhaber polynomials derived from the second
 * Bernoulli numbers `B_j^+` for `4 <= p <= 20`.
 *
 * @param {Float64Array} limits - Element-wise non-negative safe integer upper bounds `n`.
 * @param {number | Float64Array} [power=1] - Non-negative integer exponent `p` in `[0, 20]`,
 *   or a `Float64Array` of matching length specifying per-element exponents.
 * @returns {Float64Array} A new `Float64Array` containing the element-wise discrete sums.
 * @throws {TypeError} If `limits` is not a `Float64Array`, or if `power` is neither
 *   `undefined`, a `number`, nor a `Float64Array`.
 * @throws {RangeError} If any limit is negative, non-integer, non-finite, or exceeds
 *   `Number.MAX_SAFE_INTEGER`; if `power` is a `Float64Array` whose length differs from
 *   `limits.length`; or if any power is outside integer `[0, 20]`.
 */
export function summationTypedSeries(limits, power = 1) {
	if (!(limits instanceof Float64Array)) {
		throw new TypeError('limits must be a Float64Array')
	}

	const len = limits.length
	const out = new Float64Array(len)

	if (power instanceof Float64Array) {
		if (power.length !== len) {
			throw new RangeError(
				`power length (${power.length}) must match limits length (${len})`
			)
		}
		for (let i = 0; i < len; i++) {
			const n = limits[i]
			const p = power[i]
			assertValidLimit(n, i)
			assertValidPower(p, `power[${i}]`)
			out[i] = evalDiscretePowerSum(n, p)
		}
		return out
	}

	if (typeof power !== 'number') {
		throw new TypeError('power must be a number or a Float64Array')
	}

	assertValidPower(power, 'power')

	for (let i = 0; i < len; i++) {
		const n = limits[i]
		assertValidLimit(n, i)
		out[i] = evalDiscretePowerSum(n, power)
	}

	return out
}
