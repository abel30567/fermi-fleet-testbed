import { test } from 'node:test'
import assert from 'node:assert/strict'
import { divideRationalMemo } from './divideRationalMemo.js'

/**
 * Independent reference GCD using binary GCD (Stein's algorithm),
 * completely separate from the table-driven Euclidean GCD under test.
 */
function binaryGcd(a, b) {
	let u = a < 0n ? -a : a
	let v = b < 0n ? -b : b
	if (u === 0n) return v
	if (v === 0n) return u

	let shift = 0n
	while (((u | v) & 1n) === 0n) {
		u >>= 1n
		v >>= 1n
		shift += 1n
	}
	while ((u & 1n) === 0n) {
		u >>= 1n
	}
	do {
		while ((v & 1n) === 0n) {
			v >>= 1n
		}
		if (u > v) {
			const tmp = u
			u = v
			v = tmp
		}
		v -= u
	} while (v !== 0n)

	return u << shift
}

/**
 * Independent naive exact rational division: multiply first, then normalize sign
 * and divide by binary GCD.
 */
function referenceDivide(a, b) {
	const rawNum = a.num * b.den
	const rawDen = a.den * b.num
	if (rawNum === 0n) {
		return { num: 0n, den: 1n }
	}
	const num = rawDen < 0n ? -rawNum : rawNum
	const den = rawDen < 0n ? -rawDen : rawDen
	const g = binaryGcd(num, den)
	return { num: num / g, den: den / g }
}

/**
 * Independent exact rational multiplication normalized to lowest terms.
 */
function referenceMultiply(a, b) {
	const rawNum = a.num * b.num
	const rawDen = a.den * b.den
	if (rawNum === 0n) {
		return { num: 0n, den: 1n }
	}
	const num = rawDen < 0n ? -rawNum : rawNum
	const den = rawDen < 0n ? -rawDen : rawDen
	const g = binaryGcd(num, den)
	return { num: num / g, den: den / g }
}

function referenceNormalize(r) {
	if (r.num === 0n) return { num: 0n, den: 1n }
	const num = r.den < 0n ? -r.num : r.num
	const den = r.den < 0n ? -r.den : r.den
	const g = binaryGcd(num, den)
	return { num: num / g, den: den / g }
}

test('normal cases: basic exact rational division in lowest terms', () => {
	assert.deepEqual(
		divideRationalMemo({ num: 1n, den: 2n }, { num: 3n, den: 4n }),
		{ num: 2n, den: 3n },
	)
	assert.deepEqual(
		divideRationalMemo({ num: 3n, den: 4n }, { num: 1n, den: 4n }),
		{ num: 3n, den: 1n },
	)
	assert.deepEqual(
		divideRationalMemo({ num: 5n, den: 7n }, { num: 1n, den: 1n }),
		{ num: 5n, den: 7n },
	)
	assert.deepEqual(
		divideRationalMemo({ num: 1n, den: 1n }, { num: 5n, den: 7n }),
		{ num: 7n, den: 5n },
	)
	assert.deepEqual(
		divideRationalMemo({ num: 7n, den: 11n }, { num: 7n, den: 11n }),
		{ num: 1n, den: 1n },
	)
})

test('normal cases: unnormalized inputs reduce to canonical lowest terms', () => {
	assert.deepEqual(
		divideRationalMemo({ num: 6n, den: 9n }, { num: 4n, den: 6n }),
		{ num: 1n, den: 1n },
	)
	assert.deepEqual(
		divideRationalMemo({ num: 10n, den: 15n }, { num: 25n, den: 35n }),
		{ num: 14n, den: 15n },
	)
	assert.deepEqual(
		divideRationalMemo({ num: 48n, den: 64n }, { num: 36n, den: 60n }),
		{ num: 5n, den: 4n },
	)
})

test('edge cases: all 16 sign combinations normalize denominator to positive', () => {
	const signs = [-1n, 1n]
	for (const sa of signs) {
		for (const sd of signs) {
			for (const sb of signs) {
				for (const sbd of signs) {
					const a = { num: sa * 6n, den: sd * 15n }
					const b = { num: sb * 10n, den: sbd * 21n }
					const actual = divideRationalMemo(a, b)
					const expected = referenceDivide(a, b)
					assert.deepEqual(actual, expected)
					assert.ok(actual.den > 0n, 'denominator must always be positive')
					assert.equal(binaryGcd(actual.num, actual.den), 1n)
				}
			}
		}
	}
})

test('edge cases: zero dividend always returns canonical { num: 0n, den: 1n }', () => {
	assert.deepEqual(
		divideRationalMemo({ num: 0n, den: 1n }, { num: 3n, den: 5n }),
		{ num: 0n, den: 1n },
	)
	assert.deepEqual(
		divideRationalMemo({ num: 0n, den: -7n }, { num: -3n, den: 5n }),
		{ num: 0n, den: 1n },
	)
	assert.deepEqual(
		divideRationalMemo({ num: 0n, den: 100000000000000000000n }, { num: 1n, den: -9n }),
		{ num: 0n, den: 1n },
	)
})

test('edge cases: boundary values around precomputed GCD table limit (64)', () => {
	const values = [1n, 2n, 63n, 64n, 65n, 66n, 128n, 192n]
	for (const an of values) {
		for (const ad of values) {
			const a = { num: an, den: ad }
			const b = { num: 64n, den: 65n }
			assert.deepEqual(divideRationalMemo(a, b), referenceDivide(a, b))
		}
	}
})

