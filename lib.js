export function add(a, b) {
	return a + b
}

// Moment about the x-axis: double integral of y * density(x, y) over [ax, bx] x [ay, by].
export function momentX2(density, ax, bx, ay, by, n = 100) {
	const hx = (bx - ax) / n
	const hy = (by - ay) / n
	let sum = 0
	for (let i = 0; i < n; i++) {
		const x = ax + (i + 0.5) * hx
		for (let j = 0; j < n; j++) {
			const y = ay + (j + 0.5) * hy
			sum += y * density(x, y) * hx * hy
		}
	}
	return sum
}
