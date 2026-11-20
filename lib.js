export function add(a, b) {
	return a + b
}

export function matMul(A, B) {
	if (!Array.isArray(A) || !Array.isArray(B)) {
		throw new TypeError('Matrices A and B must be 2D arrays')
	}
	const m = A.length
	const bRows = B.length
	if (m === 0 || bRows === 0) {
		throw new Error('Matrices must be non-empty')
	}
	if (!Array.isArray(A[0]) || !Array.isArray(B[0])) {
		throw new TypeError('Matrices A and B must be 2D arrays')
	}
	const k = A[0].length
	const n = B[0].length
	if (k === 0 || n === 0) {
		throw new Error('Matrix rows must be non-empty')
	}
	for (let i = 0; i < m; i++) {
		if (!Array.isArray(A[i]) || A[i].length !== k) {
			throw new Error('Matrix A must be rectangular')
		}
	}
	for (let i = 0; i < bRows; i++) {
		if (!Array.isArray(B[i]) || B[i].length !== n) {
			throw new Error('Matrix B must be rectangular')
		}
	}
	if (k !== bRows) {
		throw new Error(`Dimension mismatch: cannot multiply ${m}x${k} matrix by ${bRows}x${n} matrix`)
	}

	const result = Array.from({ length: m }, () => new Array(n).fill(0))
	for (let i = 0; i < m; i++) {
		const rowA = A[i]
		const rowR = result[i]
		for (let p = 0; p < k; p++) {
			const aip = rowA[p]
			if (aip === 0) continue
			const rowB = B[p]
			for (let j = 0; j < n; j++) {
				rowR[j] += aip * rowB[j]
			}
		}
	}
	return result
}
