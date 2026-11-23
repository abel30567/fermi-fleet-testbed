/**
 * Exact rational special functions using recursive and divide-and-conquer
 * (binary splitting, doubling, and transfer-matrix product tree) algorithms.
 *
 * Every rational input and output is represented as `{ num: BigInt, den: BigInt }`.
 * All returned rationals are normalized to lowest terms with `den > 0n`
 * (and zero is normalized to `{ num: 0n, den: 1n }`).
 *
 * @module ops/advanced/specialFunctionsRationalRecursive
 */

/**
 * Computes absolute value of a BigInt.
 * @param {bigint} a
 * @returns {bigint}
 */
function absBigInt(a) {
	return a < 0n ? -a : a
}

/**
 * Computes greatest common divisor of two BigInts (always non-negative).
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = absBigInt(a)
	let y = absBigInt(b)
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

/**
 * Normalizes a numerator/denominator pair to lowest terms with `den > 0n`.
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function normalize(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator cannot be zero')
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcdBigInt(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Validates and normalizes a rational input `{ num: BigInt, den: BigInt }`.
 * @param {unknown} value
 * @param {string} label
 * @returns {{ num: bigint, den: bigint }}
 */
function parseRational(value, label) {
	if (
		value === null ||
		typeof value !== 'object' ||
		Array.isArray(value) ||
		typeof value.num !== 'bigint' ||
		typeof value.den !== 'bigint'
	) {
		throw new TypeError(`${label} must be a rational object { num: BigInt, den: BigInt }`)
	}
	return normalize(value.num, value.den)
}

/**
 * Validates an integer argument (accepts safe integer number, BigInt, or exact integer rational).
 * @param {unknown} value
 * @param {string} label
 * @param {{ min?: number, max?: number }} [bounds]
 * @returns {number}
 */
function parseIntArg(value, label, bounds = {}) {
	let n
	if (typeof value === 'number') {
		if (!Number.isSafeInteger(value)) {
			throw new TypeError(`${label} must be a safe integer`)
		}
		n = value
	} else if (typeof value === 'bigint') {
		if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
			throw new RangeError(`${label} is out of safe integer range`)
		}
		n = Number(value)
	} else if (
		value !== null &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		typeof value.num === 'bigint' &&
		typeof value.den === 'bigint'
	) {
		const r = normalize(value.num, value.den)
		if (r.den !== 1n) {
			throw new RangeError(`${label} must be an integer value`)
		}
		if (r.num < BigInt(Number.MIN_SAFE_INTEGER) || r.num > BigInt(Number.MAX_SAFE_INTEGER)) {
			throw new RangeError(`${label} is out of safe integer range`)
		}
		n = Number(r.num)
	} else {
		throw new TypeError(`${label} must be an integer (number, BigInt, or integer rational)`)
	}

	if (bounds.min !== undefined && n < bounds.min) {
		throw new RangeError(`${label} must be >= ${bounds.min}`)
	}
	if (bounds.max !== undefined && n > bounds.max) {
		throw new RangeError(`${label} must be <= ${bounds.max}`)
	}
	return n
}

/**
 * Recursive divide-and-conquer exponentiation by squaring for BigInt.
 * @param {bigint} base
 * @param {number} exp - Non-negative integer exponent.
 * @returns {bigint}
 */
function powBigInt(base, exp) {
	if (exp === 0) return 1n
	if (exp === 1) return base
	const half = powBigInt(base, exp >> 1)
	const sq = half * half
	return (exp & 1) === 1 ? sq * base : sq
}

/**
 * Recursive divide-and-conquer product of integers in `[lo, hi]`.
 * @param {bigint} lo
 * @param {bigint} hi
 * @returns {bigint}
 */
function prodRange(lo, hi) {
	if (lo > hi) return 1n
	if (lo === hi) return lo
	const mid = (lo + hi) >> 1n
	return prodRange(lo, mid) * prodRange(mid + 1n, hi)
}

/**
 * Recursive divide-and-conquer product of `p + k * step * q` for `k` in `[lo, hi]`.
 * @param {bigint} p
 * @param {bigint} q
 * @param {bigint} step
 * @param {bigint} lo
 * @param {bigint} hi
 * @returns {bigint}
 */
