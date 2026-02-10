export type Role = "fan" | "creator" | "org_admin" | "support_admin";

export type BroadcastState = "offline" | "ready" | "live" | "ended";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  displayName: string;
  organizationId: string | null;
  bio: string | null;
  hometown: string | null;
  profileImageUrl: string | null;
  websiteUrl: string | null;
  createdAt: string;
}

export interface Event {
  id: string;
  artistUserId: string;
  organizationId: string | null;
  title: string;
  description: string;
  venue: string;
  imageUrl: string | null;
  startsAt: string;
  durationMin: number;
  priceUsd: number;
  replayHours: number;
  published: boolean;
  ingestUrl: string;
  streamKey: string;
  broadcastState: BroadcastState;
  rehearsalActive: boolean;
  createdAt: string;
}

export interface Ticket {
  id: string;
  eventId: string;
  userId: string;
  purchasedAt: string;
}

export interface ChatMessage {
  id: string;
  eventId: string;
  userId: string;
  userDisplayName: string;
  userProfileImageUrl?: string | null;
  body: string;
  createdAt: string;
}

export interface CreatorProfile {
  userId: string;
  displayName: string;
  bio: string | null;
  hometown: string | null;
  profileImageUrl: string | null;
  websiteUrl: string | null;
}
