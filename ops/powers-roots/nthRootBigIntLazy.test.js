import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { nthRootBigIntLazy, SCALE } from './nthRootBigIntLazy.js'

/**
 * Independent BigInt integer exponentiation helper for cross-checking results.
 * @param {bigint} base
 * @param {bigint} exp
 * @returns {bigint}
 */
function powBigInt(base, exp) {
	let result = 1n
	let b = base
	let e = exp
	while (e > 0n) {
		if ((e & 1n) === 1n) result *= b
		e >>= 1n
		if (e > 0n) b *= b
	}
	return result
}

describe('nthRootBigIntLazy', () => {
	describe('normal scalar cases', () => {
		it('computes exact integer roots scaled by 10^18', () => {
			assert.equal(nthRootBigIntLazy(4n, 2n), 2n * SCALE)
			assert.equal(nthRootBigIntLazy(9n, 2n), 3n * SCALE)
			assert.equal(nthRootBigIntLazy(27n, 3n), 3n * SCALE)
			assert.equal(nthRootBigIntLazy(16n, 4n), 2n * SCALE)
			assert.equal(nthRootBigIntLazy(1024n, 10n), 2n * SCALE)
			assert.equal(nthRootBigIntLazy(1000000n, 6n), 10n * SCALE)
		})

		it('computes irrational roots to 18 decimal places of fixed-point precision', () => {
			// sqrt(2) = 1.4142135623730950488016... -> rounds to ...049
			assert.equal(nthRootBigIntLazy(2n, 2n), 1_414_213_562_373_095_049n)
			// sqrt(3) = 1.7320508075688772935274... -> rounds to ...294
			assert.equal(nthRootBigIntLazy(3n, 2n), 1_732_050_807_568_877_294n)
			// cbrt(2) = 1.2599210498948731647672... -> rounds to ...165
			assert.equal(nthRootBigIntLazy(2n, 3n), 1_259_921_049_894_873_165n)
			// 5th root of 10 = 1.5848931924611134852021... -> rounds to ...485
			assert.equal(nthRootBigIntLazy(10n, 5n), 1_584_893_192_461_113_485n)
		})

		it('accepts safe integer number degrees in addition to BigInt degrees', () => {
			assert.equal(nthRootBigIntLazy(8n, 3), 2n * SCALE)
			assert.equal(nthRootBigIntLazy(81n, 4), 3n * SCALE)
			assert.equal(nthRootBigIntLazy(42n, 1), 42n * SCALE)
		})

		it('handles very large BigInt radicands accurately', () => {
			const exactRoot = 123_456_789_012_345_678_901_234n
			const cube = exactRoot * exactRoot * exactRoot
			assert.equal(nthRootBigIntLazy(cube, 3n), exactRoot * SCALE)

			const largeRoot = 987_654_321_987_654_321n
			const fifthPower = powBigInt(largeRoot, 5n)
			assert.equal(nthRootBigIntLazy(fifthPower, 5n), largeRoot * SCALE)
		})

		it('handles large root degrees (n > 256) efficiently and accurately', () => {
			// 2^(1/1000) = exp(ln(2)/1000) = 1.0006933874625806325...
			const r1000 = nthRootBigIntLazy(2n, 1000n)
			const expected1000 = Math.pow(2, 1 / 1000)
			assert.ok(Math.abs(Number(r1000) / 1e18 - expected1000) < 1e-14)
			assert.equal(r1000, 1_000_693_387_462_580_633n)

			// (3^300)^(1/300) = 3
			const exact300 = powBigInt(3n, 300n)
			assert.equal(nthRootBigIntLazy(exact300, 300n), 3n * SCALE)
		})
	})

	describe('edge cases', () => {
		it('handles 0n and 1n and -1n properly', () => {
			assert.equal(nthRootBigIntLazy(0n, 1n), 0n)
			assert.equal(nthRootBigIntLazy(0n, 2n), 0n)
			assert.equal(nthRootBigIntLazy(0n, 5n), 0n)
			assert.equal(nthRootBigIntLazy(0n, 1000n), 0n)

			assert.equal(nthRootBigIntLazy(1n, 1n), SCALE)
			assert.equal(nthRootBigIntLazy(1n, 2n), SCALE)
			assert.equal(nthRootBigIntLazy(1n, 99n), SCALE)
			assert.equal(nthRootBigIntLazy(1n, 10000n), SCALE)

			assert.equal(nthRootBigIntLazy(-1n, 1n), -SCALE)
			assert.equal(nthRootBigIntLazy(-1n, 3n), -SCALE)
			assert.equal(nthRootBigIntLazy(-1n, 999n), -SCALE)
		})

		it('handles n = 1n for positive and negative values', () => {
			assert.equal(nthRootBigIntLazy(12345n, 1n), 12345n * SCALE)
			assert.equal(nthRootBigIntLazy(-12345n, 1n), -12345n * SCALE)
		})

		it('computes odd roots of negative BigInts', () => {
			assert.equal(nthRootBigIntLazy(-8n, 3n), -2n * SCALE)
			assert.equal(nthRootBigIntLazy(-27n, 3n), -3n * SCALE)
			assert.equal(nthRootBigIntLazy(-32n, 5n), -2n * SCALE)
			assert.equal(nthRootBigIntLazy(-2n, 3n), -1_259_921_049_894_873_165n)
			// Odd root symmetry: nthRoot(-x, n) === -nthRoot(x, n)
			assert.equal(nthRootBigIntLazy(-100n, 7n), -nthRootBigIntLazy(100n, 7n))
		})

		it('throws RangeError for even roots of negative BigInts', () => {
			assert.throws(() => nthRootBigIntLazy(-1n, 2n), RangeError)
			assert.throws(() => nthRootBigIntLazy(-4n, 2n), RangeError)
			assert.throws(() => nthRootBigIntLazy(-16n, 4n), RangeError)
			assert.throws(() => nthRootBigIntLazy(-64n, 6), RangeError)
			assert.throws(() => nthRootBigIntLazy(-2n, 1000n), RangeError)
		})

		it('throws RangeError when n <= 0', () => {
			assert.throws(() => nthRootBigIntLazy(4n, 0n), RangeError)
			assert.throws(() => nthRootBigIntLazy(4n, -1n), RangeError)
			assert.throws(() => nthRootBigIntLazy(4n, -2n), RangeError)
			assert.throws(() => nthRootBigIntLazy(4n, 0), RangeError)
			assert.throws(() => nthRootBigIntLazy(4n, -3), RangeError)
			assert.throws(() => nthRootBigIntLazy([4n, 9n], 0n), RangeError)
			assert.throws(() => nthRootBigIntLazy([4n, 9n], -2n), RangeError)
		})

		it('throws TypeError for invalid radicand or degree types', () => {
			assert.throws(() => nthRootBigIntLazy(4, 2n), TypeError)
			assert.throws(() => nthRootBigIntLazy('4', 2n), TypeError)
			assert.throws(() => nthRootBigIntLazy(null, 2n), TypeError)
			assert.throws(() => nthRootBigIntLazy(undefined, 2n), TypeError)
			assert.throws(() => nthRootBigIntLazy({}, 2n), TypeError)

			assert.throws(() => nthRootBigIntLazy(4n, 2.5), TypeError)
			assert.throws(() => nthRootBigIntLazy(4n, NaN), TypeError)
			assert.throws(() => nthRootBigIntLazy(4n, Infinity), TypeError)
			assert.throws(() => nthRootBigIntLazy(4n, '2'), TypeError)
			assert.throws(() => nthRootBigIntLazy(4n, null), TypeError)
			assert.throws(() => nthRootBigIntLazy(4n, undefined), TypeError)
		})
	})

	describe('lazy iterable and generator consumption', () => {
		it('consumes a generator lazily without eager evaluation and closes it on early exit', () => {
			let produced = 0
			let closed = false

			function* infiniteSquares() {
				try {
					for (let k = 1n; ; k++) {
						produced++
						yield k * k
					}
				} finally {
					closed = true
				}
			}

			const stream = nthRootBigIntLazy(infiniteSquares(), 2n)
			// Creating the stream must NOT pull any elements yet
			assert.equal(produced, 0)
			assert.equal(closed, false)

			const firstThree = []
			for (const root of stream) {
				firstThree.push(root)
				if (firstThree.length === 3) break
			}

			assert.deepEqual(firstThree, [1n * SCALE, 2n * SCALE, 3n * SCALE])
			assert.equal(produced, 3)
			assert.equal(closed, true)
		})

		it('streams over an array or Set of radicands with a scalar degree', () => {
			const results = [...nthRootBigIntLazy([0n, 1n, 8n, -27n, 64n], 3n)]
			assert.deepEqual(results, [0n, 1n * SCALE, 2n * SCALE, -3n * SCALE, 4n * SCALE])

			const setResults = [...nthRootBigIntLazy(new Set([4n, 9n, 16n]), 2n)]
			assert.deepEqual(setResults, [2n * SCALE, 3n * SCALE, 4n * SCALE])
		})

		it('streams over an iterable of degrees with a scalar radicand', () => {
			function* degrees() {
				yield 1n
				yield 2n
				yield 3n
				yield 6n
			}

			const results = [...nthRootBigIntLazy(64n, degrees())]
			assert.deepEqual(results, [64n * SCALE, 8n * SCALE, 4n * SCALE, 2n * SCALE])
		})

		it('zips two iterables lazily and stops at the shorter iterable, closing the longer one', () => {
			let degreePulls = 0
			let degreesClosed = false

			function* infiniteDegrees() {
				try {
					for (let d = 1n; ; d++) {
						degreePulls++
						yield d
					}
				} finally {
					degreesClosed = true
				}
			}

			const radicands = [5n, 9n, 27n, 16n]
			const results = [...nthRootBigIntLazy(radicands, infiniteDegrees())]

			assert.deepEqual(results, [5n * SCALE, 3n * SCALE, 3n * SCALE, 2n * SCALE])
			assert.equal(degreePulls, 4)
			assert.equal(degreesClosed, true)
		})

		it('validates items lazily as they are consumed', () => {
			function* mixedInputs() {
				yield 4n
				yield -9n
				yield 16n
			}

			const gen = nthRootBigIntLazy(mixedInputs(), 2n)
			assert.equal(gen.next().value, 2n * SCALE)
			assert.throws(() => gen.next(), RangeError)
		})
	})

	describe('independent cross-checks', () => {
		it('satisfies exact nearest-integer bracket (2r-1)^n <= 2^n * x * S^n <= (2r+1)^n when raised to the n-th power', () => {
			const testPairs = [
				[2n, 2n],
				[3n, 2n],
				[5n, 2n],
				[7n, 3n],
				[10n, 3n],
				[50n, 4n],
				[100n, 5n],
				[999n, 7n],
				[123456789n, 6n],
				[-7n, 3n],
				[-1000n, 5n],
				[10n ** 30n + 7n, 4n],
			]

			for (const [x, n] of testPairs) {
				const r = nthRootBigIntLazy(x, n)
				const absX = x < 0n ? -x : x
				const absR = r < 0n ? -r : r

				if (x < 0n) {
					assert.ok(r < 0n, `expected negative root for x=${x}, n=${n}`)
				}

				const scaledExact = (absX * powBigInt(SCALE, n)) << n
				const lowerBound = powBigInt((absR << 1n) - 1n, n)
				const upperBound = powBigInt((absR << 1n) + 1n, n)

				assert.ok(
					lowerBound <= scaledExact && scaledExact <= upperBound,
					`bracket failed for x=${x}, n=${n}: r=${r}`
				)
			}
		})

		it('matches Math.pow across a broad grid of radicands and degrees', () => {
			const radicands = [0n, 1n, 2n, 3n, 5n, 10n, 17n, 100n, 1000n, 999_999n, 10n ** 12n]
			const degrees = [1n, 2n, 3n, 4n, 5n, 7n, 10n, 16n]

			for (const x of radicands) {
				for (const n of degrees) {
					const fixedResult = nthRootBigIntLazy(x, n)
					const asFloat = Number(fixedResult) / 1e18
					const ref = Math.pow(Number(x), 1 / Number(n))
					const relErr = ref === 0 ? Math.abs(asFloat) : Math.abs(asFloat - ref) / ref
					assert.ok(
						relErr < 1e-14,
						`Math.pow mismatch for x=${x}, n=${n}: got ${asFloat}, expected ${ref} (relErr=${relErr})`
					)
				}
			}
		})
	})
})
