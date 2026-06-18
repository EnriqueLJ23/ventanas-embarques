import { createCookieSessionStorage, redirect } from "react-router";

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
