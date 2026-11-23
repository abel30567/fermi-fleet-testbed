/**
 * Computes the complex Kronecker / tensor product `A ⊗ B` for two complex
 * matrices (2D rectangular arrays) or two complex vectors (1D arrays) whose
 * entries are complex numbers `{ re, im }`.
 *
 * Uses the closed-form bilinear algebraic decomposition over ℝ ⊕ iℝ:
 *
 *   A = A_R + i·A_I,   B = B_R + i·B_I
 *   A ⊗ B = (A_R ⊗ B_R − A_I ⊗ B_I) + i·(A_R ⊗ B_I + A_I ⊗ B_R)
 *
 * where each real Kronecker product is evaluated in closed form from the
 * separated real and imaginary tensor components.
 *
 * @typedef {{ re: number, im: number }} Complex
 * @typedef {Complex[]} ComplexVector
 * @typedef {Complex[][]} ComplexMatrix
 *
 * @param {ComplexVector | ComplexMatrix} a - Left operand: non-empty 1D complex
 *   vector or non-empty rectangular 2D complex matrix.
 * @param {ComplexVector | ComplexMatrix} b - Right operand: same rank as `a`
 *   (both 1D vectors or both 2D rectangular matrices).
 * @returns {ComplexVector | ComplexMatrix} The Kronecker / tensor product `a ⊗ b`:
 *   - For 1D vectors of lengths `m` and `n`, a 1D vector of length `m * n`.
 *   - For 2D matrices of shapes `m × n` and `p × q`, a 2D matrix of shape
 *     `(m * p) × (n * q)`.
 * @throws {TypeError} If inputs are not arrays, contain invalid complex entries,
 *   have non-array rows in a 2D matrix, or have mismatched ranks (1D vs 2D).
 * @throws {RangeError} If inputs are empty, ragged, contain non-finite numbers
 *   (`NaN`, `±Infinity`), or overflow finite IEEE-754 double precision.
 */
export function tensorProductComplexSeries(a, b) {
	const parsedA = parseComplexTensor(a, 'a')
	const parsedB = parseComplexTensor(b, 'b')

	if (parsedA.rank !== parsedB.rank) {
		throw new TypeError(
			`Operands must have the same rank (got rank ${parsedA.rank} for "a" and rank ${parsedB.rank} for "b")`,
		)
	}

	if (parsedA.rank === 1) {
		return kronComplex1D(parsedA, parsedB)
	}

	return kronComplex2D(parsedA, parsedB)
}

/**
 * Normalizes `-0` to `0` and verifies finiteness.
 *
 * @param {number} value
 * @returns {number}
 */
function finalizeComponent(value) {
	if (!Number.isFinite(value)) {
		throw new RangeError('Tensor product result overflowed finite number range')
	}
	return value === 0 ? 0 : value
}

/**
 * Validates a single complex number object `{ re, im }`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {{ re: number, im: number }}
 */
