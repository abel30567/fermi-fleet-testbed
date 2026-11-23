import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { summationRationalStable } from './summationRationalStable.js'

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

function assertCanonical(r) {
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n)
	} else {
		assert.equal(gcd(r.num, r.den), 1n, `not in lowest terms: ${r.num}/${r.den}`)
	}
}

describe('summationRationalStable', () => {
	test('empty array returns 0/1', () => {
		const res = summationRationalStable([])
		assert.deepEqual(res, { num: 0n, den: 1n })
		assertCanonical(res)
	})

	test('single element is normalized without mutating input', () => {
		const input = { num: 6n, den: -9n }
		const res = summationRationalStable([input])
		assert.deepEqual(res, { num: -2n, den: 3n })
		assertCanonical(res)
		assert.deepEqual(input, { num: 6n, den: -9n })
	})

	test('single zero element with arbitrary non-zero denominator reduces to 0/1', () => {
		assert.deepEqual(summationRationalStable([{ num: 0n, den: -7n }]), {
			num: 0n,
			den: 1n,
		})
	})

	test('basic fractions and common/coprime denominators', () => {
		const res = summationRationalStable([
			{ num: 1n, den: 2n },
			{ num: 1n, den: 3n },
			{ num: 1n, den: 6n },
		])
		assert.deepEqual(res, { num: 1n, den: 1n })
		assertCanonical(res)

		const res2 = summationRationalStable([
			{ num: 3n, den: 4n },
			{ num: -5n, den: 6n },
			{ num: 7n, den: 12n },
		])
		assert.deepEqual(res2, { num: 1n, den: 2n })
		assertCanonical(res2)
	})

	test('unreduced and negative-denominator inputs', () => {
		const res = summationRationalStable([
			{ num: -10n, den: -15n }, // +2/3
			{ num: 14n, den: -21n }, // -2/3
			{ num: 100n, den: 250n }, // +2/5
			{ num: 0n, den: -999n }, // 0
			{ num: -18n, den: 30n }, // -3/5
		])
		assert.deepEqual(res, { num: -1n, den: 5n })
		assertCanonical(res)
	})

	test('catastrophic cancellation: 10^100 + 1/3 - 10^100', () => {
		const huge = 10n ** 100n
		const res = summationRationalStable([
			{ num: huge, den: 1n },
			{ num: 1n, den: 3n },
			{ num: -huge, den: 1n },
		])
		assert.deepEqual(res, { num: 1n, den: 3n })
		assertCanonical(res)
	})

	test('interleaved massive cancelling terms with tiny fractions', () => {
		const big = 10n ** 200n
		const terms = [
			{ num: big, den: 1n },
			{ num: 1n, den: 10n ** 50n },
			{ num: 7n * big, den: 3n },
			{ num: -big, den: 1n },
			{ num: 2n, den: 10n ** 50n },
			{ num: -7n * big, den: 3n },
		]
		const res = summationRationalStable(terms)
		assert.deepEqual(res, { num: 3n, den: 10n ** 50n })
		assertCanonical(res)
	})

	test('exact harmonic series H_n for known values', () => {
		const expected = [
			[1, 1n, 1n],
			[2, 3n, 2n],
			[3, 11n, 6n],
			[4, 25n, 12n],
			[5, 137n, 60n],
			[10, 7381n, 2520n],
			[15, 1195757n, 360360n],
		]
		for (const [n, num, den] of expected) {
			const terms = Array.from({ length: n }, (_, i) => ({
				num: 1n,
				den: BigInt(i + 1),
			}))
			const res = summationRationalStable(terms)
			assert.deepEqual(res, { num, den }, `H_${n} mismatch`)
			assertCanonical(res)
		}
	})

	test('supports general iterables (generator and Set)', () => {
		function* geometricHalf(n) {
			for (let k = 1; k <= n; k += 1) {
				yield { num: 1n, den: 1n << BigInt(k) }
			}
		}
		const n = 25
		const res = summationRationalStable(geometricHalf(n))
		assert.deepEqual(res, { num: (1n << BigInt(n)) - 1n, den: 1n << BigInt(n) })
		assertCanonical(res)

		const set = new Set([
			{ num: 1n, den: 4n },
			{ num: 3n, den: 8n },
			{ num: 3n, den: 8n },
		])
		assert.deepEqual(summationRationalStable(set), { num: 1n, den: 1n })
	})

	test('cross-check: telescoping series sum_{k=1}^N (1/k - 1/(k+1)) = N/(N+1)', () => {
		for (const N of [1, 7, 64, 250]) {
			const terms = []
			for (let k = 1; k <= N; k += 1) {
				terms.push({ num: 1n, den: BigInt(k) })
				terms.push({ num: -1n, den: BigInt(k + 1) })
			}
			const res = summationRationalStable(terms)
			assert.deepEqual(res, { num: BigInt(N), den: BigInt(N + 1) })
			assertCanonical(res)
		}
	})

	test('cross-check: alternating series & independent closed form sum_{k=1}^N 1/(k(k+1)) = N/(N+1)', () => {
		const N = 300
		const terms = Array.from({ length: N }, (_, i) => {
			const k = BigInt(i + 1)
			return { num: 1n, den: k * (k + 1n) }
		})
		const res = summationRationalStable(terms)
		assert.deepEqual(res, { num: BigInt(N), den: BigInt(N + 1) })
		assertCanonical(res)
	})

	test('cross-check: permutation invariance / order independence', () => {
		const base = []
		for (let k = 1; k <= 40; k += 1) {
			const sign = k % 2 === 0 ? -1n : 1n
			base.push({ num: sign * BigInt(k * 3 - 1), den: BigInt(k * 5 + 2) })
		}
		base.push({ num: 10n ** 80n, den: 7n })
		base.push({ num: -(10n ** 80n), den: 7n })

		const expected = summationRationalStable(base)
		assertCanonical(expected)

		// Reversed order
		assert.deepEqual(summationRationalStable([...base].reverse()), expected)

		// Deterministic pseudo-random shuffles (Fisher-Yates with LCG)
		for (let seed = 1; seed <= 5; seed += 1) {
			const shuffled = [...base]
			let s = seed * 1234567
			for (let i = shuffled.length - 1; i > 0; i -= 1) {
				s = (s * 1103515245 + 12345) & 0x7fffffff
				const j = s % (i + 1)
				;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
			}
			assert.deepEqual(summationRationalStable(shuffled), expected)
		}
	})

	test('cross-check: harmonic H_100 matches naive exact accumulation', () => {
		const terms = Array.from({ length: 100 }, (_, i) => ({
			num: 1n,
			den: BigInt(i + 1),
		}))
		const fast = summationRationalStable(terms)
		assertCanonical(fast)

		// Independent naive sequential reference
		let refNum = 0n
		let refDen = 1n
		for (const { num, den } of terms) {
			refNum = refNum * den + num * refDen
			refDen = refDen * den
			const g = gcd(refNum, refDen)
			refNum /= g
			refDen /= g
		}
		assert.deepEqual(fast, { num: refNum, den: refDen })
	})

	test('rejects invalid inputs with appropriate errors', () => {
		assert.throws(() => summationRationalStable(), TypeError)
		assert.throws(() => summationRationalStable(null), TypeError)
		assert.throws(() => summationRationalStable(123), TypeError)
		assert.throws(() => summationRationalStable('1/2'), TypeError)
		assert.throws(() => summationRationalStable({ num: 1n, den: 2n }), TypeError)

		assert.throws(() => summationRationalStable([null]), TypeError)
		assert.throws(() => summationRationalStable([undefined]), TypeError)
		assert.throws(() => summationRationalStable([42]), TypeError)
		assert.throws(() => summationRationalStable([{ num: 1, den: 2n }]), TypeError)
		assert.throws(() => summationRationalStable([{ num: 1n, den: 2 }]), TypeError)
		assert.throws(() => summationRationalStable([{ num: '1', den: '2' }]), TypeError)
		assert.throws(() => summationRationalStable([{ num: 1n }]), TypeError)

		assert.throws(
			() => summationRationalStable([{ num: 1n, den: 0n }]),
			RangeError
		)
		assert.throws(
			() => summationRationalStable([{ num: 0n, den: 0n }]),
			RangeError
		)
		assert.throws(
			() =>
				summationRationalStable([
					{ num: 1n, den: 2n },
					{ num: 5n, den: 0n },
				]),
			RangeError
		)
	})
})