test('edge cases: very large BigInts with shared large factors', () => {
	const bigFactor = 10n ** 40n + 7n
	const p1 = 2n ** 127n - 1n
	const p2 = 2n ** 89n - 1n
	const a = { num: p1 * bigFactor, den: p2 * 13n }
	const b = { num: -bigFactor * 5n, den: p2 * 39n }

	const actual = divideRationalMemo(a, b)
	const expected = { num: -(p1 * 3n), den: 5n }
	assert.deepEqual(actual, expected)
	assert.deepEqual(actual, referenceDivide(a, b))
})

test('validation: division by zero and zero denominators throw RangeError', () => {
	assert.throws(
		() => divideRationalMemo({ num: 1n, den: 2n }, { num: 0n, den: 1n }),
		RangeError,
	)
	assert.throws(
		() => divideRationalMemo({ num: 0n, den: 1n }, { num: 0n, den: -5n }),
		RangeError,
	)
	assert.throws(
		() => divideRationalMemo({ num: 1n, den: 0n }, { num: 1n, den: 2n }),
		RangeError,
	)
	assert.throws(
		() => divideRationalMemo({ num: 1n, den: 2n }, { num: 1n, den: 0n }),
		RangeError,
	)
	assert.throws(
		() => divideRationalMemo({ num: 0n, den: 0n }, { num: 1n, den: 1n }),
		RangeError,
	)
})

test('validation: malformed inputs throw TypeError', () => {
	const valid = { num: 1n, den: 2n }
	const badInputs = [
		null,
		undefined,
		42,
		'1/2',
		true,
		[1n, 2n],
		{},
		{ num: 1, den: 2n },
		{ num: 1n, den: 2 },
		{ num: 1n },
		{ den: 2n },
		{ num: NaN, den: 2n },
	]
	for (const bad of badInputs) {
		assert.throws(() => divideRationalMemo(bad, valid), TypeError)
		assert.throws(() => divideRationalMemo(valid, bad), TypeError)
	}
})

test('memoization: cached results are consistent, isolated from mutation, and bounded', () => {
	const a = { num: 14n, den: 21n }
	const b = { num: 10n, den: 35n }
	const first = divideRationalMemo(a, b)
	assert.deepEqual(first, { num: 7n, den: 3n })

	// Mutating the returned object must not corrupt the memo cache
	first.num = 999999n
	first.den = 888888n

	const second = divideRationalMemo(a, b)
	assert.deepEqual(second, { num: 7n, den: 3n })

	// Equivalent unnormalized input hits canonical cache and returns identical result
	const equiv = divideRationalMemo({ num: 2n, den: 3n }, { num: 2n, den: 7n })
	assert.deepEqual(equiv, { num: 7n, den: 3n })

	// Exercise LRU eviction beyond MAX_MEMO_ENTRIES (4096)
	for (let i = 1n; i <= 4200n; i++) {
		const res = divideRationalMemo({ num: i, den: i + 1n }, { num: i + 2n, den: i + 3n })
		if (i % 500n === 0n) {
			assert.deepEqual(
				res,
				referenceDivide({ num: i, den: i + 1n }, { num: i + 2n, den: i + 3n }),
			)
		}
	}
	// Re-computing evicted entry still yields exact answer
	assert.deepEqual(divideRationalMemo(a, b), { num: 7n, den: 3n })
})

test('independent cross-check: algebraic identities and binary-GCD reference across 300 pseudo-random pairs', () => {
	// Deterministic LCG for reproducible test vectors
	let seed = 0x123456789abcdef1n
	const mask = (1n << 64n) - 1n
	function nextBigInt(maxAbs) {
		seed = (seed * 6364136223846793005n + 1442695040888963407n) & mask
		const mag = (seed % maxAbs) + 1n
		return (seed & 1n) === 0n ? mag : -mag
	}

	const scales = [30n, 100n, 100000n, 10n ** 18n]
	for (let i = 0; i < 300; i++) {
		const scale = scales[i % scales.length]
		const a = { num: nextBigInt(scale), den: nextBigInt(scale) }
		const b = { num: nextBigInt(scale), den: nextBigInt(scale) }

		const q = divideRationalMemo(a, b)
		const ref = referenceDivide(a, b)

		// 1. Exact match against independent binary-GCD reference
		assert.deepEqual(q, ref)
		assert.ok(q.den > 0n)
		assert.equal(binaryGcd(q.num, q.den), 1n)

		// 2. Algebraic round-trip identity: (a / b) * b === normalize(a)
		assert.deepEqual(referenceMultiply(q, b), referenceNormalize(a))

		// 3. Reciprocal identity: (a / b) * (b / a) === 1/1
		const qInv = divideRationalMemo(b, a)
		assert.deepEqual(referenceMultiply(q, qInv), { num: 1n, den: 1n })

		// 4. Floating-point cross-check for moderate magnitudes
		if (scale <= 100000n) {
			const approxExpected =
				(Number(a.num) / Number(a.den)) / (Number(b.num) / Number(b.den))
			const approxActual = Number(q.num) / Number(q.den)
			const relErr =
				Math.abs(approxActual - approxExpected) / Math.max(1, Math.abs(approxExpected))
			assert.ok(relErr < 1e-12, `float cross-check failed: ${approxActual} vs ${approxExpected}`)
		}
	}
})
