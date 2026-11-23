import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { log10DualLazy } from './log10DualLazy.js'

function assertClose(actual, expected, tol = 1e-12, label = '') {
	const diff = Math.abs(actual - expected)
	const scale = Math.max(1, Math.abs(expected))
	assert.ok(
		diff <= tol * scale,
		`${label ? label + ': ' : ''}expected ${actual} to be within ${tol * scale} of ${expected} (diff=${diff})`
	)
}

describe('log10DualLazy', () => {
	describe('normal cases', () => {
		test('computes exact powers of 10 and forward derivatives', () => {
			const input = [
				{ v: 1, d: 1 },
				{ v: 10, d: 1 },
				{ v: 100, d: 2 },
				{ v: 1000, d: 0 },
				{ v: 0.1, d: 1 },
				{ v: 0.01, d: -5 },
			]

			const results = [...log10DualLazy(input)]
			assert.equal(results.length, input.length)

			assert.equal(results[0].v, 0)
			assertClose(results[0].d, 1 / Math.LN10)

			assert.equal(results[1].v, 1)
			assertClose(results[1].d, 1 / (10 * Math.LN10))

			assert.equal(results[2].v, 2)
			assertClose(results[2].d, 2 / (100 * Math.LN10))

			assert.equal(results[3].v, 3)
			assert.equal(results[3].d, 0)

			assert.equal(results[4].v, -1)
			assertClose(results[4].d, 1 / (0.1 * Math.LN10))

			assert.equal(results[5].v, -2)
			assertClose(results[5].d, -5 / (0.01 * Math.LN10))
		})

		test('computes non-power values and normalizes -0 derivative to +0', () => {
			const results = [
				...log10DualLazy([
					{ v: 2, d: 3 },
					{ v: Math.E, d: 1 },
					{ v: 5, d: -0 },
				]),
			]

			assertClose(results[0].v, Math.log10(2))
			assertClose(results[0].d, 3 / (2 * Math.LN10))

			assertClose(results[1].v, Math.LOG10E)
			assertClose(results[1].d, Math.LOG10E / Math.E)

			assertClose(results[2].v, Math.log10(5))
			assert.ok(Object.is(results[2].d, 0))
		})

		test('handles empty iterable', () => {
			assert.deepEqual([...log10DualLazy([])], [])
		})

		test('accepts diverse iterable sources (Set, custom iterable, generator)', () => {
			const set = new Set([
				{ v: 1, d: 2 },
				{ v: 10, d: 4 },
			])
			const customIterable = {
				*[Symbol.iterator]() {
					yield { v: 100, d: 10 }
				},
			}

			const fromSet = [...log10DualLazy(set)]
			assert.equal(fromSet.length, 2)
			assert.equal(fromSet[0].v, 0)
			assertClose(fromSet[0].d, 2 * Math.LOG10E)
			assert.equal(fromSet[1].v, 1)
			assertClose(fromSet[1].d, 0.4 * Math.LOG10E)

			const fromCustom = [...log10DualLazy(customIterable)]
			assert.equal(fromCustom.length, 1)
			assert.equal(fromCustom[0].v, 2)
			assertClose(fromCustom[0].d, 0.1 * Math.LOG10E)
		})

		test('preserves accuracy for extreme finite positive scales without spurious overflow', () => {
			const results = [
				...log10DualLazy([
					{ v: 1e308, d: 1e308 },
					{ v: 1e-308, d: 1e-308 },
					{ v: 3e-309, d: 1 },
				]),
			]

			assertClose(results[0].v, 308)
			assertClose(results[0].d, Math.LOG10E)

			assertClose(results[1].v, -308)
			assertClose(results[1].d, Math.LOG10E)

			assertClose(results[2].v, Math.log10(3e-309))
			assert.ok(Number.isFinite(results[2].d))
			assertClose(results[2].d, Math.LOG10E / 3e-309)
		})

		test('does not mutate input dual objects', () => {
			const orig = { v: 10, d: 2 }
			const [res] = [...log10DualLazy([orig])]
			assert.deepEqual(orig, { v: 10, d: 2 })
			assert.notEqual(res, orig)
		})
	})

	describe('edge cases: non-positive inputs', () => {
		test('throws RangeError for zero and negative zero', () => {
			assert.throws(() => [...log10DualLazy([{ v: 0, d: 1 }])], RangeError)
			assert.throws(() => [...log10DualLazy([{ v: -0, d: 1 }])], RangeError)
			assert.throws(() => [...log10DualLazy([{ v: 0, d: 0 }])], RangeError)
		})

		test('throws RangeError for negative values', () => {
			for (const v of [-1, -10, -1e-12, -Number.MIN_VALUE, -1e300]) {
				assert.throws(() => [...log10DualLazy([{ v, d: 1 }])], RangeError)
			}
		})

		test('yields valid prefix lazily before throwing on non-positive element', () => {
			const gen = log10DualLazy([
				{ v: 10, d: 1 },
				{ v: 100, d: 2 },
				{ v: -5, d: 1 },
				{ v: 1000, d: 3 },
			])

			const first = gen.next()
			assert.equal(first.done, false)
			assert.equal(first.value.v, 1)

			const second = gen.next()
			assert.equal(second.done, false)
			assert.equal(second.value.v, 2)

			assert.throws(() => gen.next(), RangeError)
		})
	})

	describe('lazy / streaming generator consumption', () => {
		test('does not consume upstream iterable until .next() is called and pulls one item per step', () => {
			let pulled = 0
			function* source() {
				for (let i = 1; i <= 5; i += 1) {
					pulled += 1
					yield { v: 10 ** i, d: i }
				}
			}

			const stream = log10DualLazy(source())
			assert.equal(pulled, 0)

			const first = stream.next()
			assert.equal(pulled, 1)
			assert.equal(first.done, false)
			assert.equal(first.value.v, 1)

			const second = stream.next()
			assert.equal(pulled, 2)
			assert.equal(second.done, false)
			assert.equal(second.value.v, 2)
		})

		test('supports infinite streams without exhausting memory or hanging', () => {
			function* infinitePowersOf10() {
				let k = 0
				while (true) {
					yield { v: 10 ** k, d: 10 ** k }
					k += 1
				}
			}

			const stream = log10DualLazy(infinitePowersOf10())
			const taken = []
			for (const item of stream) {
				taken.push(item)
				if (taken.length === 5) break
			}

			assert.equal(taken.length, 5)
			for (let k = 0; k < 5; k += 1) {
				assert.equal(taken[k].v, k)
				assertClose(taken[k].d, Math.LOG10E)
			}
		})

		test('propagates early termination cleanup to upstream generator', () => {
			let cleanedUp = false
			let produced = 0
			function* trackedSource() {
				try {
					while (true) {
						produced += 1
						yield { v: produced, d: 1 }
					}
				} finally {
					cleanedUp = true
				}
			}

			const stream = log10DualLazy(trackedSource())
			for (const _item of stream) {
				if (produced === 3) break
			}

			assert.equal(produced, 3)
			assert.equal(cleanedUp, true)
		})
	})

	describe('input validation errors', () => {
		test('throws TypeError synchronously for non-iterable or string inputs', () => {
			const invalidInputs = [
				undefined,
				null,
				42,
				true,
				'10',
				'',
				{ v: 10, d: 1 },
				() => {},
			]
			for (const bad of invalidInputs) {
				assert.throws(() => log10DualLazy(bad), TypeError)
			}
		})

		test('throws TypeError lazily for malformed dual elements', () => {
			const badElements = [
				null,
				undefined,
				10,
				'10',
				[10, 1],
				{},
				{ v: 10 },
				{ d: 1 },
				{ v: '10', d: 1 },
				{ v: 10, d: '1' },
				{ v: 10, d: null },
			]
			for (const el of badElements) {
				const gen = log10DualLazy([el])
				assert.throws(() => gen.next(), TypeError)
			}
		})

		test('throws RangeError lazily for non-finite v or d', () => {
			const nonFiniteElements = [
				{ v: Number.NaN, d: 1 },
				{ v: Number.POSITIVE_INFINITY, d: 1 },
				{ v: Number.NEGATIVE_INFINITY, d: 1 },
				{ v: 10, d: Number.NaN },
				{ v: 10, d: Number.POSITIVE_INFINITY },
				{ v: 10, d: Number.NEGATIVE_INFINITY },
			]
			for (const el of nonFiniteElements) {
				const gen = log10DualLazy([el])
				assert.throws(() => gen.next(), RangeError)
			}
		})
	})

	describe('independent cross-checks', () => {
		test('matches central finite-difference directional derivatives', () => {
			const h = 1e-6
			const samples = [
				{ v: 0.05, d: 1 },
				{ v: 0.5, d: -2.3 },
				{ v: 1, d: 1 },
				{ v: Math.E, d: 4.2 },
				{ v: 7.5, d: 0.75 },
				{ v: 42, d: -11 },
				{ v: 1000, d: 25 },
			]

			const results = [...log10DualLazy(samples)]
			for (let i = 0; i < samples.length; i += 1) {
				const { v, d } = samples[i]
				const step = h * Math.max(1, Math.abs(v)) / Math.max(1, Math.abs(d))
				const fd = (Math.log10(v + step * d) - Math.log10(v - step * d)) / (2 * step)
				assertClose(results[i].d, fd, 1e-7, `finite-diff sample ${i}`)
			}
		})

		test('satisfies dual-number product rule: log10(a * b) === log10(a) + log10(b)', () => {
			const pairs = [
				[
					{ v: 2.5, d: 1.3 },
					{ v: 4.8, d: -0.7 },
				],
				[
					{ v: 0.3, d: -2 },
					{ v: 15.2, d: 3.1 },
				],
			]

			for (const [a, b] of pairs) {
				const prod = { v: a.v * b.v, d: a.d * b.v + a.v * b.d }
				const [logA, logB, logProd] = [...log10DualLazy([a, b, prod])]

				assertClose(logProd.v, logA.v + logB.v, 1e-12, 'product value')
				assertClose(logProd.d, logA.d + logB.d, 1e-12, 'product derivative')
			}
		})

		test('satisfies inverse identity: log10(10^x) === x for dual x = { v, d }', () => {
			const xs = [
				{ v: -3.5, d: 2.1 },
				{ v: 0, d: 1 },
				{ v: 2.75, d: -0.4 },
			]

			// Dual exp10(v + d*eps) = 10^v + (10^v * ln(10) * d)*eps
			const exp10Stream = xs.map(({ v, d }) => {
				const pow = 10 ** v
				return { v: pow, d: pow * Math.LN10 * d }
			})

			const recovered = [...log10DualLazy(exp10Stream)]
			for (let i = 0; i < xs.length; i += 1) {
				assertClose(recovered[i].v, xs[i].v, 1e-12, `inverse value ${i}`)
				assertClose(recovered[i].d, xs[i].d, 1e-12, `inverse derivative ${i}`)
			}
		})
	})
})
