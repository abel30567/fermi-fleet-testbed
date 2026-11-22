import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { setDifferenceKleeneRecursive } from './setDifferenceKleeneRecursive.js'

/**
 * Independent reference computation of `A \ B = A ∩ ¬B` using numeric Kleene K3 encoding:
 * `{ false: 0, unknown: 1, true: 2 }`, with `¬x = 2 - x` and `x ∧ y = min(x, y)`.
 */
const TO_NUM = Object.freeze({ false: 0, unknown: 1, true: 2 })
const FROM_NUM = Object.freeze([false, 'unknown', true])

function toNum(v) {
	return v === true ? TO_NUM.true : v === false ? TO_NUM.false : TO_NUM.unknown
}

function independentKleeneDiffPlain(setA, setB) {
	const keys = new Set([...Object.keys(setA), ...Object.keys(setB)])
	const out = {}
	for (const k of keys) {
		const aVal = Object.hasOwn(setA, k) ? setA[k] : false
		const bVal = Object.hasOwn(setB, k) ? setB[k] : false
		const notB = 2 - toNum(bVal)
		const diff = FROM_NUM[Math.min(toNum(aVal), notB)]
		if (k === '__proto__') {
			Object.defineProperty(out, k, {
				value: diff,
				writable: true,
				enumerable: true,
				configurable: true,
			})
		} else {
			out[k] = diff
		}
	}
	return out
}

function independentKleeneDiffMap(mapA, mapB) {
	const keys = new Set([...mapA.keys(), ...mapB.keys()])
	const out = new Map()
	for (const k of keys) {
		const aVal = mapA.has(k) ? mapA.get(k) : false
		const bVal = mapB.has(k) ? mapB.get(k) : false
		const notB = 2 - toNum(bVal)
		out.set(k, FROM_NUM[Math.min(toNum(aVal), notB)])
	}
	return out
}

