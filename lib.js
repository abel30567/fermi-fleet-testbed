export function add(a, b) {
	return a + b
}

export function crossProduct(a, b) {
	if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 3 || b.length !== 3) {
		throw new Error('crossProduct requires two length-3 vectors')
	}
	return [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0],
	]
}
