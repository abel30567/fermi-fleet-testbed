import { describe, test } from 'node:test'
import assert from 'node:assert'
import { matMulFloatLazy } from './matMulFloatLazy.js'

/**
 * Independent classic triple-loop (ijk) float64 matrix multiplication reference.
 *
 * @param {number[][]} a
 * @param {number[][]} b
 * @returns {number[][]}
 */
function referenceMatMulIjk(a, b) {
	const m = a.length
	if (m === 0) return []
	const k = a[0].length
	const n = k === 0 ? 0 : b[0].length
	const out = Array.from({ length: m }, () => new Array(n).fill(0))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let sum = 0
			for (let p = 0; p < k; p++) {
				sum += a[i][p] * b[p][j]
			}
			out[i][j] = sum
		}
	}
	return out
}

/**
 * Independent BigInt matrix multiplication reference for exact integer inputs.
 *
 * @param {number[][]} a
 * @param {number[][]} b
 * @returns {number[][]}
 */
function referenceMatMulBigInt(a, b) {
	const m = a.length
	if (m === 0) return []
	const k = a[0].length
	const n = k === 0 ? 0 : b[0].length
	const out = Array.from({ length: m }, () => new Array(n).fill(0))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let sum = 0n
			for (let p = 0; p < k; p++) {
				sum += BigInt(a[i][p]) * BigInt(b[p][j])
			}
			out[i][j] = Number(sum)
		}
	}
	return out
}

/**
 * Transposes a 2D array matrix.
 *
 * @param {number[][]} matrix
 * @returns {number[][]}
 */
function transpose(matrix) {
	if (matrix.length === 0) return []
	const cols = matrix[0].length
	return Array.from({ length: cols }, (_, j) =>
		matrix.map((row) => row[j])
	)
}

/**
 * Adds two matrices of identical dimensions.
 *
 * @param {number[][]} a
 * @param {number[][]} b
 * @returns {number[][]}
 */
function matAdd(a, b) {
	return a.map((row, i) => row.map((val, j) => val + b[i][j]))
}

/**
 * Deterministic xorshift32 PRNG for reproducible test matrices.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
	let state = seed >>> 0
	return () => {
		state ^= state << 13
		state ^= state >>> 17
		state ^= state << 5
		return (state >>> 0) / 0x100000000
	}
}

/**
 * Generates a deterministic float64 matrix with values in [-10, 10].
 *
 * @param {number} rows
 * @param {number} cols
 * @param {() => number} rng
 * @returns {number[][]}
 */
function randomFloatMatrix(rows, cols, rng) {
	return Array.from({ length: rows }, () =>
		Array.from({ length: cols }, () => (rng() - 0.5) * 20)
	)
}

describe('matMulFloatLazy - normal cases', () => {
	test('multiplies 2x2 matrices', () => {
		const a = [
			[1, 2],
			[3, 4]
		]
		const b = [
			[5, 6],
			[7, 8]
		]
		assert.deepStrictEqual(
			[...matMulFloatLazy(a, b)],
			[
				[19, 22],
				[43, 50]
			]
		)
	})

	test('multiplies rectangular matrices (2x3 * 3x4, dot product, outer product)', () => {
		const a = [
			[1, 2, 3],
			[4, 5, 6]
		]
		const b = [
			[7, 8, 9, 10],
			[11, 12, 13, 14],
			[15, 16, 17, 18]
		]
		assert.deepStrictEqual(
			[...matMulFloatLazy(a, b)],
			[
				[74, 80, 86, 92],
				[173, 188, 203, 218]
			]
		)

		// 1x3 * 3x1 (dot product)
		assert.deepStrictEqual(
			[...matMulFloatLazy([[2, -3, 4]], [[5], [6], [-7]])],
			[[-36]]
		)

		// 3x1 * 1x3 (outer product)
		assert.deepStrictEqual(
			[...matMulFloatLazy([[2], [3], [4]], [[5, 6, 7]])],
			[
				[10, 12, 14],
				[15, 18, 21],
				[20, 24, 28]
			]
		)
	})

	test('respects identity, zero, and self-multiplication', () => {
		const m = [
			[1.5, -2.25, 3],
			[0, 4.5, -1.5],
			[2, -1, 0.25]
		]
		const identity = [
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 1]
		]
		const zero = [
			[0, 0, 0],
			[0, 0, 0],
			[0, 0, 0]
		]

		assert.deepStrictEqual([...matMulFloatLazy(m, identity)], m)
		assert.deepStrictEqual([...matMulFloatLazy(identity, m)], m)
		assert.deepStrictEqual([...matMulFloatLazy(m, zero)], zero)
		assert.deepStrictEqual(
			[...matMulFloatLazy(m, m)],
			referenceMatMulIjk(m, m)
		)
	})

	test('handles floating-point fractions accurately in IEEE-754 float64', () => {
		const a = [[0.1, 0.2]]
		const b = [[0.3], [0.4]]
		const [[result]] = [...matMulFloatLazy(a, b)]
		assert.strictEqual(result, 0.1 * 0.3 + 0.2 * 0.4)
	})
})

