export function add(a, b) {
	return a + b
}

export function gradientAscent2(f, x0, y0, lr = 0.1, steps = 200, h = 1e-5) {
	let x = x0
	let y = y0
	for (let i = 0; i < steps; i++) {
		const dfdx = (f(x + h, y) - f(x - h, y)) / (2 * h)
		const dfdy = (f(x, y + h) - f(x, y - h)) / (2 * h)
		x += lr * dfdx
		y += lr * dfdy
	}
	return [x, y]
}
