export function add(a, b) {
	return a + b
}

export function doubleIntegralMid(f, ax, bx, ay, by, n = 100) {
	const hx = (bx - ax) / n
	const hy = (by - ay) / n
	let sum = 0
	for (let i = 0; i < n; i++) {
		const x = ax + (i + 0.5) * hx
		for (let j = 0; j < n; j++) {
			const y = ay + (j + 0.5) * hy
			sum += f(x, y)
		}
	}
	return sum * hx * hy
}
