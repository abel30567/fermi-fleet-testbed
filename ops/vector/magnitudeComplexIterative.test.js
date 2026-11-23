import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { magnitudeComplexIterative } from './magnitudeComplexIterative.js'

function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-15) {
	const diff = Math.abs(actual - expected)
	const limit = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)))
	assert.ok(
		diff <= limit,
		`Expected ${actual} to be within ${limit} of ${expected} (diff=${diff})`,
	)
}

function makePrng(seed) {
	let state = seed >>> 0
	return () => {
		state = (1664525 * state + 1013904223) >>> 0
		return state / 0x100000000
	}
}

describe('magnitudeComplexIterative', () => {
	test('computes magnitude for single complex elements', () => {
		assert.equal(magnitudeComplexIterative([{ re: 3, im: 4 }]), 5)
		assert.equal(magnitudeComplexIterative([{ re: -3, im: -4 }]), 5)
		assert.equal(magnitudeComplexIterative([{ re: 7, im: 0 }]), 7)
		assert.equal(magnitudeComplexIterative([{ re: 0, im: -9 }]), 9)
	})

	test('computes magnitude for multi-element complex vectors', () => {
		// 1^2 + 2^2 + 3^2 + 4^2 = 30
		assertClose(
			magnitudeComplexIterative([
				{ re: 1, im: 2 },
				{ re: 3, im: 4 },
			]),
			Math.sqrt(30),
		)

		// 4 elements each with |z|^2 = 2 -> sqrt(8)
		assertClose(
			magnitudeComplexIterative([
				{ re: 1, im: 1 },
				{ re: 1, im: -1 },
				{ re: -1, im: 1 },
				{ re: -1, im: -1 },
			]),
			Math.sqrt(8),
		)

		// Pythagorean quadruple in C^2: (1 + 2i, 2 + 0i) -> sqrt(1 + 4 + 4) = 3
		assertClose(
			magnitudeComplexIterative([
				{ re: 1, im: 2 },
				{ re: 2, im: 0 },
			]),
			3,
		)
	})

	test('handles empty vector and all-zero vectors', () => {
		assert.ok(Object.is(magnitudeComplexIterative([]), 0))
		assert.ok(Object.is(magnitudeComplexIterative([{ re: 0, im: 0 }]), 0))
		assert.ok(
			Object.is(
				magnitudeComplexIterative([
					{ re: -0, im: 0 },
					{ re: 0, im: -0 },
				]),
				0,
			),
		)
	})

	test('avoids overflow and underflow on extreme magnitudes', () => {
		assertClose(
			magnitudeComplexIterative([
				{ re: 3e200, im: 0 },
				{ re: 0, im: 4e200 },
			]),
			5e200,
		)

		assertClose(
			magnitudeComplexIterative([
				{ re: 3e-200, im: 0 },
				{ re: 0, im: 4e-200 },
			]),
			5e-200,
		)

		assertClose(
			magnitudeComplexIterative([
				{ re: 1e-250, im: 1e-250 },
				{ re: 1e250, im: 0 },
			]),
			1e250,
		)
	})

	test('handles large vectors and ignores extra properties without mutating input', () => {
		const n = 10_000
		const vec = Array.from({ length: n }, () => ({ re: 0.6, im: 0.8, tag: 'ok' }))
		const snapshot = JSON.stringify(vec)

		assertClose(magnitudeComplexIterative(vec), Math.sqrt(n))
		assert.equal(JSON.stringify(vec), snapshot)
	})

	test('throws TypeError for non-array and sparse array inputs', () => {
		const badVectors = [null, undefined, 123, 'vec', {}, { re: 1, im: 2 }, new Float64Array([1, 2])]
		for (const bad of badVectors) {
			assert.throws(() => magnitudeComplexIterative(bad), TypeError)
		}

		// Sparse array with hole
		const sparse = [{ re: 1, im: 0 }, , { re: 0, im: 1 }] // eslint-disable-line no-sparse-arrays
		assert.throws(() => magnitudeComplexIterative(sparse), TypeError)
	})

	test('throws TypeError for malformed complex elements', () => {
		const badElements = [
			[null],
			[undefined],
			[42],
			['1+2i'],
			[[1, 2]],
			[{}],
			[{ re: 1 }],
			[{ im: 2 }],
			[{ re: '1', im: 2 }],
			[{ re: 1, im: '2' }],
			[{ re: 1, im: null }],
			[{ re: true, im: 0 }],
			[{ re: 1, im: 2 }, { re: 3, im: undefined }],
		]
		for (const vec of badElements) {
			assert.throws(() => magnitudeComplexIterative(vec), TypeError)
		}
	})

	test('throws RangeError for non-finite components', () => {
		const nonFinite = [
			[{ re: Number.NaN, im: 0 }],
			[{ re: 0, im: Number.NaN }],
			[{ re: Number.POSITIVE_INFINITY, im: 0 }],
			[{ re: 0, im: Number.NEGATIVE_INFINITY }],
			[{ re: 3, im: 4 }, { re: 1, im: Number.POSITIVE_INFINITY }],
		]
		for (const vec of nonFinite) {
			assert.throws(() => magnitudeComplexIterative(vec), RangeError)
		}
	})

	test('cross-checks against Math.hypot over pseudo-random vectors', () => {
		const rand = makePrng(0x5eed1234)
		const lengths = [1, 2, 5, 17, 64, 250]

		for (const len of lengths) {
			const vec = Array.from({ length: len }, () => ({
				re: (rand() - 0.5) * 200,
				im: (rand() - 0.5) * 200,
			}))
			const flat = vec.flatMap(({ re, im }) => [re, im])
			const expected = Math.hypot(...flat)
			const actual = magnitudeComplexIterative(vec)
			assertClose(actual, expected, 1e-12)
		}
	})

	test('satisfies complex vector norm identities (homogeneity, conjugation, phase rotation, triangle inequality)', () => {
		const rand = makePrng(0xc0ffee)
		const u = Array.from({ length: 20 }, () => ({
			re: (rand() - 0.5) * 10,
			im: (rand() - 0.5) * 10,
		}))
		const v = Array.from({ length: 20 }, () => ({
			re: (rand() - 0.5) * 10,
			im: (rand() - 0.5) * 10,
		}))

		const normU = magnitudeComplexIterative(u)
		const normV = magnitudeComplexIterative(v)

		// 1. Hermitian inner product: ||u||^2 == sum(re^2 + im^2)
		const innerProduct = u.reduce((acc, { re, im }) => acc + re * re + im * im, 0)
		assertClose(normU * normU, innerProduct, 1e-12)

		// 2. Complex scalar homogeneity: ||c * u|| == |c| * ||u||
		const c = { re: -2.5, im: 3.75 }
		const scaledU = u.map(({ re, im }) => ({
			re: c.re * re - c.im * im,
			im: c.re * im + c.im * re,
		}))
		assertClose(magnitudeComplexIterative(scaledU), Math.hypot(c.re, c.im) * normU, 1e-12)

		// 3. Complex conjugation invariance: ||conj(u)|| == ||u||
		const conjU = u.map(({ re, im }) => ({ re, im: -im }))
		assertClose(magnitudeComplexIterative(conjU), normU, 1e-14)

		// 4. Component-wise unitary phase rotation invariance: ||[e^{i*theta_k} u_k]|| == ||u||
		const rotatedU = u.map(({ re, im }, k) => {
			const theta = (k + 1) * 0.73
			const cosT = Math.cos(theta)
			const sinT = Math.sin(theta)
			return {
				re: re * cosT - im * sinT,
				im: re * sinT + im * cosT,
			}
		})
		assertClose(magnitudeComplexIterative(rotatedU), normU, 1e-12)

		// 5. Triangle inequality: ||u + v|| <= ||u|| + ||v||
		const sumUV = u.map((z, k) => ({ re: z.re + v[k].re, im: z.im + v[k].im }))
		assert.ok(magnitudeComplexIterative(sumUV) <= normU + normV + 1e-12)
	})
})
