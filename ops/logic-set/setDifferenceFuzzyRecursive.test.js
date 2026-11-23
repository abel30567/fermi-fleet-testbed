import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { setDifferenceFuzzyRecursive } from './setDifferenceFuzzyRecursive.js'

/**
 * Independent iterative reference implementation constructed directly from
 * Zadeh fuzzy complement (¬B) and Zadeh fuzzy intersection (A ∩ ¬B).
 */
function referenceZadehDifferenceObject(a, b, includeZero = false) {
	const universe = new Set([...Object.keys(a), ...Object.keys(b)])
	const complementB = {}
	for (const key of universe) {
		const muB = Object.prototype.hasOwnProperty.call(b, key) ? b[key] : 0
		complementB[key] = 1 - muB
	}
	const out = {}
	for (const key of universe) {
		const muA = Object.prototype.hasOwnProperty.call(a, key) ? a[key] : 0
		const mu = Math.min(muA, complementB[key])
		const normalized = mu === 0 ? 0 : mu
		if (includeZero || normalized > 0) {
			Object.defineProperty(out, key, {
				value: normalized,
				writable: true,
				enumerable: true,
				configurable: true,
			})
		}
	}
	return out
}

function referenceZadehDifferenceMap(a, b, includeZero = false) {
	const universe = new Set([...a.keys(), ...b.keys()])
	const out = new Map()
	for (const key of universe) {
		const muA = a.has(key) ? a.get(key) : 0
		const muB = b.has(key) ? b.get(key) : 0
		const mu = Math.min(muA, 1 - muB)
		const normalized = mu === 0 ? 0 : mu
		if (includeZero || normalized > 0) {
			out.set(key, normalized)
		}
	}
	return out
}

