export function add(a, b) {
	return a + b
}

export function frobeniusNorm(A) {
	if (!Array.isArray(A)) {
		throw new TypeError('Matrix A must be a 2D array')
	}
	if (A.length === 0) {
		return 0
	}

	if (!Array.isArray(A[0])) {
		throw new TypeError('Matrix A must be a 2D array')
	}
	const cols = A[0].length

	let maxAbs = 0
	let hasNaN = false
	for (let i = 0; i < A.length; i++) {
		const row = A[i]
		if (!Array.isArray(row)) {
			throw new TypeError('Matrix A must be a 2D array')
		}
		if (row.length !== cols) {
			throw new RangeError('Matrix rows must have equal length')
		}
		for (let j = 0; j < cols; j++) {
			const val = row[j]
			if (typeof val !== 'number') {
				throw new TypeError('Matrix elements must be numbers')
			}
			if (Number.isNaN(val)) {
				hasNaN = true
			} else {
				const abs = Math.abs(val)
				if (abs > maxAbs) {
					maxAbs = abs
				}
			}
		}
	}

	if (hasNaN) {
		return NaN
	}
	if (maxAbs === 0) {
		return 0
	}
	if (!Number.isFinite(maxAbs)) {
		return Infinity
	}

	let sumSq = 0
	for (let i = 0; i < A.length; i++) {
		const row = A[i]
		for (let j = 0; j < cols; j++) {
			const scaled = row[j] / maxAbs
			sumSq += scaled * scaled
		}
	}

	return maxAbs * Math.sqrt(sumSq)
}
