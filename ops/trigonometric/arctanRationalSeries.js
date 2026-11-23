/**
 * Exact rational arithmetic helpers and arctan over exact rationals.
 *
 * Uses exact rational argument reduction (reciprocal, complementary, and
 * tangent-addition identities with Machin's formula for pi/4) so that every
 * series evaluation satisfies |r| <= 1/5, guaranteeing rapid convergence for
 * all rational inputs including |x| >= 1.
 */

/**
 * Compute the greatest common divisor of two non-negative BigInts.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
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
 * Normalize a rational number to lowest terms with a positive denominator.
 *
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
	const g = gcd(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Add two normalized rationals.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function addRational(a, b) {
	return normalize(a.num * b.den + b.num * a.den, a.den * b.den)
}

/**
 * Subtract rational b from rational a.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function subRational(a, b) {
	return normalize(a.num * b.den - b.num * a.den, a.den * b.den)
}

/**
 * Multiply two rationals.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function mulRational(a, b) {
	return normalize(a.num * b.num, a.den * b.den)
}

/**
 * Scale a rational by a BigInt integer factor.
 *
 * @param {bigint} k
 * @param {{ num: bigint, den: bigint }} r
 * @returns {{ num: bigint, den: bigint }}
 */
function scaleRational(k, r) {
	if (k === 0n || r.num === 0n) {
		return { num: 0n, den: 1n }
	}
	return normalize(k * r.num, r.den)
}

/**
 * Evaluate the Gregory-Leibniz (Taylor) series for arctan(r) using Horner's
 * method for a small rational |r| <= 1/5:
 *   arctan(r) ≈ sum_{k=0}^{terms-1} (-1)^k * r^(2k+1) / (2k+1)
 *
 * @param {{ num: bigint, den: bigint }} r
 * @param {number} terms
 * @returns {{ num: bigint, den: bigint }}
 */
function arctanSmallSeries(r, terms) {
	if (r.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const r2 = { num: r.num * r.num, den: r.den * r.den }
	let acc = { num: 1n, den: BigInt(2 * terms - 1) }
	for (let k = terms - 2; k >= 0; k--) {
		const term = { num: 1n, den: BigInt(2 * k + 1) }
		acc = subRational(term, mulRational(r2, acc))
	}
	return mulRational(r, acc)
}

const ONE_FIFTH = { num: 1n, den: 5n }
const ONE_239TH = { num: 1n, den: 239n }

/**
 * Compute arctan(x) over exact rationals as `{ num: bigint, den: bigint }`
 * in lowest terms (`den > 0n` and `gcd(|num|, den) === 1n`).
 *
 * Uses exact rational argument reduction so every series evaluation runs on a
 * reduced argument `0 < r <= 1/5`:
 * - Odd symmetry: `arctan(-x) = -arctan(x)`
 * - Reciprocal identity (`x > 1`): `arctan(x) = pi/2 - arctan(1/x)`
 * - Complementary identity (`1/2 < x < 1`): `arctan(x) = pi/4 - arctan((1 - x)/(1 + x))`
 * - Machin's identity: `pi/4 = 4*arctan(1/5) - arctan(1/239)`
 * - Tangent-addition reduction (`1/5 < r <= 1/2`): `arctan(r) = arctan(1/5) + arctan((5r - 1)/(5 + r))`
 *
 * Each reduced argument is then evaluated with `terms` terms of the alternating
 * Taylor series (error <= (1/5)^(2*terms+1)/(2*terms+1) per component; with the
 * default `terms = 12`, total error is < 2e-18 for all rational inputs).
 *
 * @param {{ num: bigint, den: bigint }} x Exact rational input.
 * @param {number} [terms=12] Positive safe integer number of series terms per reduced evaluation.
 * @returns {{ num: bigint, den: bigint }} Normalized rational approximation of arctan(x).
 */
export function arctanRationalSeries(x, terms = 12) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('x must be an object with BigInt num and den properties')
	}
	if (typeof x.num !== 'bigint' || typeof x.den !== 'bigint') {
		throw new TypeError('x.num and x.den must be BigInts')
	}
	if (x.den === 0n) {
		throw new RangeError('x.den cannot be zero')
	}
	if (typeof terms !== 'number') {
		throw new TypeError('terms must be a positive safe integer')
	}
	if (!Number.isSafeInteger(terms) || terms < 1) {
		throw new RangeError('terms must be a positive safe integer')
	}

	const normX = normalize(x.num, x.den)
	if (normX.num === 0n) {
		return { num: 0n, den: 1n }
	}

	const sign = normX.num < 0n ? -1n : 1n
	let r = { num: normX.num < 0n ? -normX.num : normX.num, den: normX.den }

	// Express arctan(|x|) = c5 * arctan(1/5) + c239 * arctan(1/239) + sRem * arctan(r)
	let c5 = 0n
	let c239 = 0n
	let sRem = 1n

	// Step 1: If r > 1, use arctan(r) = pi/2 - arctan(1/r)
	if (r.num > r.den) {
		c5 += 8n
		c239 -= 2n
		sRem = -sRem
		r = { num: r.den, den: r.num }
	}

	// Step 2: If r === 1, use arctan(1) = pi/4 = 4*arctan(1/5) - arctan(1/239)
	if (r.num === r.den) {
		c5 += sRem * 4n
		c239 -= sRem
		sRem = 0n
		r = { num: 0n, den: 1n }
	} else if (2n * r.num > r.den) {
		// Step 3: If 1/2 < r < 1, use arctan(r) = pi/4 - arctan((1 - r)/(1 + r))
		// so the new remainder lies in (0, 1/3).
		c5 += sRem * 4n
		c239 -= sRem
		sRem = -sRem
		r = normalize(r.den - r.num, r.den + r.num)
	}

	// Step 4: While r > 1/5, subtract arctan(1/5) via tangent addition (at most 2 steps).
	while (r.num > 0n && 5n * r.num > r.den) {
		c5 += sRem
		r = normalize(5n * r.num - r.den, 5n * r.den + r.num)
	}

	// Fold remainder into c5 or c239 if it matches one of the Machin base points.
	if (sRem !== 0n && r.num === 1n && r.den === 5n) {
		c5 += sRem
		sRem = 0n
		r = { num: 0n, den: 1n }
	} else if (sRem !== 0n && r.num === 1n && r.den === 239n) {
		c239 += sRem
		sRem = 0n
		r = { num: 0n, den: 1n }
	}

	let total = { num: 0n, den: 1n }
	if (c5 !== 0n) {
		total = addRational(total, scaleRational(c5, arctanSmallSeries(ONE_FIFTH, terms)))
	}
	if (c239 !== 0n) {
		total = addRational(total, scaleRational(c239, arctanSmallSeries(ONE_239TH, terms)))
	}
	if (sRem !== 0n && r.num !== 0n) {
		total = addRational(total, scaleRational(sRem, arctanSmallSeries(r, terms)))
	}

	return sign < 0n ? { num: -total.num, den: total.den } : total
}
