import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { divideRationalLazy } from './divideRationalLazy.js'

const R = (num, den = 1n) => ({ num, den })

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

function assertLowestTerms(q) {
	assert.equal(typeof q.num, 'bigint')
	assert.equal(typeof q.den, 'bigint')
	assert.ok(q.den > 0n, `expected den > 0n, got ${q.den}`)
	if (q.num === 0n) {
		assert.equal(q.den, 1n)
	} else {
		assert.equal(gcd(q.num, q.den), 1n, `expected gcd(|num|, den) === 1n for ${q.num}/${q.den}`)
	}
}

describe('divideRationalLazy', () => {
	test('pairwise streaming division over two iterables', () => {
		const dividends = [R(3n, 4n), R(-6n, 9n), R(0n, 5n), R(10n, -15n)]
		const divisors = [R(2n, 5n), R(4n, -3n), R(-7n, 3n), R(-5n, 6n)]

		const results = [...divideRationalLazy(dividends, divisors)]
		assert.deepEqual(results, [
			R(15n, 8n),
			R(1n, 2n),
			R(0n, 1n),
			R(4n, 5n),
		])
		for (const q of results) assertLowestTerms(q)
	})

	test('single-argument cumulative left-associative division', () => {
		// r0 = 12/5
		// q0 = 12/5
		// q1 = (12/5) / (3/10) = 8/1
		// q2 = (8/1) / (-4/3) = -6/1
		// q3 = (-6/1) / (9/-2) = 4/3
		const seq = [R(24n, 10n), R(3n, 10n), R(-4n, 3n), R(9n, -2n)]
		const results = [...divideRationalLazy(seq)]
		assert.deepEqual(results, [R(12n, 5n), R(8n, 1n), R(-6n, 1n), R(4n, 3n)])
		for (const q of results) assertLowestTerms(q)
	})

	test('broadcast modes: iterable/scalar, scalar/iterable, scalar/scalar', () => {
		const seq = [R(2n, 3n), R(-4n, 5n), R(0n, -9n)]

		assert.deepEqual(
			[...divideRationalLazy(seq, R(2n, -3n))],
			[R(-1n, 1n), R(6n, 5n), R(0n, 1n)]
		)

		// Reciprocals via scalar dividend 1/1
		assert.deepEqual(
			[...divideRationalLazy(R(1n, 1n), [R(2n, 3n), R(-5n, 4n), R(6n, -9n)])],
			[R(3n, 2n), R(-4n, 5n), R(-3n, 2n)]
		)

		assert.deepEqual(
			[...divideRationalLazy(R(-14n, 15n), R(21n, -25n))],
			[R(10n, 9n)]
		)
	})

	test('edge cases: empty iterables, single element, zero handling, mutation safety', () => {
		assert.deepEqual([...divideRationalLazy([])], [])
		assert.deepEqual([...divideRationalLazy([], [R(1n, 2n)])], [])
		assert.deepEqual([...divideRationalLazy([R(1n, 2n)], [])], [])
		assert.deepEqual([...divideRationalLazy([], R(3n, 4n))], [])
		assert.deepEqual([...divideRationalLazy(R(3n, 4n), [])], [])

		// Single element in cumulative mode is normalized to lowest terms
		assert.deepEqual([...divideRationalLazy([R(-18n, -24n)])], [R(3n, 4n)])
		assert.deepEqual([...divideRationalLazy([R(0n, -99n)])], [R(0n, 1n)])

		// Zero dividend stays 0/1 through non-zero divisions, still throws on / 0
		const zeroGen = divideRationalLazy([R(0n, 3n), R(5n, 7n), R(0n, 2n)])
		assert.deepEqual(zeroGen.next(), { value: R(0n, 1n), done: false })
		assert.deepEqual(zeroGen.next(), { value: R(0n, 1n), done: false })
		assert.throws(() => zeroGen.next(), RangeError)

		// Mutating a yielded value in cumulative mode does not corrupt running state
		const gen = divideRationalLazy([R(10n, 1n), R(2n, 1n), R(5n, 1n)])
		const first = gen.next().value
		assert.deepEqual(first, R(10n, 1n))
		first.num = 99999n
		first.den = 7n
		assert.deepEqual(gen.next().value, R(5n, 1n))
		assert.deepEqual(gen.next().value, R(1n, 1n))
	})

	test('huge BigInts preserve exactness and cross-reduce cleanly', () => {
		const p = 10n ** 200n + 3n
		const q = 10n ** 180n + 7n
		const sharedNum = 3n ** 300n
		const sharedDen = 5n ** 250n

		const a = R(p * sharedNum, sharedDen)
		const b = R(q * sharedNum, sharedDen * 2n)
		const [res] = [...divideRationalLazy(a, b)]

		assertLowestTerms(res)
		// (p * sharedNum / sharedDen) / (q * sharedNum / (2 * sharedDen)) = (2 * p) / q
		const expectedGcd = gcd(2n * p, q)
		assert.deepEqual(res, R((2n * p) / expectedGcd, q / expectedGcd))
	})

	test('laziness: infinite generators consumed strictly on demand and closed on break', () => {
		let pulledCum = 0
		let closedCum = false
		function* infiniteRationals() {
			try {
				let k = 1n
				while (true) {
					pulledCum++
					yield R(k, k + 1n)
					k++
				}
			} finally {
				closedCum = true
			}
		}

		const cumGen = divideRationalLazy(infiniteRationals())
		assert.equal(pulledCum, 0)

		const taken = []
		for (const q of cumGen) {
			taken.push(q)
			assert.equal(pulledCum, taken.length)
			if (taken.length === 5) break
		}
		assert.equal(pulledCum, 5)
		assert.equal(closedCum, true)
		// q0 = 1/2, q1 = (1/2)/(2/3) = 3/4, q2 = (3/4)/(3/4) = 1/1,
		// q3 = (1/1)/(4/5) = 5/4, q4 = (5/4)/(5/6) = 3/2
		assert.deepEqual(taken, [R(1n, 2n), R(3n, 4n), R(1n, 1n), R(5n, 4n), R(3n, 2n)])

		// Pairwise infinite streams + poison element check
		let pulledA = 0
		let pulledB = 0
		let closedA = false
		let closedB = false

		function* infA() {
			try {
				for (let i = 1n; ; i++) {
					pulledA++
					if (i > 4n) throw new Error('Over-consumed A')
					yield R(i * i, 1n)
				}
			} finally {
				closedA = true
			}
		}

		function* infB() {
			try {
				for (let i = 1n; ; i++) {
					pulledB++
					if (i > 4n) throw new Error('Over-consumed B')
					yield R(i, 2n)
				}
			} finally {
				closedB = true
			}
		}

		const pairResults = []
		for (const q of divideRationalLazy(infA(), infB())) {
			pairResults.push(q)
			assert.equal(pulledA, pairResults.length)
			assert.equal(pulledB, pairResults.length)
			if (pairResults.length === 4) break
		}
		assert.deepEqual(pairResults, [R(2n, 1n), R(4n, 1n), R(6n, 1n), R(8n, 1n)])
		assert.equal(pulledA, 4)
		assert.equal(pulledB, 4)
		assert.equal(closedA, true)
		assert.equal(closedB, true)
	})

	test('laziness: unequal-length pairwise stops cleanly without over-pulling right iterable', () => {
		let pulledRight = 0
		let closedRight = false
		function* rightGen() {
			try {
				for (let i = 1n; i <= 10n; i++) {
					pulledRight++
					yield R(i, 1n)
				}
			} finally {
				closedRight = true
			}
		}

		const out = [...divideRationalLazy([R(10n, 1n), R(20n, 1n)], rightGen())]
		assert.deepEqual(out, [R(10n, 1n), R(10n, 1n)])
		assert.equal(pulledRight, 2)
		assert.equal(closedRight, true)
	})

	test('invalid inputs throw TypeError or RangeError', () => {
		// Bad argument counts
		assert.throws(() => divideRationalLazy(), TypeError)
		assert.throws(() => divideRationalLazy([], [], []), TypeError)

		// Non-iterables (and strings) in 1-arg mode
		for (const bad of [null, undefined, 123, '1/2', true, R(1n, 2n), {}]) {
			assert.throws(() => divideRationalLazy(bad), TypeError)
		}

		// Invalid 2-arg combinations
		assert.throws(() => divideRationalLazy([], undefined), TypeError)
		assert.throws(() => divideRationalLazy([], null), TypeError)
		assert.throws(() => divideRationalLazy(null, []), TypeError)
		assert.throws(() => divideRationalLazy('abc', []), TypeError)
		assert.throws(() => divideRationalLazy([], 'abc'), TypeError)
		assert.throws(() => divideRationalLazy([], { num: 1, den: 2 }), TypeError)
		assert.throws(() => divideRationalLazy({ num: 1n, den: 2 }, []), TypeError)

		// Zero denominator / zero scalar divisor rejected eagerly in scalar position
		assert.throws(() => divideRationalLazy([], R(1n, 0n)), RangeError)
		assert.throws(() => divideRationalLazy(R(1n, 0n), []), RangeError)
		assert.throws(() => divideRationalLazy([], R(0n, 1n)), RangeError)
		assert.throws(() => divideRationalLazy(R(1n, 2n), R(0n, 5n)), RangeError)

		// Invalid elements inside iterables throw lazily when consumed
		const badTypeGen = divideRationalLazy([R(1n, 2n), { num: 3, den: 4n }])
		assert.deepEqual(badTypeGen.next().value, R(1n, 2n))
		assert.throws(() => badTypeGen.next(), TypeError)

		const badShapeGen = divideRationalLazy([null])
		assert.throws(() => badShapeGen.next(), TypeError)

		const badArrayElem = divideRationalLazy([[1n, 2n]])
		assert.throws(() => badArrayElem.next(), TypeError)

		const zeroDenGen = divideRationalLazy([R(1n, 2n)], [R(3n, 0n)])
		assert.throws(() => zeroDenGen.next(), RangeError)

		const divZeroGen = divideRationalLazy([R(1n, 2n), R(3n, 4n)], [R(1n, 1n), R(0n, 3n)])
		assert.deepEqual(divZeroGen.next().value, R(1n, 2n))
		assert.throws(() => divZeroGen.next(), RangeError)
	})

	test('cross-check: telescoping and factorial closed-form identities + algebraic & float verification', () => {
		// Identity 1 (telescoping): start at 1/1 and divide by k/(k+1) for k=1..30 => q_k = (k+1)/1
		function* telescopingInput(n) {
			yield R(1n, 1n)
			for (let k = 1n; k <= n; k++) {
				yield R(k, k + 1n)
			}
		}
		const tele = [...divideRationalLazy(telescopingInput(30n))]
		assert.equal(tele.length, 31)
		for (let k = 0; k <= 30; k++) {
			assert.deepEqual(tele[k], R(BigInt(k + 1), 1n))
		}

		// Identity 2 (factorial): start at 1/1 and divide by 1, 2, ..., 25 => q_k = 1 / k!
		function* factorialInput(n) {
			yield R(1n, 1n)
			for (let k = 1n; k <= n; k++) {
				yield R(k, 1n)
			}
		}
		const facts = [...divideRationalLazy(factorialInput(25n))]
		let fact = 1n
		for (let k = 0; k <= 25; k++) {
			if (k > 0) fact *= BigInt(k)
			assert.deepEqual(facts[k], R(1n, fact))
		}

		// Identity 3: algebraic inverse (a / b) * b === a and floating-point agreement
		const pairsA = []
		const pairsB = []
		for (let i = -12; i <= 12; i++) {
			const aNum = BigInt(i * 7 + 3)
			const aDen = BigInt((Math.abs(i) % 5) + 1) * (i % 2 === 0 ? 1n : -1n)
			const bNum = BigInt((i === 0 ? 5 : i) * 11 - 2)
			const bDen = BigInt((Math.abs(i) % 7) + 2) * (i % 3 === 0 ? -1n : 1n)
			pairsA.push(R(aNum, aDen))
			pairsB.push(R(bNum, bDen))
		}

		const quotients = [...divideRationalLazy(pairsA, pairsB)]
		assert.equal(quotients.length, pairsA.length)
		for (let i = 0; i < quotients.length; i++) {
			const q = quotients[i]
			const a = pairsA[i]
			const b = pairsB[i]
			assertLowestTerms(q)
			// Exact cross-multiplication: (q.num / q.den) * (b.num / b.den) === a.num / a.den
			assert.equal(q.num * b.num * a.den, q.den * b.den * a.num)
			// Numerical cross-check
			const expectedFloat =
				(Number(a.num) / Number(a.den)) / (Number(b.num) / Number(b.den))
			const actualFloat = Number(q.num) / Number(q.den)
			assert.ok(
				Math.abs(actualFloat - expectedFloat) <= 1e-12 * Math.max(1, Math.abs(expectedFloat)),
				`float mismatch at index ${i}: ${actualFloat} vs ${expectedFloat}`
			)
		}
	})
})
