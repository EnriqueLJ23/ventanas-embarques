import { redirect, Form } from "react-router";
import { Warehouse } from "lucide-react";

import { msalClient, REDIRECT_URI } from "~/lib/microsoft.server";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

export async function action() {
  const authUrl = await msalClient.getAuthCodeUrl({
    scopes: ["User.Read"],
    redirectUri: REDIRECT_URI,
  });

  return redirect(authUrl);
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Warehouse className="size-5" />
          </div>
          <CardTitle className="mt-2">Ventanas de Embarque</CardTitle>
          <CardDescription>Inicia sesión para continuar</CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="post">
            <Button type="submit" className="w-full">
              Iniciar sesión con Microsoft
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
