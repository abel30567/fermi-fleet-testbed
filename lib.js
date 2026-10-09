export function add(a, b) {
	return a + b
}

function checkMatrix(m, name) {
	if (!Array.isArray(m) || m.length === 0 || !Array.isArray(m[0]) || m[0].length === 0) {
		throw new RangeError(`${name} must be a non-empty matrix`)
	}
	const cols = m[0].length
	for (const row of m) {
		if (!Array.isArray(row) || row.length !== cols) {
			throw new RangeError(`${name} is ragged`)
		}
	}
	return cols
}

export function matMul(a, b) {
	const n = checkMatrix(a, 'a')
	const p = checkMatrix(b, 'b')
	if (n !== b.length) {
		throw new RangeError(`inner dimensions do not match: ${n} !== ${b.length}`)
	}
	return a.map((row) => {
		const out = new Array(p).fill(0)
		for (let k = 0; k < n; k++) {
			for (let j = 0; j < p; j++) {
				out[j] += row[k] * b[k][j]
			}
		}
		return out
	})
}
