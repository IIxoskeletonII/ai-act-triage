// Talking to the server: a streamed assessment and the small status/outline lookups.

export async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} failed (${res.status}).`);
  return res.json();
}

// POST /api/assess and read its newline-delimited JSON stream. Progress events go to onEvent;
// the promise resolves with the verdict payload.
export async function assess(body, { onEvent, signal }) {
  let res;
  try {
    res = await fetch("/api/assess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new Error("Could not reach the server. Is app.py still running?");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `The request failed (${res.status}).`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const event = JSON.parse(line);
      if (event.type === "result") result = event.data;
      else if (event.type === "error") throw new Error(event.message);
      else onEvent(event);
    }
  }
  if (!result) throw new Error("The connection closed before the assessment finished. Try again.");
  return result;
}
