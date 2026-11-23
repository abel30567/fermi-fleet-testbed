/**
 * Compute the greatest common divisor of two BigInts using the iterative
 * Euclidean algorithm. Always returns a non-negative BigInt.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Validate and normalize a rational `{ num: bigint, den: bigint }` into
 * canonical lowest terms with `den > 0n` and `0` represented as `{ num: 0n, den: 1n }`.
 *
 * @param {unknown} term
 * @param {number} index
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(term, index) {
	if (term === null || typeof term !== 'object') {
		throw new TypeError(
			`Expected rational object { num: bigint, den: bigint } at index ${index}`
		)
	}
	const { num, den } = term
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(
			`Rational num and den must be BigInt values at index ${index}`
		)
	}
	if (den === 0n) {
		throw new RangeError(`Rational denominator cannot be 0n at index ${index}`)
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
 * Add two already-normalized rationals in lowest terms (`den > 0n`), returning
 * an exact normalized result using Knuth's reduced cross-product formula to
 * minimize intermediate BigInt growth and avoid denominator blowup.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function addNormalizedRationals(a, b) {
	if (a.num === 0n) {
		return { num: b.num, den: b.den }
	}
	if (b.num === 0n) {
		return { num: a.num, den: a.den }
	}
	if (a.den === b.den) {
		const sumNum = a.num + b.num
		if (sumNum === 0n) {
			return { num: 0n, den: 1n }
		}
		const g = gcd(sumNum, a.den)
		return { num: sumNum / g, den: a.den / g }
	}

	const g1 = gcd(a.den, b.den)
	if (g1 === 1n) {
		const num = a.num * b.den + b.num * a.den
		if (num === 0n) {
			return { num: 0n, den: 1n }
		}
		return { num, den: a.den * b.den }
	}

	const aDenReduced = a.den / g1
	const bDenReduced = b.den / g1
	const t = a.num * bDenReduced + b.num * aDenReduced
	if (t === 0n) {
		return { num: 0n, den: 1n }
	}
	const g2 = gcd(t, g1)
	return {
		num: t / g2,
		den: aDenReduced * (b.den / g2),
	}
}

/**
 * Compute the exact discrete sum of a sequence of rational numbers represented
 * as `{ num: bigint, den: bigint }`, returning the reduced canonical rational
 * in lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`).
 *
 * Uses streaming balanced pairwise (binary-tree carry) summation with exact
 * GCD reduction at every merge. This avoids floating-point rounding and
 * catastrophic cancellation, prevents intermediate denominator blowup, and
 * uses only `O(log n)` auxiliary slots while supporting any non-string iterable.
 *
 * @param {Iterable<{ num: bigint, den: bigint }>} terms - Array or iterable of rationals.
 * @returns {{ num: bigint, den: bigint }} Exact reduced sum (`{ num: 0n, den: 1n }` if empty).
 * @throws {TypeError} If `terms` is not a non-string iterable or any element lacks BigInt `num`/`den`.
 * @throws {RangeError} If any element has a zero denominator (`den === 0n`).
 */
export function summationRationalStable(terms) {
	if (
		terms === null ||
		terms === undefined ||
		typeof terms === 'string' ||
		typeof terms[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			'Expected an array or iterable of rational objects { num: bigint, den: bigint }'
		)
	}

	/** @type {Array<{ num: bigint, den: bigint } | null>} */
	const partials = []
	let index = 0

	for (const term of terms) {
		let acc = normalizeRational(term, index)
		index += 1

		let level = 0
		while (level < partials.length && partials[level] !== null) {
			acc = addNormalizedRationals(partials[level], acc)
			partials[level] = null
			level += 1
		}
		partials[level] = acc
	}

	let result = null
	for (let level = 0; level < partials.length; level += 1) {
		const part = partials[level]
		if (part !== null) {
			result = result === null ? part : addNormalizedRationals(result, part)
		}
	}

	return result === null ? { num: 0n, den: 1n } : result
}
