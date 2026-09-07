export function add(a, b) {
	return a + b
}

export function gradientNorm2(f, x, y, h = 1e-5) {
	const df_dx = (f(x + h, y) - f(x - h, y)) / (2 * h)
	const df_dy = (f(x, y + h) - f(x, y - h)) / (2 * h)
	return Math.sqrt(df_dx * df_dx + df_dy * df_dy)
}
