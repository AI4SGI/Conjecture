export const COMMUNITY_MAX_REQUEST_BYTES = 12_000;

export function normalizeCommunityContactEmail(input: unknown) {
  const raw = String(input ?? "").trim();
  if (!raw || raw.length > 254) return null;
  const email = raw.toLowerCase();
  const parts = email.split("@");
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (
    !local
    || local.length > 64
    || local.startsWith(".")
    || local.endsWith(".")
    || local.includes("..")
    || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)
  ) return null;
  const labels = domain.split(".");
  if (
    labels.length < 2
    || labels.some((label) => (
      !label
      || label.length > 63
      || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
    ))
  ) return null;
  return email;
}

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function communityRequestFingerprint(
  request: Request,
  salt?: string,
) {
  const ip = request.headers.get("CF-Connecting-IP")
    ?? request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim()
    ?? "unknown";
  const userAgent = request.headers.get("User-Agent")?.slice(0, 240) ?? "unknown";
  const data = new TextEncoder().encode([ip, userAgent].join("\n"));
  if (salt) {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(salt),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    return bytesToHex(await crypto.subtle.sign("HMAC", key, data)).slice(0, 40);
  }
  return bytesToHex(await crypto.subtle.digest("SHA-256", data)).slice(0, 40);
}

export function communityRequestCountry(request: Request) {
  const country = request.headers.get("CF-IPCountry")?.toUpperCase() ?? "";
  if (country === "TW") return "CN";
  return /^[A-Z]{2}$/.test(country) ? country : "ZZ";
}

export function communitySecurityHeaders(headers = new Headers()) {
  headers.set("Cache-Control", "no-store");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}
