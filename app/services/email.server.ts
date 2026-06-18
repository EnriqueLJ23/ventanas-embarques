import { msalClient } from "~/lib/microsoft.server";

async function getAppAccessToken(): Promise<string> {
  const result = await msalClient.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });
  if (!result?.accessToken) throw new Error("Failed to acquire app access token");
  return result.accessToken;
}

export async function sendEmail({
  fromEmail,
  subject,
  toAddresses,
  ccAddresses = [],
  bodyHtml,
  attachments = [],
}: {
  fromEmail: string;
  subject: string;
  toAddresses: string[];
  ccAddresses?: string[];
  bodyHtml: string;
  attachments?: { name: string; contentType: string; contentBase64: string }[];
}) {
  const token = await getAppAccessToken();

  const message: Record<string, unknown> = {
    subject,
    body: { contentType: "HTML", content: bodyHtml },
    toRecipients: toAddresses.map((a) => ({ emailAddress: { address: a } })),
    ccRecipients: ccAddresses.map((a) => ({ emailAddress: { address: a } })),
  };

  if (attachments.length > 0) {
    message.attachments = attachments.map((a) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: a.name,
      contentType: a.contentType,
      contentBytes: a.contentBase64,
      isInline: false,
    }));
  }

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromEmail)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph sendMail failed (${res.status}): ${text}`);
  }
}
