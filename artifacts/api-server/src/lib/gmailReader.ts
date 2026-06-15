const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const INITIAL_SYNC_DAYS = 30;
const INITIAL_SYNC_MAX = 200;
const FETCH_BATCH = 5;

export interface GmailMessage {
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
}

interface GmailProfileResponse {
  emailAddress: string;
  historyId: string;
}

interface GmailMessagesListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate: number;
}

interface GmailMessageMetadata {
  id: string;
  threadId: string;
  snippet: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
  };
  internalDate: string;
}

interface GmailHistoryResponse {
  history?: Array<{
    id: string;
    messagesAdded?: Array<{ message: { id: string; threadId: string } }>;
  }>;
  historyId: string;
  nextPageToken?: string;
}

async function gmailGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gmail API ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export async function getGmailProfile(token: string): Promise<{ historyId: string; email: string }> {
  const profile = await gmailGet<GmailProfileResponse>(token, "/profile");
  return { historyId: profile.historyId, email: profile.emailAddress };
}

function getHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

async function fetchMessageMetadata(
  token: string,
  id: string,
  threadId: string,
): Promise<GmailMessage | null> {
  try {
    const msg = await gmailGet<GmailMessageMetadata>(
      token,
      `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
    );
    const headers = msg.payload?.headers ?? [];
    const subject = getHeader(headers, "Subject") || "(no subject)";
    const from = getHeader(headers, "From");
    const to = getHeader(headers, "To");
    const dateHeader = getHeader(headers, "Date");

    let date: string;
    try {
      const d = dateHeader
        ? new Date(dateHeader)
        : new Date(parseInt(msg.internalDate, 10));
      date = isNaN(d.getTime())
        ? new Date().toISOString().slice(0, 10)
        : d.toISOString().slice(0, 10);
    } catch {
      date = new Date().toISOString().slice(0, 10);
    }

    return {
      messageId: msg.id,
      threadId: msg.threadId ?? threadId,
      subject,
      from,
      to,
      date,
      snippet: msg.snippet ?? "",
    };
  } catch {
    return null;
  }
}

async function batchFetchMetadata(
  token: string,
  ids: Array<{ id: string; threadId: string }>,
): Promise<GmailMessage[]> {
  const results: GmailMessage[] = [];
  for (let i = 0; i < ids.length; i += FETCH_BATCH) {
    const batch = ids.slice(i, i + FETCH_BATCH);
    const settled = await Promise.allSettled(
      batch.map((m) => fetchMessageMetadata(token, m.id, m.threadId)),
    );
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value) results.push(r.value);
    }
  }
  return results;
}

export async function fetchRecentMessages(token: string): Promise<GmailMessage[]> {
  const query = `newer_than:${INITIAL_SYNC_DAYS}d`;
  const list = await gmailGet<GmailMessagesListResponse>(
    token,
    `/messages?q=${encodeURIComponent(query)}&maxResults=${INITIAL_SYNC_MAX}`,
  );
  if (!list.messages?.length) return [];
  return batchFetchMetadata(token, list.messages);
}

export async function fetchHistoryMessages(
  token: string,
  startHistoryId: string,
): Promise<{ messages: GmailMessage[]; newHistoryId: string }> {
  const allIds: Array<{ id: string; threadId: string }> = [];
  let pageToken: string | undefined;
  let finalHistoryId = startHistoryId;

  do {
    const path =
      `/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded&maxResults=100` +
      (pageToken ? `&pageToken=${pageToken}` : "");
    const hist = await gmailGet<GmailHistoryResponse>(token, path);
    finalHistoryId = hist.historyId ?? finalHistoryId;
    for (const entry of hist.history ?? []) {
      for (const added of entry.messagesAdded ?? []) {
        allIds.push({ id: added.message.id, threadId: added.message.threadId });
      }
    }
    pageToken = hist.nextPageToken;
  } while (pageToken);

  const messages = allIds.length > 0 ? await batchFetchMetadata(token, allIds) : [];
  return { messages, newHistoryId: finalHistoryId };
}
