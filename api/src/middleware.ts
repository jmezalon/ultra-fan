import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "./auth.js";
import { Role } from "./types.js";

export interface AuthedRequest extends Request {
  auth?: {
    userId: string;
    role: Role;
    organizationId: string | null;
  };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Bearer token" });
    return;
  }

  try {
    const claims = verifyAccessToken(header.slice("Bearer ".length));
    req.auth = {
      userId: claims.sub,
      role: claims.role,
      organizationId: claims.organizationId,
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(req.auth.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
