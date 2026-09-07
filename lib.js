export function add(a, b) {
	return a + b
}

export function mixedPartialXY(f, x, y, h = 1e-4) {
	return (
		(f(x + h, y + h) - f(x + h, y - h) - f(x - h, y + h) + f(x - h, y - h)) /
		(4 * h * h)
	)
}
