export function add(a, b) {
	return a + b
}

export function partialY(f, x, y, h = 1e-5) {
	return (f(x, y + h) - f(x, y - h)) / (2 * h)
}
