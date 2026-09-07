export function add(a, b) {
	return a + b
}

// Flux form of Green's theorem: double integral of (Px + Qy) dA over the
// rectangle [ax, bx] x [ay, by], evaluated via midpoint quadrature with
// central-difference partial derivatives.
export function greenFlux(P, Q, ax, bx, ay, by, n = 100) {
	const hx = (bx - ax) / n
	const hy = (by - ay) / n
	const eps = 1e-6
	let sum = 0
	for (let i = 0; i < n; i++) {
		const x = ax + (i + 0.5) * hx
		for (let j = 0; j < n; j++) {
			const y = ay + (j + 0.5) * hy
			const Px = (P(x + eps, y) - P(x - eps, y)) / (2 * eps)
			const Qy = (Q(x, y + eps) - Q(x, y - eps)) / (2 * eps)
			sum += (Px + Qy) * hx * hy
		}
	}
	return sum
}
