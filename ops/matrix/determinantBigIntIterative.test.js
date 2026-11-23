import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { determinantBigIntIterative } from './determinantBigIntIterative.js'

/**
 * Independent reference implementation: recursive Laplace cofactor expansion.
 * Used strictly as a cross-check oracle for small matrices (n <= 6).
 */
function detLaplace(m) {
	const n = m.length
	if (n === 0) return 1n
	if (n === 1) return m[0][0]
	if (n === 2) return m[0][0] * m[1][1] - m[0][1] * m[1][0]

	let total = 0n
	for (let col = 0; col < n; col++) {
		const coeff = m[0][col]
		if (coeff === 0n) continue
		const minor = []
		for (let r = 1; r < n; r++) {
			const row = []
			for (let c = 0; c < n; c++) {
				if (c !== col) row.push(m[r][c])
			}
			minor.push(row)
		}
		const subDet = detLaplace(minor)
		total += col % 2 === 0 ? coeff * subDet : -coeff * subDet
	}
	return total
}

function matMul(a, b) {
	const n = a.length
	const out = Array.from({ length: n }, () => new Array(n).fill(0n))
	for (let i = 0; i < n; i++) {
		for (let k = 0; k < n; k++) {
			const aik = a[i][k]
			if (aik === 0n) continue
			for (let j = 0; j < n; j++) {
				out[i][j] += aik * b[k][j]
			}
		}
	}
	return out
}

function transpose(m) {
	const n = m.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => m[j][i])
	)
}

function makeRng(seed) {
	let s = BigInt(seed)
	return () => {
		s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n)
		return s
	}
}

