import { redirect, Form } from "react-router";

import { msalClient, REDIRECT_URI } from "~/lib/microsoft.server";

export async function action() {
  const authUrl = await msalClient.getAuthCodeUrl({
    scopes: ["User.Read"],
    redirectUri: REDIRECT_URI,
  });

  return redirect(authUrl);
}

export default function LoginPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-center">Iniciar sesión</h1>
      <Form method="post">
        <button
          type="submit"
          className="w-full border p-2 hover:bg-gray-50 transition-colors"
        >
          Iniciar sesión con Microsoft
        </button>
      </Form>
    </div>
  );
}
