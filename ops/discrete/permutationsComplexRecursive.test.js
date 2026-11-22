import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { permutationsComplexRecursive } from './permutationsComplexRecursive.js'

function assertComplexClose(actual, expected, relTol = 1e-12, absTol = 1e-12) {
	assert.equal(typeof actual, 'object')
	assert.notEqual(actual, null)
	assert.equal(Object.is(actual.re, -0), false, 're must not be -0')
	assert.equal(Object.is(actual.im, -0), false, 'im must not be -0')
	const reDiff = Math.abs(actual.re - expected.re)
	const imDiff = Math.abs(actual.im - expected.im)
	const reBound = Math.max(absTol, relTol * Math.max(Math.abs(actual.re), Math.abs(expected.re)))
	const imBound = Math.max(absTol, relTol * Math.max(Math.abs(actual.im), Math.abs(expected.im)))
	assert.ok(
		reDiff <= reBound,
		`real part mismatch: actual=${actual.re}, expected=${expected.re}, diff=${reDiff}, bound=${reBound}`,
	)
	assert.ok(
		imDiff <= imBound,
		`imag part mismatch: actual=${actual.im}, expected=${expected.im}, diff=${imDiff}, bound=${imBound}`,
	)
}

function iterativePermutationsComplex(z, k) {
	let re = 1
	let im = 0
	for (let j = 0; j < k; j++) {
		const fre = z.re - j
		const fim = z.im
		const nextRe = re * fre - im * fim
		const nextIm = re * fim + im * fre
		re = nextRe
		im = nextIm
	}
	return { re: re === 0 ? 0 : re, im: im === 0 ? 0 : im }
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

function binomial(n, k) {
	if (k < 0 || k > n) return 0
	let res = 1
	for (let i = 1; i <= Math.min(k, n - k); i++) {
		res = (res * (n - i + 1)) / i
	}
	return res
}

describe('permutationsComplexRecursive', () => {
	describe('normal cases', () => {
		test('matches standard real integer permutations P(n, k) = n! / (n - k)!', () => {
			assert.deepEqual(permutationsComplexRecursive({ re: 5, im: 0 }, 0), { re: 1, im: 0 })
			assert.deepEqual(permutationsComplexRecursive({ re: 5, im: 0 }, 1), { re: 5, im: 0 })
			assert.deepEqual(permutationsComplexRecursive({ re: 5, im: 0 }, 3), { re: 60, im: 0 })
			assert.deepEqual(permutationsComplexRecursive({ re: 5, im: 0 }, 5), { re: 120, im: 0 })
			assert.deepEqual(permutationsComplexRecursive({ re: 10, im: 0 }, 4), { re: 5040, im: 0 })
		})

		test('matches analytical hand-computed complex values', () => {
			// P(i, 2) = i(i - 1) = -1 - i
			assert.deepEqual(permutationsComplexRecursive({ re: 0, im: 1 }, 2), { re: -1, im: -1 })

			// P(i, 3) = (-1 - i)(i - 2) = 3 + i
			assert.deepEqual(permutationsComplexRecursive({ re: 0, im: 1 }, 3), { re: 3, im: 1 })

			// P(1 + i, 2) = (1 + i)(i) = -1 + i
			assert.deepEqual(permutationsComplexRecursive({ re: 1, im: 1 }, 2), { re: -1, im: 1 })

			// P(2 + 3i, 3) = (2 + 3i)(1 + 3i)(3i) = (-7 + 9i)(3i) = -27 - 21i
			assert.deepEqual(permutationsComplexRecursive({ re: 2, im: 3 }, 3), { re: -27, im: -21 })

			// P(-1 - 2i, 2) = (-1 - 2i)(-2 - 2i) = (2 - 4) + (2 + 4)i = -2 + 6i
			assert.deepEqual(permutationsComplexRecursive({ re: -1, im: -2 }, 2), { re: -2, im: 6 })
		})

		test('handles negative real integers via rising factorial sign duality', () => {
			// P(-2, 3) = (-2)(-3)(-4) = -24
			assert.deepEqual(permutationsComplexRecursive({ re: -2, im: 0 }, 3), { re: -24, im: 0 })
			// P(-3, 4) = (-3)(-4)(-5)(-6) = 360
			assert.deepEqual(permutationsComplexRecursive({ re: -3, im: 0 }, 4), { re: 360, im: 0 })
		})

		test('handles fractional real values', () => {
			// P(0.5, 3) = (0.5)(-0.5)(-1.5) = 0.375
			assertComplexClose(permutationsComplexRecursive({ re: 0.5, im: 0 }, 3), { re: 0.375, im: 0 })
		})
	})

	describe('edge cases', () => {
		test('k = 0 always returns { re: 1, im: 0 }', () => {
			assert.deepEqual(permutationsComplexRecursive({ re: 0, im: 0 }, 0), { re: 1, im: 0 })
			assert.deepEqual(permutationsComplexRecursive({ re: -7.5, im: 4.25 }, 0), { re: 1, im: 0 })
		})

		test('k = 1 returns a distinct object without mutating input', () => {
			const input = { re: 3.5, im: -2.25 }
			const result = permutationsComplexRecursive(input, 1)
			assert.deepEqual(result, { re: 3.5, im: -2.25 })
			assert.notEqual(result, input)
			assert.deepEqual(input, { re: 3.5, im: -2.25 })
		})

		test('returns exact zero when a factor vanishes, even for large k', () => {
			assert.deepEqual(permutationsComplexRecursive({ re: 0, im: 0 }, 1), { re: 0, im: 0 })
			assert.deepEqual(permutationsComplexRecursive({ re: 3, im: 0 }, 5), { re: 0, im: 0 })
			assert.deepEqual(permutationsComplexRecursive({ re: 3, im: 0 }, 1000), { re: 0, im: 0 })
			assert.deepEqual(permutationsComplexRecursive({ re: 1000, im: 0 }, 1001), { re: 0, im: 0 })
		})

		test('normalizes -0 to 0 in both real and imaginary parts', () => {
			const res1 = permutationsComplexRecursive({ re: -0, im: -0 }, 1)
			assert.equal(Object.is(res1.re, 0), true)
			assert.equal(Object.is(res1.im, 0), true)

			const res2 = permutationsComplexRecursive({ re: -2, im: 0 }, 3)
			assert.equal(Object.is(res2.im, 0), true)

			const res3 = permutationsComplexRecursive({ re: 0, im: -0 }, 2)
			assert.equal(Object.is(res3.re, 0), true)
			assert.equal(Object.is(res3.im, 0), true)
		})

		test('handles larger k without stack overflow via O(log k) recursion depth', () => {
			// P(z, 64) for z = 0.01i stays well within finite range
			const z = { re: 0, im: 0.01 }
			const actual = permutationsComplexRecursive(z, 64)
			const expected = iterativePermutationsComplex(z, 64)
			assertComplexClose(actual, expected, 1e-11, 1e-12)
		})
	})

	describe('input validation and error handling', () => {
		test('throws TypeError for invalid z types', () => {
			const invalidZ = [null, undefined, 5, '1+2i', true, [1, 2], {}, { re: 1 }, { im: 2 }, { re: '1', im: 0 }, { re: 1, im: null }]
			for (const z of invalidZ) {
				assert.throws(() => permutationsComplexRecursive(z, 2), TypeError)
			}
		})

		test('throws RangeError for non-finite z components', () => {
			const nonFiniteZ = [
				{ re: Number.NaN, im: 0 },
				{ re: 0, im: Number.NaN },
				{ re: Number.POSITIVE_INFINITY, im: 1 },
				{ re: 1, im: Number.NEGATIVE_INFINITY },
			]
			for (const z of nonFiniteZ) {
				assert.throws(() => permutationsComplexRecursive(z, 2), RangeError)
			}
		})

		test('throws TypeError for non-number k', () => {
			const invalidK = [null, undefined, '3', { re: 3, im: 0 }, 3n, true, []]
			for (const k of invalidK) {
				assert.throws(() => permutationsComplexRecursive({ re: 5, im: 1 }, k), TypeError)
			}
		})

		test('throws RangeError for negative, non-integer, non-finite, or unsafe k', () => {
			const outOfRangeK = [-1, -100, 1.5, 0.1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]
			for (const k of outOfRangeK) {
				assert.throws(() => permutationsComplexRecursive({ re: 5, im: 1 }, k), RangeError)
			}
		})

		test('throws RangeError on IEEE-754 floating-point overflow', () => {
			assert.throws(() => permutationsComplexRecursive({ re: 1e200, im: 1e200 }, 2), RangeError)
			assert.throws(() => permutationsComplexRecursive({ re: 100.5, im: 1 }, 500), RangeError)
		})
	})

	describe('cross-checks against independent computations and identities', () => {
		test('agrees with iterative reference implementation across diverse complex inputs', () => {
			const zValues = [
				{ re: 0, im: 0 },
				{ re: 7, im: 0 },
				{ re: -4, im: 0 },
				{ re: 0, im: 3.5 },
				{ re: 2.5, im: -1.75 },
				{ re: -3.25, im: 4.125 },
				{ re: 0.1, im: 0.2 },
				{ re: 12.5, im: -6.25 },
			]
			const kValues = [0, 1, 2, 3, 4, 7, 12, 18]

			for (const z of zValues) {
				for (const k of kValues) {
					const recursive = permutationsComplexRecursive(z, k)
					const iterative = iterativePermutationsComplex(z, k)
					assertComplexClose(recursive, iterative, 1e-12, 1e-12)
				}
			}
		})

		test('satisfies complex conjugate symmetry: P(conj(z), k) = conj(P(z, k))', () => {
			const cases = [
				{ z: { re: 3.2, im: 4.7 }, k: 6 },
				{ z: { re: -1.5, im: -2.3 }, k: 9 },
				{ z: { re: 0, im: 5.1 }, k: 7 },
			]
			for (const { z, k } of cases) {
				const pz = permutationsComplexRecursive(z, k)
				const pConjZ = permutationsComplexRecursive({ re: z.re, im: -z.im }, k)
				assertComplexClose(pConjZ, { re: pz.re, im: -pz.im })
			}
		})

		test('satisfies multiplicative splitting: P(z, k + m) = P(z, k) * P(z - k, m)', () => {
			const z = { re: 4.3, im: -2.1 }
			for (const [k, m] of [[0, 5], [3, 4], [5, 6], [7, 0]]) {
				const lhs = permutationsComplexRecursive(z, k + m)
				const rhs = complexMul(
					permutationsComplexRecursive(z, k),
					permutationsComplexRecursive({ re: z.re - k, im: z.im }, m),
				)
				assertComplexClose(lhs, rhs)
			}
		})

		test('satisfies finite difference identity: P(z + 1, k) - P(z, k) = k * P(z, k - 1)', () => {
			const z = { re: -2.4, im: 3.6 }
			for (let k = 1; k <= 10; k++) {
				const lhs = complexSub(
					permutationsComplexRecursive({ re: z.re + 1, im: z.im }, k),
					permutationsComplexRecursive(z, k),
				)
				const prev = permutationsComplexRecursive(z, k - 1)
				const rhs = { re: k * prev.re, im: k * prev.im }
				assertComplexClose(lhs, rhs)
			}
		})

		test('satisfies Chu-Vandermonde identity over complex numbers', () => {
			const z = { re: 2.3, im: 1.7 }
			const w = { re: -1.4, im: 2.9 }
			const zw = complexAdd(z, w)

			for (let n = 0; n <= 8; n++) {
				const lhs = permutationsComplexRecursive(zw, n)
				let rhs = { re: 0, im: 0 }
				for (let j = 0; j <= n; j++) {
					const coeff = binomial(n, j)
					const term = complexMul(
						permutationsComplexRecursive(z, j),
						permutationsComplexRecursive(w, n - j),
					)
					rhs = complexAdd(rhs, { re: coeff * term.re, im: coeff * term.im })
				}
				assertComplexClose(lhs, rhs, 1e-11, 1e-11)
			}
		})
	})
})
