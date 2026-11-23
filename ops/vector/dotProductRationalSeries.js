/**
 * Computes the exact rational dot product of two vectors over Q.
 *
 * Each vector element is an exact rational `{ num: BigInt, den: BigInt }` with
 * `den !== 0n` (unreduced inputs and negative denominators are accepted and
 * normalized). The inner product is evaluated as the exact finite rational
 * series:
 *
 *   u · v = Σ_{i=0}^{n-1} u_i * v_i = (1 / L) * Σ_{i=0}^{n-1} r_i * (L / q_i)
 *
 * where each product term `u_i * v_i = r_i / q_i` is reduced via cross-cancellation
 * and `L = lcm(q_0, ..., q_{n-1})`. The returned rational is normalized in lowest
 * terms with `den > 0n` and `gcd(|num|, den) === 1n` (with zero represented as
 * `{ num: 0n, den: 1n }`).
 *
 * @param {Array<{ num: bigint, den: bigint }>} u - First rational vector.
 * @param {Array<{ num: bigint, den: bigint }>} v - Second rational vector (same length as `u`).
 * @returns {{ num: bigint, den: bigint }} Exact dot product in lowest terms.
 * @throws {TypeError} If `u` or `v` is not an array, or any element is not a valid `{ num: BigInt, den: BigInt }`.
 * @throws {RangeError} If `u` and `v` have different lengths, or any element has a zero denominator.
 */
export function dotProductRationalSeries(u, v) {
	if (!Array.isArray(u)) {
		throw new TypeError('First argument u must be an array of rationals')
	}
	if (!Array.isArray(v)) {
		throw new TypeError('Second argument v must be an array of rationals')
	}
	if (u.length !== v.length) {
		throw new RangeError(`Vector length mismatch: u.length (${u.length}) !== v.length (${v.length})`)
	}

	const terms = []
	for (let i = 0; i < u.length; i++) {
		const a = validateRational(u[i], `u[${i}]`)
		const b = validateRational(v[i], `v[${i}]`)
		const prod = multiplyNormalized(a, b)
		if (prod.num !== 0n) {
			terms.push(prod)
		}
	}

	if (terms.length === 0) {
		return { num: 0n, den: 1n }
	}

	let commonDen = 1n
	for (let i = 0; i < terms.length; i++) {
		commonDen = lcmBigInt(commonDen, terms[i].den)
	}

	let totalNum = 0n
	for (let i = 0; i < terms.length; i++) {
		totalNum += terms[i].num * (commonDen / terms[i].den)
	}

	return normalizeRational(totalNum, commonDen)
}

function absBigInt(x) {
	return x < 0n ? -x : x
}

function gcdBigInt(a, b) {
	let x = absBigInt(a)
	let y = absBigInt(b)
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

function lcmBigInt(a, b) {
	if (a === 0n || b === 0n) {
		return 0n
	}
	return (a / gcdBigInt(a, b)) * b
}

function normalizeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must not be zero')
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

function validateRational(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be an object of the form { num: BigInt, den: BigInt }`)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label} must have BigInt num and den properties`)
	}
	if (den === 0n) {
		throw new RangeError(`${label} denominator must not be zero`)
	}
	return normalizeRational(num, den)
}

function multiplyNormalized(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g1 = gcdBigInt(a.num, b.den)
	const g2 = gcdBigInt(b.num, a.den)
	return {
		num: (a.num / g1) * (b.num / g2),
		den: (a.den / g2) * (b.den / g1),
	}
}
