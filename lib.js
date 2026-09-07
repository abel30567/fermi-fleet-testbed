export function add(a, b) {
	return a + b
}

export function sqrt(n) {
	if (n < 0) {
		throw new Error('Cannot take square root of a negative number')
	}
	return Math.sqrt(n)
}
