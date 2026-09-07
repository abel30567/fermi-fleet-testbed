export function add(a, b) {
	return a + b
}

export function matVec2(m, v) {
	return [
		m[0][0] * v[0] + m[0][1] * v[1],
		m[1][0] * v[0] + m[1][1] * v[1],
	]
}