describe('determinantBigIntIterative', () => {
	it('handles 0x0 and 1x1 matrices', () => {
		assert.equal(determinantBigIntIterative([]), 1n)
		assert.equal(determinantBigIntIterative([[0n]]), 0n)
		assert.equal(determinantBigIntIterative([[7n]]), 7n)
		assert.equal(determinantBigIntIterative([[-42n]]), -42n)
	})

	it('computes exact determinants for 2x2 matrices including zero pivots', () => {
		assert.equal(
			determinantBigIntIterative([
				[1n, 2n],
				[3n, 4n]
			]),
			-2n
		)
		assert.equal(
			determinantBigIntIterative([
				[0n, 5n],
				[7n, 3n]
			]),
			-35n
		)
		assert.equal(
			determinantBigIntIterative([
				[2n, 4n],
				[1n, 2n]
			]),
			0n
		)
		assert.equal(
			determinantBigIntIterative([
				[0n, 0n],
				[3n, 4n]
			]),
			0n
		)
	})

	it('computes exact determinants for 3x3 and 4x4 matrices', () => {
		assert.equal(
			determinantBigIntIterative([
				[6n, 1n, 1n],
				[4n, -2n, 5n],
				[2n, 8n, 7n]
			]),
			-306n
		)

		// Requires multiple row swaps because leading diagonal entries are zero
		const m4 = [
			[0n, 0n, 0n, 2n],
			[0n, 0n, 3n, 1n],
			[0n, 5n, 4n, 7n],
			[11n, 6n, 8n, 9n]
		]
		// Anti-triangular 4x4: permutation (3,2,1,0) has 6 inversions (even), product = 2*3*5*11 = 330
		assert.equal(determinantBigIntIterative(m4), 330n)
	})

	it('handles identity, triangular, diagonal, and singular matrices', () => {
		for (let n = 1; n <= 7; n++) {
			const id = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => (i === j ? 1n : 0n))
			)
			assert.equal(determinantBigIntIterative(id), 1n)
		}

		// Upper triangular 5x5: determinant is product of diagonal
		const upper = [
			[2n, 9n, -3n, 4n, 1n],
			[0n, -3n, 7n, 2n, 5n],
			[0n, 0n, 5n, -8n, 6n],
			[0n, 0n, 0n, 7n, 11n],
			[0n, 0n, 0n, 0n, -13n]
		]
		assert.equal(determinantBigIntIterative(upper), 2n * -3n * 5n * 7n * -13n)

		// Singular matrix where row 3 = 2*row 0 - row 1 + row 2
		const singular = [
			[1n, 2n, 3n, 4n],
			[5n, 6n, 7n, 8n],
			[2n, 0n, 1n, -1n],
			[-1n, -2n, 0n, -1n]
		]
		assert.equal(determinantBigIntIterative(singular), 0n)
	})

	it('matches closed-form determinant for Vandermonde and tridiagonal matrices', () => {
		// Vandermonde matrix V_{i,j} = x_i^j has det = prod_{i < j} (x_j - x_i)
		const xs = [-3n, -1n, 2n, 4n, 7n, 10n]
		const n = xs.length
		const vandermonde = xs.map((x) =>
			Array.from({ length: n }, (_, p) => x ** BigInt(p))
		)
		let expectedVandermonde = 1n
		for (let i = 0; i < n; i++) {
			for (let j = i + 1; j < n; j++) {
				expectedVandermonde *= xs[j] - xs[i]
			}
		}
		assert.equal(determinantBigIntIterative(vandermonde), expectedVandermonde)

		// Tridiagonal matrix with 2 on main diagonal and -1 on sub/super diagonals: det = n + 1
		for (let size = 1; size <= 10; size++) {
			const tri = Array.from({ length: size }, (_, i) =>
				Array.from({ length: size }, (_, j) => {
					if (i === j) return 2n
					if (Math.abs(i - j) === 1) return -1n
					return 0n
				})
			)
			assert.equal(determinantBigIntIterative(tri), BigInt(size + 1))
		}
	})

	it('preserves exact precision for huge BigInt entries exceeding Number.MAX_SAFE_INTEGER', () => {
		const big = 10n ** 30n
		// [[big + 1, big], [big, big - 1]] => (big^2 - 1) - big^2 = -1n
		assert.equal(
			determinantBigIntIterative([
				[big + 1n, big],
				[big, big - 1n]
			]),
			-1n
		)

		// 3x3 with huge entries where floating-point would suffer catastrophic cancellation
		const m = [
			[big, big + 1n, big + 2n],
			[big + 3n, big + 5n, big + 7n],
			[big + 11n, big + 13n, big + 19n]
		]
		assert.equal(determinantBigIntIterative(m), detLaplace(m))
	})

	it('does not mutate the input matrix', () => {
		const original = [
			[0n, 2n, 1n],
			[3n, -1n, 4n],
			[2n, 5n, -3n]
		]
		const snapshot = original.map((row) => [...row])
		const det = determinantBigIntIterative(original)
		assert.equal(det, detLaplace(snapshot))
		assert.deepEqual(original, snapshot)
	})

	it('cross-checks against independent Laplace expansion across random and sparse matrices (n = 1..6)', () => {
		const next = makeRng(20261123)
		for (let n = 1; n <= 6; n++) {
			const trials = n <= 4 ? 12 : 4
			for (let t = 0; t < trials; t++) {
				// Mix dense and zero-heavy matrices to exercise pivoting paths
				const sparse = t % 2 === 1
				const m = Array.from({ length: n }, () =>
					Array.from({ length: n }, () => {
						const r = next()
						if (sparse && r % 3n !== 0n) return 0n
						return (r % 21n) - 10n
					})
				)
				assert.equal(
					determinantBigIntIterative(m),
					detLaplace(m),
					`mismatch for n=${n}, trial=${t}`
				)
			}
		}
	})

	it('satisfies algebraic identities: det(AB) = det(A)det(B), det(A^T) = det(A), and elementary row ops', () => {
		const next = makeRng(987654321)
		const genMatrix = (n, scale = 1n) =>
			Array.from({ length: n }, () =>
				Array.from({ length: n }, () => ((next() % 19n) - 9n) * scale)
			)

		for (const [n, scale] of [
			[4, 1n],
			[6, 1n],
			[5, 10n ** 12n]
		]) {
			const a = genMatrix(n, scale)
			const b = genMatrix(n, scale)
			const detA = determinantBigIntIterative(a)
			const detB = determinantBigIntIterative(b)
			const detAB = determinantBigIntIterative(matMul(a, b))
			assert.equal(detAB, detA * detB)
			assert.equal(determinantBigIntIterative(transpose(a)), detA)

			// Row swap negates determinant
			const swapped = a.map((row) => [...row])
			;[swapped[0], swapped[n - 1]] = [swapped[n - 1], swapped[0]]
			assert.equal(determinantBigIntIterative(swapped), -detA)

			// Scaling a single row by k multiplies determinant by k
			const scaled = a.map((row, idx) =>
				idx === 1 ? row.map((v) => v * 7n) : [...row]
			)
			assert.equal(determinantBigIntIterative(scaled), 7n * detA)

			// Adding a multiple of one row to another leaves determinant unchanged
			const sheared = a.map((row) => [...row])
			for (let j = 0; j < n; j++) {
				sheared[2][j] += 5n * sheared[0][j]
			}
			assert.equal(determinantBigIntIterative(sheared), detA)
		}
	})

	it('rejects invalid inputs with appropriate errors', () => {
		for (const bad of [null, undefined, 42, 42n, '[[1]]', {}]) {
			assert.throws(() => determinantBigIntIterative(bad), TypeError)
		}

		// Non-array rows
		assert.throws(() => determinantBigIntIterative([1n, 2n]), TypeError)
		assert.throws(() => determinantBigIntIterative([[1n, 2n], null]), TypeError)

		// Non-square matrices
		assert.throws(() => determinantBigIntIterative([[1n, 2n]]), RangeError)
		assert.throws(() => determinantBigIntIterative([[1n], [2n]]), RangeError)
		assert.throws(
			() => determinantBigIntIterative([[1n, 2n], [3n]]),
			RangeError
		)

		// Non-BigInt entries
		assert.throws(() => determinantBigIntIterative([[1]]), TypeError)
		assert.throws(
			() =>
				determinantBigIntIterative([
					[1n, 2n],
					[3n, 4]
				]),
			TypeError
		)
		assert.throws(() => determinantBigIntIterative([['1']]), TypeError)
		assert.throws(() => determinantBigIntIterative([[NaN]]), TypeError)
		assert.throws(() => determinantBigIntIterative([[undefined]]), TypeError)
		assert.throws(() => determinantBigIntIterative([new Array(1)]), TypeError)

		// Validation must run even if the first column is all zeros
		assert.throws(
			() =>
				determinantBigIntIterative([
					[0n, 1n],
					[0n, 'bad']
				]),
			TypeError
		)
	})
})
