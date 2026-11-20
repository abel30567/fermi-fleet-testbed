export function add(a, b) {
	return a + b
}

export function taylorExp(x, terms = 20) {
	if (typeof x !== 'number' || Number.isNaN(x)) {
		return NaN
	}
	if (!Number.isInteger(terms) || terms < 0) {
		throw new RangeError('terms must be a non-negative integer')
	}
	if (terms === 0) {
		return 0
	}
	let sum = 1
	let term = 1
	for (let k = 1; k < terms; k++) {
		term = (term * x) / k
		if (term === 0) {
			break
		}
		sum += term
	}
	return sum
}
