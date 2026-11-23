import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { projectionBigIntLazy, SCALE } from './projectionBigIntLazy.js'

function* fromArray(values) {
	for (const value of values) {
		yield value
	}
}

function dot(a, b) {
	let acc = 0n
	for (let i = 0; i < a.length; i += 1) {
		acc += a[i] * b[i]
	}
	return acc
}

function absBigInt(x) {
	return x < 0n ? -x : x
}

describe('projectionBigIntLazy', () => {
	test('computes exact integer-ratio projections scaled by 10^18', () => {
		// u = [3, 4], v = [1, 0] -> proj_v(u) = [3, 0]
		assert.deepEqual([...projectionBigIntLazy([3n, 4n], [1n, 0n])], [3n * SCALE, 0n])

		// u = [2, 3], v = [1, 1] -> (u·v)/(v·v) = 5/2 -> [2.5, 2.5]
		assert.deepEqual(
			[...projectionBigIntLazy([2n, 3n], [1n, 1n])],
			[2_500_000_000_000_000_000n, 2_500_000_000_000_000_000n]
		)

		// Negative components: u = [-4, 2, -6], v = [2, -2, 0]
		// u·v = -8 - 4 + 0 = -12, v·v = 8, ratio = -3/2 -> [-3, 3, 0]
		assert.deepEqual(
			[...projectionBigIntLazy([-4n, 2n, -6n], [2n, -2n, 0n])],
			[-3n * SCALE, 3n * SCALE, 0n]
		)
	})

	test('computes non-integer fixed-point projections with round-half-to-even', () => {
		// u = [1, 0], v = [1, 2] -> u·v = 1, v·v = 5 -> [0.2, 0.4] exact in base 10
		assert.deepEqual(
			[...projectionBigIntLazy([1n, 0n], [1n, 2n])],
			[200_000_000_000_000_000n, 400_000_000_000_000_000n]
		)

		// u = [1, 0, 0], v = [1, 1, 1] -> ratio = 1/3 -> 333333333333333333n
		const third = 333_333_333_333_333_333n
		assert.deepEqual([...projectionBigIntLazy([1n, 0n, 0n], [1n, 1n, 1n])], [third, third, third])

		// u = [2, 0, 0], v = [1, 1, 1] -> ratio = 2/3 -> 666666666666666667n (rounded nearest)
		const twoThirds = 666_666_666_666_666_667n
		assert.deepEqual(
			[...projectionBigIntLazy([2n, 0n, 0n], [1n, 1n, 1n])],
			[twoThirds, twoThirds, twoThirds]
		)

		// Negative 2/3 rounds symmetrically away from zero to -666666666666666667n
		assert.deepEqual(
			[...projectionBigIntLazy([-2n, 0n, 0n], [1n, 1n, 1n])],
			[-twoThirds, -twoThirds, -twoThirds]
		)
	})

	test('handles 1D vectors and zero vector u', () => {
		assert.deepEqual([...projectionBigIntLazy([7n], [-3n])], [7n * SCALE])
		assert.deepEqual([...projectionBigIntLazy([0n, 0n, 0n], [5n, -2n, 9n])], [0n, 0n, 0n])
	})

	test('orthogonal vectors project to all zeros', () => {
		assert.deepEqual([...projectionBigIntLazy([1n, 0n, -2n], [2n, 7n, 1n])], [0n, 0n, 0n])
		assert.deepEqual([...projectionBigIntLazy([3n, -4n], [4n, 3n])], [0n, 0n])
	})

	test('parallel and anti-parallel vectors project to exact u * 10^18', () => {
		// Even when v is a non-unit multiple like 3*u (where (u·v)/(v·v) = 1/3 is non-terminating),
		// multiplying before dividing keeps proj_v(u) === u * SCALE exact.
		const u1 = [1n, 2n, -5n]
		const v1 = [3n, 6n, -15n]
		assert.deepEqual(
			[...projectionBigIntLazy(u1, v1)],
			u1.map((x) => x * SCALE)
		)

		// Anti-parallel: v = -7 * u
		const u2 = [-11n, 0n, 13n, -17n]
		const v2 = u2.map((x) => -7n * x)
		assert.deepEqual(
			[...projectionBigIntLazy(u2, v2)],
			u2.map((x) => x * SCALE)
		)
	})

	test('supports arbitrary-precision BigInt values beyond Number.MAX_SAFE_INTEGER', () => {
		const big = 10n ** 40n
		const u = [big, 2n * big]
		const v = [big, big]
		// (u·v)/(v·v) = (3 * big^2) / (2 * big^2) = 3/2 -> [1.5 * big, 1.5 * big]
		const expected = (3n * big * SCALE) / 2n
		assert.deepEqual([...projectionBigIntLazy(u, v)], [expected, expected])
	})

	test('consumes lazy iterables lazily and yields components on demand', () => {
		let uPulls = 0
		let vPulls = 0
		function* trackedU() {
			for (const x of [4n, 6n, 8n, 10n]) {
				uPulls += 1
				yield x
			}
		}
		function* trackedV() {
			for (const x of [1n, 1n, 1n, 1n]) {
				vPulls += 1
				yield x
			}
		}

		const gen = projectionBigIntLazy(trackedU(), trackedV())
		// Neither iterable is consumed until iteration begins
		assert.equal(uPulls, 0)
		assert.equal(vPulls, 0)

		const first = gen.next()
		assert.deepEqual(first, { value: 7n * SCALE, done: false })
		assert.equal(uPulls, 4)
		assert.equal(vPulls, 4)

		const second = gen.next()
		assert.deepEqual(second, { value: 7n * SCALE, done: false })

		// Early termination via return() stops generator cleanly
		const stopped = gen.return()
		assert.deepEqual(stopped, { value: undefined, done: true })
		assert.deepEqual(gen.next(), { value: undefined, done: true })

		// Supports BigInt64Array and one-shot generators
		const typedResult = [
			...projectionBigIntLazy(new BigInt64Array([6n, 0n]), fromArray([3n, 3n]))
		]
		assert.deepEqual(typedResult, [3n * SCALE, 3n * SCALE])
	})

	test('closes longer or infinite iterable on length mismatch without hanging', () => {
		let vClosed = false
		let vPulled = 0
		function* infiniteV() {
			try {
				while (true) {
					vPulled += 1
					yield 1n
				}
			} finally {
				vClosed = true
			}
		}

		assert.throws(
			() => [...projectionBigIntLazy([1n, 2n], infiniteV())],
			{ name: 'RangeError', message: /same length/ }
		)
		assert.equal(vClosed, true)
		assert.equal(vPulled, 3)
	})

	test('throws RangeError for zero target vector, empty vectors, and mismatched lengths', () => {
		assert.throws(
			() => [...projectionBigIntLazy([1n, 2n], [0n, 0n])],
			{ name: 'RangeError', message: /zero vector/ }
		)
		assert.throws(
			() => [...projectionBigIntLazy([0n], [0n])],
			{ name: 'RangeError', message: /zero vector/ }
		)
		assert.throws(
			() => [...projectionBigIntLazy([], [])],
			{ name: 'RangeError', message: /empty/ }
		)
		assert.throws(
			() => [...projectionBigIntLazy(fromArray([]), fromArray([]))],
			{ name: 'RangeError', message: /empty/ }
		)
		assert.throws(
			() => [...projectionBigIntLazy([1n, 2n], [1n])],
			{ name: 'RangeError', message: /same length/ }
		)
		assert.throws(
			() => [...projectionBigIntLazy([1n], [1n, 2n])],
			{ name: 'RangeError', message: /same length/ }
		)
	})

	test('throws TypeError for non-iterable inputs or non-BigInt elements', () => {
		// Top-level iterable checks fail immediately on call
		for (const bad of [null, undefined, 42, 42n, true, {}, '123', '']) {
			assert.throws(() => projectionBigIntLazy(bad, [1n]), TypeError)
			assert.throws(() => projectionBigIntLazy([1n], bad), TypeError)
		}

		// Non-BigInt elements fail during iteration
		for (const badEl of [1, 1.5, NaN, Infinity, '1', null, undefined, true, {}]) {
			assert.throws(() => [...projectionBigIntLazy([badEl], [1n])], TypeError)
			assert.throws(() => [...projectionBigIntLazy([1n], [badEl])], TypeError)
		}
	})

	test('independent cross-check: residual (u - proj_v(u)) is orthogonal to v within rounding bound', () => {
		const cases = [
			{ u: [3n, 5n, -7n], v: [2n, -3n, 11n] },
			{ u: [101n, -203n, 307n, -409n, 503n], v: [17n, 19n, -23n, 29n, -31n] },
			{ u: [1n, 2n, 3n, 4n, 5n, 6n], v: [7n, -13n, 17n, -19n, 23n, -29n] },
			{
				u: [10n ** 30n + 7n, -(10n ** 29n) + 13n, 10n ** 28n + 19n],
				v: [3n * 10n ** 25n + 1n, -7n * 10n ** 24n + 5n, 11n * 10n ** 25n - 3n]
			}
		]

		for (const { u, v } of cases) {
			const proj = [...projectionBigIntLazy(fromArray(u), fromArray(v))]
			assert.equal(proj.length, u.length)

			// Scaled residual r = u * SCALE - proj_v(u)
			const residual = u.map((ui, i) => ui * SCALE - proj[i])
			const residualDotV = dot(residual, v)

			// With round-half-to-even, each component error is <= 0.5 scaled units,
			// so |(u*SCALE - proj) · v| <= 0.5 * sum(|v_i|) -> 2 * |r · v| <= sum(|v_i|).
			const l1NormV = v.reduce((sum, vi) => sum + absBigInt(vi), 0n)
			assert.ok(
				absBigInt(residualDotV) * 2n <= l1NormV,
				`Expected 2*|residual·v| (${absBigInt(residualDotV) * 2n}) <= ||v||_1 (${l1NormV})`
			)

			// Scale invariance of target vector: proj_{k*v}(u) === proj_v(u) exactly
			const scaledV = v.map((vi) => vi * -13n)
			assert.deepEqual([...projectionBigIntLazy(u, scaledV)], proj)
		}
	})
})
