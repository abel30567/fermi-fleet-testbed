export function add(a, b) {
	return a + b
}

export function partialX(f, x, y, h = 1e-5) {
	return (f(x + h, y) - f(x - h, y)) / (2 * h)
}