function prodArithNumerators(p, q, step, lo, hi) {
	if (lo > hi) return 1n
	if (lo === hi) return p + lo * step * q
	const mid = (lo + hi) >> 1n
	const left = prodArithNumerators(p, q, step, lo, mid)
	if (left === 0n) return 0n
	const right = prodArithNumerators(p, q, step, mid + 1n, hi)
	return left * right
}

/**
 * Computes product of `(x + k * step)` for `k = 0 .. count - 1` via divide-and-conquer.
 * @param {{ num: bigint, den: bigint }} x
 * @param {bigint} step
 * @param {number} count
 * @returns {{ num: bigint, den: bigint }}
 */
function prodArithProgression(x, step, count) {
	if (count === 0) return { num: 1n, den: 1n }
	const numProd = prodArithNumerators(x.num, x.den, step, 0n, BigInt(count - 1))
	if (numProd === 0n) return { num: 0n, den: 1n }
	const denProd = powBigInt(x.den, count)
	return normalize(numProd, denProd)
}

/**
 * Exact rational subtraction `a - b`.
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function rSub(a, b) {
	return normalize(a.num * b.den - b.num * a.den, a.den * b.den)
}

/**
 * Exact rational multiplication `a * b`.
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function rMul(a, b) {
	return normalize(a.num * b.num, a.den * b.den)
}

/**
 * Recursive divide-and-conquer sum of an array of rationals over `[lo, hi]`.
 * @param {Array<{ num: bigint, den: bigint }>} terms
 * @param {number} lo
 * @param {number} hi
 * @returns {{ num: bigint, den: bigint }}
 */
function sumRationalsDC(terms, lo, hi) {
	if (lo > hi) return { num: 0n, den: 1n }
	if (lo === hi) return terms[lo]
	const mid = (lo + hi) >> 1
	const L = sumRationalsDC(terms, lo, mid)
	const R = sumRationalsDC(terms, mid + 1, hi)
	return {
		num: L.num * R.den + R.num * L.den,
		den: L.den * R.den,
	}
}

/**
 * Binary-splitting sum of `1 / k^r` for `k` in `[lo, hi]`.
 * @param {bigint} lo
 * @param {bigint} hi
 * @param {number} r
 * @returns {{ num: bigint, den: bigint }}
 */
function harmonicSplit(lo, hi, r) {
	if (lo === hi) {
		return { num: 1n, den: powBigInt(lo, r) }
	}
	const mid = (lo + hi) >> 1n
	const L = harmonicSplit(lo, mid, r)
	const R = harmonicSplit(mid + 1n, hi, r)
	return {
		num: L.num * R.den + R.num * L.den,
		den: L.den * R.den,
	}
}

/**
 * Binary-splitting sum of `q / (p + k * q)` for `k` in `[lo, hi]`.
 * @param {bigint} p
 * @param {bigint} q
 * @param {bigint} lo
 * @param {bigint} hi
 * @returns {{ num: bigint, den: bigint }}
 */
function digammaSplit(p, q, lo, hi) {
	if (lo === hi) {
		const d = p + lo * q
		if (d === 0n) {
			throw new RangeError('Digamma difference pole: x + k equals zero')
		}
		return { num: q, den: d }
	}
	const mid = (lo + hi) >> 1n
	const L = digammaSplit(p, q, lo, mid)
	const R = digammaSplit(p, q, mid + 1n, hi)
	return {
		num: L.num * R.den + R.num * L.den,
		den: L.den * R.den,
	}
}

/**
 * Multiplies two 2x2 BigInt matrices `[a, b, c, d]`.
 * @param {[bigint, bigint, bigint, bigint]} A
 * @param {[bigint, bigint, bigint, bigint]} B
 * @returns {[bigint, bigint, bigint, bigint]}
 */
function matMul2x2BigInt(A, B) {
	return [
		A[0] * B[0] + A[1] * B[2],
		A[0] * B[1] + A[1] * B[3],
		A[2] * B[0] + A[3] * B[2],
		A[2] * B[1] + A[3] * B[3],
	]
}

/**
 * Recursive divide-and-conquer product of 2x2 BigInt matrices `M(hi) * ... * M(lo)`.
 * @param {(k: bigint) => [bigint, bigint, bigint, bigint]} makeMat
 * @param {bigint} lo
 * @param {bigint} hi
 * @returns {[bigint, bigint, bigint, bigint]}
 */
