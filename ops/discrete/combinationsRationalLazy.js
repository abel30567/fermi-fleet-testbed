/**
 * Computes the greatest common divisor of two non-negative BigInts
 * using the iterative Euclidean algorithm.
 *
 * @param {bigint} a - Non-negative integer.
 * @param {bigint} b - Non-negative integer.
 * @returns {bigint} Non-negative greatest common divisor of `a` and `b`.
 */
function gcdBigInt(a, b) {
	let x = a
	let y = b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

/**
 * Validates and normalizes an exact rational `{ num: bigint, den: bigint }`
 * to canonical lowest terms with strictly positive denominator (`den > 0n`),
 * and `{ num: 0n, den: 1n }` when `num === 0n`.
 *
 * @param {unknown} value - Candidate rational object.
 * @returns {{ num: bigint, den: bigint }} Normalized exact rational in lowest terms.
 * @throws {TypeError} If `value` is not an object with `bigint` `num` and `den` fields.
 * @throws {RangeError} If `den === 0n`.
 */
function normalizeRational(value) {
	if (typeof value !== 'object' || value === null) {
		throw new TypeError('Each element must be an object with { num: bigint, den: bigint }')
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError('Rational num and den must both be BigInt values')
	}
	if (den === 0n) {
		throw new RangeError('Rational denominator must be non-zero')
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
	const absN = n < 0n ? -n : n
	const g = gcdBigInt(absN, d)
	return { num: n / g, den: d / g }
}

/**
 * Streaming generator that yields all `k`-combinations of exact rationals
 * from `iterable` in colexicographic prefix order, pulling elements from
 * `iterable` lazily only as needed.
 *
 * @param {Iterable<{ num: bigint, den: bigint }>} iterable
 * @param {number} k
 * @returns {Generator<Array<{ num: bigint, den: bigint }>, void, undefined>}
 */
function* generateCombinations(iterable, k) {
	if (k === 0) {
		yield []
		return
	}

	if (k === 1) {
		for (const item of iterable) {
			const r = normalizeRational(item)
			yield [{ num: r.num, den: r.den }]
		}
		return
	}

	/** @type {Array<{ num: bigint, den: bigint }>} */
	const seen = []
	const prefixLen = k - 1

	for (const item of iterable) {
		const current = normalizeRational(item)
		const m = seen.length

		if (m >= prefixLen) {
			const indices = new Array(prefixLen)
			for (let i = 0; i < prefixLen; i++) {
				indices[i] = i
			}

			while (true) {
				const combo = new Array(k)
				for (let i = 0; i < prefixLen; i++) {
					const r = seen[indices[i]]
					combo[i] = { num: r.num, den: r.den }
				}
				combo[prefixLen] = { num: current.num, den: current.den }
				yield combo

				let i = prefixLen - 1
				while (i >= 0 && indices[i] === i + m - prefixLen) {
					i--
				}
				if (i < 0) {
					break
				}
				indices[i]++
				for (let j = i + 1; j < prefixLen; j++) {
					indices[j] = indices[j - 1] + 1
				}
			}
		}

		seen.push(current)
	}
}

/**
 * Lazily generates all discrete `k`-combinations from an iterable of exact
 * rationals represented as `{ num: bigint, den: bigint }`.
 *
 * Each rational element is validated and reduced to canonical lowest terms
 * (`den > 0n`, `gcd(|num|, den) === 1n`, and `{ num: 0n, den: 1n }` for zero)
 * on demand as it is pulled from the input iterable.
 *
 * Combinations are streamed in colexicographic order (preserving each element's
 * original relative order within a combination) so that the input iterable is
 * consumed minimally and lazily — infinite iterables are supported when consumed
 * partially, and early termination closes the underlying iterator.
 *
 * @param {Iterable<{ num: bigint, den: bigint }>} iterable - Input sequence/iterable of exact rationals.
 * @param {number} k - Non-negative safe integer combination size.
 * @returns {Generator<Array<{ num: bigint, den: bigint }>, void, undefined>} Lazy generator of `k`-combinations.
 * @throws {TypeError} If `iterable` is not iterable, `k` is not a number, or an element has invalid rational types.
 * @throws {RangeError} If `k` is negative, non-integer, or not a safe integer, or an element has a zero denominator.
 */
export function combinationsRationalLazy(iterable, k) {
	if (iterable == null || typeof iterable[Symbol.iterator] !== 'function') {
		throw new TypeError('iterable must be a valid Iterable of rational objects')
	}
	if (typeof k !== 'number') {
		throw new TypeError('k must be a non-negative safe integer')
	}
	if (!Number.isSafeInteger(k) || k < 0) {
		throw new RangeError('k must be a non-negative safe integer')
	}
	return generateCombinations(iterable, k)
}
