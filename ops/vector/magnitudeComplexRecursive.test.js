import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { magnitudeComplexRecursive } from './magnitudeComplexRecursive.js'

function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-15) {
	const diff = Math.abs(actual - expected)
	const bound = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)))
	assert.ok(
		diff <= bound,
		`Expected ${actual} to be close to ${expected} (diff=${diff}, bound=${bound})`
	)
}

function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

function complexAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

function complexSub(a, b) {
	return { re: a.re - b.re, im: a.im - b.im }
}

describe('magnitudeComplexRecursive', () => {
	describe('normal cases', () => {
		it('computes magnitude of a single complex element', () => {
			assert.equal(magnitudeComplexRecursive([{ re: 3, im: 4 }]), 5)
			assert.equal(magnitudeComplexRecursive([{ re: -5, im: 12 }]), 13)
			assert.equal(magnitudeComplexRecursive([{ re: -8, im: -15 }]), 17)
		})

		it('computes magnitude of multi-element complex vectors (even and odd lengths)', () => {
			// |1+2i|^2 + |3-4i|^2 = 5 + 25 = 30
			assertClose(
				magnitudeComplexRecursive([
					{ re: 1, im: 2 },
					{ re: 3, im: -4 },
				]),
				Math.sqrt(30)
			)

			// |1+i|^2 + |-2+3i|^2 + |4-i|^2 = 2 + 13 + 17 = 32
			assertClose(
				magnitudeComplexRecursive([
					{ re: 1, im: 1 },
					{ re: -2, im: 3 },
					{ re: 4, im: -1 },
				]),
				Math.sqrt(32)
			)

			// 5 elements: |1+i|^2 * 5 = 10
			assertClose(
				magnitudeComplexRecursive([
					{ re: 1, im: 1 },
					{ re: -1, im: 1 },
					{ re: 1, im: -1 },
					{ re: -1, im: -1 },
					{ re: 1, im: 1 },
				]),
				Math.sqrt(10)
			)
		})

		it('handles both merge scale orderings (left >= right and right > left)', () => {
			const v1 = [
				{ re: 100, im: 0 },
				{ re: 0, im: 0 },
				{ re: 3, im: 4 },
			]
			const v2 = [
				{ re: 3, im: 4 },
				{ re: 0, im: 0 },
				{ re: 100, im: 0 },
			]
			const expected = Math.sqrt(100 * 100 + 25)
			assertClose(magnitudeComplexRecursive(v1), expected)
			assertClose(magnitudeComplexRecursive(v2), expected)
		})

		it('does not mutate the input vector or its elements', () => {
			const input = [
				{ re: -3, im: 4 },
				{ re: 5, im: -12 },
			]
			const snapshot = structuredClone(input)
			magnitudeComplexRecursive(input)
			assert.deepEqual(input, snapshot)
		})
	})

	describe('edge cases', () => {
		it('returns +0 for an empty vector', () => {
			const result = magnitudeComplexRecursive([])
			assert.equal(Object.is(result, 0), true)
		})

		it('returns +0 for all-zero vectors including -0 components', () => {
			assert.equal(Object.is(magnitudeComplexRecursive([{ re: 0, im: 0 }]), 0), true)
			assert.equal(
				Object.is(
					magnitudeComplexRecursive([
						{ re: -0, im: -0 },
						{ re: 0, im: -0 },
						{ re: -0, im: 0 },
					]),
					0
				),
				true
			)
		})

		it('handles vectors with zero halves mixed with nonzero halves', () => {
			assert.equal(
				magnitudeComplexRecursive([
					{ re: 0, im: 0 },
					{ re: 0, im: 0 },
					{ re: 3, im: 4 },
				]),
				5
			)
			assert.equal(
				magnitudeComplexRecursive([
					{ re: 3, im: 4 },
					{ re: 0, im: 0 },
					{ re: 0, im: 0 },
				]),
				5
			)
		})

		it('handles pure real and pure imaginary vectors with negative entries', () => {
			assert.equal(
				magnitudeComplexRecursive([
					{ re: -3, im: 0 },
					{ re: 4, im: 0 },
				]),
				5
			)
			assert.equal(
				magnitudeComplexRecursive([
					{ re: 0, im: -6 },
					{ re: 0, im: 8 },
				]),
				10
			)
		})

		it('avoids intermediate overflow for very large magnitudes', () => {
			const v = [
				{ re: 3e300, im: 4e300 },
				{ re: 0, im: 0 },
			]
			assertClose(magnitudeComplexRecursive(v), 5e300, 1e-14)

			const nearMax = [
				{ re: 1e308, im: 0 },
				{ re: 0, im: 1e308 },
			]
			assertClose(magnitudeComplexRecursive(nearMax), Math.SQRT2 * 1e308, 1e-14)
		})

		it('avoids intermediate underflow for very small and subnormal magnitudes', () => {
			const tiny = [
				{ re: 3e-300, im: 4e-300 },
				{ re: 0, im: 0 },
			]
			assertClose(magnitudeComplexRecursive(tiny), 5e-300, 1e-14, 0)

			const subnormal = [
				{ re: 3e-320, im: 4e-320 },
			]
			assertClose(magnitudeComplexRecursive(subnormal), 5e-320, 1e-3, 0)

			const minVal = [
				{ re: Number.MIN_VALUE, im: 0 },
				{ re: 0, im: 0 },
			]
			assert.equal(magnitudeComplexRecursive(minVal), Number.MIN_VALUE)
		})

		it('handles widely separated scales cleanly', () => {
			const mixed = [
				{ re: 1e-200, im: 2e-200 },
				{ re: 3e200, im: 4e200 },
				{ re: -5e-200, im: 1e-200 },
			]
			assertClose(magnitudeComplexRecursive(mixed), 5e200, 1e-14)
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-array vector inputs', () => {
			for (const bad of [null, undefined, 42, 'abc', {}, { re: 1, im: 2 }, true]) {
				assert.throws(() => magnitudeComplexRecursive(bad), TypeError)
			}
		})

		it('throws TypeError for invalid element types or sparse arrays', () => {
			assert.throws(() => magnitudeComplexRecursive([null]), TypeError)
			assert.throws(() => magnitudeComplexRecursive([undefined]), TypeError)
			assert.throws(() => magnitudeComplexRecursive([123]), TypeError)
			assert.throws(() => magnitudeComplexRecursive(['1+2i']), TypeError)
			assert.throws(() => magnitudeComplexRecursive([[1, 2]]), TypeError)
			assert.throws(() => magnitudeComplexRecursive(new Array(2)), TypeError)
		})

		it('throws TypeError when re or im is missing or non-numeric', () => {
			assert.throws(() => magnitudeComplexRecursive([{ re: 1 }]), TypeError)
			assert.throws(() => magnitudeComplexRecursive([{ im: 1 }]), TypeError)
			assert.throws(() => magnitudeComplexRecursive([{ re: '1', im: 0 }]), TypeError)
			assert.throws(() => magnitudeComplexRecursive([{ re: 0, im: null }]), TypeError)
			assert.throws(() => magnitudeComplexRecursive([{ re: 1n, im: 0 }]), TypeError)
		})

		it('throws RangeError for non-finite re or im values', () => {
			assert.throws(() => magnitudeComplexRecursive([{ re: NaN, im: 0 }]), RangeError)
			assert.throws(() => magnitudeComplexRecursive([{ re: 0, im: NaN }]), RangeError)
			assert.throws(() => magnitudeComplexRecursive([{ re: Infinity, im: 0 }]), RangeError)
			assert.throws(() => magnitudeComplexRecursive([{ re: 0, im: -Infinity }]), RangeError)
			assert.throws(
				() =>
					magnitudeComplexRecursive([
						{ re: 1, im: 2 },
						{ re: 3, im: Infinity },
					]),
				RangeError
			)
		})
	})

	describe('cross-checks and algebraic identities', () => {
		it('matches independent Math.hypot reference across lengths 1..65', () => {
			let seed = 123456789
			const nextReal = () => {
				seed = (1664525 * seed + 1013904223) >>> 0
				return (seed / 0xffffffff) * 20 - 10
			}

			for (let n = 1; n <= 65; n++) {
				const vec = Array.from({ length: n }, () => ({
					re: nextReal(),
					im: nextReal(),
				}))
				const flat = vec.flatMap((z) => [z.re, z.im])
				const expected = Math.hypot(...flat)
				const actual = magnitudeComplexRecursive(vec)
				assertClose(actual, expected, 1e-13)
			}
		})

		it('matches Hermitian inner product identity ||v||^2 = sum(conj(z_k) * z_k)', () => {
			const v = [
				{ re: 2.5, im: -1.75 },
				{ re: -4.2, im: 3.1 },
				{ re: 0.8, im: 5.4 },
				{ re: -1.1, im: -2.9 },
				{ re: 6.3, im: 0.2 },
			]
			const innerRe = v.reduce((acc, z) => acc + (z.re * z.re + z.im * z.im), 0)
			const innerIm = v.reduce((acc, z) => acc + (z.re * z.im - z.im * z.re), 0)
			assert.equal(innerIm, 0)

			const mag = magnitudeComplexRecursive(v)
			assertClose(mag * mag, innerRe, 1e-13)
		})

		it('satisfies absolute homogeneity ||alpha * v|| = |alpha| * ||v||', () => {
			const v = [
				{ re: 1.5, im: -2.5 },
				{ re: -3.2, im: 4.1 },
				{ re: 0.7, im: 1.9 },
				{ re: -2.0, im: -0.5 },
			]
			const alpha = { re: -2.4, im: 3.2 } // |alpha| = 4.0
			const scaled = v.map((z) => complexMul(alpha, z))

			const lhs = magnitudeComplexRecursive(scaled)
			const rhs = Math.hypot(alpha.re, alpha.im) * magnitudeComplexRecursive(v)
			assertClose(lhs, rhs, 1e-13)
		})

		it('is invariant under elementwise phase rotation z_k -> e^(i*theta_k) * z_k', () => {
			const v = [
				{ re: 2, im: -3 },
				{ re: -1.5, im: 4.5 },
				{ re: 3.3, im: 2.2 },
				{ re: -0.8, im: -1.6 },
				{ re: 5.1, im: -0.4 },
			]
			const rotated = v.map((z, k) => {
				const theta = 0.7 * (k + 1)
				return complexMul(z, { re: Math.cos(theta), im: Math.sin(theta) })
			})

			assertClose(
				magnitudeComplexRecursive(rotated),
				magnitudeComplexRecursive(v),
				1e-13
			)
		})

		it('satisfies triangle inequality, parallelogram law, and concatenation identity', () => {
			const u = [
				{ re: 1.2, im: -3.4 },
				{ re: 5.6, im: 2.1 },
				{ re: -0.9, im: 4.3 },
			]
			const v = [
				{ re: -2.3, im: 1.5 },
				{ re: 0.4, im: -3.7 },
				{ re: 2.8, im: 1.1 },
			]
			const sum = u.map((z, i) => complexAdd(z, v[i]))
			const diff = u.map((z, i) => complexSub(z, v[i]))

			const nu = magnitudeComplexRecursive(u)
			const nv = magnitudeComplexRecursive(v)
			const nSum = magnitudeComplexRecursive(sum)
			const nDiff = magnitudeComplexRecursive(diff)

			// Triangle inequality
			assert.ok(nSum <= nu + nv + 1e-12)

			// Parallelogram law: ||u+v||^2 + ||u-v||^2 = 2(||u||^2 + ||v||^2)
			assertClose(nSum * nSum + nDiff * nDiff, 2 * (nu * nu + nv * nv), 1e-13)

			// Concatenation identity: ||[u, v]||^2 = ||u||^2 + ||v||^2
			const nConcat = magnitudeComplexRecursive([...u, ...v])
			assertClose(nConcat * nConcat, nu * nu + nv * nv, 1e-13)
		})

		it('maintains high precision on a large 1024-element vector', () => {
			// Each element has |z|^2 = 0.6^2 + 0.8^2 = 1 -> exact norm = sqrt(1024) = 32
			const unitVec = Array.from({ length: 1024 }, (_, i) => {
				const s1 = i % 2 === 0 ? 1 : -1
				const s2 = i % 3 === 0 ? 1 : -1
				return { re: s1 * 0.6, im: s2 * 0.8 }
			})
			assertClose(magnitudeComplexRecursive(unitVec), 32, 1e-14)
		})
	})
})