function matProdDescDC(makeMat, lo, hi) {
	if (lo === hi) return makeMat(lo)
	const mid = (lo + hi) >> 1n
	const upper = matProdDescDC(makeMat, mid + 1n, hi)
	const lower = matProdDescDC(makeMat, lo, mid)
	return matMul2x2BigInt(upper, lower)
}

/**
 * Recursive divide-and-conquer power `M^exp` for a 2x2 BigInt matrix.
 * @param {[bigint, bigint, bigint, bigint]} M
 * @param {number} exp
 * @returns {[bigint, bigint, bigint, bigint]}
 */
function matPow2x2BigInt(M, exp) {
	if (exp === 0) return [1n, 0n, 0n, 1n]
	if (exp === 1) return M
	const half = matPow2x2BigInt(M, exp >> 1)
	const sq = matMul2x2BigInt(half, half)
	return (exp & 1) === 1 ? matMul2x2BigInt(sq, M) : sq
}

/**
 * Recursive doubling for Chebyshev polynomials of the first kind: returns `[T_n(x), T_{n+1}(x)]`.
 * @param {number} n
 * @param {{ num: bigint, den: bigint }} x
 * @returns {[{ num: bigint, den: bigint }, { num: bigint, den: bigint }]}
 */
function chebyshevTDoubling(n, x) {
	if (n === 0) {
		return [{ num: 1n, den: 1n }, x]
	}
	const [tk, tk1] = chebyshevTDoubling(n >> 1, x)
	const two = { num: 2n, den: 1n }
	const one = { num: 1n, den: 1n }
	const t2k = rSub(rMul(two, rMul(tk, tk)), one)
	const t2k1 = rSub(rMul(two, rMul(tk, tk1)), x)
	if ((n & 1) === 0) {
		return [t2k, t2k1]
	}
	const t2k2 = rSub(rMul(two, rMul(tk1, tk1)), one)
	return [t2k1, t2k2]
}

/**
 * Computes exact integer binomial coefficient `C(n, k)` via divide-and-conquer product ranges.
 * @param {number} n
 * @param {number} k
 * @returns {bigint}
 */
function intBinomial(n, k) {
	const m = Math.min(k, n - k)
	if (m === 0) return 1n
	return prodRange(BigInt(n - m + 1), BigInt(n)) / prodRange(1n, BigInt(m))
}

/**
 * Recursive memoized Bernoulli number `B_n` (`B_1 = -1/2`) using divide-and-conquer summation.
 * @param {number} n
 * @param {Map<number, { num: bigint, den: bigint }>} memo
 * @returns {{ num: bigint, den: bigint }}
 */
function bernoulliRec(n, memo) {
	if (memo.has(n)) return memo.get(n)
	if (n === 0) {
		const res = { num: 1n, den: 1n }
		memo.set(0, res)
		return res
	}
	if (n === 1) {
		const res = { num: -1n, den: 2n }
		memo.set(1, res)
		return res
	}
	if ((n & 1) === 1) {
		const res = { num: 0n, den: 1n }
		memo.set(n, res)
		return res
	}

	const terms = []
	for (let k = 0; k < n; k++) {
		if (k > 1 && (k & 1) === 1) continue
		const bk = bernoulliRec(k, memo)
		const c = intBinomial(n + 1, k)
		terms.push({ num: c * bk.num, den: bk.den })
	}
	const total = sumRationalsDC(terms, 0, terms.length - 1)
	const res = normalize(-total.num, total.den * BigInt(n + 1))
	memo.set(n, res)
	return res
}

/**
 * Binary splitting for generalized hypergeometric series `_p F_q(a; b; z)`.
 * Evaluates ratio steps for `k` in `[lo, hi)`.
 * @param {Array<{ num: bigint, den: bigint }>} aList
 * @param {Array<{ num: bigint, den: bigint }>} bList
 * @param {{ num: bigint, den: bigint }} z
 * @param {number} lo
 * @param {number} hi
 * @returns {{ P: bigint, Q: bigint, T: bigint }}
 */
