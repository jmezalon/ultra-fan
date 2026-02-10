import { ChatMessage, Event, Role, User } from "../types.js";

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  role: Role;
  displayName: string;
  organizationId: string | null;
}

export interface UpdateUserProfileInput {
  displayName?: string;
  bio?: string | null;
  hometown?: string | null;
  profileImageUrl?: string | null;
  websiteUrl?: string | null;
}

export interface CreateEventInput {
  artistUserId: string;
  organizationId: string | null;
  title: string;
  description: string;
  venue: string;
  startsAt: string;
  durationMin: number;
  priceUsd: number;
  replayHours: number;
  published: boolean;
  imageUrl?: string;
}

export interface CreateTicketInput {
  userId: string;
  eventId: string;
}

export interface CreateChatMessageInput {
  eventId: string;
  userId: string;
  userDisplayName: string;
  body: string;
}

export interface ListChatMessagesInput {
  eventId: string;
  since?: string;
  limit?: number;
}

export interface Repository {
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(userId: string): Promise<User | null>;
  createUser(input: CreateUserInput): Promise<User>;
  updateUserProfile(userId: string, patch: UpdateUserProfileInput): Promise<User | null>;

  listPublishedEvents(): Promise<Event[]>;
  listPublishedEventsByArtist(artistUserId: string): Promise<Event[]>;
  findEventById(eventId: string): Promise<Event | null>;
  createEvent(input: CreateEventInput): Promise<Event>;
  updateEvent(eventId: string, patch: Partial<Event>): Promise<Event | null>;

  hasTicket(userId: string, eventId: string): Promise<boolean>;
  createTicket(input: CreateTicketInput): Promise<void>;
  listLibraryEvents(userId: string): Promise<Event[]>;

  createChatMessage(input: CreateChatMessageInput): Promise<ChatMessage>;
  listChatMessages(input: ListChatMessagesInput): Promise<ChatMessage[]>;
  deleteChatMessagesOlderThan(cutoffIso: string): Promise<number>;
}
