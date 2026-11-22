/**
 * Exact orthogonal vector projection over rational numbers `{ num: BigInt, den: BigInt }`.
 *
 * Computes `proj_v(u) = ((u · v) / (v · v)) * v` using a straightforward iterative algorithm,
 * returning each component in canonical lowest terms (`den > 0n`, and `{ num: 0n, den: 1n }` for zero).
 */

/**
 * Compute the non-negative greatest common divisor of two BigInts iteratively.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const remainder = x % y
		x = y
		y = remainder
	}
	return x
}

/**
 * Normalize a rational number to lowest terms with a positive denominator.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(num, den) {
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
 * Validate and normalize a single rational component.
 *
 * @param {unknown} q
 * @param {string} vectorName
 * @param {number} index
 * @returns {{ num: bigint, den: bigint }}
 */
function parseRational(q, vectorName, index) {
	if (typeof q !== 'object' || q === null || Array.isArray(q)) {
		throw new TypeError(`${vectorName}[${index}] must be a rational object { num: BigInt, den: BigInt }`)
	}
	if (typeof q.num !== 'bigint' || typeof q.den !== 'bigint') {
		throw new TypeError(`${vectorName}[${index}] must have BigInt num and den properties`)
	}
	if (q.den === 0n) {
		throw new RangeError(`${vectorName}[${index}] has a zero denominator`)
	}
	return normalizeRational(q.num, q.den)
}

/**
 * Add two normalized rationals.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function addRational(a, b) {
	if (a.num === 0n) return b
	if (b.num === 0n) return a
	const g = gcdBigInt(a.den, b.den)
	const aDenReduced = a.den / g
	const bDenReduced = b.den / g
	const num = a.num * bDenReduced + b.num * aDenReduced
	const den = aDenReduced * b.den
	return normalizeRational(num, den)
}

/**
 * Multiply two normalized rationals.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function mulRational(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g1 = gcdBigInt(a.num, b.den)
	const g2 = gcdBigInt(b.num, a.den)
	const num = (a.num / g1) * (b.num / g2)
	const den = (a.den / g2) * (b.den / g1)
	return normalizeRational(num, den)
}

/**
 * Divide normalized rational `a` by non-zero normalized rational `b`.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function divRational(a, b) {
	if (b.num === 0n) {
		throw new RangeError('Division by zero rational')
	}
	return mulRational(a, normalizeRational(b.den, b.num))
}

/**
 * Compute the orthogonal projection of exact rational vector `u` onto non-zero exact
 * rational vector `v`:
 *
 *   proj_v(u) = ((u · v) / (v · v)) * v
 *
 * Each vector is a non-empty array of `{ num: BigInt, den: BigInt }` objects with `den !== 0n`.
 * Output components are returned in canonical lowest terms (`den > 0n`, `{ num: 0n, den: 1n }` for zero).
 *
 * @param {Array<{ num: bigint, den: bigint }>} u - Vector to project.
 * @param {Array<{ num: bigint, den: bigint }>} v - Non-zero target vector onto which `u` is projected.
 * @returns {Array<{ num: bigint, den: bigint }>} Exact orthogonal projection vector.
 * @throws {TypeError} If `u` or `v` is not an array or contains invalid rational entries.
 * @throws {RangeError} If `u` or `v` is empty, lengths differ, any denominator is `0n`, or `v` is the zero vector.
 */
export function projectionRationalIterative(u, v) {
	if (!Array.isArray(u)) {
		throw new TypeError('u must be an array of rational objects')
	}
	if (!Array.isArray(v)) {
		throw new TypeError('v must be an array of rational objects')
	}
	if (u.length === 0 || v.length === 0) {
		throw new RangeError('Vectors u and v must be non-empty')
	}
	if (u.length !== v.length) {
		throw new RangeError(`Vector length mismatch: u has length ${u.length}, v has length ${v.length}`)
	}

	const n = u.length
	const normU = new Array(n)
	const normV = new Array(n)

	for (let i = 0; i < n; i++) {
		normU[i] = parseRational(u[i], 'u', i)
		normV[i] = parseRational(v[i], 'v', i)
	}

	let dotUV = { num: 0n, den: 1n }
	let dotVV = { num: 0n, den: 1n }

	for (let i = 0; i < n; i++) {
		dotUV = addRational(dotUV, mulRational(normU[i], normV[i]))
		dotVV = addRational(dotVV, mulRational(normV[i], normV[i]))
	}

	if (dotVV.num === 0n) {
		throw new RangeError('Target vector v must not be the zero vector')
	}

	const scale = divRational(dotUV, dotVV)
	const result = new Array(n)

	for (let i = 0; i < n; i++) {
		result[i] = mulRational(scale, normV[i])
	}

	return result
}