function hypergeomSplit(aList, bList, z, lo, hi) {
	if (hi - lo === 1) {
		const k = BigInt(lo)
		let p = z.num
		let q = z.den * (k + 1n)
		for (let i = 0; i < aList.length; i++) {
			p *= aList[i].num + k * aList[i].den
			q *= aList[i].den
		}
		for (let j = 0; j < bList.length; j++) {
			const bj = bList[j].num + k * bList[j].den
			if (bj === 0n) {
				throw new RangeError('Hypergeometric pole: denominator parameter hits non-positive integer')
			}
			p *= bList[j].den
			q *= bj
		}
		return { P: p, Q: q, T: p }
	}
	const mid = (lo + hi) >> 1
	const L = hypergeomSplit(aList, bList, z, lo, mid)
	const R = hypergeomSplit(aList, bList, z, mid, hi)
	return {
		P: L.P * R.P,
		Q: L.Q * R.Q,
		T: L.T * R.Q + L.P * R.T,
	}
}

/**
 * Evaluates exact rational special functions using recursive and divide-and-conquer algorithms.
 *
 * Supported functions (`name`):
 * - `'gamma'`: `(n)` -> `(n - 1)!` for integer `n >= 1`.
 * - `'beta'`: `(p, q)` -> `B(p, q) = (p-1)!(q-1)! / (p+q-1)!` for integers `p, q >= 1`.
 * - `'pochhammer'`: `(x, n)` -> rising factorial `(x)_n` for rational `x`, integer `n`.
 * - `'falling'`: `(x, n)` -> falling factorial `x(x-1)...(x-n+1)` for rational `x`, integer `n >= 0`.
 * - `'binomial'`: `(x, k)` -> generalized binomial coefficient `C(x, k)` for rational `x`, integer `k`.
 * - `'harmonic'`: `(n, r = 1)` -> generalized harmonic number `H_n^(r) = sum_{k=1}^n 1/k^r` for `n >= 0, r >= 1`.
 * - `'digammaDiff'`: `(x, n)` -> `psi(x + n) - psi(x) = sum_{k=0}^{n-1} 1/(x + k)` for rational `x`, integer `n >= 0`.
 * - `'bernoulli'`: `(n)` -> `n`-th Bernoulli number `B_n` (`B_1 = -1/2`) for integer `n >= 0`.
 * - `'zetaNeg'`: `(n)` -> Riemann zeta at `-n`, `zeta(-n) = (-1)^n B_{n+1}/(n+1)` for integer `n >= 0`.
 * - `'legendre'`: `(n, x)` -> Legendre polynomial `P_n(x)` for integer `n >= 0`, rational `x`.
 * - `'chebyshevT'`: `(n, x)` -> Chebyshev polynomial of the first kind `T_n(x)` for integer `n >= 0`, rational `x`.
 * - `'chebyshevU'`: `(n, x)` -> Chebyshev polynomial of the second kind `U_n(x)` for integer `n >= 0`, rational `x`.
 * - `'hermite'`: `(n, x)` -> Physicists' Hermite polynomial `H_n(x)` for integer `n >= 0`, rational `x`.
 * - `'laguerre'`: `(n, x, alpha = { num: 0n, den: 1n })` -> Generalized Laguerre polynomial `L_n^(alpha)(x)`.
 * - `'hypergeom'`: `(aList, bList, z, terms?)` -> Generalized hypergeometric series `_p F_q(a; b; z)` via binary splitting.
 *
 * @param {string} name - Special function identifier.
 * @param {...unknown} args - Function arguments.
 * @returns {{ num: bigint, den: bigint }} Exact rational result in lowest terms with `den > 0n`.
 */
