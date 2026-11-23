import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sqrtFloatLazy } from './sqrtFloatLazy.js'

/**
 * Independent Newton-Raphson (Heron's method) square root for positive finite numbers.
 * Used as an independent cross-check against `sqrtFloatLazy`.
 *
 * @param {number} x
 * @returns {number}
 */
function newtonSqrt(x) {
	if (x === 0) return x
	// Scale by exact powers of 4 into [0.25, 4) so binary scaling introduces zero rounding error
	let scale = 1
	let scaled = x
	while (scaled >= 4) {
		scaled *= 0.25
		scale *= 2
	}
	while (scaled < 0.25) {
		scaled *= 4
		scale *= 0.5
	}

	let guess = 1
	for (let i = 0; i < 64; i += 1) {
		const next = 0.5 * (guess + scaled / guess)
		if (next === guess || Math.abs(next - guess) <= Number.EPSILON * next) {
			return next * scale
		}
		guess = next
	}
	return guess * scale
}

describe('sqrtFloatLazy', () => {
	it('computes exact square roots for perfect squares', () => {
		const input = [0, 1, 4, 9, 16, 25, 100, 144, 625, 1e12]
		const expected = [0, 1, 2, 3, 4, 5, 10, 12, 25, 1e6]
		assert.deepEqual([...sqrtFloatLazy(input)], expected)
	})

	it('computes square roots for fractional and irrational values', () => {
		const results = [...sqrtFloatLazy([0.25, 0.0625, 2, 3, 0.5])]
		assert.equal(results[0], 0.5)
		assert.equal(results[1], 0.25)
		assert.ok(Math.abs(results[2] - Math.SQRT2) <= Number.EPSILON)
		assert.ok(Math.abs(results[3] - 1.7320508075688772) <= Number.EPSILON)
		assert.ok(Math.abs(results[4] - Math.SQRT1_2) <= Number.EPSILON)
	})

	it('handles empty iterables', () => {
		const gen = sqrtFloatLazy([])
		assert.deepEqual(gen.next(), { value: undefined, done: true })
	})

	it('supports diverse iterable types (Set, TypedArrays, custom and null-proto iterables)', () => {
		assert.deepEqual([...sqrtFloatLazy(new Set([4, 9, 16]))], [2, 3, 4])
		assert.deepEqual([...sqrtFloatLazy(new Float64Array([1, 4, 9]))], [1, 2, 3])
		assert.deepEqual([...sqrtFloatLazy(new Int32Array([16, 25]))], [4, 5])

		const nullProtoIterable = Object.create(null)
		nullProtoIterable[Symbol.iterator] = function* () {
			yield 36
			yield 49
		}
		assert.deepEqual([...sqrtFloatLazy(nullProtoIterable)], [6, 7])
	})

	it('preserves IEEE-754 signed zero (+0 and -0)', () => {
		const [posZero, negZero] = [...sqrtFloatLazy([0, -0])]
		assert.ok(Object.is(posZero, 0), 'expected +0')
		assert.ok(Object.is(negZero, -0), 'expected -0')
	})

	it('returns NaN for negative numbers, -Infinity, and NaN, and +Infinity for +Infinity', () => {
		const inputs = [-1, -0.0001, -Number.MIN_VALUE, -Number.MAX_VALUE, -Infinity, NaN, Infinity]
		const results = [...sqrtFloatLazy(inputs)]

		for (let i = 0; i < 6; i += 1) {
			assert.ok(Number.isNaN(results[i]), `expected NaN for input ${inputs[i]}`)
		}
		assert.equal(results[6], Infinity)
	})

	it('handles subnormal and extreme IEEE-754 float64 boundaries', () => {
		const [minRoot, epsRoot, maxSafeRoot, maxRoot] = [
			...sqrtFloatLazy([
				Number.MIN_VALUE,
				Number.EPSILON,
				Number.MAX_SAFE_INTEGER,
				Number.MAX_VALUE
			])
		]

		// sqrt(2^-1074) = 2^-537
		assert.equal(minRoot, 2 ** -537)
		// sqrt(2^-52) = 2^-26
		assert.equal(epsRoot, 2 ** -26)
		assert.ok(Number.isFinite(maxSafeRoot) && maxSafeRoot > 0)
		assert.ok(Number.isFinite(maxRoot) && maxRoot > 1e153)
	})

	it('consumes iterables strictly lazily without pre-fetching elements', () => {
		let pulled = 0
		function* tracked() {
			for (const n of [4, 9, 16, 25]) {
				pulled += 1
				yield n
			}
		}

		const gen = sqrtFloatLazy(tracked())
		assert.equal(pulled, 0, 'should not pull any elements on construction')

		assert.deepEqual(gen.next(), { value: 2, done: false })
		assert.equal(pulled, 1, 'should pull exactly 1 element on first next()')

		assert.deepEqual(gen.next(), { value: 3, done: false })
		assert.equal(pulled, 2, 'should pull exactly 2 elements on second next()')

		gen.return()
		assert.equal(pulled, 2, 'should not pull extra elements on return()')
	})

	it('streams over an infinite generator and cleans up upstream on early break', () => {
		let finalized = false
		let produced = 0

		function* infiniteSquares() {
			try {
				for (let n = 0; ; n += 1) {
					produced += 1
					yield n * n
				}
			} finally {
				finalized = true
			}
		}

		const taken = []
		for (const root of sqrtFloatLazy(infiniteSquares())) {
			taken.push(root)
			if (taken.length === 6) break
		}

		assert.deepEqual(taken, [0, 1, 2, 3, 4, 5])
		assert.equal(produced, 6)
		assert.equal(finalized, true, 'upstream generator finally block should execute on early break')
	})

	it('supports lazy composition (4th root via nested sqrtFloatLazy over infinite stream)', () => {
		function* fourthPowers() {
			for (let n = 1; ; n += 1) {
				yield n ** 4
			}
		}

		const fourthRoots = sqrtFloatLazy(sqrtFloatLazy(fourthPowers()))
		const firstFive = []
		for (let i = 0; i < 5; i += 1) {
			firstFive.push(fourthRoots.next().value)
		}
		assert.deepEqual(firstFive, [1, 2, 3, 4, 5])
	})

	it('throws TypeError eagerly for invalid non-iterable or string inputs', () => {
		const invalidInputs = [
			undefined,
			null,
			42,
			NaN,
			Infinity,
			true,
			false,
			{},
			'149',
			'',
			16n,
			Symbol('s')
		]

		for (const bad of invalidInputs) {
			assert.throws(
				() => sqrtFloatLazy(bad),
				{ name: 'TypeError' },
				`expected eager TypeError for ${String(bad)}`
			)
		}
	})

	it('throws TypeError lazily when encountering non-number elements and runs upstream cleanup', () => {
		const badElements = ['4', null, undefined, 4n, true, {}, [4], new Number(4), Symbol('x')]

		for (const bad of badElements) {
			let finalized = false
			function* source() {
				try {
					yield 9
					yield bad
					yield 16
				} finally {
					finalized = true
				}
			}

			const gen = sqrtFloatLazy(source())
			// First valid element is yielded before encountering the invalid element
			assert.deepEqual(gen.next(), { value: 3, done: false })
			assert.equal(finalized, false)

			assert.throws(
				() => gen.next(),
				{ name: 'TypeError' },
				`expected lazy TypeError for element ${String(bad)}`
			)
			assert.equal(finalized, true, 'upstream finally should run when validation throws')
		}
	})

	it('throws TypeError if custom iterable returns a malformed iterator', () => {
		const broken = {
			[Symbol.iterator]() {
				return 123
			}
		}
		const gen = sqrtFloatLazy(broken)
		assert.throws(() => gen.next(), { name: 'TypeError' })
	})

	it('matches independent squaring-back and Newton-Raphson cross-checks across magnitudes', () => {
		const samples = [
			1e-300,
			1e-150,
			1e-12,
			1e-6,
			0.001,
			0.1,
			0.5,
			0.999999999,
			1,
			1.5,
			2,
			3,
			Math.E,
			Math.PI,
			7.123456789,
			42,
			1000,
			123456.789012,
			1e15,
			1e100,
			1e200,
			1e300
		]

		const roots = [...sqrtFloatLazy(samples)]
		assert.equal(roots.length, samples.length)

		for (let i = 0; i < samples.length; i += 1) {
			const x = samples[i]
			const y = roots[i]

			// Cross-check 1: squaring back matches original input within 2 ULPs
			const squared = y * y
			const squareRelErr = Math.abs(squared - x) / x
			assert.ok(
				squareRelErr <= 2 * Number.EPSILON,
				`squaring back failed for ${x}: got ${squared} (relErr=${squareRelErr})`
			)

			// Cross-check 2: independent Newton-Raphson implementation
			const nr = newtonSqrt(x)
			const nrRelErr = Math.abs(y - nr) / nr
			assert.ok(
				nrRelErr <= 4 * Number.EPSILON,
				`Newton-Raphson mismatch for ${x}: sqrtFloatLazy=${y}, newtonSqrt=${nr} (relErr=${nrRelErr})`
			)
		}
	})
})
