export function add(a, b) {
	return a + b
}

export function angleBetween(u, v) {
	const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
	const magU = Math.sqrt(u[0] ** 2 + u[1] ** 2 + u[2] ** 2)
	const magV = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2)
	if (magU === 0 || magV === 0) {
		throw new RangeError('angleBetween: zero vector has no defined angle')
	}
	const cos = Math.min(1, Math.max(-1, dot / (magU * magV)))
	return Math.acos(cos)
}
