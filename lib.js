export function add(a, b) {
	return a + b
}

function _composeMatMul(a, b) {
	return [
		[a[0][0] * b[0][0] + a[0][1] * b[1][0], a[0][0] * b[0][1] + a[0][1] * b[1][1]],
		[a[1][0] * b[0][0] + a[1][1] * b[1][0], a[1][0] * b[0][1] + a[1][1] * b[1][1]]
	]
}

export function composeTransforms(...matrices) {
	if (matrices.length === 0) throw new Error('composeTransforms: at least one matrix is required')
	return matrices.reduce((acc, m) => _composeMatMul(acc, m))
}
