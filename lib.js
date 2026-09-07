export function add(a, b) {
	return a + b
}

export function hessian2(f, x, y, h = 1e-4) {
	const fxx = (f(x + h, y) - 2 * f(x, y) + f(x - h, y)) / (h * h)
	const fyy = (f(x, y + h) - 2 * f(x, y) + f(x, y - h)) / (h * h)
	const fxy =
		(f(x + h, y + h) - f(x + h, y - h) - f(x - h, y + h) + f(x - h, y - h)) /
		(4 * h * h)
	const fyx =
		(f(x + h, y + h) - f(x - h, y + h) - f(x + h, y - h) + f(x - h, y - h)) /
		(4 * h * h)
	return [
		[fxx, fxy],
		[fyx, fyy],
	]
}
