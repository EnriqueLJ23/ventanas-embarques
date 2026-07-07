import { createCookieSessionStorage, redirect } from "react-router";
import type { Role, User } from "@prisma/client";
import { prisma } from "~/lib/db.server";

type SessionData = {
  userId: number;
};

type SessionFlashData = {
  error: string;
};

const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
  throw new Error("SESSION_SECRET must be set");
}

const storage = createCookieSessionStorage<SessionData, SessionFlashData>({
  cookie: {
    name: "_session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [sessionSecret],
    secure: process.env.NODE_ENV === "production",
  },
});

export async function getSession(cookieHeader: string | null) {
  return storage.getSession(cookieHeader);
}

export async function createUserSession(userId: number, redirectTo: string) {
  const session = await storage.getSession();

  session.set("userId", userId);

  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await storage.commitSession(session),
    },
  });
}

export async function logout(request: Request) {
  const session = await getSession(request.headers.get("Cookie"));

  return redirect("/login", {
    headers: {
      "Set-Cookie": await storage.destroySession(session),
    },
  });
}

export async function requireUserId(request: Request) {
  const session = await getSession(request.headers.get("Cookie"));

  const userId = session.get("userId");

  if (!userId) {
    throw redirect("/login");
  }
  return userId;
}

export async function requireUser(
  request: Request,
  allowedRoles?: Role[]
): Promise<User> {
  const userId = await requireUserId(request);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.active) {
    throw await logout(request);
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    throw redirect("/");
  }
  return user;
}

export async function getOptionalUserId(request: Request): Promise<number | null> {
  const session = await getSession(request.headers.get("Cookie"));
  return session.get("userId") ?? null;
}
