import { msalClient } from "~/lib/microsoft.server";

async function getAppAccessToken(): Promise<string> {
  const result = await msalClient.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });
  if (!result?.accessToken) throw new Error("Failed to acquire app access token");
  return result.accessToken;
}

export async function sendReminderEmail({
  fromEmail,
  subject,
  toAddresses,
  ccAddresses,
  bodyHtml,
  attachments,
}: {
  fromEmail: string;
  subject: string;
  toAddresses: string[];
  ccAddresses: string[];
  bodyHtml: string;
  attachments: { name: string; contentType: string; contentBase64: string }[];
}) {
  const token = await getAppAccessToken();

  // Extract embedded data-URI images from body, replace with CID references
  type InlineAttachment = {
    "@odata.type": string;
    name: string;
    contentType: string;
    contentBytes: string;
    isInline: true;
    contentId: string;
  };
  const inlineAttachments: InlineAttachment[] = [];
  let imgIdx = 0;
  const processedBody = bodyHtml.replace(
    /(<img\b[^>]*?\bsrc=")data:([^;]+);base64,([^"]+)(")/gi,
    (match, prefix, contentType, base64, suffix) => {
      const contentId = `inline-img-${imgIdx++}`;
      const nameMatch = match.match(/data-name="([^"]+)"/i);
      const ext = (contentType.split("/")[1] ?? "png").split("+")[0];
      const name = nameMatch?.[1] ?? `image-${imgIdx}.${ext}`;
      inlineAttachments.push({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name,
        contentType,
        contentBytes: base64,
        isInline: true,
        contentId,
      });
      return `${prefix}cid:${contentId}${suffix}`;
    }
  );

  const message: Record<string, unknown> = {
    subject,
    body: { contentType: "HTML", content: processedBody },
    toRecipients: toAddresses.map((a) => ({ emailAddress: { address: a } })),
    ccRecipients: ccAddresses.map((a) => ({ emailAddress: { address: a } })),
  };

  const allAttachments = [
    ...attachments.map((a) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: a.name,
      contentType: a.contentType,
      contentBytes: a.contentBase64,
      isInline: false,
    })),
    ...inlineAttachments,
  ];

  if (allAttachments.length > 0) {
    message.attachments = allAttachments;
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

export async function searchEntraUsers(
  query: string
): Promise<{ name: string; email: string }[]> {
  if (!query || query.length < 2) return [];

  const token = await getAppAccessToken();

  // $search and $filter cannot be combined; $search with ConsistencyLevel covers active users well enough
  const url = new URL("https://graph.microsoft.com/v1.0/users");
  url.searchParams.set(
    "$search",
    `"displayName:${query}" OR "mail:${query}" OR "userPrincipalName:${query}"`
  );
  url.searchParams.set("$select", "displayName,mail,userPrincipalName");
  url.searchParams.set("$top", "10");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      ConsistencyLevel: "eventual",
    },
  });

  if (!res.ok) {
    console.error(`[contacts search] Graph API error ${res.status}:`, await res.text());
    return [];
  }

  const data = (await res.json()) as {
    value: { displayName: string; mail: string; userPrincipalName: string }[];
  };

  return (data.value ?? [])
    .filter((u) => u.mail || u.userPrincipalName)
    .map((u) => ({
      name: u.displayName ?? u.mail ?? u.userPrincipalName,
      email: u.mail || u.userPrincipalName,
    }));
}
