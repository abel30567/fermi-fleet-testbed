export function add(a, b) {
	return a + b
}

function _rotate2DMatVec(m, v) {
	return [m[0][0] * v[0] + m[0][1] * v[1], m[1][0] * v[0] + m[1][1] * v[1]]
}

export function rotate2D(v, theta) {
	const c = Math.cos(theta)
	const s = Math.sin(theta)
	return _rotate2DMatVec([[c, -s], [s, c]], v)
}
