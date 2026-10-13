export function add(a, b) {
	return a + b
}

function _scale2DMatVec(m, v) {
	return [m[0][0] * v[0] + m[0][1] * v[1], m[1][0] * v[0] + m[1][1] * v[1]]
}

export function scale2D(v, sx, sy) {
	return _scale2DMatVec([[sx, 0], [0, sy]], v)
}
