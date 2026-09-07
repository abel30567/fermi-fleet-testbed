export function add(a, b) {
	return a + b
}

export function divergence3(P, Q, R, x, y, z, h = 1e-5) {
	const dPdx = (P(x + h, y, z) - P(x - h, y, z)) / (2 * h)
	const dQdy = (Q(x, y + h, z) - Q(x, y - h, z)) / (2 * h)
	const dRdz = (R(x, y, z + h) - R(x, y, z - h)) / (2 * h)
	return dPdx + dQdy + dRdz
}
