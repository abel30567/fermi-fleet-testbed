export function add(a, b) {
	return a + b
}

export function scalarTriple(u, v, w) {
	const cx = v[1] * w[2] - v[2] * w[1]
	const cy = v[2] * w[0] - v[0] * w[2]
	const cz = v[0] * w[1] - v[1] * w[0]
	return u[0] * cx + u[1] * cy + u[2] * cz
}
