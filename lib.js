export function add(a, b) {
	return a + b
}

// One Newton optimization step [x, y] - H^-1 * grad for f(x, y), using
// central finite differences (step h) to estimate the gradient and Hessian.
export function newtonOptStep2(f, x, y, h = 1e-4) {
	const gx = (f(x + h, y) - f(x - h, y)) / (2 * h)
	const gy = (f(x, y + h) - f(x, y - h)) / (2 * h)

	const fxy = f(x, y)
	const fxx = (f(x + h, y) - 2 * fxy + f(x - h, y)) / (h * h)
	const fyy = (f(x, y + h) - 2 * fxy + f(x, y - h)) / (h * h)
	const fxyMixed =
		(f(x + h, y + h) - f(x + h, y - h) - f(x - h, y + h) + f(x - h, y - h)) /
		(4 * h * h)

	const det = fxx * fyy - fxyMixed * fxyMixed
	if (Math.abs(det) < 1e-8) {
		throw new RangeError('Hessian is singular')
	}

	// Inverse of [[fxx, fxyMixed], [fxyMixed, fyy]] applied to [gx, gy].
	const dx = (fyy * gx - fxyMixed * gy) / det
	const dy = (fxx * gy - fxyMixed * gx) / det

	return [x - dx, y - dy]
}
