export function add(a, b) {
	return a + b
}

export function curl3(P, Q, R, x, y, z, h = 1e-5) {
	const dRdy = (R(x, y + h, z) - R(x, y - h, z)) / (2 * h)
	const dQdz = (Q(x, y, z + h) - Q(x, y, z - h)) / (2 * h)
	const dPdz = (P(x, y, z + h) - P(x, y, z - h)) / (2 * h)
	const dRdx = (R(x + h, y, z) - R(x - h, y, z)) / (2 * h)
	const dQdx = (Q(x + h, y, z) - Q(x - h, y, z)) / (2 * h)
	const dPdy = (P(x, y + h, z) - P(x, y - h, z)) / (2 * h)
	return [dRdy - dQdz, dPdz - dRdx, dQdx - dPdy]
}
