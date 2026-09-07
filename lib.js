export function add(a, b) {
	return a + b
}

export function secondDerivativeTest(f, x0, y0, h = 1e-4) {
	const fxx = (f(x0 + h, y0) - 2 * f(x0, y0) + f(x0 - h, y0)) / (h * h)
	const fyy = (f(x0, y0 + h) - 2 * f(x0, y0) + f(x0, y0 - h)) / (h * h)
	const fxy = (f(x0 + h, y0 + h) - f(x0 + h, y0 - h) - f(x0 - h, y0 + h) + f(x0 - h, y0 - h)) / (4 * h * h)

	const D = fxx * fyy - fxy * fxy

	if (D < 0) return 'saddle'
	if (D === 0) return 'inconclusive'
	return fxx > 0 ? 'min' : 'max'
}
