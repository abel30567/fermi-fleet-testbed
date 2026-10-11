export function add(a, b) {
	return a + b
}

export function hadamardProduct(a, b) {
	if (a.length !== b.length) {
		throw new Error('Arrays must have the same length')
	}
	return a.map((v, i) => v * b[i])
}
