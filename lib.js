export function add(a, b) {
	return a + b
}

export function bilinearInterpolate(x, y, x0, x1, y0, y1, q00, q10, q01, q11) {
	if (x1 === x0) {
		throw new RangeError('x0 and x1 must not be equal')
	}
	if (y1 === y0) {
		throw new RangeError('y0 and y1 must not be equal')
	}
	const tx = (x - x0) / (x1 - x0)
	const ty = (y - y0) / (y1 - y0)
	const r0 = q00 * (1 - tx) + q10 * tx
	const r1 = q01 * (1 - tx) + q11 * tx
	return r0 * (1 - ty) + r1 * ty
}
