export function add(a, b) {
	return a + b
}

export function normalizeN(v) {
	const magnitude = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0))
	if (magnitude === 0) {
		throw new RangeError('Cannot normalize a zero vector')
	}
	return v.map((x) => x / magnitude)
}
