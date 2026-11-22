/**
 * Computes matrix inverses over a packed {@link Float64Array} series of `n × n`
 * row-major matrices.
 *
 * Uses closed-form adjugate/determinant formulas for `1 × 1` and `2 × 2`
 * matrices, and Gauss-Jordan elimination with partial pivoting for `n >= 3`.
 *
 * @param {Float64Array} data - Packed row-major `n × n` matrices (`data.length % (n * n) === 0`).
 * @param {number} n - Positive integer matrix dimension.
 * @returns {Float64Array} Packed row-major inverses with the same length as `data`.
 * @throws {TypeError} If `data` is not a `Float64Array` or `n` is not a number.
 * @throws {RangeError} If `n` is not a positive integer, `data.length` is not a
 *   multiple of `n * n`, or any matrix in the series is singular or non-finite.
 */
export function inverseTypedSeries(data, n) {
	if (!(data instanceof Float64Array)) {
		throw new TypeError('data must be a Float64Array')
	}
	if (typeof n !== 'number') {
		throw new TypeError('n must be a positive integer')
	}
	if (!Number.isInteger(n) || n < 1) {
		throw new RangeError('n must be a positive integer')
	}

	const size = n * n
	if (!Number.isSafeInteger(size)) {
		throw new RangeError('n * n exceeds MAX_SAFE_INTEGER')
	}
	if (data.length % size !== 0) {
		throw new RangeError(
			`data.length (${data.length}) must be a multiple of n * n (${size})`
		)
	}

	const out = new Float64Array(data.length)
	if (data.length === 0) {
		return out
	}

	if (n === 1) {
		for (let i = 0; i < data.length; i++) {
			const a = data[i]
			if (!Number.isFinite(a) || a === 0) {
				throw new RangeError(`Matrix at index ${i} is singular`)
			}
			const inv = 1 / a
			if (!Number.isFinite(inv)) {
				throw new RangeError(`Matrix at index ${i} is singular`)
			}
			out[i] = inv + 0
		}
		return out
	}

	if (n === 2) {
		const tol2 = Number.EPSILON * 64
		for (let offset = 0, m = 0; offset < data.length; offset += 4, m++) {
			const a = data[offset]
			const b = data[offset + 1]
			const c = data[offset + 2]
			const d = data[offset + 3]

			if (
				!Number.isFinite(a) ||
				!Number.isFinite(b) ||
				!Number.isFinite(c) ||
				!Number.isFinite(d)
			) {
				throw new RangeError(`Matrix at index ${m} is singular`)
			}

			const ad = a * d
			const bc = b * c
			const det = ad - bc
			const scale = Math.max(Math.abs(ad), Math.abs(bc))

			if (
				!Number.isFinite(det) ||
				det === 0 ||
				Math.abs(det) <= scale * tol2
			) {
				throw new RangeError(`Matrix at index ${m} is singular`)
			}

			const invDet = 1 / det
			const o0 = d * invDet + 0
			const o1 = -b * invDet + 0
			const o2 = -c * invDet + 0
			const o3 = a * invDet + 0

			if (
				!Number.isFinite(o0) ||
				!Number.isFinite(o1) ||
				!Number.isFinite(o2) ||
				!Number.isFinite(o3)
			) {
				throw new RangeError(`Matrix at index ${m} is singular`)
			}

			out[offset] = o0
			out[offset + 1] = o1
			out[offset + 2] = o2
			out[offset + 3] = o3
		}
		return out
	}

	// Gauss-Jordan elimination with partial pivoting for n >= 3
	const work = new Float64Array(size)
	const inv = new Float64Array(size)
	const rowScale = new Float64Array(n)
	const tol = n * Number.EPSILON * 64

	for (let offset = 0, m = 0; offset < data.length; offset += size, m++) {
		inv.fill(0)

		for (let r = 0; r < n; r++) {
			const rowOff = r * n
			let maxAbs = 0
			for (let c = 0; c < n; c++) {
				const v = data[offset + rowOff + c]
				if (!Number.isFinite(v)) {
					throw new RangeError(`Matrix at index ${m} is singular`)
				}
				work[rowOff + c] = v
				const av = Math.abs(v)
				if (av > maxAbs) {
					maxAbs = av
				}
			}
			if (maxAbs === 0) {
				throw new RangeError(`Matrix at index ${m} is singular`)
			}
			rowScale[r] = maxAbs
			inv[rowOff + r] = 1
		}

		for (let col = 0; col < n; col++) {
			// Partial pivoting: choose row >= col with largest |work[r, col]|
			let pivotRow = col
			let maxPivot = Math.abs(work[col * n + col])
			for (let r = col + 1; r < n; r++) {
				const v = Math.abs(work[r * n + col])
				if (v > maxPivot) {
					maxPivot = v
					pivotRow = r
				}
			}

			const pivotVal = work[pivotRow * n + col]
			if (
				!Number.isFinite(pivotVal) ||
				maxPivot === 0 ||
				maxPivot <= rowScale[pivotRow] * tol
			) {
				throw new RangeError(`Matrix at index ${m} is singular`)
			}

			const colRowOff = col * n
			if (pivotRow !== col) {
				const pivRowOff = pivotRow * n
				for (let c = col; c < n; c++) {
					const tmp = work[colRowOff + c]
					work[colRowOff + c] = work[pivRowOff + c]
					work[pivRowOff + c] = tmp
				}
				for (let c = 0; c < n; c++) {
					const tmp = inv[colRowOff + c]
					inv[colRowOff + c] = inv[pivRowOff + c]
					inv[pivRowOff + c] = tmp
				}
				const tmpScale = rowScale[col]
				rowScale[col] = rowScale[pivotRow]
				rowScale[pivotRow] = tmpScale
			}

			// Normalize pivot row
			const invPivot = 1 / pivotVal
			if (!Number.isFinite(invPivot)) {
				throw new RangeError(`Matrix at index ${m} is singular`)
			}
			work[colRowOff + col] = 1
			for (let c = col + 1; c < n; c++) {
				work[colRowOff + c] *= invPivot
			}
			for (let c = 0; c < n; c++) {
				inv[colRowOff + c] *= invPivot
			}
			rowScale[col] *= Math.abs(invPivot)

			// Eliminate column `col` in all other rows
			for (let r = 0; r < n; r++) {
				if (r === col) continue
				const rOff = r * n
				const factor = work[rOff + col]
				if (factor === 0) continue

				work[rOff + col] = 0
				for (let c = col + 1; c < n; c++) {
					work[rOff + c] -= factor * work[colRowOff + c]
				}
				for (let c = 0; c < n; c++) {
					inv[rOff + c] -= factor * inv[colRowOff + c]
				}
				if (r > col) {
					const scaled = Math.abs(factor) * rowScale[col]
					if (scaled > rowScale[r]) {
						rowScale[r] = scaled
					}
				}
			}
		}

		for (let i = 0; i < size; i++) {
			const v = inv[i]
			if (!Number.isFinite(v)) {
				throw new RangeError(`Matrix at index ${m} is singular`)
			}
			out[offset + i] = v + 0
		}
	}

	return out
}
