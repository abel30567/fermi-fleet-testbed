export function add(a, b) {
	return a + b
}

export function polyEval(coeffs, x) {
	if (!Array.isArray(coeffs)) {
		throw new TypeError('coeffs must be an array')
	}
	if (coeffs.length === 0) {
		return 0
	}
	let result = coeffs[coeffs.length - 1]
	for (let i = coeffs.length - 2; i >= 0; i--) {
		result = result * x + coeffs[i]
	}
	return result
}