describe('matMulFloatLazy - edge cases', () => {
	test('handles 1x1 matrices', () => {
		assert.deepStrictEqual([...matMulFloatLazy([[3.5]], [[-2]])], [[-7]])
	})

	test('handles empty left matrix without consuming right matrix', () => {
		let bTouched = false
		function* genB() {
			bTouched = true
			yield [1, 2]
		}
		assert.deepStrictEqual([...matMulFloatLazy([], genB())], [])
		assert.strictEqual(bTouched, false)
	})

	test('handles zero-column / zero-inner-dimension matrices', () => {
		// (2x0) * (0x0) = (2x0)
		assert.deepStrictEqual([...matMulFloatLazy([[], []], [])], [[], []])

		// (1x2) * (2x0) = (1x0)
		assert.deepStrictEqual([...matMulFloatLazy([[1, 2]], [[], []])], [[]])
	})

	test('preserves IEEE-754 special values (Infinity, -Infinity, NaN, -0, subnormals)', () => {
		// 0 * Infinity must yield NaN (must not skip zero entries)
		const [[zeroTimesInf]] = [...matMulFloatLazy([[0]], [[Infinity]])]
		assert.ok(Number.isNaN(zeroTimesInf))

		// NaN propagation
		const [[nanRes]] = [...matMulFloatLazy([[NaN, 1]], [[2], [3]])]
		assert.ok(Number.isNaN(nanRes))

		// Infinity and -Infinity
		const [[infRes, negInfRes]] = [
			...matMulFloatLazy([[2, 1]], [[Infinity, -Infinity], [1, 1]])
		]
		assert.strictEqual(infRes, Infinity)
		assert.strictEqual(negInfRes, -Infinity)

		// Subnormals and large finite values
		const [[subRes]] = [
			...matMulFloatLazy([[Number.MIN_VALUE]], [[2]])
		]
		assert.strictEqual(subRes, Number.MIN_VALUE * 2)

		// Signed zero: 0 + (-0 * 1) === +0 in IEEE-754
		const [[signedZeroRes]] = [...matMulFloatLazy([[-0]], [[1]])]
		assert.ok(Object.is(signedZeroRes, 0))
	})

	test('accepts heterogeneous iterable types (Float64Array, Int32Array, Set, custom iterables)', () => {
		const customIterableA = {
			*[Symbol.iterator]() {
				yield new Float64Array([1.5, 2.5])
				yield new Set([3, 4])
			}
		}
		const customIterableB = {
			*[Symbol.iterator]() {
				yield new Int32Array([2, -1])
				yield {
					*[Symbol.iterator]() {
						yield 4
						yield 0.5
					}
				}
			}
		}
		assert.deepStrictEqual(
			[...matMulFloatLazy(customIterableA, customIterableB)],
			[
				[13, -0.25],
				[22, -1]
			]
		)
	})
})

