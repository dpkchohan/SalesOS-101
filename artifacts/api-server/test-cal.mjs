import { ReplitConnectors } from "@replit/connectors-sdk";
const c = new ReplitConnectors();
try {
  const r = await c.proxy("google-calendar", "/calendar/v3/users/me/calendarList?maxResults=1", { method: "GET" });
  console.log("status", r.status);
  const body = await r.text();
  console.log("body", body.slice(0, 800));
} catch (e) {
  console.error("ERR", e?.message);
}
try {
  const r2 = await c.proxy("google-calendar", "/calendar/v3/calendars/primary", { method: "GET" });
  console.log("primary status", r2.status);
  console.log("primary body", (await r2.text()).slice(0, 400));
} catch (e) { console.error("ERR2", e?.message); }
