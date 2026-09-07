export function add(a, b) {
	return a + b
}

// m is a 3x3 matrix given as an array of 3 row arrays; v is a 3-vector.
export function matVec3(m, v) {
	return [
		m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
		m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
		m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
	]
}