describe('matMulFloatLazy - input validation', () => {
	test('throws TypeError synchronously for invalid top-level matrix arguments', () => {
		const invalidInputs = [
			null,
			undefined,
			42,
			true,
			'123',
			{},
			new Float64Array([1, 2])
		]
		for (const bad of invalidInputs) {
			assert.throws(() => matMulFloatLazy(bad, [[1]]), TypeError)
			assert.throws(() => matMulFloatLazy([[1]], bad), TypeError)
		}
	})

	test('throws TypeError when a row is not a valid iterable', () => {
		const badRows = [null, undefined, 123, '12', {}, true]
		for (const badRow of badRows) {
			assert.throws(() => [...matMulFloatLazy([badRow], [[1]])], TypeError)
			assert.throws(() => [...matMulFloatLazy([[1]], [badRow])], TypeError)
		}
	})

	test('throws TypeError when any element is not a number', () => {
		const badElements = ['1', 1n, null, undefined, true, {}, Symbol('x')]
		for (const badEl of badElements) {
			assert.throws(
				() => [...matMulFloatLazy([[badEl]], [[1]])],
				TypeError
			)
			assert.throws(
				() => [...matMulFloatLazy([[1]], [[badEl]])],
				TypeError
			)
		}
		// BigInt64Array row yields BigInt elements
		assert.throws(
			() => [...matMulFloatLazy([new BigInt64Array([1n])], [[1]])],
			TypeError
		)
	})

	test('throws RangeError for incompatible matrix dimensions', () => {
		// cols(a)=2, rows(b)=1
		assert.throws(
			() => [...matMulFloatLazy([[1, 2]], [[3, 4]])],
			RangeError
		)
		// cols(a)=1, rows(b)=2
		assert.throws(
			() => [...matMulFloatLazy([[1]], [[2], [3]])],
			RangeError
		)
		// cols(a)=2, rows(b)=0
		assert.throws(() => [...matMulFloatLazy([[1, 2]], [])], RangeError)
		// cols(a)=0, rows(b)=1
		assert.throws(() => [...matMulFloatLazy([[]], [[1]])], RangeError)
	})

	test('throws RangeError for ragged matrices', () => {
		// Ragged a (shorter second row)
		assert.throws(
			() =>
				[
					...matMulFloatLazy(
						[
							[1, 2],
							[3]
						],
						[[1], [1]]
					)
				],
			RangeError
		)
		// Ragged a (longer second row)
		assert.throws(
			() =>
				[
					...matMulFloatLazy(
						[
							[1, 2],
							[3, 4, 5]
						],
						[[1], [1]]
					)
				],
			RangeError
		)
		// Ragged b (shorter second row)
		assert.throws(
			() =>
				[
					...matMulFloatLazy(
						[[1, 2]],
						[
							[1, 2],
							[3]
						]
					)
				],
			RangeError
		)
		// Ragged b (longer second row)
		assert.throws(
			() =>
				[
					...matMulFloatLazy(
						[[1, 2]],
						[
							[1, 2],
							[3, 4, 5]
						]
					)
				],
			RangeError
		)
	})
})

describe('matMulFloatLazy - lazy streaming behavior', () => {
	test('does not pull from a or b until iteration starts, then streams a one row at a time', () => {
		let aPulled = 0
		let bPulled = 0

		function* genA() {
			for (const row of [
				[1, 2],
				[3, 4],
				[5, 6]
			]) {
				aPulled++
				yield row
			}
		}

		function* genB() {
			for (const row of [
				[10, 20],
				[30, 40]
			]) {
				bPulled++
				yield row
			}
		}

		const gen = matMulFloatLazy(genA(), genB())
		assert.strictEqual(aPulled, 0)
		assert.strictEqual(bPulled, 0)

		const first = gen.next()
		assert.deepStrictEqual(first, { value: [70, 100], done: false })
		assert.strictEqual(aPulled, 1)
		assert.strictEqual(bPulled, 2)

		const second = gen.next()
		assert.deepStrictEqual(second, { value: [150, 220], done: false })
		assert.strictEqual(aPulled, 2)
		assert.strictEqual(bPulled, 2)

		const third = gen.next()
		assert.deepStrictEqual(third, { value: [230, 340], done: false })
		assert.strictEqual(aPulled, 3)
		assert.strictEqual(bPulled, 2)

		assert.deepStrictEqual(gen.next(), { value: undefined, done: true })
	})

	test('streams from an infinite generator a and cleans up on early break', () => {
		let yielded = 0
		let closed = false

		function* infiniteA() {
			try {
				for (let i = 1; ; i++) {
					yielded++
					yield (function* rowGen() {
						yield i
						yield i * 2
					})()
				}
			} finally {
				closed = true
			}
		}

		function* singlePassB() {
			yield (function* () {
				yield 1
				yield 0
			})()
			yield (function* () {
				yield 0
				yield 3
			})()
		}

		const collected = []
		for (const row of matMulFloatLazy(infiniteA(), singlePassB())) {
			collected.push(row)
			if (collected.length === 4) break
		}

		assert.deepStrictEqual(collected, [
			[1, 6],
			[2, 12],
			[3, 18],
			[4, 24]
		])
		assert.strictEqual(yielded, 4)
		assert.strictEqual(closed, true)
	})

	test('fails fast on an infinite b generator with mismatched rows and closes iterator', () => {
		let bPulled = 0
		let bClosed = false

		function* infiniteB() {
			try {
				while (true) {
					bPulled++
					yield [1, 2]
				}
			} finally {
				bClosed = true
			}
		}

		const gen = matMulFloatLazy([[1, 2]], infiniteB())
		assert.throws(() => gen.next(), RangeError)
		assert.strictEqual(bPulled, 3) // read k=2 rows + 1 extra row to detect mismatch
		assert.strictEqual(bClosed, true)
	})

	test('fails fast on an infinite subsequent row of a and closes row iterator', () => {
		let elemPulled = 0
		let rowClosed = false

		function* infiniteRow() {
			try {
				while (true) {
					elemPulled++
					yield 1
				}
			} finally {
				rowClosed = true
			}
		}

		function* genA() {
			yield [1, 2]
			yield infiniteRow()
		}

		const gen = matMulFloatLazy(genA(), [[3], [4]])
		assert.deepStrictEqual(gen.next(), { value: [11], done: false })
		assert.throws(() => gen.next(), RangeError)
		assert.strictEqual(elemPulled, 3) // stopped on 3rd element (index 2 >= expected 2)
		assert.strictEqual(rowClosed, true)
	})

	test('yields valid prefix rows lazily before encountering a later ragged row in a', () => {
		function* genA() {
			yield [1, 2]
			yield [3, 4]
			yield [5] // ragged at row index 2
		}

		const gen = matMulFloatLazy(genA(), [[1], [2]])
		assert.deepStrictEqual(gen.next(), { value: [5], done: false })
		assert.deepStrictEqual(gen.next(), { value: [11], done: false })
		assert.throws(() => gen.next(), RangeError)
	})
})

