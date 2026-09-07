export function add(a, b) {
	return a + b
}

// Vector triple product u x (v x w), using the BAC-CAB identity:
// u x (v x w) = v * (u . w) - w * (u . v)
export function vectorTriple(u, v, w) {
	const uw = u[0] * w[0] + u[1] * w[1] + u[2] * w[2]
	const uv = u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
	return [
		v[0] * uw - w[0] * uv,
		v[1] * uw - w[1] * uv,
		v[2] * uw - w[2] * uv,
	]
}