describe('setDifferenceKleeneRecursive', () => {
	describe('normal cases — all 9 Kleene K3 combinations', () => {
		it('computes all 9 combinations for plain objects', () => {
			const setA = {
				t_f: true,
				t_t: true,
				t_u: true,
				f_f: false,
				f_t: false,
				f_u: false,
				u_f: 'unknown',
				u_t: 'unknown',
				u_u: 'unknown',
			}
			const setB = {
				t_f: false,
				t_t: true,
				t_u: 'unknown',
				f_f: false,
				f_t: true,
				f_u: 'unknown',
				u_f: false,
				u_t: true,
				u_u: 'unknown',
			}

			const expected = {
				t_f: true,
				t_t: false,
				t_u: 'unknown',
				f_f: false,
				f_t: false,
				f_u: false,
				u_f: 'unknown',
				u_t: false,
				u_u: 'unknown',
			}

			assert.deepEqual(setDifferenceKleeneRecursive(setA, setB), expected)
		})

		it('computes all 9 combinations for Maps with heterogeneous key types', () => {
			const objKey = { id: 1 }
			const symKey = Symbol('u_u')

			const mapA = new Map([
				['t_f', true],
				[2, true],
				[true, true],
				[objKey, false],
				[NaN, false],
				['f_u', false],
				['u_f', 'unknown'],
				[99n, 'unknown'],
				[symKey, 'unknown'],
			])
			const mapB = new Map([
				['t_f', false],
				[2, true],
				[true, 'unknown'],
				[objKey, false],
				[NaN, true],
				['f_u', 'unknown'],
				['u_f', false],
				[99n, true],
				[symKey, 'unknown'],
			])

			const expected = new Map([
				['t_f', true],
				[2, false],
				[true, 'unknown'],
				[objKey, false],
				[NaN, false],
				['f_u', false],
				['u_f', 'unknown'],
				[99n, false],
				[symKey, 'unknown'],
			])

			assert.deepEqual(setDifferenceKleeneRecursive(mapA, mapB), expected)
		})

		it('handles disjoint partial sets (missing keys default to false)', () => {
			const setA = { a: true, b: 'unknown', c: false }
			const setB = { x: true, y: 'unknown', z: false }

			assert.deepEqual(setDifferenceKleeneRecursive(setA, setB), {
				a: true,
				b: 'unknown',
				c: false,
				x: false,
				y: false,
				z: false,
			})

			const mapA = new Map([
				['a', true],
				['b', 'unknown'],
			])
			const mapB = new Map([
				['x', true],
				['y', 'unknown'],
			])

			assert.deepEqual(
				setDifferenceKleeneRecursive(mapA, mapB),
				new Map([
					['a', true],
					['b', 'unknown'],
					['x', false],
					['y', false],
				])
			)
		})

		it('handles partially overlapping sets without mutating inputs', () => {
			const setA = { a: true, b: true, c: 'unknown', d: false }
			const setB = { b: true, c: 'unknown', e: true, f: 'unknown' }
			const snapA = { ...setA }
			const snapB = { ...setB }

			const result = setDifferenceKleeneRecursive(setA, setB)

			assert.deepEqual(result, {
				a: true,
				b: false,
				c: 'unknown',
				d: false,
				e: false,
				f: false,
			})
			assert.deepEqual(setA, snapA)
			assert.deepEqual(setB, snapB)
			assert.notEqual(result, setA)
			assert.notEqual(result, setB)
		})
	})

	describe('edge cases', () => {
		it('handles empty partial sets: ∅ \\ ∅, ∅ \\ B, and A \\ ∅', () => {
			assert.deepEqual(setDifferenceKleeneRecursive({}, {}), {})
			assert.deepEqual(setDifferenceKleeneRecursive(new Map(), new Map()), new Map())

			assert.deepEqual(
				setDifferenceKleeneRecursive({}, { a: true, b: 'unknown', c: false }),
				{ a: false, b: false, c: false }
			)
			assert.deepEqual(
				setDifferenceKleeneRecursive(
					new Map(),
					new Map([
						['a', true],
						['b', 'unknown'],
					])
				),
				new Map([
					['a', false],
					['b', false],
				])
			)

			assert.deepEqual(
				setDifferenceKleeneRecursive({ a: true, b: 'unknown', c: false }, {}),
				{ a: true, b: 'unknown', c: false }
			)
			assert.deepEqual(
				setDifferenceKleeneRecursive(
					new Map([
						['a', true],
						['b', 'unknown'],
						['c', false],
					]),
					new Map()
				),
				new Map([
					['a', true],
					['b', 'unknown'],
					['c', false],
				])
			)
		})

		it('handles self-difference A \\ A where unknown \\ unknown === unknown', () => {
			const setA = { a: true, b: false, c: 'unknown' }
			assert.deepEqual(setDifferenceKleeneRecursive(setA, setA), {
				a: false,
				b: false,
				c: 'unknown',
			})

			const mapA = new Map([
				['a', true],
				['b', false],
				['c', 'unknown'],
			])
			assert.deepEqual(
				setDifferenceKleeneRecursive(mapA, mapA),
				new Map([
					['a', false],
					['b', false],
					['c', 'unknown'],
				])
			)
		})

		it('handles single-key, null-prototype objects, and Object.prototype property names', () => {
			assert.deepEqual(setDifferenceKleeneRecursive({ only: true }, { only: false }), {
				only: true,
			})

			const nullProtoA = Object.create(null)
			nullProtoA.toString = true
			nullProtoA.constructor = 'unknown'
			nullProtoA.hasOwnProperty = true

			const nullProtoB = Object.create(null)
			nullProtoB.toString = 'unknown'
			nullProtoB.hasOwnProperty = true

			assert.deepEqual(setDifferenceKleeneRecursive(nullProtoA, nullProtoB), {
				toString: 'unknown',
				constructor: 'unknown',
				hasOwnProperty: false,
			})
		})

		it('throws TypeError on invalid membership values', () => {
			const badValues = [1, 0, null, undefined, 'true', 'false', 'UNKNOWN', '', {}, []]

			for (const bad of badValues) {
				assert.throws(
					() => setDifferenceKleeneRecursive({ a: bad }, {}),
					TypeError
				)
				assert.throws(
					() => setDifferenceKleeneRecursive({}, { a: bad }),
					TypeError
				)
				assert.throws(
					() => setDifferenceKleeneRecursive(new Map([['a', bad]]), new Map()),
					TypeError
				)
				assert.throws(
					() => setDifferenceKleeneRecursive(new Map(), new Map([['a', bad]])),
					TypeError
				)
			}
		})

		it('throws TypeError on non-set or mismatched container types', () => {
			const nonSets = [
				null,
				undefined,
				42,
				'abc',
				true,
				[],
				new Set(['a']),
				new Date(),
				/regex/,
				new (class Custom {})(),
			]

			for (const invalid of nonSets) {
				assert.throws(() => setDifferenceKleeneRecursive(invalid, {}), TypeError)
				assert.throws(() => setDifferenceKleeneRecursive({}, invalid), TypeError)
			}

			assert.throws(
				() => setDifferenceKleeneRecursive({ a: true }, new Map([['a', true]])),
				TypeError
			)
			assert.throws(
				() => setDifferenceKleeneRecursive(new Map([['a', true]]), { a: true }),
				TypeError
			)
		})
	})

	describe('cross-check against independent A ∩ ¬B encoding ({false: 0, unknown: 1, true: 2})', () => {
		it('matches independent numeric min/negation computation across larger plain objects and Maps', () => {
			const values = [false, 'unknown', true]
			const setA = {}
			const setB = {}
			const mapA = new Map()
			const mapB = new Map()

			// Build 200 keys covering every combination including missing keys on either side
			for (let i = 0; i < 200; i++) {
				const key = `k${i}`
				const aMode = i % 4 // 0..2 => values, 3 => omitted
				const bMode = Math.floor(i / 4) % 4

				if (aMode < 3) {
					setA[key] = values[aMode]
					mapA.set(key, values[aMode])
				}
				if (bMode < 3) {
					setB[key] = values[bMode]
					mapB.set(key, values[bMode])
				}
			}

			assert.deepEqual(
				setDifferenceKleeneRecursive(setA, setB),
				independentKleeneDiffPlain(setA, setB)
			)
			assert.deepEqual(
				setDifferenceKleeneRecursive(mapA, mapB),
				independentKleeneDiffMap(mapA, mapB)
			)
		})
	})
})