describe('matMulFloatLazy - independent cross-checks', () => {
	test('matches independent ijk reference bit-for-bit across deterministic random float64 matrices', () => {
		const rng = makeRng(0xdecafbad)
		const shapes = [
			[5, 7, 4],
			[12, 12, 12],
			[8, 3, 11],
			[1, 15, 1],
			[15, 1, 9]
		]

		for (const [m, k, n] of shapes) {
			const a = randomFloatMatrix(m, k, rng)
			const b = randomFloatMatrix(k, n, rng)

			// Wrap both in fresh generators to exercise full streaming path
			const genA = (function* () {
				for (const row of a) yield row.values()
			})()
			const genB = (function* () {
				for (const row of b) yield row.values()
			})()

			const actual = [...matMulFloatLazy(genA, genB)]
			const expected = referenceMatMulIjk(a, b)
			assert.deepStrictEqual(actual, expected)
		}
	})

	test('matches exact BigInt reference on integer matrices', () => {
		const rng = makeRng(0x12345678)
		const intMat = (rows, cols) =>
			Array.from({ length: rows }, () =>
				Array.from({ length: cols }, () => Math.floor((rng() - 0.5) * 2000))
			)

		const a = intMat(9, 11)
		const b = intMat(11, 7)
		assert.deepStrictEqual(
			[...matMulFloatLazy(a, b)],
			referenceMatMulBigInt(a, b)
		)
	})

	test('satisfies matrix algebra identities: transpose (exact), associativity, and distributivity', () => {
		const rng = makeRng(0x9e3779b9)
		const a = randomFloatMatrix(6, 5, rng)
		const b = randomFloatMatrix(5, 4, rng)
		const c = randomFloatMatrix(4, 7, rng)
		const b2 = randomFloatMatrix(5, 4, rng)

		// Exact transpose identity: (A * B)^T === B^T * A^T
		const ab = [...matMulFloatLazy(a, b)]
		const abT = transpose(ab)
		const bTaT = [...matMulFloatLazy(transpose(b), transpose(a))]
		assert.deepStrictEqual(abT, bTaT)

		// Associativity: (A * B) * C ≈ A * (B * C)
		const leftAssoc = [...matMulFloatLazy(ab, c)]
		const bc = [...matMulFloatLazy(b, c)]
		const rightAssoc = [...matMulFloatLazy(a, bc)]
		for (let i = 0; i < leftAssoc.length; i++) {
			for (let j = 0; j < leftAssoc[i].length; j++) {
				const diff = Math.abs(leftAssoc[i][j] - rightAssoc[i][j])
				const scale = Math.max(
					1,
					Math.abs(leftAssoc[i][j]),
					Math.abs(rightAssoc[i][j])
				)
				assert.ok(
					diff <= scale * 1e-12,
					`Associativity mismatch at (${i},${j}): ${leftAssoc[i][j]} vs ${rightAssoc[i][j]}`
				)
			}
		}

		// Distributivity: A * (B + B2) ≈ A * B + A * B2
		const distLeft = [...matMulFloatLazy(a, matAdd(b, b2))]
		const distRight = matAdd(ab, [...matMulFloatLazy(a, b2)])
		for (let i = 0; i < distLeft.length; i++) {
			for (let j = 0; j < distLeft[i].length; j++) {
				const diff = Math.abs(distLeft[i][j] - distRight[i][j])
				const scale = Math.max(
					1,
					Math.abs(distLeft[i][j]),
					Math.abs(distRight[i][j])
				)
				assert.ok(
					diff <= scale * 1e-12,
					`Distributivity mismatch at (${i},${j}): ${distLeft[i][j]} vs ${distRight[i][j]}`
				)
			}
		}
	})
})