export function specialFunctionsRationalRecursive(name, ...args) {
	if (typeof name !== 'string' || name.length === 0) {
		throw new TypeError('Function name must be a non-empty string')
	}

	switch (name) {
		case 'gamma': {
			if (args.length !== 1) {
				throw new TypeError('gamma expects 1 argument: (n)')
			}
			const n = parseIntArg(args[0], 'n', { min: 1 })
			return { num: prodRange(1n, BigInt(n - 1)), den: 1n }
		}

		case 'beta': {
			if (args.length !== 2) {
				throw new TypeError('beta expects 2 arguments: (p, q)')
			}
			const p = parseIntArg(args[0], 'p', { min: 1 })
			const q = parseIntArg(args[1], 'q', { min: 1 })
			const a = Math.min(p, q)
			const b = Math.max(p, q)
			const num = prodRange(1n, BigInt(a - 1))
			const den = prodRange(BigInt(b), BigInt(a + b - 1))
			return normalize(num, den)
		}

		case 'pochhammer': {
			if (args.length !== 2) {
				throw new TypeError('pochhammer expects 2 arguments: (x, n)')
			}
			const x = parseRational(args[0], 'x')
			const n = parseIntArg(args[1], 'n')
			if (n === 0) return { num: 1n, den: 1n }
			if (n > 0) {
				return prodArithProgression(x, 1n, n)
			}
			const m = -n
			const shifted = rSub(x, { num: BigInt(m), den: 1n })
			const denom = prodArithProgression(shifted, 1n, m)
			if (denom.num === 0n) {
				throw new RangeError('Pochhammer pole: division by zero for negative order')
			}
			return normalize(denom.den, denom.num)
		}

		case 'falling': {
			if (args.length !== 2) {
				throw new TypeError('falling expects 2 arguments: (x, n)')
			}
			const x = parseRational(args[0], 'x')
			const n = parseIntArg(args[1], 'n', { min: 0 })
			return prodArithProgression(x, -1n, n)
		}

		case 'binomial': {
			if (args.length !== 2) {
				throw new TypeError('binomial expects 2 arguments: (x, k)')
			}
			const x = parseRational(args[0], 'x')
			const k = parseIntArg(args[1], 'k')
			if (k < 0) return { num: 0n, den: 1n }
			if (k === 0) return { num: 1n, den: 1n }
			const num = prodArithProgression(x, -1n, k)
			if (num.num === 0n) return { num: 0n, den: 1n }
			const factK = prodRange(1n, BigInt(k))
			return normalize(num.num, num.den * factK)
		}

		case 'harmonic': {
			if (args.length < 1 || args.length > 2) {
				throw new TypeError('harmonic expects 1 or 2 arguments: (n, r = 1)')
			}
			const n = parseIntArg(args[0], 'n', { min: 0 })
			const r = args.length === 2 && args[1] !== undefined ? parseIntArg(args[1], 'r', { min: 1 }) : 1
			if (n === 0) return { num: 0n, den: 1n }
			const sum = harmonicSplit(1n, BigInt(n), r)
			return normalize(sum.num, sum.den)
		}

		case 'digammaDiff': {
			if (args.length !== 2) {
				throw new TypeError('digammaDiff expects 2 arguments: (x, n)')
			}
			const x = parseRational(args[0], 'x')
			const n = parseIntArg(args[1], 'n', { min: 0 })
			if (n === 0) return { num: 0n, den: 1n }
			const sum = digammaSplit(x.num, x.den, 0n, BigInt(n - 1))
			return normalize(sum.num, sum.den)
		}

		case 'bernoulli': {
			if (args.length !== 1) {
				throw new TypeError('bernoulli expects 1 argument: (n)')
			}
			const n = parseIntArg(args[0], 'n', { min: 0 })
			return bernoulliRec(n, new Map())
		}

		case 'zetaNeg': {
			if (args.length !== 1) {
				throw new TypeError('zetaNeg expects 1 argument: (n)')
			}
			const n = parseIntArg(args[0], 'n', { min: 0 })
			const b = bernoulliRec(n + 1, new Map())
			if (b.num === 0n) return { num: 0n, den: 1n }
			const sign = (n & 1) === 0 ? 1n : -1n
			return normalize(sign * b.num, b.den * BigInt(n + 1))
		}

		case 'legendre': {
			if (args.length !== 2) {
				throw new TypeError('legendre expects 2 arguments: (n, x)')
			}
			const n = parseIntArg(args[0], 'n', { min: 0 })
			const x = parseRational(args[1], 'x')
			if (n === 0) return { num: 1n, den: 1n }
			if (n === 1) return x
			const { num: p, den: q } = x
			const M = matProdDescDC(
				(k) => [(2n * k - 1n) * p, -(k - 1n) * q, k * q, 0n],
				2n,
				BigInt(n)
			)
			const top = M[0] * p + M[1] * q
			const denom = prodRange(2n, BigInt(n)) * powBigInt(q, n)
			return normalize(top, denom)
		}

		case 'chebyshevT': {
			if (args.length !== 2) {
				throw new TypeError('chebyshevT expects 2 arguments: (n, x)')
			}
			const n = parseIntArg(args[0], 'n', { min: 0 })
			const x = parseRational(args[1], 'x')
			return chebyshevTDoubling(n, x)[0]
		}

		case 'chebyshevU': {
			if (args.length !== 2) {
				throw new TypeError('chebyshevU expects 2 arguments: (n, x)')
			}
			const n = parseIntArg(args[0], 'n', { min: 0 })
			const x = parseRational(args[1], 'x')
			if (n === 0) return { num: 1n, den: 1n }
			if (n === 1) return normalize(2n * x.num, x.den)
			const { num: p, den: q } = x
			// q * [U_k, U_{k-1}]^T = [[2p, -q], [q, 0]] * [U_{k-1}, U_{k-2}]^T
			// Starting from [U_1, U_0] = (1/q) * [2p, q]^T
			const M = matPow2x2BigInt([2n * p, -q, q, 0n], n - 1)
			const top = M[0] * (2n * p) + M[1] * q
			const denom = powBigInt(q, n)
			return normalize(top, denom)
		}

		case 'hermite': {
			if (args.length !== 2) {
				throw new TypeError('hermite expects 2 arguments: (n, x)')
			}
			const n = parseIntArg(args[0], 'n', { min: 0 })
			const x = parseRational(args[1], 'x')
			if (n === 0) return { num: 1n, den: 1n }
			if (n === 1) return normalize(2n * x.num, x.den)
			const { num: p, den: q } = x
			const M = matProdDescDC(
				(k) => [2n * p, -2n * (k - 1n) * q, q, 0n],
				2n,
				BigInt(n)
			)
			const top = M[0] * (2n * p) + M[1] * q
			const denom = powBigInt(q, n)
			return normalize(top, denom)
		}

		case 'laguerre': {
			if (args.length < 2 || args.length > 3) {
				throw new TypeError('laguerre expects 2 or 3 arguments: (n, x, alpha = 0)')
			}
			const n = parseIntArg(args[0], 'n', { min: 0 })
			const x = parseRational(args[1], 'x')
			const alpha =
				args.length === 3 && args[2] !== undefined
					? parseRational(args[2], 'alpha')
					: { num: 0n, den: 1n }
			if (n === 0) return { num: 1n, den: 1n }
			const D = x.den * alpha.den
			const X = x.num * alpha.den
			const A = alpha.num * x.den
			if (n === 1) return normalize(D + A - X, D)
			const M = matProdDescDC(
				(k) => [(2n * k - 1n) * D + A - X, -((k - 1n) * D + A), k * D, 0n],
				2n,
				BigInt(n)
			)
			const top = M[0] * (D + A - X) + M[1] * D
			const denom = prodRange(2n, BigInt(n)) * powBigInt(D, n)
			return normalize(top, denom)
		}

		case 'hypergeom': {
			if (args.length < 3 || args.length > 4) {
				throw new TypeError('hypergeom expects 3 or 4 arguments: (aList, bList, z, terms?)')
			}
			const [rawA, rawB, rawZ, rawTerms] = args
			if (!Array.isArray(rawA)) {
				throw new TypeError('aList must be an array of rational objects')
			}
			if (!Array.isArray(rawB)) {
				throw new TypeError('bList must be an array of rational objects')
			}
			const aList = rawA.map((v, i) => parseRational(v, `aList[${i}]`))
			const bList = rawB.map((v, i) => parseRational(v, `bList[${i}]`))
			const z = parseRational(rawZ, 'z')

			let naturalTerms = Infinity
			for (let i = 0; i < aList.length; i++) {
				const ai = aList[i]
				if (ai.den === 1n && ai.num <= 0n) {
					const m = Number(-ai.num) + 1
					if (m < naturalTerms) naturalTerms = m
				}
			}

			let effectiveTerms
			if (rawTerms === undefined) {
				if (!Number.isFinite(naturalTerms)) {
					throw new RangeError(
						'hypergeom requires an explicit positive integer terms count when series is non-terminating'
					)
				}
				effectiveTerms = naturalTerms
			} else {
				const requested = parseIntArg(rawTerms, 'terms', { min: 1 })
				effectiveTerms = Math.min(requested, naturalTerms)
			}

			if (effectiveTerms === 1) {
				return { num: 1n, den: 1n }
			}
			const split = hypergeomSplit(aList, bList, z, 0, effectiveTerms - 1)
			return normalize(split.Q + split.T, split.Q)
		}

		default:
			throw new RangeError(`Unknown special function: "${name}"`)
	}
}
