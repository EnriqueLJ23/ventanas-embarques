import { ConfidentialClientApplication } from "@azure/msal-node";

const msalConfig = {
  auth: {
    clientId: process.env.MICROSOFT_CLIENT_ID!,

    authority: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}`,

    clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
  },
};

export const msalClient = new ConfidentialClientApplication(msalConfig);

export const REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI!;
