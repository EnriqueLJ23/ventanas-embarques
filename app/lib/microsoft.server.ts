import { ConfidentialClientApplication } from "@azure/msal-node";

const msalConfig = {
  auth: {
    clientId: process.env.MICROSOFT_CLIENT_ID!,

    authority: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}`,

    clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
  },
};

// Requires the Microsoft Graph application permission "User.Read.All"
// (or "People.Read.All") with admin consent granted in Azure AD, in
// addition to the existing "Mail.Send" application permission, for
// GET /api/users/search (app/routes/api/users.search.ts) to work.
export const msalClient = new ConfidentialClientApplication(msalConfig);

export const REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI!;

export async function getAppAccessToken(): Promise<string> {
  const result = await msalClient.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });
  if (!result?.accessToken) throw new Error("Failed to acquire app access token");
  return result.accessToken;
}
