export function add(a, b) {
	return a + b
}

function _shear2DMatVec(m, v) {
	return [m[0][0] * v[0] + m[0][1] * v[1], m[1][0] * v[0] + m[1][1] * v[1]]
}

export function shear2D(v, kx, ky) {
	return _shear2DMatVec([[1, kx], [ky, 1]], v)
}
