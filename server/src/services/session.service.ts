import jwt, { type JwtPayload } from 'jsonwebtoken';

/**
 * Generates a signed JWT token with the given payload.
 *
 * @param payload - Data to encode in the token
 * @param secret - Signing secret
 * @param expiry - Expiration duration (e.g., '24h', '7d')
 * @returns The signed JWT string
 */
export function generateToken(
  payload: Record<string, unknown>,
  secret: string,
  expiry: string,
): string {
  return jwt.sign(payload, secret, { expiresIn: expiry as any });
}

/**
 * Verifies a JWT token and returns its decoded payload.
 *
 * @param token - The JWT token string to verify
 * @param secret - The signing secret used to verify
 * @returns The decoded payload
 * @throws If the token is invalid or expired
 */
export function verifyToken(token: string, secret: string): JwtPayload {
  const decoded = jwt.verify(token, secret);
  if (typeof decoded === 'string') {
    return { sub: decoded } as JwtPayload;
  }
  return decoded;
}
