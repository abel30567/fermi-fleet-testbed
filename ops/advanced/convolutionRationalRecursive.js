/**
 * @typedef {Object} Rational
 * @property {bigint} num - Numerator as a BigInt.
 * @property {bigint} den - Denominator as a positive BigInt (> 0n) in lowest terms.
 */

/**
 * Computes the absolute value of a BigInt.
 * @param {bigint} n
 * @returns {bigint}
 */
function absBigInt(n) {
	return n < 0n ? -n : n
}

/**
 * Computes the greatest common divisor of two non-negative BigInts.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = a
	let y = b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Normalizes a rational number to lowest terms with a strictly positive denominator.
 * Zero is uniquely represented as `{ num: 0n, den: 1n }`.
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalizeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must not be 0n')
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
	const g = gcdBigInt(absBigInt(n), d)
	return { num: n / g, den: d / g }
}

/**
 * Validates and normalizes an array of rational numbers.
 * @param {unknown} seq
 * @param {string} name
 * @returns {Rational[]}
 */
function validateRationalArray(seq, name) {
	if (!Array.isArray(seq)) {
		throw new TypeError(`${name} must be an array of { num: bigint, den: bigint }`)
	}
	const out = new Array(seq.length)
	for (let i = 0; i < seq.length; i++) {
		if (!(i in seq)) {
			throw new TypeError(`${name}[${i}] must be a rational object { num: bigint, den: bigint }`)
		}
		const el = seq[i]
		if (el === null || typeof el !== 'object' || Array.isArray(el)) {
			throw new TypeError(`${name}[${i}] must be a rational object { num: bigint, den: bigint }`)
		}
		if (typeof el.num !== 'bigint' || typeof el.den !== 'bigint') {
			throw new TypeError(`${name}[${i}].num and ${name}[${i}].den must be BigInts`)
		}
		if (el.den === 0n) {
			throw new RangeError(`${name}[${i}].den must not be 0n`)
		}
		out[i] = normalizeRational(el.num, el.den)
	}
	return out
}

/**
 * Adds two normalized rationals, returning a normalized rational.
 * @param {Rational} x
 * @param {Rational} y
 * @returns {Rational}
 */
function addRational(x, y) {
	if (x.num === 0n) return { num: y.num, den: y.den }
	if (y.num === 0n) return { num: x.num, den: x.den }
	const g = gcdBigInt(x.den, y.den)
	const num = x.num * (y.den / g) + y.num * (x.den / g)
	if (num === 0n) return { num: 0n, den: 1n }
	const den = (x.den / g) * y.den
	const g2 = gcdBigInt(absBigInt(num), g)
	return { num: num / g2, den: den / g2 }
}

/**
 * Subtracts two normalized rationals (`x - y`), returning a normalized rational.
 * @param {Rational} x
 * @param {Rational} y
 * @returns {Rational}
 */
function subRational(x, y) {
	return addRational(x, { num: -y.num, den: y.den })
}

/**
 * Multiplies two normalized rationals, returning a normalized rational.
 * @param {Rational} x
 * @param {Rational} y
 * @returns {Rational}
 */
