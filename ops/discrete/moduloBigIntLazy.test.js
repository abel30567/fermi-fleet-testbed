import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { moduloBigIntLazy } from './moduloBigIntLazy.js'

/**
 * Independent reference oracle for floored discrete modulo using explicit
 * floored quotient calculation (does not share implementation with moduloBigIntLazy).
 *
 * @param {bigint} a
 * @param {bigint} m
 * @returns {bigint}
 */
function referenceFlooredMod(a, m) {
	const truncQuotient = a / m
	const truncRemainder = a % m
	const signsDiffer = (a < 0n) !== (m < 0n)
	const floorQuotient =
		truncRemainder !== 0n && signsDiffer ? truncQuotient - 1n : truncQuotient
	return a - floorQuotient * m
}

/**
 * Independent iterative subtraction/addition oracle for small integers with m > 0n.
 *
 * @param {bigint} a
 * @param {bigint} m
 * @returns {bigint}
 */
function referenceIterativeMod(a, m) {
	let r = a
	while (r < 0n) r += m
	while (r >= m) r -= m
	return r
}

describe('moduloBigIntLazy', () => {
	describe('normal cases across input shapes', () => {
		it('computes discrete modulo for iterable dividends and scalar modulus', () => {
			const dividends = [0n, 1n, 5n, 7n, 10n, 14n, 15n]
			const result = [...moduloBigIntLazy(dividends, 5n)]
			assert.deepEqual(result, [0n, 1n, 0n, 2n, 0n, 4n, 0n])
		})

		it('computes discrete modulo for scalar dividend and iterable moduli', () => {
			const moduli = [1n, 2n, 3n, 5n, 7n, 13n, 100n]
			const result = [...moduloBigIntLazy(17n, moduli)]
			assert.deepEqual(result, [0n, 1n, 2n, 2n, 3n, 4n, 17n])
		})

		it('computes pairwise discrete modulo for two iterables', () => {
			const dividends = [10n, -10n, 25n, -1n, 0n]
			const moduli = [3n, 3n, 7n, 4n, 9n]
			const result = [...moduloBigIntLazy(dividends, moduli)]
			assert.deepEqual(result, [1n, 2n, 4n, 3n, 0n])
		})

		it('computes discrete modulo for two scalar BigInts as a 1-element generator', () => {
			const gen = moduloBigIntLazy(-7n, 5n)
			assert.equal(typeof gen.next, 'function')
			assert.equal(typeof gen[Symbol.iterator], 'function')
			assert.deepEqual([...gen], [3n])
		})

		it('supports BigInt typed arrays, Sets, and custom iterables', () => {
			const typedDividends = new BigInt64Array([-13n, -1n, 0n, 13n, 26n])
			assert.deepEqual([...moduloBigIntLazy(typedDividends, 5n)], [2n, 4n, 0n, 3n, 1n])

			const unsignedModuli = new BigUint64Array([2n, 3n, 4n, 5n])
			assert.deepEqual([...moduloBigIntLazy(11n, unsignedModuli)], [1n, 2n, 3n, 1n])

			const setDividends = new Set([8n, 9n, 10n])
			assert.deepEqual([...moduloBigIntLazy(setDividends, 4n)], [0n, 1n, 2n])
		})
	})

	describe('signed values, zero, and arbitrary-precision BigInt edge cases', () => {
		it('produces canonical non-negative residues for negative dividends with positive modulus', () => {
			const dividends = [-10n, -9n, -7n, -5n, -4n, -1n, 0n]
			const result = [...moduloBigIntLazy(dividends, 5n)]
			assert.deepEqual(result, [0n, 1n, 3n, 0n, 1n, 4n, 0n])
		})

		it('handles negative moduli consistently with floored division', () => {
			const pairs = [
				[7n, -5n, -3n],
				[-7n, -5n, -2n],
				[10n, -5n, 0n],
				[-10n, -5n, 0n],
				[0n, -5n, 0n],
				[1n, -1n, 0n],
				[-1n, -1n, 0n],
			]
			for (const [a, m, expected] of pairs) {
				assert.deepEqual([...moduloBigIntLazy(a, m)], [expected])
			}
		})

		it('handles very large arbitrary-precision BigInts beyond Number.MAX_SAFE_INTEGER', () => {
			const scale = 10n ** 18n
			const hugeA = 10n ** 120n + 98765432109876543210987654321n
			const hugeM = 10n ** 30n + 7n
			const [res1] = moduloBigIntLazy(hugeA, hugeM)
			assert.equal(res1, referenceFlooredMod(hugeA, hugeM))
			assert.ok(res1 >= 0n && res1 < hugeM)

			// Fixed-point scaled BigInt values (10^18 scale) remain exact
			const [res2] = moduloBigIntLazy(-(5n * scale + 123456789012345678n), scale)
			assert.equal(res2, scale - 123456789012345678n)
		})

		it('yields nothing for empty iterables', () => {
			assert.deepEqual([...moduloBigIntLazy([], 5n)], [])
			assert.deepEqual([...moduloBigIntLazy(5n, [])], [])
			assert.deepEqual([...moduloBigIntLazy([], [])], [])
		})

		it('stops at the shorter iterable when zipping mismatched lengths', () => {
			assert.deepEqual([...moduloBigIntLazy([10n, 11n], [3n, 4n, 5n, 6n])], [1n, 3n])
			assert.deepEqual([...moduloBigIntLazy([10n, 11n, 12n, 13n], [3n, 4n])], [1n, 3n])
		})
	})

	describe('lazy streaming consumption and iterator lifecycle', () => {
		it('consumes infinite generators strictly lazily one step at a time', () => {
			let pulled = 0
			function* naturals() {
				let n = 0n
				while (true) {
					pulled += 1
					yield n
					n += 1n
				}
			}

			const stream = moduloBigIntLazy(naturals(), 4n)
			assert.equal(pulled, 0, 'nothing should be pulled before first .next()')

			const collected = []
			for (let i = 0; i < 6; i += 1) {
				const step = stream.next()
				assert.equal(step.done, false)
				collected.push(step.value)
				assert.equal(pulled, i + 1, 'exactly one upstream item pulled per downstream .next()')
			}
			assert.deepEqual(collected, [0n, 1n, 2n, 3n, 0n, 1n])
			stream.return()
		})

		it('lazily zips two infinite generators and closes both on early break', () => {
			let divPulled = 0
			let modPulled = 0
			let divClosed = false
			let modClosed = false

			function* infiniteDividends() {
				let n = 100n
				try {
					while (true) {
						divPulled += 1
						yield n
						n += 1n
					}
				} finally {
					divClosed = true
				}
			}

			function* infiniteModuli() {
				let m = 2n
				try {
					while (true) {
						modPulled += 1
						yield m
						m += 1n
					}
				} finally {
					modClosed = true
				}
			}

			const out = []
			for (const r of moduloBigIntLazy(infiniteDividends(), infiniteModuli())) {
				out.push(r)
				if (out.length === 4) break
			}

			assert.deepEqual(out, [100n % 2n, 101n % 3n, 102n % 4n, 103n % 5n])
			assert.equal(divPulled, 4)
			assert.equal(modPulled, 4)
			assert.equal(divClosed, true)
			assert.equal(modClosed, true)
		})

		it('does not pull from moduli when dividends ends first, and closes moduli iterator', () => {
			let modPulled = 0
			let modClosed = false

			function* trackedModuli() {
				try {
					for (const m of [3n, 5n, 7n, 11n]) {
						modPulled += 1
						yield m
					}
				} finally {
					modClosed = true
				}
			}

			const out = [...moduloBigIntLazy([10n, 12n], trackedModuli())]
			assert.deepEqual(out, [1n, 2n])
			assert.equal(modPulled, 2)
			assert.equal(modClosed, true)
		})

		it('does not trigger an error on a later zero modulus if consumer stops early', () => {
			function* moduliWithLateZero() {
				yield 3n
				yield 5n
				yield 0n
			}

			const stream = moduloBigIntLazy(14n, moduliWithLateZero())
			assert.equal(stream.next().value, 2n)
			assert.equal(stream.next().value, 4n)
			assert.throws(() => stream.next(), RangeError)
		})
	})

	describe('input validation', () => {
		it('throws RangeError eagerly for scalar 0n modulus', () => {
			assert.throws(() => moduloBigIntLazy(10n, 0n), RangeError)
			assert.throws(() => moduloBigIntLazy([], 0n), RangeError)
		})

		it('throws RangeError lazily when an iterable modulus yields 0n', () => {
			const gen = moduloBigIntLazy([10n, 20n], [3n, 0n])
			assert.equal(gen.next().value, 1n)
			assert.throws(() => gen.next(), RangeError)
		})

		it('throws TypeError eagerly for invalid top-level inputs including strings and numbers', () => {
			const badInputs = [42, NaN, Infinity, '123', null, undefined, true, {}, Symbol('x')]
			for (const bad of badInputs) {
				assert.throws(() => moduloBigIntLazy(bad, 5n), TypeError)
				assert.throws(() => moduloBigIntLazy(5n, bad), TypeError)
			}
		})

		it('throws TypeError lazily when an iterable yields a non-BigInt element', () => {
			const genDiv = moduloBigIntLazy([10n, 20], 3n)
			assert.equal(genDiv.next().value, 1n)
			assert.throws(() => genDiv.next(), TypeError)

			const genMod = moduloBigIntLazy(10n, [3n, '5'])
			assert.equal(genMod.next().value, 1n)
			assert.throws(() => genMod.next(), TypeError)

			const genPair = moduloBigIntLazy([10n, null], [3n, 5n])
			assert.equal(genPair.next().value, 1n)
			assert.throws(() => genPair.next(), TypeError)
		})
	})

	describe('independent mathematical cross-checks', () => {
		it('matches independent floored-division and iterative oracles across full grid of signed values', () => {
			const dividends = []
			for (let a = -25n; a <= 25n; a += 1n) {
				dividends.push(a)
			}

			for (let m = -12n; m <= 12n; m += 1n) {
				if (m === 0n) continue
				const actual = [...moduloBigIntLazy(dividends, m)]
				for (let i = 0; i < dividends.length; i += 1) {
					const a = dividends[i]
					const r = actual[i]

					// Cross-check 1: independent floored-division oracle
					assert.equal(r, referenceFlooredMod(a, m))

					// Cross-check 2: exact divisibility & range invariants
					assert.equal((a - r) % m, 0n)
					if (m > 0n) {
						assert.ok(r >= 0n && r < m)
						// Cross-check 3: independent iterative addition/subtraction oracle
						assert.equal(r, referenceIterativeMod(a, m))
					} else {
						assert.ok(r <= 0n && r > m)
					}
				}
			}
		})

		it('satisfies modular ring homomorphisms for addition and multiplication on large BigInts', () => {
			const m = 1_000_000_000_000_000_003n // large prime > 10^18
			const xs = [
				-98765432109876543210987654321n,
				-1n,
				0n,
				12345678901234567890123456789n,
				(1n << 200n) - 17n,
			]
			const ys = [
				-55555555555555555555555555555n,
				42n,
				m,
				(1n << 128n) + 99n,
				-m * 7n + 13n,
			]

			const rx = [...moduloBigIntLazy(xs, m)]
			const ry = [...moduloBigIntLazy(ys, m)]

			for (let i = 0; i < xs.length; i += 1) {
				const [sumMod] = moduloBigIntLazy(xs[i] + ys[i], m)
				const [modSumMod] = moduloBigIntLazy(rx[i] + ry[i], m)
				assert.equal(sumMod, modSumMod)

				const [prodMod] = moduloBigIntLazy(xs[i] * ys[i], m)
				const [modProdMod] = moduloBigIntLazy(rx[i] * ry[i], m)
				assert.equal(prodMod, modProdMod)
			}
		})
	})
})
