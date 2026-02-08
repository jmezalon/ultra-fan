import jwt from "jsonwebtoken";
import { Role } from "./types.js";

const jwtSecret = process.env.JWT_SECRET ?? "dev-jwt-secret";
const playbackSecret = process.env.PLAYBACK_SECRET ?? "dev-playback-secret";

export interface AuthClaims {
  sub: string;
  role: Role;
  organizationId: string | null;
}

export function signAccessToken(claims: AuthClaims): string {
  return jwt.sign(claims, jwtSecret, { expiresIn: "2h" });
}

export function verifyAccessToken(token: string): AuthClaims {
  return jwt.verify(token, jwtSecret) as AuthClaims;
}

export function signPlaybackToken(input: {
  userId: string;
  eventId: string;
  expiresInSec: number;
}): string {
  return jwt.sign(
    {
      sub: input.userId,
      eventId: input.eventId,
      tokenType: "playback",
    },
    playbackSecret,
    { expiresIn: input.expiresInSec },
  );
}
