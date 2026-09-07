export function add(a, b) {
	return a + b
}

export function laplaceCheck(f, x, y, tol = 1e-2, h = 1e-4) {
	const fxx = (f(x + h, y) - 2 * f(x, y) + f(x - h, y)) / (h * h)
	const fyy = (f(x, y + h) - 2 * f(x, y) + f(x, y - h)) / (h * h)
	return Math.abs(fxx + fyy) < tol
}