function mulRational(x, y) {
	if (x.num === 0n || y.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g1 = gcdBigInt(absBigInt(x.num), y.den)
	const g2 = gcdBigInt(absBigInt(y.num), x.den)
	return {
		num: (x.num / g1) * (y.num / g2),
		den: (x.den / g2) * (y.den / g1),
	}
}

/**
 * Adds two rational polynomials coefficient-wise.
 * @param {Rational[]} p
 * @param {Rational[]} q
 * @returns {Rational[]}
 */
function addPoly(p, q) {
	const len = Math.max(p.length, q.length)
	const res = new Array(len)
	for (let i = 0; i < len; i++) {
		if (i < p.length && i < q.length) {
			res[i] = addRational(p[i], q[i])
		} else if (i < p.length) {
			res[i] = { num: p[i].num, den: p[i].den }
		} else {
			res[i] = { num: q[i].num, den: q[i].den }
		}
	}
	return res
}

/**
 * Subtracts rational polynomial `q` from `p` coefficient-wise.
 * @param {Rational[]} p
 * @param {Rational[]} q
 * @returns {Rational[]}
 */
function subPoly(p, q) {
	const len = Math.max(p.length, q.length)
	const res = new Array(len)
	for (let i = 0; i < len; i++) {
		if (i < p.length && i < q.length) {
			res[i] = subRational(p[i], q[i])
		} else if (i < p.length) {
			res[i] = { num: p[i].num, den: p[i].den }
		} else {
			res[i] = { num: -q[i].num, den: q[i].den }
		}
	}
	return res
}

/**
 * Recursive divide-and-conquer (Karatsuba) discrete linear convolution over
 * non-empty arrays of normalized rationals.
 * @param {Rational[]} a
 * @param {Rational[]} b
 * @returns {Rational[]}
 */
function karatsubaConvolve(a, b) {
	const m = a.length
	const n = b.length

	if (m === 1) {
		const a0 = a[0]
		return b.map((bi) => mulRational(a0, bi))
	}
	if (n === 1) {
		const b0 = b[0]
		return a.map((ai) => mulRational(ai, b0))
	}

	const maxLen = Math.max(m, n)
	const mid = Math.floor(maxLen / 2)
	const outLen = m + n - 1
	const result = Array.from({ length: outLen }, () => ({ num: 0n, den: 1n }))

	// Unbalanced split when one sequence fits entirely in the lower half.
	if (m <= mid) {
		const b0 = b.slice(0, mid)
		const b1 = b.slice(mid)
		const z0 = karatsubaConvolve(a, b0)
		const z1 = karatsubaConvolve(a, b1)
		for (let i = 0; i < z0.length; i++) {
			result[i] = addRational(result[i], z0[i])
		}
		for (let i = 0; i < z1.length; i++) {
			result[i + mid] = addRational(result[i + mid], z1[i])
		}
		return result
	}

	if (n <= mid) {
		const a0 = a.slice(0, mid)
		const a1 = a.slice(mid)
		const z0 = karatsubaConvolve(a0, b)
		const z1 = karatsubaConvolve(a1, b)
		for (let i = 0; i < z0.length; i++) {
			result[i] = addRational(result[i], z0[i])
		}
		for (let i = 0; i < z1.length; i++) {
			result[i + mid] = addRational(result[i + mid], z1[i])
		}
		return result
	}

	// Balanced 3-way Karatsuba divide-and-conquer split:
	// A(x) = A0(x) + x^mid * A1(x), B(x) = B0(x) + x^mid * B1(x)
	// A(x)*B(x) = z0 + x^mid * ((A0+A1)*(B0+B1) - z0 - z2) + x^(2*mid) * z2
	const a0 = a.slice(0, mid)
	const a1 = a.slice(mid)
	const b0 = b.slice(0, mid)
	const b1 = b.slice(mid)

	const z0 = karatsubaConvolve(a0, b0)
	const z2 = karatsubaConvolve(a1, b1)
	const z1Full = karatsubaConvolve(addPoly(a0, a1), addPoly(b0, b1))
	const z1 = subPoly(subPoly(z1Full, z0), z2)

	for (let i = 0; i < z0.length; i++) {
		result[i] = addRational(result[i], z0[i])
	}
	for (let i = 0; i < z1.length; i++) {
		const idx = i + mid
		if (idx < outLen) {
			result[idx] = addRational(result[idx], z1[i])
		}
	}
	for (let i = 0; i < z2.length; i++) {
		result[i + 2 * mid] = addRational(result[i + 2 * mid], z2[i])
	}

	return result
}

/**
 * Computes the discrete linear convolution of two sequences of exact rational
 * numbers using a recursive divide-and-conquer (Karatsuba) algorithm.
 *
 * Each element in the input sequences must be an object `{ num: bigint, den: bigint }`
 * with `den !== 0n`. All output elements are normalized exact rationals in lowest
 * terms with `den > 0n` (zero is `{ num: 0n, den: 1n }`).
 *
 * If either input sequence is empty, returns `[]`.
 *
 * @param {ReadonlyArray<Rational>} a - First sequence of exact rationals.
 * @param {ReadonlyArray<Rational>} b - Second sequence of exact rationals.
 * @returns {Rational[]} Discrete linear convolution `a * b` of length `a.length + b.length - 1` (or `[]` if either input is empty).
 * @throws {TypeError} If `a` or `b` is not an array of `{ num: bigint, den: bigint }` objects.
 * @throws {RangeError} If any rational has denominator `0n`.
 */
export function convolutionRationalRecursive(a, b) {
	const normA = validateRationalArray(a, 'a')
	const normB = validateRationalArray(b, 'b')

	if (normA.length === 0 || normB.length === 0) {
		return []
	}

	return karatsubaConvolve(normA, normB)
}
