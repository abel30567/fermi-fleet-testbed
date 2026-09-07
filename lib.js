export function add(a, b) {
	return a + b
}

export function projectOnto(u, v) {
	const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
	const normSq = v[0] * v[0] + v[1] * v[1] + v[2] * v[2]
	if (normSq === 0) {
		throw new RangeError('cannot project onto the zero vector')
	}
	const scale = dot / normSq
	return [scale * v[0], scale * v[1], scale * v[2]]
}
