export function add(a, b) {
	return a + b
}

// Circulation form of Green's theorem: oint P dx + Q dy = double integral over R of (Qx - Py) dA
export function greenCirculation(P, Q, ax, bx, ay, by, n = 100) {
	const h = 1e-6
	const Qx = (x, y) => (Q(x + h, y) - Q(x - h, y)) / (2 * h)
	const Py = (x, y) => (P(x, y + h) - P(x, y - h)) / (2 * h)

	const dx = (bx - ax) / n
	const dy = (by - ay) / n
	let sum = 0
	for (let i = 0; i < n; i++) {
		const x = ax + (i + 0.5) * dx
		for (let j = 0; j < n; j++) {
			const y = ay + (j + 0.5) * dy
			sum += Qx(x, y) - Py(x, y)
		}
	}
	return sum * dx * dy
}
