import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { xorMultisetIterative } from './xorMultisetIterative.js'

/**
 * Independent reference implementation via union minus intersection:
 * |a(x) - b(x)| === max(a(x), b(x)) - min(a(x), b(x))
 */
function referenceUnionMinusIntersection(a, b) {
	const keys = new Set([...a.keys(), ...b.keys()])
	const out = new Map()
	for (const k of keys) {
		const ca = a.get(k) ?? 0
		const cb = b.get(k) ?? 0
		const diff = Math.max(ca, cb) - Math.min(ca, cb)
		if (diff > 0) {
			out.set(k, diff)
		}
	}
	return out
}

/**
 * Independent reference implementation via bag expansion and 1-to-1 cancellation.
 */
function referenceBagCancellation(a, b) {
	const bagA = []
	for (const [k, c] of a) {
		for (let i = 0; i < c; i++) bagA.push(k)
	}
	const bagB = []
	for (const [k, c] of b) {
		for (let i = 0; i < c; i++) bagB.push(k)
	}

	const remainingB = [...bagB]
	const leftovers = []
	for (const item of bagA) {
		const idx = remainingB.findIndex((x) => Object.is(x, item))
		if (idx !== -1) {
			remainingB.splice(idx, 1)
		} else {
			leftovers.push(item)
		}
	}
	for (const item of remainingB) {
		leftovers.push(item)
	}

	const out = new Map()
	for (const item of leftovers) {
		out.set(item, (out.get(item) ?? 0) + 1)
	}
	return out
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property tests.
 */
function createRng(seed) {
	let s = seed >>> 0
	return () => {
		s = (s + 0x6d2b79f5) >>> 0
		let t = Math.imul(s ^ (s >>> 15), 1 | s)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

describe('xorMultisetIterative', () => {
	describe('normal cases', () => {
		it('computes absolute multiplicity differences for overlapping and disjoint keys', () => {
			const a = new Map([
				['apple', 3],
				['banana', 2],
				['cherry', 4],
			])
			const b = new Map([
				['apple', 1],
				['banana', 2],
				['date', 5],
			])

			const res = xorMultisetIterative(a, b)
			assert.deepEqual(
				res,
				new Map([
					['apple', 2],
					['cherry', 4],
					['date', 5],
				]),
			)
		})

		it('handles counts where b exceeds a', () => {
			const a = new Map([['x', 2]])
			const b = new Map([['x', 7]])
			assert.deepEqual(xorMultisetIterative(a, b), new Map([['x', 5]]))
		})

		it('matches standard set XOR when all counts are 0 or 1', () => {
			const a = new Map([
				['a', 1],
				['b', 1],
				['c', 1],
			])
			const b = new Map([
				['b', 1],
				['c', 1],
				['d', 1],
			])
			assert.deepEqual(
				xorMultisetIterative(a, b),
				new Map([
					['a', 1],
					['d', 1],
				]),
			)
		})

		it('supports arbitrary Map key types (numbers, NaN, symbols, objects, null, undefined)', () => {
			const obj1 = { id: 1 }
			const obj2 = { id: 2 }
			const sym = Symbol('k')
			const nullProto = Object.create(null)

			const a = new Map([
				[1, 3],
				[NaN, 2],
				[sym, 4],
				[obj1, 1],
				[null, 2],
				[undefined, 1],
				[nullProto, 3],
			])
			const b = new Map([
				[1, 1],
				[NaN, 5],
				[sym, 4],
				[obj2, 2],
				[null, 2],
				[nullProto, 1],
			])

			const res = xorMultisetIterative(a, b)
			assert.equal(res.size, 6)
			assert.equal(res.get(1), 2)
			assert.equal(res.get(NaN), 3)
			assert.equal(res.has(sym), false)
			assert.equal(res.get(obj1), 1)
			assert.equal(res.get(obj2), 2)
			assert.equal(res.has(null), false)
			assert.equal(res.get(undefined), 1)
			assert.equal(res.get(nullProto), 2)
		})
	})

	describe('edge cases', () => {
		it('returns an empty Map when both inputs are empty', () => {
			assert.deepEqual(xorMultisetIterative(new Map(), new Map()), new Map())
		})

		it('acts as identity when one input is empty', () => {
			const m = new Map([
				['a', 3],
				['b', 1],
			])
			assert.deepEqual(xorMultisetIterative(m, new Map()), m)
			assert.deepEqual(xorMultisetIterative(new Map(), m), m)
		})

		it('returns an empty Map when multisets are equal or the same reference', () => {
			const m = new Map([
				['a', 4],
				['b', 2],
			])
			assert.deepEqual(xorMultisetIterative(m, new Map(m)), new Map())
			assert.deepEqual(xorMultisetIterative(m, m), new Map())
		})

		it('treats explicit zero and -0 counts as absent and omits zero results', () => {
			const a = new Map([
				['zeroOnlyA', 0],
				['negZero', -0],
				['zeroA_posB', 0],
				['posA_zeroB', 3],
			])
			const b = new Map([
				['zeroOnlyB', 0],
				['negZero', 0],
				['zeroA_posB', 4],
				['posA_zeroB', 0],
			])

			assert.deepEqual(
				xorMultisetIterative(a, b),
				new Map([
					['zeroA_posB', 4],
					['posA_zeroB', 3],
				]),
			)
		})

		it('handles Number.MAX_SAFE_INTEGER counts accurately', () => {
			const max = Number.MAX_SAFE_INTEGER
			const a = new Map([
				['same', max],
				['onlyA', max],
				['near', max],
			])
			const b = new Map([
				['same', max],
				['onlyB', max],
				['near', max - 1],
			])

			assert.deepEqual(
				xorMultisetIterative(a, b),
				new Map([
					['onlyA', max],
					['near', 1],
					['onlyB', max],
				]),
			)
		})

		it('does not mutate input maps and returns a new Map instance', () => {
			const a = new Map([['x', 2]])
			const b = new Map([['y', 3]])
			const res = xorMultisetIterative(a, b)

			assert.notEqual(res, a)
			assert.notEqual(res, b)
			assert.deepEqual(a, new Map([['x', 2]]))
			assert.deepEqual(b, new Map([['y', 3]]))
		})
	})

	describe('input validation', () => {
		it('throws TypeError when a or b is not a Map', () => {
			const valid = new Map()
			for (const bad of [null, undefined, {}, [], new Set(), 42, 'map', true]) {
				assert.throws(() => xorMultisetIterative(bad, valid), TypeError)
				assert.throws(() => xorMultisetIterative(valid, bad), TypeError)
			}
		})

		it('throws TypeError when any count is not a number', () => {
			const valid = new Map()
			for (const badCount of ['1', null, undefined, true, 1n, {}, []]) {
				assert.throws(
					() => xorMultisetIterative(new Map([['k', badCount]]), valid),
					TypeError,
				)
				assert.throws(
					() => xorMultisetIterative(valid, new Map([['k', badCount]])),
					TypeError,
				)
			}
		})

		it('throws RangeError when any count is negative, non-integer, non-finite, or unsafe', () => {
			const valid = new Map()
			for (const badCount of [
				-1,
				-100,
				0.5,
				1.25,
				NaN,
				Infinity,
				-Infinity,
				Number.MAX_SAFE_INTEGER + 1,
			]) {
				assert.throws(
					() => xorMultisetIterative(new Map([['k', badCount]]), valid),
					RangeError,
				)
				assert.throws(
					() => xorMultisetIterative(valid, new Map([['k', badCount]])),
					RangeError,
				)
			}
		})

		it('formats error messages cleanly for Symbol and null-prototype keys', () => {
			const sym = Symbol('secret')
			const nullProto = Object.create(null)
			assert.throws(
				() => xorMultisetIterative(new Map([[sym, -1]]), new Map()),
				RangeError,
			)
			assert.throws(
				() => xorMultisetIterative(new Map(), new Map([[nullProto, 'bad']])),
				TypeError,
			)
		})
	})

	describe('independent cross-checks', () => {
		it('matches union-minus-intersection and bag-cancellation across randomized multisets', () => {
			const rng = createRng(20261123)
			const universe = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

			for (let trial = 0; trial < 50; trial++) {
				const a = new Map()
				const b = new Map()
				for (const key of universe) {
					if (rng() < 0.7) a.set(key, Math.floor(rng() * 6))
					if (rng() < 0.7) b.set(key, Math.floor(rng() * 6))
				}

				const actual = xorMultisetIterative(a, b)
				const expectedUnionDiff = referenceUnionMinusIntersection(a, b)
				const expectedBag = referenceBagCancellation(a, b)

				assert.deepEqual(actual, expectedUnionDiff)
				assert.deepEqual(actual, expectedBag)

				// Commutativity: xor(a, b) === xor(b, a)
				assert.deepEqual(actual, xorMultisetIterative(b, a))
				// Self-inverse: xor(actual, actual) === empty
				assert.deepEqual(xorMultisetIterative(actual, actual), new Map())
			}
		})
	})
})
