import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { transposeTypedStable } from './transposeTypedStable.js'

/**
 * Independent naive 2D-array reference transpose for cross-checking.
 */
function referenceTranspose2D(flat, rows, cols) {
	const grid = []
	for (let i = 0; i < rows; i++) {
		const row = []
		for (let j = 0; j < cols; j++) {
			row.push(flat[i * cols + j])
		}
		grid.push(row)
	}
	const out = new Float64Array(rows * cols)
	for (let j = 0; j < cols; j++) {
		for (let i = 0; i < rows; i++) {
			out[j * rows + i] = grid[i][j]
		}
	}
	return out
}

/**
 * Independent scaled + Neumaier compensated Frobenius norm (dlassq-style)
 * that avoids overflow on huge values and underflow on tiny/subnormal values.
 */
function scaledFrobeniusNorm(arr) {
	let scale = 0
	for (let i = 0; i < arr.length; i++) {
		const a = Math.abs(arr[i])
		if (a > scale) scale = a
	}
	if (scale === 0 || !Number.isFinite(scale)) return scale

	let sum = 0
	let comp = 0
	for (let i = 0; i < arr.length; i++) {
		const q = arr[i] / scale
		const term = q * q
		const t = sum + term
		if (Math.abs(sum) >= Math.abs(term)) {
			comp += (sum - t) + term
		} else {
			comp += (term - t) + sum
		}
		sum = t
	}
	return scale * Math.sqrt(sum + comp)
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible matrix tests.
 */
function mulberry32(seed) {
	let s = seed >>> 0
	return () => {
		s = (s + 0x6d2b79f5) >>> 0
		let t = Math.imul(s ^ (s >>> 15), 1 | s)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/**
 * Neumaier compensated dot product for bilinear-form cross-check.
 */
function compensatedDot(a, b) {
	let sum = 0
	let comp = 0
	for (let i = 0; i < a.length; i++) {
		const term = a[i] * b[i]
		const t = sum + term
		if (Math.abs(sum) >= Math.abs(term)) {
			comp += (sum - t) + term
		} else {
			comp += (term - t) + sum
		}
		sum = t
	}
	return sum + comp
}

function matVec(mat, rows, cols, vec) {
	const out = new Float64Array(rows)
	for (let i = 0; i < rows; i++) {
		const rowSlice = mat.subarray(i * cols, (i + 1) * cols)
		out[i] = compensatedDot(rowSlice, vec)
	}
	return out
}

describe('transposeTypedStable', () => {
	describe('normal cases', () => {
		it('transposes a 2x3 rectangular matrix to 3x2', () => {
			const input = new Float64Array([1, 2, 3, 4, 5, 6])
			const result = transposeTypedStable(input, 2, 3)

			assert.ok(result instanceof Float64Array)
			assert.deepEqual(Array.from(result), [1, 4, 2, 5, 3, 6])
		})

		it('transposes a 3x2 rectangular matrix to 2x3', () => {
			const input = new Float64Array([1, 4, 2, 5, 3, 6])
			const result = transposeTypedStable(input, 3, 2)

			assert.deepEqual(Array.from(result), [1, 2, 3, 4, 5, 6])
		})

		it('transposes square matrices accurately', () => {
			const input = new Float64Array([
				1, 2, 3,
				4, 5, 6,
				7, 8, 9
			])
			const result = transposeTypedStable(input, 3, 3)

			assert.deepEqual(Array.from(result), [
				1, 4, 7,
				2, 5, 8,
				3, 6, 9
			])
		})

		it('transposes 1x1, row vectors (1xN), and column vectors (Nx1)', () => {
			assert.deepEqual(Array.from(transposeTypedStable(new Float64Array([42.5]), 1, 1)), [42.5])

			const vec = new Float64Array([1.5, -2.25, 3.75, 4.125])
			assert.deepEqual(Array.from(transposeTypedStable(vec, 1, 4)), [1.5, -2.25, 3.75, 4.125])
			assert.deepEqual(Array.from(transposeTypedStable(vec, 4, 1)), [1.5, -2.25, 3.75, 4.125])
		})

		it('handles non-zero byteOffset Float64Array subarray views', () => {
			const backing = new Float64Array([999, 10, 20, 30, 40, 50, 60, -999])
			const view = backing.subarray(1, 7) // 2x3
			const result = transposeTypedStable(view, 2, 3)

			assert.deepEqual(Array.from(result), [10, 40, 20, 50, 30, 60])
		})

		it('returns a fresh non-aliased Float64Array', () => {
			const input = new Float64Array([1, 2, 3, 4])
			const result = transposeTypedStable(input, 2, 2)

			assert.notEqual(result, input)
			assert.notEqual(result.buffer, input.buffer)
			input[0] = -100
			assert.equal(result[0], 1)
		})

		it('produces identical results across different cache block sizes', () => {
			const rows = 73
			const cols = 59
			const rand = mulberry32(1337)
			const input = new Float64Array(rows * cols)
			for (let i = 0; i < input.length; i++) {
				input[i] = (rand() - 0.5) * 1e6
			}

			const expected = transposeTypedStable(input, rows, cols, { blockSize: 1 })
			for (const blockSize of [2, 7, 16, 32, 64, 128]) {
				const actual = transposeTypedStable(input, rows, cols, { blockSize })
				assert.deepEqual(actual, expected)
			}
		})
	})

	describe('edge cases and numerical robustness', () => {
		it('handles empty matrices (0x0, 0xN, Nx0)', () => {
			const empty = new Float64Array(0)
			for (const [r, c] of [[0, 0], [0, 5], [5, 0]]) {
				const res = transposeTypedStable(empty, r, c)
				assert.ok(res instanceof Float64Array)
				assert.equal(res.length, 0)
			}
		})

		it('preserves signed zeros (-0 vs +0), subnormals, and extreme magnitudes bit-for-bit', () => {
			const input = new Float64Array([
				-0, +0, Number.MIN_VALUE,
				-Number.MIN_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE
			])
			const result = transposeTypedStable(input, 2, 3)

			assert.equal(Object.is(result[0], -0), true)
			assert.equal(Object.is(result[1], -Number.MIN_VALUE), true)
			assert.equal(Object.is(result[2], +0), true)
			assert.equal(Object.is(result[3], Number.MAX_VALUE), true)
			assert.equal(Object.is(result[4], Number.MIN_VALUE), true)
			assert.equal(Object.is(result[5], -Number.MAX_VALUE), true)
		})

		it('preserves Infinity, -Infinity, and exact NaN bit payloads by default', () => {
			const input = new Float64Array(4)
			const inBits = new BigUint64Array(input.buffer)
			const customQuietNaN = 0x7ff8000000001234n
			input[0] = Infinity
			input[1] = -Infinity
			inBits[2] = customQuietNaN
			input[3] = -0

			const result = transposeTypedStable(input, 2, 2)
			const outBits = new BigUint64Array(result.buffer)

			assert.equal(result[0], Infinity)
			assert.equal(outBits[1], customQuietNaN)
			assert.equal(result[2], -Infinity)
			assert.equal(Object.is(result[3], -0), true)
		})

		it('enforces finiteOnly option when enabled', () => {
			const finite = new Float64Array([Number.MIN_VALUE, -Number.MAX_VALUE, -0, 42])
			const transposed = transposeTypedStable(finite, 2, 2, { finiteOnly: true })
			assert.equal(transposed[1], -0)

			assert.throws(
				() => transposeTypedStable(new Float64Array([1, NaN, 3, 4]), 2, 2, { finiteOnly: true }),
				RangeError
			)
			assert.throws(
				() => transposeTypedStable(new Float64Array([1, 2, Infinity, 4]), 2, 2, { finiteOnly: true }),
				RangeError
			)
			assert.throws(
				() => transposeTypedStable(new Float64Array([1, 2, 3, -Infinity]), 2, 2, { finiteOnly: true }),
				RangeError
			)
		})
	})

	describe('invalid inputs', () => {
		it('rejects non-Float64Array data inputs', () => {
			for (const bad of [null, undefined, [1, 2, 3, 4], new Float32Array(4), new Int32Array(4), {}]) {
				assert.throws(() => transposeTypedStable(bad, 2, 2), TypeError)
			}
		})

		it('rejects non-integer or non-safe-integer dimensions', () => {
			const data = new Float64Array(4)
			for (const bad of [undefined, null, '2', 2.5, NaN, Infinity, -Infinity, 2n, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(() => transposeTypedStable(data, bad, 2), TypeError)
				assert.throws(() => transposeTypedStable(data, 2, bad), TypeError)
			}
		})

		it('rejects negative dimensions and length mismatches including product overflow', () => {
			const data = new Float64Array(6)
			assert.throws(() => transposeTypedStable(data, -2, 3), RangeError)
			assert.throws(() => transposeTypedStable(data, 2, -3), RangeError)
			assert.throws(() => transposeTypedStable(data, 2, 2), RangeError)
			assert.throws(() => transposeTypedStable(data, 3, 3), RangeError)
			assert.throws(
				() => transposeTypedStable(new Float64Array(0), Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
				RangeError
			)
		})

		it('rejects invalid options', () => {
			const data = new Float64Array([1, 2, 3, 4])
			assert.throws(() => transposeTypedStable(data, 2, 2, null), TypeError)
			assert.throws(() => transposeTypedStable(data, 2, 2, []), TypeError)
			assert.throws(() => transposeTypedStable(data, 2, 2, 'bad'), TypeError)
			assert.throws(() => transposeTypedStable(data, 2, 2, { finiteOnly: 1 }), TypeError)
			assert.throws(() => transposeTypedStable(data, 2, 2, { blockSize: 1.5 }), TypeError)
			assert.throws(() => transposeTypedStable(data, 2, 2, { blockSize: 0 }), RangeError)
			assert.throws(() => transposeTypedStable(data, 2, 2, { blockSize: -4 }), RangeError)
		})
	})

	describe('independent cross-checks', () => {
		it('matches naive 2D reference transpose and satisfies involution (A^T)^T === A bit-for-bit', () => {
			const rand = mulberry32(20261123)
			const shapes = [
				[1, 7],
				[7, 1],
				[5, 8],
				[13, 9],
				[33, 33],
				[41, 67]
			]

			for (const [rows, cols] of shapes) {
				const a = new Float64Array(rows * cols)
				for (let i = 0; i < a.length; i++) {
					a[i] = (rand() - 0.5) * 1e12
				}

				const at = transposeTypedStable(a, rows, cols)
				const ref = referenceTranspose2D(a, rows, cols)
				assert.deepEqual(
					new BigUint64Array(at.buffer),
					new BigUint64Array(ref.buffer),
					`Mismatch against 2D reference for shape ${rows}x${cols}`
				)

				const att = transposeTypedStable(at, cols, rows)
				assert.deepEqual(
					new BigUint64Array(att.buffer),
					new BigUint64Array(a.buffer),
					`Involution failed for shape ${rows}x${cols}`
				)
			}
		})

		it('satisfies adjoint bilinear identity <Ax, y> = <x, A^T y>', () => {
			const rand = mulberry32(987654)
			const rows = 29
			const cols = 37
			const a = new Float64Array(rows * cols)
			const x = new Float64Array(cols)
			const y = new Float64Array(rows)

			for (let i = 0; i < a.length; i++) a[i] = (rand() - 0.5) * 100
			for (let i = 0; i < x.length; i++) x[i] = (rand() - 0.5) * 100
			for (let i = 0; i < y.length; i++) y[i] = (rand() - 0.5) * 100

			const at = transposeTypedStable(a, rows, cols)
			const lhs = compensatedDot(matVec(a, rows, cols, x), y)
			const rhs = compensatedDot(x, matVec(at, cols, rows, y))

			const relErr = Math.abs(lhs - rhs) / Math.max(1, Math.abs(lhs), Math.abs(rhs))
			assert.ok(relErr < 1e-13, `Expected relative error < 1e-13, got ${relErr}`)
		})

		it('preserves scaled Frobenius norm invariance ||A^T||_F == ||A||_F on extreme scales', () => {
			const rand = mulberry32(424242)
			const rows = 35
			const cols = 43
			for (const scale of [1e200, 1e-200]) {
				const a = new Float64Array(rows * cols)
				for (let i = 0; i < a.length; i++) {
					a[i] = (rand() - 0.5) * scale
				}
				const at = transposeTypedStable(a, rows, cols)
				const normA = scaledFrobeniusNorm(a)
				const normAT = scaledFrobeniusNorm(at)

				assert.ok(Number.isFinite(normA) && normA > 0)
				const relErr = Math.abs(normA - normAT) / normA
				assert.ok(relErr < 1e-14, `Frobenius norm mismatch at scale ${scale}: relErr=${relErr}`)
			}
		})
	})
})
