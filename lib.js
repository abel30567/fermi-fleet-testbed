export function add(a, b) {
	return a + b
}

export function convolve1D(a, b) {
	if (!Array.isArray(a) || !Array.isArray(b)) {
		throw new TypeError('Inputs a and b must be arrays')
	}
	if (a.length === 0 || b.length === 0) {
		return []
	}
	const result = new Array(a.length + b.length - 1).fill(0)
	for (let i = 0; i < a.length; i++) {
		const ai = a[i]
		for (let j = 0; j < b.length; j++) {
			result[i + j] += ai * b[j]
		}
	}
	return result
}
