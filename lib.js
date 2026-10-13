export function add(a, b) {
	return a + b
}

function _reflect2DMatVec(m, v) {
	return [m[0][0] * v[0] + m[0][1] * v[1], m[1][0] * v[0] + m[1][1] * v[1]]
}

export function reflect2D(v, axis) {
	let m
	if (axis === 'x') m = [[1, 0], [0, -1]]
	else if (axis === 'y') m = [[-1, 0], [0, 1]]
	else if (axis === 'y=x') m = [[0, 1], [1, 0]]
	else throw new Error('reflect2D: unknown axis ' + axis)
	return _reflect2DMatVec(m, v)
}
