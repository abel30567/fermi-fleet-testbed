/**
 * Default fixed-point scale factor (10^18) used to represent exact or rounded
 * non-integer curl components as BigInt values.
 */
export const CURL_SCALE = 10n ** 18n

const MAX_ORDER = 16

/**
 * Recursive Euclidean greatest common divisor for BigInt values.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	const absA = a < 0n ? -a : a
	const absB = b < 0n ? -b : b
	if (absB === 0n) return absA
	return gcdBigInt(absB, absA % absB)
}

/**
 * Construct a reduced exact BigInt rational { num, den } with den > 0n.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function makeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Denominator must be non-zero')
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const n = den < 0n ? -num : num
	const d = den < 0n ? -den : den
	const g = gcdBigInt(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Add two exact BigInt rationals.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function addRational(a, b) {
	return makeRational(a.num * b.den + b.num * a.den, a.den * b.den)
}

/**
 * Subtract two exact BigInt rationals (a - b).
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function subRational(a, b) {
	return makeRational(a.num * b.den - b.num * a.den, a.den * b.den)
}

/**
 * Multiply an exact BigInt rational by factorNum / factorDen.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {bigint} factorNum
 * @param {bigint} [factorDen=1n]
 * @returns {{ num: bigint, den: bigint }}
 */
function scaleRational(a, factorNum, factorDen = 1n) {
	return makeRational(a.num * factorNum, a.den * factorDen)
}

/**
 * Divide numerator by positive denominator, rounding ties to even.
 *
 * @param {bigint} numerator
 * @param {bigint} denominator
 * @returns {bigint}
 */
function divRoundHalfToEven(numerator, denominator) {
	const negative = numerator < 0n
	const absNum = negative ? -numerator : numerator
	let quotient = absNum / denominator
	const remainder = absNum % denominator
	const twiceRemainder = remainder * 2n
	if (
		twiceRemainder > denominator ||
		(twiceRemainder === denominator && (quotient & 1n) === 1n)
	) {
		quotient += 1n
	}
	return negative ? -quotient : quotient
}

/**
 * 3D Levi-Civita permutation symbol epsilon_{i,j,k} in { -1n, 0n, 1n }.
 *
 * @param {number} i
 * @param {number} j
 * @param {number} k
 * @returns {bigint}
 */
function leviCivita(i, j, k) {
	if (i === j || j === k || i === k) return 0n
	if (
		(i === 0 && j === 1 && k === 2) ||
		(i === 1 && j === 2 && k === 0) ||
		(i === 2 && j === 0 && k === 1)
	) {
		return 1n
	}
	return -1n
}

/**
 * Validate a 3-element BigInt vector.
 *
 * @param {unknown} vec
 * @param {string} label
 * @returns {[bigint, bigint, bigint]}
 */
