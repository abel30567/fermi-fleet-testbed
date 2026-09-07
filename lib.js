export function add(a, b) {
	return a + b
}

export function isCriticalPoint2(f, x, y, tol = 1e-3, h = 1e-5) {
	const fx = (f(x + h, y) - f(x - h, y)) / (2 * h)
	const fy = (f(x, y + h) - f(x, y - h)) / (2 * h)
	return Math.abs(fx) <= tol && Math.abs(fy) <= tol
}