function validateComplex(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be a complex number object { re, im }`)
	}
	const { re, im } = value
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${label} must have numeric "re" and "im" properties`)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${label} must have finite "re" and "im" values`)
	}
	return { re, im }
}

/**
 * Parses and validates a 1D complex vector or 2D rectangular complex matrix,
 * decomposing it into real and imaginary component arrays.
 *
 * @param {unknown} tensor
 * @param {string} name
 * @returns {{ rank: 1, len: number, re: number[], im: number[] }
 *         | { rank: 2, rows: number, cols: number, re: number[][], im: number[][] }}
 */
function parseComplexTensor(tensor, name) {
	if (!Array.isArray(tensor)) {
		throw new TypeError(`Operand "${name}" must be an array`)
	}
	if (tensor.length === 0) {
		throw new RangeError(`Operand "${name}" must not be empty`)
	}

	if (Array.isArray(tensor[0])) {
		const rows = tensor.length
		const cols = tensor[0].length
		if (cols === 0) {
			throw new RangeError(`Operand "${name}" must not have empty rows`)
		}

		const re = new Array(rows)
		const im = new Array(rows)

		for (let i = 0; i < rows; i++) {
			const row = tensor[i]
			if (!Array.isArray(row)) {
				throw new TypeError(`Row ${i} of "${name}" must be an array`)
			}
			if (row.length !== cols) {
				throw new RangeError(
					`Operand "${name}" must be rectangular (row ${i} has length ${row.length}, expected ${cols})`,
				)
			}

			const reRow = new Array(cols)
			const imRow = new Array(cols)
			for (let j = 0; j < cols; j++) {
				const z = validateComplex(row[j], `${name}[${i}][${j}]`)
				reRow[j] = z.re
				imRow[j] = z.im
			}
			re[i] = reRow
			im[i] = imRow
		}

		return { rank: 2, rows, cols, re, im }
	}

	const len = tensor.length
	const re = new Array(len)
	const im = new Array(len)

	for (let i = 0; i < len; i++) {
		const z = validateComplex(tensor[i], `${name}[${i}]`)
		re[i] = z.re
		im[i] = z.im
	}

	return { rank: 1, len, re, im }
}

/**
 * Closed-form real 1D Kronecker product.
 *
 * @param {number[]} x
 * @param {number[]} y
 * @returns {number[]}
 */
function realKron1D(x, y) {
	const m = x.length
	const n = y.length
	const out = new Array(m * n)
	for (let i = 0; i < m; i++) {
		const xi = x[i]
		const offset = i * n
		for (let j = 0; j < n; j++) {
			out[offset + j] = xi * y[j]
		}
	}
	return out
}

/**
 * Closed-form real 2D Kronecker product.
 *
 * @param {number[][]} x
 * @param {number[][]} y
 * @returns {number[][]}
 */
function realKron2D(x, y) {
	const m = x.length
	const n = x[0].length
	const p = y.length
	const q = y[0].length
	const out = new Array(m * p)

	for (let i = 0; i < m; i++) {
		const xRow = x[i]
		for (let k = 0; k < p; k++) {
			const yRow = y[k]
			const outRow = new Array(n * q)
			for (let j = 0; j < n; j++) {
				const xij = xRow[j]
				const colOffset = j * q
				for (let l = 0; l < q; l++) {
					outRow[colOffset + l] = xij * yRow[l]
				}
			}
			out[i * p + k] = outRow
		}
	}

	return out
}

/**
 * 1D complex Kronecker product via bilinear decomposition:
 *   Re(a ⊗ b) = a_R ⊗ b_R − a_I ⊗ b_I
 *   Im(a ⊗ b) = a_R ⊗ b_I + a_I ⊗ b_R
 *
 * @param {{ len: number, re: number[], im: number[] }} a
 * @param {{ len: number, re: number[], im: number[] }} b
 * @returns {ComplexVector}
 */
function kronComplex1D(a, b) {
	const rr = realKron1D(a.re, b.re)
	const ii = realKron1D(a.im, b.im)
	const ri = realKron1D(a.re, b.im)
	const ir = realKron1D(a.im, b.re)

	const total = a.len * b.len
	const result = new Array(total)
	for (let idx = 0; idx < total; idx++) {
		result[idx] = {
			re: finalizeComponent(rr[idx] - ii[idx]),
			im: finalizeComponent(ri[idx] + ir[idx]),
		}
	}
	return result
}

/**
 * 2D complex Kronecker product via bilinear decomposition:
 *   Re(A ⊗ B) = A_R ⊗ B_R − A_I ⊗ B_I
 *   Im(A ⊗ B) = A_R ⊗ B_I + A_I ⊗ B_R
 *
 * @param {{ rows: number, cols: number, re: number[][], im: number[][] }} a
 * @param {{ rows: number, cols: number, re: number[][], im: number[][] }} b
 * @returns {ComplexMatrix}
 */
function kronComplex2D(a, b) {
	const rr = realKron2D(a.re, b.re)
	const ii = realKron2D(a.im, b.im)
	const ri = realKron2D(a.re, b.im)
	const ir = realKron2D(a.im, b.re)

	const outRows = a.rows * b.rows
	const outCols = a.cols * b.cols
	const result = new Array(outRows)

	for (let r = 0; r < outRows; r++) {
		const row = new Array(outCols)
		for (let c = 0; c < outCols; c++) {
			row[c] = {
				re: finalizeComponent(rr[r][c] - ii[r][c]),
				im: finalizeComponent(ri[r][c] + ir[r][c]),
			}
		}
		result[r] = row
	}

	return result
}
