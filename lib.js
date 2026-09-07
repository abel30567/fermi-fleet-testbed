export function add(a, b) {
	return a + b
}

export function secondPartialYY(f, x, y, h = 1e-4) {
	return (f(x, y + h) - 2 * f(x, y) + f(x, y - h)) / (h * h)
}
