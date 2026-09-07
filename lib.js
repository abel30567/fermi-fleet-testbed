export function add(a, b) {
	return a + b
}

export function fivePointPartialX(f, x, y, h = 1e-3) {
	return (-f(x + 2 * h, y) + 8 * f(x + h, y) - 8 * f(x - h, y) + f(x - 2 * h, y)) / (12 * h)
}
