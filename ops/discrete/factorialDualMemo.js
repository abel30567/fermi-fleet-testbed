/**
 * Computes the discrete factorial over a dual number `{ v, d }`, propagating
 * the forward-mode derivative alongside the primal value using a precomputed
 * and lazily memoized lookup table.
 *
 * Uses the analytic extension `f(x) = Gamma(x + 1)` evaluated at non-negative
 * integer primal values `n = x.v`:
 *   - Primal value: `f(n) = n!`
 *   - Derivative:   `f'(n) = Gamma'(n + 1) = n! * psi(n + 1) = n! * (H_n - gamma)`
 * where `H_n = sum_{k=1..n} 1/k` is the `n`-th harmonic number (`H_0 = 0`) and
 * `gamma` is the Euler-Mascheroni constant.
 *
 * By the chain rule for dual numbers `x = v + d * eps`:
 *   `factorialDualMemo({ v, d }) = { v: n!, d: n! * (H_n - gamma) * d }`
 *
 * Table-driven / memoized strategy:
 *   - Entries `0..20` (all exact IEEE-754 integer factorials) are precomputed at
 *     module load time.
 *   - Entries `21..170` (the largest finite IEEE-754 float64 factorial) are
 *     computed lazily on first access and cached in module-level tables using
 *     Kahan compensated summation for `H_n`.
 *   - Integers `n > 170` overflow float64 in `O(1)` without extending the table.
 *
 * @param {{ v: number, d: number }} x - Input dual number with non-negative integer `v` and finite `d`.
 * @returns {{ v: number, d: number }} Resulting dual number `{ v, d }`.
 * @throws {TypeError} If `x` is not a non-null object or `x.v`/`x.d` are not numbers.
 * @throws {RangeError} If `x.v` is not a finite non-negative integer or `x.d` is not finite.
 */

const EULER_GAMMA = 0.5772156649015329
const MAX_FINITE_N = 170
const PRECOMPUTED_N = 20

/** @type {number[]} Memoized values of n! for 0 <= n <= cachedN. */
const factTable = [1]

/** @type {number[]} Memoized values of psi(n + 1) = H_n - gamma for 0 <= n <= cachedN. */
const psiTable = [-EULER_GAMMA]

let cachedN = 0
let harmonicSum = 0
let harmonicComp = 0

/**
 * Extends the memoized factorial and digamma tables up to `targetN` (capped at MAX_FINITE_N).
 *
 * @param {number} targetN - Target non-negative integer index <= MAX_FINITE_N.
 */
function ensureMemo(targetN) {
	if (targetN <= cachedN) return
	for (let k = cachedN + 1; k <= targetN; k++) {
		factTable[k] = factTable[k - 1] * k
		// Kahan compensated summation for H_k = H_{k-1} + 1/k
		const y = 1 / k - harmonicComp
		const t = harmonicSum + y
		harmonicComp = t - harmonicSum - y
		harmonicSum = t
		psiTable[k] = harmonicSum - EULER_GAMMA + harmonicComp
	}
	cachedN = targetN
}

// Precompute exact IEEE-754 integer factorials (0! through 20!).
ensureMemo(PRECOMPUTED_N)

/**
 * Evaluates the discrete factorial over a dual number `{ v, d }`.
 *
 * @param {{ v: number, d: number }} x - Dual number `{ v, d }`.
 * @returns {{ v: number, d: number }} Dual number `{ v: v!, d: v! * (H_v - gamma) * d }`.
 */
export function factorialDualMemo(x) {
	if (x === null || typeof x !== 'object') {
		throw new TypeError('factorialDualMemo expects a non-null dual number object { v, d }')
	}
	const { v, d } = x
	if (typeof v !== 'number') {
		throw new TypeError('factorialDualMemo expects dual.v to be a number')
	}
	if (typeof d !== 'number') {
		throw new TypeError('factorialDualMemo expects dual.d to be a number')
	}
	if (!Number.isInteger(v) || v < 0) {
		throw new RangeError('factorialDualMemo expects dual.v to be a finite non-negative integer')
	}
	if (!Number.isFinite(d)) {
		throw new RangeError('factorialDualMemo expects dual.d to be a finite number')
	}

	if (v > MAX_FINITE_N) {
		return {
			v: Infinity,
			d: d === 0 ? 0 : d > 0 ? Infinity : -Infinity,
		}
	}

	// Normalize -0 to 0 for table indexing.
	const n = v === 0 ? 0 : v
	ensureMemo(n)

	const value = factTable[n]
	if (d === 0) {
		return { v: value, d: 0 }
	}

	const deriv = value * (psiTable[n] * d)
	return { v: value, d: deriv }
}
