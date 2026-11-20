export function add(a, b) {
	return a + b
}

export function matRank(A, tol = 1e-9) {
	if (!Array.isArray(A)) {
		throw new TypeError('A must be a 2D array of numbers')
	}
	if (typeof tol !== 'number' || Number.isNaN(tol) || tol < 0) {
		throw new RangeError('tol must be a non-negative number')
	}
	const m = A.length
	if (m === 0) return 0
	if (!Array.isArray(A[0])) {
		throw new TypeError('A must be a 2D array of numbers')
	}
	const n = A[0].length
	const M = new Array(m)
	for (let i = 0; i < m; i++) {
		const row = A[i]
		if (!Array.isArray(row) || row.length !== n) {
			throw new RangeError('All rows in A must be arrays of the same length')
		}
		const copy = new Array(n)
		for (let j = 0; j < n; j++) {
			const val = row[j]
			if (typeof val !== 'number' || !Number.isFinite(val)) {
				throw new TypeError('Matrix entries must be finite numbers')
			}
			copy[j] = val
		}
		M[i] = copy
	}
	if (n === 0) return 0

	let rank = 0
	for (let col = 0; col < n && rank < m; col++) {
		let pivotRow = rank
		let maxVal = Math.abs(M[rank][col])
		for (let r = rank + 1; r < m; r++) {
			const v = Math.abs(M[r][col])
			if (v > maxVal) {
				maxVal = v
				pivotRow = r
			}
		}
		if (maxVal <= tol) continue
		if (pivotRow !== rank) {
			const tmp = M[rank]
			M[rank] = M[pivotRow]
			M[pivotRow] = tmp
		}
		const pivot = M[rank][col]
		for (let r = rank + 1; r < m; r++) {
			const factor = M[r][col] / pivot
			if (factor === 0) continue
			M[r][col] = 0
			for (let c = col + 1; c < n; c++) {
				M[r][c] -= factor * M[rank][c]
			}
		}
		rank++
	}
	return rank
}
