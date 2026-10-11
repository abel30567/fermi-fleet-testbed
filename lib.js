export function add(a, b) {
	return a + b
}

export function dotProduct(a, b) {
	if (a.length !== b.length) {
		throw new Error('Vectors must have the same length')
	}
	let sum = 0
	for (let i = 0; i < a.length; i++) {
		sum += a[i] * b[i]
	}
	return sum
}
