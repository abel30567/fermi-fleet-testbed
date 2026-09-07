export function add(a, b) {
	return a + b
}

export function levelCurveSlope(f, x, y, h = 1e-5) {
	const fx = (f(x + h, y) - f(x - h, y)) / (2 * h)
	const fy = (f(x, y + h) - f(x, y - h)) / (2 * h)
	if (Math.abs(fy) < 1e-8) {
		throw new RangeError('fy is approximately zero; level curve slope is undefined')
	}
	return -fx / fy
}
