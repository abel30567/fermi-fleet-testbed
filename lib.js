export function add(a, b) {
	return a + b
}

export function gradient2(f, x, y, h = 1e-5) {
	const dfdx = (f(x + h, y) - f(x - h, y)) / (2 * h)
	const dfdy = (f(x, y + h) - f(x, y - h)) / (2 * h)
	return [dfdx, dfdy]
}
