import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { unionKleeneRecursive } from './unionKleeneRecursive.js'

/**
 * Independent iterative reference implementation using numeric max-encoding:
 *   false -> 0, 'unknown' -> 1, true -> 2
 * Under this order, Kleene K3 OR is simply max(a, b).
 */
const ENCODE = new Map([
	[false, 0],
	['unknown', 1],
	[true, 2],
])
const DECODE = [false, 'unknown', true]

function iterativeMaxEncodingUnion(sets) {
	const result = new Map()
	for (const s of sets) {
		const entries = s instanceof Map ? s.entries() : Object.entries(s)
		for (const [k, v] of entries) {
			const prev = result.has(k) ? ENCODE.get(result.get(k)) : 0
			const next = ENCODE.get(v)
			result.set(k, DECODE[Math.max(prev, next)])
		}
	}
	return result
}

/**
 * Independent Kleene K3 complement and intersection helpers for De Morgan cross-check:
 *   A ∪ B = ¬(¬A ∩ ¬B)
 */
function kleeneNotValue(v) {
	if (v === true) return false
	if (v === false) return true
	return 'unknown'
}

function kleeneAndValue(a, b) {
	if (a === false || b === false) return false
	if (a === 'unknown' || b === 'unknown') return 'unknown'
	return true
}

function complementOnUniverse(setObj, universe) {
	const out = {}
	for (const k of universe) {
		const val = Object.prototype.hasOwnProperty.call(setObj, k) ? setObj[k] : false
		out[k] = kleeneNotValue(val)
	}
	return out
}

function intersectOnUniverse(a, b, universe) {
	const out = {}
	for (const k of universe) {
		const av = Object.prototype.hasOwnProperty.call(a, k) ? a[k] : false
		const bv = Object.prototype.hasOwnProperty.call(b, k) ? b[k] : false
		out[k] = kleeneAndValue(av, bv)
	}
	return out
}

