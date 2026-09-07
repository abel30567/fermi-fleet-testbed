export function add(a, b) {
	return a + b
}

export function normalize(v) {
	const [x, y, z] = v
	const length = Math.sqrt(x * x + y * y + z * z)
	if (length === 0) {
		throw new RangeError('Cannot normalize a zero vector')
	}
	return [x / length, y / length, z / length]
}
