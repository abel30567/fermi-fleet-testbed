import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { projectionFloatRecursive } from './projectionFloatRecursive.js'

function dotIterative(u, v) {
	let sum = 0
	for (let i = 0; i < u.length; i++) {
		sum += u[i] * v[i]
	}
	return sum
}

function assertVecClose(actual, expected, tol = 1e-12) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		const diff = Math.abs(actual[i] - expected[i])
		const scale = Math.max(1, Math.abs(expected[i]))
		assert.ok(
			diff <= tol * scale,
			`index ${i}: expected ${expected[i]}, got ${actual[i]} (diff=${diff})`,
		)
	}
}

function mulberry32(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

describe('projectionFloatRecursive', () => {
	test('1D vectors', () => {
		assertVecClose(projectionFloatRecursive([5], [2]), [5])
		assertVecClose(projectionFloatRecursive([-3.5], [4]), [-3.5])
		assertVecClose(projectionFloatRecursive([7], [-0.5]), [7])
	})

	test('2D axis-aligned and general vectors', () => {
		assertVecClose(projectionFloatRecursive([3, 4], [1, 0]), [3, 0])
		assertVecClose(projectionFloatRecursive([3, 4], [0, 2]), [0, 4])
		assertVecClose(projectionFloatRecursive([3, 4], [1, 1]), [3.5, 3.5])
		assertVecClose(projectionFloatRecursive([1, 2], [3, 4]), [33 / 25, 44 / 25])
	})

	test('3D vectors including negative components', () => {
		assertVecClose(projectionFloatRecursive([1, 2, 3], [0, 1, 0]), [0, 2, 0])
		assertVecClose(projectionFloatRecursive([2, -1, 3], [1, 2, 2]), [2 / 3, 4 / 3, 4 / 3])
		assertVecClose(projectionFloatRecursive([-2, -4, -6], [1, 2, 3]), [-2, -4, -6])
	})

	test('orthogonal vectors project to zero without negative zero', () => {
		const result = projectionFloatRecursive([1, 0, 0], [0, -1, 0])
		assert.deepStrictEqual(result, [0, 0, 0])
		for (const x of result) {
			assert.ok(Object.is(x, 0))
		}
	})

	test('zero source vector projects to zero', () => {
		const result = projectionFloatRecursive([0, 0, 0], [3, -4, 5])
		assert.deepStrictEqual(result, [0, 0, 0])
	})

	test('parallel vectors return the source vector unchanged', () => {
		assertVecClose(projectionFloatRecursive([2, 4, 6], [1, 2, 3]), [2, 4, 6])
		assertVecClose(projectionFloatRecursive([1, -2, 3], [-2, 4, -6]), [1, -2, 3])
	})

	test('does not mutate input arrays', () => {
		const a = [3, 4, 5]
		const b = [1, -1, 2]
		const aCopy = [...a]
		const bCopy = [...b]
		projectionFloatRecursive(a, b)
		assert.deepStrictEqual(a, aCopy)
		assert.deepStrictEqual(b, bCopy)
	})

	test('high-dimensional vectors (even and odd lengths)', () => {
		for (const n of [1023, 1024]) {
			const a = Array.from({ length: n }, (_, i) => i + 1)
			const b = Array.from({ length: n }, () => 1)
			const mean = (n + 1) / 2
			const expected = Array.from({ length: n }, () => mean)
			assertVecClose(projectionFloatRecursive(a, b), expected, 1e-11)
		}
	})

	test('extreme magnitudes avoid overflow and underflow', () => {
		assertVecClose(projectionFloatRecursive([1e200, 0], [1e200, 1e200]), [5e199, 5e199], 1e-12)
		assertVecClose(
			projectionFloatRecursive([1e-200, 0], [1e-200, 1e-200]),
			[5e-201, 5e-201],
			1e-12,
		)
		assert.deepStrictEqual(projectionFloatRecursive([0, 0], [1e200, -1e200]), [0, 0])
	})

	test('rejects invalid inputs', () => {
		// Zero-magnitude target vector
		assert.throws(() => projectionFloatRecursive([1], [0]), RangeError)
		assert.throws(() => projectionFloatRecursive([1, 2, 3], [0, -0, 0]), RangeError)

		// Empty vectors
		assert.throws(() => projectionFloatRecursive([], []), RangeError)

		// Mismatched lengths
		assert.throws(() => projectionFloatRecursive([1, 2], [1, 2, 3]), RangeError)

		// Non-array arguments
		assert.throws(() => projectionFloatRecursive(null, [1, 2]), TypeError)
		assert.throws(() => projectionFloatRecursive([1, 2], undefined), TypeError)
		assert.throws(() => projectionFloatRecursive('12', [1, 2]), TypeError)
		assert.throws(() => projectionFloatRecursive([1, 2], { 0: 1, 1: 2 }), TypeError)

		// Non-finite or non-number elements
		assert.throws(() => projectionFloatRecursive([NaN, 1], [1, 1]), TypeError)
		assert.throws(() => projectionFloatRecursive([1, 1], [1, Infinity]), TypeError)
		assert.throws(() => projectionFloatRecursive([1, -Infinity], [1, 1]), TypeError)
		assert.throws(() => projectionFloatRecursive(['1', 2], [1, 2]), TypeError)
		assert.throws(() => projectionFloatRecursive([1, 2], [1, null]), TypeError)
	})

	test('independent cross-checks: orthogonality, idempotency, scale invariance, linearity, Pythagorean theorem', () => {
		const rand = mulberry32(42)
		const randVec = (n) => Array.from({ length: n }, () => (rand() - 0.5) * 20)

		for (const n of [2, 3, 7, 16, 65]) {
			for (let trial = 0; trial < 5; trial++) {
				const a = randVec(n)
				const a2 = randVec(n)
				const b = randVec(n)
				if (dotIterative(b, b) < 1e-6) continue

				const p = projectionFloatRecursive(a, b)

				// 1. Residual (a - proj_b(a)) is orthogonal to b
				const residual = a.map((ai, i) => ai - p[i])
				const resDotB = dotIterative(residual, b)
				const normScale = Math.sqrt(dotIterative(a, a) * dotIterative(b, b))
				assert.ok(
					Math.abs(resDotB) <= 1e-11 * Math.max(1, normScale),
					`residual not orthogonal: dot=${resDotB}`,
				)

				// 2. Idempotency: proj_b(proj_b(a)) ≈ proj_b(a)
				const pp = projectionFloatRecursive(p, b)
				assertVecClose(pp, p, 1e-11)

				// 3. Scale invariance in b: proj_{k*b}(a) ≈ proj_b(a)
				for (const k of [3.5, -0.25]) {
					const kb = b.map((bi) => bi * k)
					assertVecClose(projectionFloatRecursive(a, kb), p, 1e-11)
				}

				// 4. Linearity in a: proj_b(c1*a + c2*a2) ≈ c1*proj_b(a) + c2*proj_b(a2)
				const c1 = 2.5
				const c2 = -1.75
				const combined = a.map((ai, i) => c1 * ai + c2 * a2[i])
				const pCombined = projectionFloatRecursive(combined, b)
				const p2 = projectionFloatRecursive(a2, b)
				const expectedLinear = p.map((pi, i) => c1 * pi + c2 * p2[i])
				assertVecClose(pCombined, expectedLinear, 1e-11)

				// 5. Pythagorean theorem: ||p||^2 + ||a - p||^2 ≈ ||a||^2
				const normASq = dotIterative(a, a)
				const normPSq = dotIterative(p, p)
				const normResSq = dotIterative(residual, residual)
				assert.ok(
					Math.abs(normPSq + normResSq - normASq) <= 1e-10 * Math.max(1, normASq),
					`Pythagorean mismatch: ${normPSq} + ${normResSq} vs ${normASq}`,
				)
			}
		}
	})
})
