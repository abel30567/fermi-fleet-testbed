export function add(a, b) {
	return a + b
}

export function laplacian2(f, x, y, h = 1e-4) {
	const fxx = (f(x + h, y) - 2 * f(x, y) + f(x - h, y)) / (h * h)
	const fyy = (f(x, y + h) - 2 * f(x, y) + f(x, y - h)) / (h * h)
	return fxx + fyy
}
