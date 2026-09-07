export function add(a, b) {
	return a + b
}

export function taylor2Second(f, x0, y0, x, y, h = 1e-4) {
	const f00 = f(x0, y0)
	const fx = (f(x0 + h, y0) - f(x0 - h, y0)) / (2 * h)
	const fy = (f(x0, y0 + h) - f(x0, y0 - h)) / (2 * h)
	const fxx = (f(x0 + h, y0) - 2 * f00 + f(x0 - h, y0)) / (h * h)
	const fyy = (f(x0, y0 + h) - 2 * f00 + f(x0, y0 - h)) / (h * h)
	const fxy =
		(f(x0 + h, y0 + h) - f(x0 + h, y0 - h) - f(x0 - h, y0 + h) + f(x0 - h, y0 - h)) /
		(4 * h * h)

	const dx = x - x0
	const dy = y - y0

	return (
		f00 +
		fx * dx +
		fy * dy +
		0.5 * fxx * dx * dx +
		fxy * dx * dy +
		0.5 * fyy * dy * dy
	)
}