function validateVector3(vec, label) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${label} must be an array of 3 BigInts`)
	}
	if (vec.length !== 3) {
		throw new RangeError(`${label} must have length 3, received ${vec.length}`)
	}
	for (let idx = 0; idx < 3; idx++) {
		if (typeof vec[idx] !== 'bigint') {
			throw new TypeError(
				`${label}[${idx}] must be a BigInt, received ${typeof vec[idx]}`
			)
		}
	}
	return [vec[0], vec[1], vec[2]]
}

/**
 * Validate curlBigIntRecursive options and fill defaults.
 *
 * @param {unknown} options
 * @returns {{ step: bigint, order: number, scale: bigint }}
 */
function validateOptions(options) {
	if (options === undefined) {
		return { step: 1n, order: 2, scale: CURL_SCALE }
	}
	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('options must be a plain object')
	}

	const { step = 1n, order = 2, scale = CURL_SCALE } = options

	if (typeof step !== 'bigint') {
		throw new TypeError(`options.step must be a BigInt, received ${typeof step}`)
	}
	if (step <= 0n) {
		throw new RangeError('options.step must be a positive BigInt (> 0n)')
	}

	if (typeof order !== 'number' || !Number.isInteger(order)) {
		throw new TypeError('options.order must be an integer')
	}
	if (order < 0 || order > MAX_ORDER) {
		throw new RangeError(
			`options.order must be between 0 and ${MAX_ORDER}, received ${order}`
		)
	}

	if (typeof scale !== 'bigint') {
		throw new TypeError(`options.scale must be a BigInt, received ${typeof scale}`)
	}
	if (scale <= 0n) {
		throw new RangeError('options.scale must be a positive BigInt (> 0n)')
	}

	return { step, order, scale }
}

/**
 * Compute the 3D curl (∇ × F) of a BigInt vector field at a point using a
 * recursive divide-and-conquer implementation with exact BigInt rational
 * Richardson extrapolation over central differences.
 *
 * Each output component is returned as a fixed-point BigInt scaled by
 * `options.scale` (default `10n ** 18n`), rounded half-to-even when the exact
 * rational value is non-integer.
 *
 * Because partial derivatives are ratios ΔF / Δx, `field` may operate either on
 * unscaled integer BigInts or on fixed-point BigInts sharing a common scale for
 * inputs and outputs; in both cases the resulting curl is scaled by `options.scale`.
 * With the default Richardson depth `order = 2`, polynomial vector fields up to
 * degree 6 are differentiated exactly even with `step = 1n`.
 *
 * @param {(x: bigint, y: bigint, z: bigint) => [bigint, bigint, bigint]} field
 *   3D vector field mapping BigInt coordinates `(x, y, z)` to `[Fx, Fy, Fz]`.
 * @param {[bigint, bigint, bigint]} point
 *   Evaluation point `[x, y, z]` as 3 BigInts.
 * @param {object} [options]
 *   Optional numerical differentiation and scaling settings.
 * @param {bigint} [options.step=1n]
 *   Positive BigInt base step size `h` for central differences.
 * @param {number} [options.order=2]
 *   Non-negative integer Richardson extrapolation recursion depth (0..16).
 *   `0` uses plain central differences; depth `d` eliminates error terms up to
 *   `O(h^(2d))` (exact for polynomials of degree <= 2d + 2).
 * @param {bigint} [options.scale=10n ** 18n]
 *   Positive BigInt fixed-point scale factor applied to the output components.
 * @returns {[bigint, bigint, bigint]}
 *   Fixed-point BigInt 3D curl vector `[curlX, curlY, curlZ]` scaled by `options.scale`.
 */
export function curlBigIntRecursive(field, point, options) {
	if (typeof field !== 'function') {
		throw new TypeError(`field must be a function, received ${typeof field}`)
	}

	const [px, py, pz] = validateVector3(point, 'point')
	const { step, order, scale } = validateOptions(options)

	// Per-call memoization avoids duplicate field evaluations across shared axes.
	const fieldCache = new Map()

	/**
	 * Evaluate and validate field at (x, y, z), memoizing by coordinate tuple.
	 *
	 * @param {bigint} x
	 * @param {bigint} y
	 * @param {bigint} z
	 * @returns {[bigint, bigint, bigint]}
	 */
	function evalField(x, y, z) {
		const key = `${x},${y},${z}`
		if (fieldCache.has(key)) {
			return fieldCache.get(key)
		}
		const result = validateVector3(field(x, y, z), 'field(x, y, z)')
		fieldCache.set(key, result)
		return result
	}

	/**
	 * Compute partial derivative ∂F_{componentIdx}/∂x_{axisIdx} as an exact
	 * BigInt rational using recursive Richardson extrapolation over step-doubled
	 * central differences.
	 *
	 * @param {number} componentIdx
	 * @param {number} axisIdx
	 * @returns {{ num: bigint, den: bigint }}
	 */
	function richardsonPartial(componentIdx, axisIdx) {
		const memo = new Map()

		function solve(stepExp, depth) {
			const key = `${stepExp}:${depth}`
			if (memo.has(key)) {
				return memo.get(key)
			}

			let value
			if (depth === 0) {
				const delta = step << BigInt(stepExp)
				const plus = [px, py, pz]
				const minus = [px, py, pz]
				plus[axisIdx] += delta
				minus[axisIdx] -= delta
				const fPlus = evalField(plus[0], plus[1], plus[2])[componentIdx]
				const fMinus = evalField(minus[0], minus[1], minus[2])[componentIdx]
				value = makeRational(fPlus - fMinus, 2n * delta)
			} else {
				const fine = solve(stepExp, depth - 1)
				const coarse = solve(stepExp + 1, depth - 1)
				const weight = 1n << BigInt(2 * depth) // 4^depth
				const numerator = subRational(scaleRational(fine, weight), coarse)
				value = scaleRational(numerator, 1n, weight - 1n)
			}

			memo.set(key, value)
			return value
		}

		return solve(0, order)
	}

	/**
	 * Divide-and-conquer reduction over Levi-Civita terms for a single curl component.
	 *
	 * @param {Array<{ j: number, k: number, sign: bigint }>} terms
	 * @param {number} lo
	 * @param {number} hi
	 * @returns {{ num: bigint, den: bigint }}
	 */
	function reduceTerms(terms, lo, hi) {
		if (lo === hi) {
			const { j, k, sign } = terms[lo]
			const partial = richardsonPartial(k, j)
			return sign === 1n ? partial : { num: -partial.num, den: partial.den }
		}
		const mid = (lo + hi) >> 1
		const left = reduceTerms(terms, lo, mid)
		const right = reduceTerms(terms, mid + 1, hi)
		return addRational(left, right)
	}

	/**
	 * Collect all non-zero Levi-Civita index pairs (j, k) for component i.
	 *
	 * @param {number} i
	 * @returns {Array<{ j: number, k: number, sign: bigint }>}
	 */
	function collectLeviCivitaTerms(i) {
		const terms = []
		for (let j = 0; j < 3; j++) {
			for (let k = 0; k < 3; k++) {
				const sign = leviCivita(i, j, k)
				if (sign !== 0n) {
					terms.push({ j, k, sign })
				}
			}
		}
		return terms
	}

	/**
	 * Divide-and-conquer assembly of curl components in [lo, hi].
	 *
	 * @param {number} lo
	 * @param {number} hi
	 * @returns {bigint[]}
	 */
	function assembleComponents(lo, hi) {
		if (lo === hi) {
			const terms = collectLeviCivitaTerms(lo)
			const exact = reduceTerms(terms, 0, terms.length - 1)
			const scaled = divRoundHalfToEven(exact.num * scale, exact.den)
			return [scaled]
		}
		const mid = (lo + hi) >> 1
		const left = assembleComponents(lo, mid)
		const right = assembleComponents(mid + 1, hi)
		return [...left, ...right]
	}

	const [cx, cy, cz] = assembleComponents(0, 2)
	return [cx, cy, cz]
}
