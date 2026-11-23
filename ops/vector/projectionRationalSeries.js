/**
 * Exact rational number in lowest terms with positive denominator.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Compute the absolute value of a BigInt.
 *
 * @param {bigint} x
 * @returns {bigint}
 */
function absBigInt(x) {
	return x < 0n ? -x : x
}

/**
 * Compute the non-negative greatest common divisor of two BigInts
 * using the Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	a = absBigInt(a)
	b = absBigInt(b)
	while (b !== 0n) {
		const r = a % b
		a = b
		b = r
	}
	return a
}

/**
 * Normalize a rational (num / den) to lowest terms with den > 0n
 * and gcd(|num|, den) === 1n.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalizeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must be non-zero')
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = gcdBigInt(num, den)
	return { num: num / g, den: den / g }
}

/**
 * Add two normalized rationals.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function addRational(a, b) {
	const g = gcdBigInt(a.den, b.den)
	const aDenReduced = a.den / g
	const bDenReduced = b.den / g
	return normalizeRational(
		a.num * bDenReduced + b.num * aDenReduced,
		aDenReduced * b.den
	)
}

/**
 * Multiply two normalized rationals with cross-cancellation to keep
 * intermediate values small.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function mulRational(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g1 = gcdBigInt(a.num, b.den)
	const g2 = gcdBigInt(b.num, a.den)
	return normalizeRational(
		(a.num / g1) * (b.num / g2),
		(a.den / g2) * (b.den / g1)
	)
}

/**
 * Divide normalized rational a by non-zero normalized rational b.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function divRational(a, b) {
	if (b.num === 0n) {
		throw new RangeError('Division by zero rational')
	}
	return mulRational(a, normalizeRational(b.den, b.num))
}

/**
 * Validate and normalize an input vector of rational objects.
 *
 * @param {unknown} vec
 * @param {string} name
 * @returns {Rational[]}
 */
function parseRationalVector(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an array of rational objects`)
	}
	if (vec.length === 0) {
		throw new RangeError(`${name} must be a non-empty vector`)
	}
	const out = new Array(vec.length)
	for (let i = 0; i < vec.length; i++) {
		const el = vec[i]
		if (
			el === null ||
			typeof el !== 'object' ||
			typeof el.num !== 'bigint' ||
			typeof el.den !== 'bigint'
		) {
			throw new TypeError(
				`${name}[${i}] must be a rational object { num: bigint, den: bigint }`
			)
		}
		if (el.den === 0n) {
			throw new RangeError(`${name}[${i}] denominator must be non-zero`)
		}
		out[i] = normalizeRational(el.num, el.den)
	}
	return out
}

/**
 * Compute the exact orthogonal projection of rational vector `u` onto
 * non-zero rational vector `v` using the closed-form inner-product identity:
 *
 *   proj_v(u) = ((u · v) / (v · v)) * v
 *             = ((sum_i u_i * v_i) / (sum_i v_i^2)) * v
 *
 * All arithmetic is performed over exact BigInt rationals and every output
 * component is returned in lowest terms with `den > 0n` and
 * `gcd(|num|, den) === 1n`.
 *
 * @param {Rational[]} u - Vector being projected.
 * @param {Rational[]} v - Non-zero target vector onto which `u` is projected.
 * @returns {Rational[]} The exact rational projection vector `proj_v(u)`.
 * @throws {TypeError} If `u` or `v` is not an array of `{ num: bigint, den: bigint }` objects.
 * @throws {RangeError} If either vector is empty, lengths differ, any denominator is `0n`, or `v` is the zero vector.
 */
export function projectionRationalSeries(u, v) {
	const uNorm = parseRationalVector(u, 'u')
	const vNorm = parseRationalVector(v, 'v')

	if (uNorm.length !== vNorm.length) {
		throw new RangeError(
			`Vector length mismatch: u has length ${uNorm.length}, v has length ${vNorm.length}`
		)
	}

	let uDotV = { num: 0n, den: 1n }
	let vDotV = { num: 0n, den: 1n }

	for (let i = 0; i < uNorm.length; i++) {
		uDotV = addRational(uDotV, mulRational(uNorm[i], vNorm[i]))
		vDotV = addRational(vDotV, mulRational(vNorm[i], vNorm[i]))
	}

	if (vDotV.num === 0n) {
		throw new RangeError('Cannot project onto the zero vector')
	}

	const scale = divRational(uDotV, vDotV)
	return vNorm.map((vi) => mulRational(scale, vi))
}