/** Deterministic PRNG (Mulberry32) for repeatable randomized cross-checks. */
function mulberry32(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

describe('setDifferenceFuzzyRecursive', () => {
	describe('normal cases', () => {
		test('computes Zadeh fuzzy difference on plain objects', () => {
			const a = { x: 0.8, y: 0.5, z: 0.25 }
			const b = { x: 0.3, y: 0.75, w: 0.9 }
			const result = setDifferenceFuzzyRecursive(a, b)

			// x: min(0.8, 1 - 0.3) = min(0.8, 0.7) = 0.7
			// y: min(0.5, 1 - 0.75) = min(0.5, 0.25) = 0.25
			// z: min(0.25, 1 - 0) = 0.25
			// w: min(0, 1 - 0.9) = 0 (omitted)
			assert.deepEqual(Object.keys(result), ['x', 'y', 'z'])
			assert.ok(Math.abs(result.x - 0.7) < 1e-12)
			assert.ok(Math.abs(result.y - 0.25) < 1e-12)
			assert.ok(Math.abs(result.z - 0.25) < 1e-12)
		})

		test('supports Map inputs including non-string keys', () => {
			const sym = Symbol('item')
			const objKey = { id: 1 }
			const a = new Map([
				[1, 0.9],
				[sym, 0.6],
				[objKey, 0.4],
			])
			const b = new Map([
				[1, 0.25],
				[sym, 1],
				['extra', 0.5],
			])

			const result = setDifferenceFuzzyRecursive(a, b)
			assert.ok(result instanceof Map)
			assert.equal(result.size, 2)
			assert.equal(result.get(1), 0.75)
			assert.equal(result.has(sym), false)
			assert.equal(result.get(objKey), 0.4)
		})

		test('reduces to classical set difference on crisp {0, 1} sets', () => {
			const a = { a: 1, b: 1, c: 1, d: 0 }
			const b = { b: 1, c: 0, e: 1 }
			assert.deepEqual(setDifferenceFuzzyRecursive(a, b), { a: 1, c: 1 })
		})

		test('satisfies fuzzy self-difference μ_{A\\A}(x) = min(μ_A(x), 1 - μ_A(x))', () => {
			const a = { p: 0.2, q: 0.5, r: 0.8, s: 1.0, t: 0.0 }
			const result = setDifferenceFuzzyRecursive(a, a)
			assert.deepEqual(Object.keys(result), ['p', 'q', 'r'])
			assert.ok(Math.abs(result.p - 0.2) < 1e-12)
			assert.ok(Math.abs(result.q - 0.5) < 1e-12)
			assert.ok(Math.abs(result.r - 0.2) < 1e-12)
		})

		test('retains all universe keys when options.includeZero is true', () => {
			const a = { x: 0.7, y: 0.5, zero: 0 }
			const b = { x: 1, z: 0.4 }
			const result = setDifferenceFuzzyRecursive(a, b, { includeZero: true })
			assert.deepEqual(result, { x: 0, y: 0.5, zero: 0, z: 0 })

			const mapResult = setDifferenceFuzzyRecursive(
				new Map(Object.entries(a)),
				new Map(Object.entries(b)),
				{ includeZero: true },
			)
			assert.deepEqual(
				mapResult,
				new Map([
					['x', 0],
					['y', 0.5],
					['zero', 0],
					['z', 0],
				]),
			)
		})

		test('does not mutate input sets', () => {
			const a = { x: 0.6, y: 0.4 }
			const b = { x: 0.2, z: 0.8 }
			const snapshotA = { ...a }
			const snapshotB = { ...b }
			setDifferenceFuzzyRecursive(a, b)
			assert.deepEqual(a, snapshotA)
			assert.deepEqual(b, snapshotB)

			const mapA = new Map([['x', 0.6]])
			const mapB = new Map([['x', 0.2]])
			setDifferenceFuzzyRecursive(mapA, mapB)
			assert.deepEqual(mapA, new Map([['x', 0.6]]))
			assert.deepEqual(mapB, new Map([['x', 0.2]]))
		})
	})

	describe('edge cases', () => {
		test('handles empty sets', () => {
			assert.deepEqual(setDifferenceFuzzyRecursive({}, {}), {})
			assert.deepEqual(setDifferenceFuzzyRecursive({}, { a: 0.5 }), {})
			assert.deepEqual(
				setDifferenceFuzzyRecursive({}, { a: 0.5 }, { includeZero: true }),
				{ a: 0 },
			)
			assert.deepEqual(setDifferenceFuzzyRecursive({ a: 0.5 }, {}), { a: 0.5 })
			assert.deepEqual(setDifferenceFuzzyRecursive(new Map(), new Map()), new Map())
		})

		test('handles single-element sets (divide-and-conquer base case)', () => {
			assert.deepEqual(setDifferenceFuzzyRecursive({ only: 0.75 }, { only: 0.5 }), {
				only: 0.5,
			})
			assert.deepEqual(setDifferenceFuzzyRecursive({ only: 0.75 }, { only: 1 }), {})
		})

		test('normalizes -0 to +0', () => {
			const res = setDifferenceFuzzyRecursive(
				{ k: -0 },
				{ k: 0 },
				{ includeZero: true },
			)
			assert.ok(Object.is(res.k, 0))
		})

		test('accepts null-prototype objects and safely handles __proto__ key', () => {
			const a = Object.create(null)
			a.alpha = 0.9
			a['__proto__'] = 0.6
			const b = Object.create(null)
			b.alpha = 0.4
			b['__proto__'] = 0.2

			const result = setDifferenceFuzzyRecursive(a, b)
			assert.ok(Math.abs(result.alpha - 0.6) < 1e-12)
			assert.equal(Object.prototype.hasOwnProperty.call(result, '__proto__'), true)
			assert.ok(Math.abs(result['__proto__'] - 0.6) < 1e-12)
		})

		test('handles large fuzzy sets without call stack overflow (O(log n) depth)', () => {
			const size = 10_000
			const a = new Map()
			const b = new Map()
			for (let i = 0; i < size; i++) {
				a.set(i, (i % 101) / 100)
				b.set(i, ((i * 7) % 101) / 100)
			}

			const result = setDifferenceFuzzyRecursive(a, b)
			const expected = referenceZadehDifferenceMap(a, b)
			assert.equal(result.size, expected.size)
			for (const [k, v] of expected) {
				assert.equal(result.get(k), v)
			}
		})
	})

	describe('invalid inputs', () => {
		test('rejects non-plain-object / non-Map containers and mismatched types', () => {
			const invalidContainers = [
				null,
				undefined,
				42,
				'abc',
				true,
				[0.5],
				new Set([0.5]),
				new Date(),
				/regex/,
				() => {},
			]
			for (const bad of invalidContainers) {
				assert.throws(() => setDifferenceFuzzyRecursive(bad, {}), TypeError)
				assert.throws(() => setDifferenceFuzzyRecursive({}, bad), TypeError)
			}
			assert.throws(() => setDifferenceFuzzyRecursive({}, new Map()), TypeError)
			assert.throws(() => setDifferenceFuzzyRecursive(new Map(), {}), TypeError)
		})

		test('rejects non-number memberships', () => {
			const badValues = ['0.5', true, false, null, undefined, {}, []]
			for (const v of badValues) {
				assert.throws(() => setDifferenceFuzzyRecursive({ x: v }, {}), TypeError)
				assert.throws(() => setDifferenceFuzzyRecursive({}, { x: v }), TypeError)
				assert.throws(
					() => setDifferenceFuzzyRecursive(new Map([['x', v]]), new Map()),
					TypeError,
				)
			}
		})

		test('rejects out-of-range and non-finite memberships (including keys only in B)', () => {
			const badNumbers = [-0.0001, -1, 1.0001, 2, NaN, Infinity, -Infinity]
			for (const v of badNumbers) {
				assert.throws(() => setDifferenceFuzzyRecursive({ x: v }, {}), RangeError)
				assert.throws(() => setDifferenceFuzzyRecursive({}, { onlyInB: v }), RangeError)
				assert.throws(
					() => setDifferenceFuzzyRecursive(new Map(), new Map([['onlyInB', v]])),
					RangeError,
				)
			}
		})

		test('rejects invalid options argument', () => {
			assert.throws(() => setDifferenceFuzzyRecursive({}, {}, null), TypeError)
			assert.throws(() => setDifferenceFuzzyRecursive({}, {}, []), TypeError)
			assert.throws(() => setDifferenceFuzzyRecursive({}, {}, 'yes'), TypeError)
			assert.throws(
				() => setDifferenceFuzzyRecursive({}, {}, { includeZero: 1 }),
				TypeError,
			)
		})
	})

	describe('independent cross-checks and algebraic identities', () => {
		test('matches independent iterative Zadeh A ∩ ¬B reference across 100 random trials', () => {
			const rand = mulberry32(20261123)
			const pool = Array.from({ length: 25 }, (_, i) => `e${i}`)

			for (let trial = 0; trial < 100; trial++) {
				const aObj = {}
				const bObj = {}
				const aMap = new Map()
				const bMap = new Map()

				for (const key of pool) {
					if (rand() < 0.65) {
						const v = rand() < 0.1 ? 0 : rand() < 0.2 ? 1 : Math.round(rand() * 1000) / 1000
						aObj[key] = v
						aMap.set(key, v)
					}
					if (rand() < 0.65) {
						const v = rand() < 0.1 ? 0 : rand() < 0.2 ? 1 : Math.round(rand() * 1000) / 1000
						bObj[key] = v
						bMap.set(key, v)
					}
				}

				for (const includeZero of [false, true]) {
					const actualObj = setDifferenceFuzzyRecursive(aObj, bObj, { includeZero })
					const expectedObj = referenceZadehDifferenceObject(aObj, bObj, includeZero)
					assert.deepEqual(actualObj, expectedObj)

					const actualMap = setDifferenceFuzzyRecursive(aMap, bMap, { includeZero })
					const expectedMap = referenceZadehDifferenceMap(aMap, bMap, includeZero)
					assert.deepEqual(actualMap, expectedMap)
				}
			}
		})

		test('satisfies Zadeh fuzzy algebraic properties (sub-setness and De Morgan law)', () => {
			const rand = mulberry32(987654321)
			const a = {}
			const b = {}
			const keys = Array.from({ length: 40 }, (_, i) => `k${i}`)
			for (const k of keys) {
				a[k] = Math.round(rand() * 100) / 100
				b[k] = Math.round(rand() * 100) / 100
			}

			const diff = setDifferenceFuzzyRecursive(a, b, { includeZero: true })
			for (const k of keys) {
				const muA = a[k]
				const muB = b[k]
				const muDiff = diff[k]

				// Sub-setness: (A \ B) ⊆ A  <=>  μ_{A \ B}(x) <= μ_A(x)
				assert.ok(muDiff <= muA + 1e-12)
				// Bound by ¬B: μ_{A \ B}(x) <= 1 - μ_B(x)
				assert.ok(muDiff <= 1 - muB + 1e-12)
				// De Morgan: ¬(A \ B) = ¬A ∪ B  <=>  1 - μ_{A \ B}(x) = max(1 - μ_A(x), μ_B(x))
				assert.ok(Math.abs(1 - muDiff - Math.max(1 - muA, muB)) < 1e-12)
			}
		})
	})
})
