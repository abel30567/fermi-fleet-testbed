export function add(a, b) {
	return a + b
}

export function secondPartialXX(f, x, y, h = 1e-4) {
	return (f(x + h, y) - 2 * f(x, y) + f(x - h, y)) / (h * h)
}