describe('unionKleeneRecursive', () => {
	describe('Kleene K3 truth table (all 9 combinations)', () => {
		it('computes all 9 Kleene disjunction combinations accurately for plain objects', () => {
			const left = {
				tt: true,
				tu: true,
				tf: true,
				ut: 'unknown',
				uu: 'unknown',
				uf: 'unknown',
				ft: false,
				fu: false,
				ff: false,
			}
			const right = {
				tt: true,
				tu: 'unknown',
				tf: false,
				ut: true,
				uu: 'unknown',
				uf: false,
				ft: true,
				fu: 'unknown',
				ff: false,
			}

			const expected = {
				tt: true,
				tu: true,
				tf: true,
				ut: true,
				uu: 'unknown',
				uf: 'unknown',
				ft: true,
				fu: 'unknown',
				ff: false,
			}

			assert.deepStrictEqual(unionKleeneRecursive(left, right), expected)
		})

		it('computes all 9 Kleene disjunction combinations accurately for Maps', () => {
			const keys = ['tt', 'tu', 'tf', 'ut', 'uu', 'uf', 'ft', 'fu', 'ff']
			const values = [true, 'unknown', false]
			const left = new Map()
			const right = new Map()
			const expected = new Map()

			let idx = 0
			for (const a of values) {
				for (const b of values) {
					const k = keys[idx++]
					left.set(k, a)
					right.set(k, b)
					expected.set(k, a === true || b === true ? true : a === 'unknown' || b === 'unknown' ? 'unknown' : false)
				}
			}

			const actual = unionKleeneRecursive(left, right)
			assert.ok(actual instanceof Map)
			assert.deepStrictEqual(actual, expected)
		})
	})

	describe('normal cases: plain objects, Maps, disjoint, overlapping, and multi-set unions', () => {
		it('handles disjoint and overlapping plain object partial sets (missing keys default to false)', () => {
			const a = { onlyA_t: true, onlyA_u: 'unknown', onlyA_f: false, shared1: 'unknown', shared2: false }
			const b = { onlyB_t: true, onlyB_u: 'unknown', onlyB_f: false, shared1: true, shared2: 'unknown' }

			assert.deepStrictEqual(unionKleeneRecursive(a, b), {
				onlyA_t: true,
				onlyA_u: 'unknown',
				onlyA_f: false,
				shared1: true,
				shared2: 'unknown',
				onlyB_t: true,
				onlyB_u: 'unknown',
				onlyB_f: false,
			})
		})

		it('handles multi-set variadic unions (3, 5, and 7 sets)', () => {
			const s1 = { a: false, b: false, c: false }
			const s2 = { a: 'unknown', b: false, d: 'unknown' }
			const s3 = { b: 'unknown', c: true, e: false }
			const s4 = { a: true, d: false, f: 'unknown' }
			const s5 = { e: 'unknown', g: true }

			assert.deepStrictEqual(unionKleeneRecursive(s1, s2, s3), {
				a: 'unknown',
				b: 'unknown',
				c: true,
				d: 'unknown',
				e: false,
			})

			assert.deepStrictEqual(unionKleeneRecursive(s1, s2, s3, s4, s5), {
				a: true,
				b: 'unknown',
				c: true,
				d: 'unknown',
				e: 'unknown',
				f: 'unknown',
				g: true,
			})

			const seven = [
				{ k: false },
				{ k: false },
				{ k: 'unknown' },
				{ k: false },
				{ k: 'unknown' },
				{ k: true },
				{ k: false },
			]
			assert.deepStrictEqual(unionKleeneRecursive(...seven), { k: true })
		})

		it('accepts a single array of partial sets', () => {
			const a = { x: 'unknown', y: false }
			const b = { x: true, z: 'unknown' }
			const c = { y: 'unknown', w: false }

			assert.deepStrictEqual(unionKleeneRecursive([a, b, c]), {
				x: true,
				y: 'unknown',
				z: 'unknown',
				w: false,
			})
		})

		it('supports Map inputs with arbitrary non-string key types', () => {
			const objKey = { id: 1 }
			const symKey = Symbol('elem')

			const m1 = new Map([
				[1, 'unknown'],
				[objKey, false],
				[symKey, true],
				[NaN, 'unknown'],
			])
			const m2 = new Map([
				[1, true],
				[objKey, 'unknown'],
				[null, false],
				[NaN, false],
			])

			const result = unionKleeneRecursive(m1, m2)
			assert.ok(result instanceof Map)
			assert.equal(result.get(1), true)
			assert.equal(result.get(objKey), 'unknown')
			assert.equal(result.get(symKey), true)
			assert.equal(result.get(null), false)
			assert.equal(result.get(NaN), 'unknown')
			assert.equal(result.size, 5)
		})

		it('supports mixed plain object and Map inputs by returning a Map without losing non-string keys', () => {
			const plain = { a: 'unknown', b: false }
			const map = new Map([
				['a', true],
				[42, 'unknown'],
			])

			const result = unionKleeneRecursive(plain, map)
			assert.ok(result instanceof Map)
			assert.equal(result.get('a'), true)
			assert.equal(result.get('b'), false)
			assert.equal(result.get(42), 'unknown')
			assert.equal(result.size, 3)
		})

		it('does not mutate any input objects or Maps', () => {
			const a = { x: 'unknown', y: false }
			const b = { x: true, z: 'unknown' }
			const m1 = new Map([['k', false]])
			const m2 = new Map([['k', true]])

			const resObj = unionKleeneRecursive(a, b)
			const resMap = unionKleeneRecursive(m1, m2)

			assert.deepStrictEqual(a, { x: 'unknown', y: false })
			assert.deepStrictEqual(b, { x: true, z: 'unknown' })
			assert.notEqual(resObj, a)
			assert.notEqual(resObj, b)

			assert.deepStrictEqual(m1, new Map([['k', false]]))
			assert.deepStrictEqual(m2, new Map([['k', true]]))
			assert.notEqual(resMap, m1)
			assert.notEqual(resMap, m2)
		})
	})

	describe('edge cases', () => {
		it('handles zero arguments and empty array by returning an empty partial set', () => {
			assert.deepStrictEqual(unionKleeneRecursive(), {})
			assert.deepStrictEqual(unionKleeneRecursive([]), {})
		})

		it('handles empty partial sets (plain objects and Maps)', () => {
			assert.deepStrictEqual(unionKleeneRecursive({}, {}), {})
			assert.deepStrictEqual(unionKleeneRecursive({}, { a: 'unknown', b: true }), {
				a: 'unknown',
				b: true,
			})
			assert.deepStrictEqual(unionKleeneRecursive({ a: false }, {}), { a: false })

			const emptyMapUnion = unionKleeneRecursive(new Map(), new Map())
			assert.ok(emptyMapUnion instanceof Map)
			assert.equal(emptyMapUnion.size, 0)
		})

		it('handles single partial set and returns a fresh clone', () => {
			const single = { a: true, b: 'unknown', c: false }
			const res = unionKleeneRecursive(single)
			assert.deepStrictEqual(res, single)
			assert.notEqual(res, single)

			const singleArr = unionKleeneRecursive([single])
			assert.deepStrictEqual(singleArr, single)
			assert.notEqual(singleArr, single)

			const singleMap = new Map([['x', 'unknown']])
			const resMap = unionKleeneRecursive(singleMap)
			assert.ok(resMap instanceof Map)
			assert.deepStrictEqual(resMap, singleMap)
			assert.notEqual(resMap, singleMap)
		})

		it('supports null-prototype objects and literal "__proto__" keys safely', () => {
			const nullProto = Object.create(null)
			nullProto.a = true
			nullProto.b = 'unknown'

			const withProtoKey = JSON.parse('{"__proto__": "unknown", "a": false}')

			const result = unionKleeneRecursive(nullProto, withProtoKey)
			assert.equal(Object.getPrototypeOf(result), Object.prototype)
			assert.equal(result.a, true)
			assert.equal(result.b, 'unknown')
			assert.equal(Object.prototype.hasOwnProperty.call(result, '__proto__'), true)
			assert.equal(Object.getOwnPropertyDescriptor(result, '__proto__').value, 'unknown')
		})

		it('handles large key sets and many input sets without stack overflow', () => {
			const keyCount = 10000
			const a = {}
			const b = {}
			const vals = [false, 'unknown', true]

			for (let i = 0; i < keyCount; i++) {
				a[`k${i}`] = vals[i % 3]
				b[`k${i}`] = vals[(i * 7 + 1) % 3]
			}

			const actual = unionKleeneRecursive(a, b)
			const refMap = iterativeMaxEncodingUnion([a, b])

			assert.equal(Object.keys(actual).length, keyCount)
			for (let i = 0; i < keyCount; i++) {
				const k = `k${i}`
				assert.equal(actual[k], refMap.get(k))
			}

			// Many small partial sets to exercise deep set-splitting recursion
			const manySets = Array.from({ length: 128 }, (_, i) => ({
				shared: i === 100 ? true : i % 2 === 0 ? 'unknown' : false,
				[`unique_${i}`]: vals[i % 3],
			}))
			const manyActual = unionKleeneRecursive(manySets)
			const manyRef = iterativeMaxEncodingUnion(manySets)
			assert.equal(manyActual.shared, true)
			assert.equal(Object.keys(manyActual).length, 129)
			for (const [k, v] of manyRef.entries()) {
				assert.equal(manyActual[k], v)
			}
		})
	})

	describe('input validation', () => {
		it('rejects non-partial-set inputs with TypeError', () => {
			const invalidInputs = [
				null,
				undefined,
				42,
				'unknown',
				true,
				Symbol('s'),
				() => {},
				new Set(['a']),
				new Date(),
				/abc/,
				new (class Custom {})(),
			]

			for (const bad of invalidInputs) {
				assert.throws(() => unionKleeneRecursive(bad), TypeError)
				assert.throws(() => unionKleeneRecursive({ a: true }, bad), TypeError)
				assert.throws(() => unionKleeneRecursive([bad]), TypeError)
			}
		})

		it('rejects nested arrays or arrays mixed with other arguments', () => {
			assert.throws(() => unionKleeneRecursive([[{ a: true }]]), TypeError)
			assert.throws(() => unionKleeneRecursive([{ a: true }], { b: false }), TypeError)
			assert.throws(() => unionKleeneRecursive({ a: true }, [{ b: false }]), TypeError)
		})

		it('rejects invalid membership values in plain objects and Maps', () => {
			const invalidValues = [undefined, null, 0, 1, 'true', 'false', 'UNKNOWN', '', NaN, {}, []]

			for (const badVal of invalidValues) {
				assert.throws(() => unionKleeneRecursive({ a: badVal }), TypeError)
				assert.throws(() => unionKleeneRecursive({ a: true }, { b: badVal }), TypeError)
				assert.throws(() => unionKleeneRecursive(new Map([['a', badVal]])), TypeError)
			}
		})
	})

	describe('algebraic laws and independent cross-checks', () => {
		const sampleA = { a: true, b: true, c: true, d: 'unknown', e: 'unknown', f: false, g: 'unknown' }
		const sampleB = { a: true, b: 'unknown', c: false, d: 'unknown', e: false, f: false, h: true }
		const sampleC = { a: false, c: 'unknown', d: true, f: 'unknown', g: false, i: false }

		it("satisfies De Morgan's law: A ∪ B = ¬(¬A ∩ ¬B)", () => {
			const universe = Array.from(new Set([...Object.keys(sampleA), ...Object.keys(sampleB)]))
			const direct = unionKleeneRecursive(sampleA, sampleB)

			const notA = complementOnUniverse(sampleA, universe)
			const notB = complementOnUniverse(sampleB, universe)
			const notA_and_notB = intersectOnUniverse(notA, notB, universe)
			const deMorgan = complementOnUniverse(notA_and_notB, universe)

			assert.deepStrictEqual(direct, deMorgan)
		})

		it('satisfies commutativity: A ∪ B = B ∪ A', () => {
			assert.deepStrictEqual(unionKleeneRecursive(sampleA, sampleB), unionKleeneRecursive(sampleB, sampleA))
		})

		it('satisfies associativity: (A ∪ B) ∪ C = A ∪ (B ∪ C) = union(A, B, C)', () => {
			const leftAssoc = unionKleeneRecursive(unionKleeneRecursive(sampleA, sampleB), sampleC)
			const rightAssoc = unionKleeneRecursive(sampleA, unionKleeneRecursive(sampleB, sampleC))
			const multi = unionKleeneRecursive(sampleA, sampleB, sampleC)

			assert.deepStrictEqual(leftAssoc, rightAssoc)
			assert.deepStrictEqual(leftAssoc, multi)
		})

		it('satisfies idempotence: A ∪ A = A', () => {
			assert.deepStrictEqual(unionKleeneRecursive(sampleA, sampleA), sampleA)
			assert.deepStrictEqual(unionKleeneRecursive(sampleB, sampleB), sampleB)
		})

		it('matches independent iterative max-encoding reference across randomized multi-set cases', () => {
			// Deterministic LCG PRNG for reproducible cross-checking
			let seed = 0x5eed1234
			const nextRand = () => {
				seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
				return seed
			}
			const values = [false, 'unknown', true]

			for (let trial = 0; trial < 25; trial++) {
				const numSets = (nextRand() % 7) + 1
				const sets = []
				for (let s = 0; s < numSets; s++) {
					const obj = {}
					const numKeys = nextRand() % 20
					for (let k = 0; k < numKeys; k++) {
						const key = `e${nextRand() % 15}`
						obj[key] = values[nextRand() % 3]
					}
					sets.push(obj)
				}

				const actual = unionKleeneRecursive(...sets)
				const expectedMap = iterativeMaxEncodingUnion(sets)
				const expectedObj = Object.fromEntries(expectedMap.entries())
				assert.deepStrictEqual(actual, expectedObj)
			}
		})
	})
})
