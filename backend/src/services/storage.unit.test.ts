import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildObjectPath, createUploadTicket, signMediaUrls } from "./storage.ts";

// A fake Supabase bucket. vi.mock calls are moved to the top of the file before the imports run,
// so the fake has to be created with vi.hoisted to exist by then.
const bucket = vi.hoisted(() => ({
  createSignedUploadUrl: vi.fn(),
  createSignedUrls: vi.fn(),
}));
const from = vi.hoisted(() => vi.fn(() => bucket));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ storage: { from } }),
}));

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
  vi.stubEnv("SUPABASE_STORAGE_BUCKET", "media");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  bucket.createSignedUploadUrl.mockReset();
  bucket.createSignedUrls.mockReset();
  from.mockClear();
});

const notConfigured = () => {
  vi.stubEnv("SUPABASE_URL", "");
};

describe("buildObjectPath", () => {
  it("puts the file under the user's folder with a random id and a safe name", () => {
    const path = buildObjectPath(2, "Part 1 (Booking).MP3");

    expect(path).toMatch(/^2\/[0-9a-f-]{36}-part-1-booking-.mp3$/);
  });

  it("falls back to 'file' when nothing of the name is left", () => {
    expect(buildObjectPath(2, "練習")).toMatch(/^2\/[0-9a-f-]{36}-file$/);
    expect(buildObjectPath(2, "...")).toMatch(/^2\/[0-9a-f-]{36}-file$/);
  });

  it("gives two uploads of the same file different paths", () => {
    expect(buildObjectPath(2, "part1.mp3")).not.toBe(buildObjectPath(2, "part1.mp3"));
  });
});

describe("createUploadTicket", () => {
  it("returns Supabase's signed upload URL and the object path", async () => {
    bucket.createSignedUploadUrl.mockImplementation(async (path: string) => ({
      data: { signedUrl: `https://example.supabase.co/upload/${path}?token=t`, token: "t", path },
      error: null,
    }));

    const ticket = await createUploadTicket(2, "part1.mp3");

    expect(from).toHaveBeenCalledWith("media");
    expect(ticket.path).toMatch(/^2\/[0-9a-f-]{36}-part1.mp3$/);
    expect(ticket.uploadUrl).toBe(`https://example.supabase.co/upload/${ticket.path}?token=t`);
  });

  it("throws when Supabase refuses", async () => {
    bucket.createSignedUploadUrl.mockResolvedValue({
      data: null,
      error: { message: "Bucket not found" },
    });

    await expect(createUploadTicket(2, "part1.mp3")).rejects.toThrow("Bucket not found");
  });

  it("throws when Storage isn't configured", async () => {
    notConfigured();

    await expect(createUploadTicket(2, "part1.mp3")).rejects.toThrow("not configured");
    expect(bucket.createSignedUploadUrl).not.toHaveBeenCalled();
  });
});

describe("signMediaUrls", () => {
  it("signs every distinct path in one request, for 1 hour", async () => {
    bucket.createSignedUrls.mockResolvedValue({
      data: [
        { path: "2/a.mp3", signedUrl: "https://signed/a", signedURL: "/a", error: null },
        { path: "2/b.mp3", signedUrl: "https://signed/b", signedURL: "/b", error: null },
      ],
      error: null,
    });

    const urls = await signMediaUrls(["2/a.mp3", "2/b.mp3", "2/a.mp3"]);

    expect(bucket.createSignedUrls).toHaveBeenCalledTimes(1);
    expect(bucket.createSignedUrls).toHaveBeenCalledWith(["2/a.mp3", "2/b.mp3"], 3600);
    expect(urls.get("2/a.mp3")).toBe("https://signed/a");
    expect(urls.get("2/b.mp3")).toBe("https://signed/b");
  });

  it("leaves out paths that can't be signed, such as a file that was never uploaded", async () => {
    bucket.createSignedUrls.mockResolvedValue({
      data: [
        { path: "2/a.mp3", signedUrl: "https://signed/a", signedURL: "/a", error: null },
        {
          path: "seed/x.mp3",
          signedUrl: null,
          signedURL: null,
          error: "Either the object does not exist or you do not have access to it",
        },
      ],
      error: null,
    });

    const urls = await signMediaUrls(["2/a.mp3", "seed/x.mp3"]);

    expect(urls.has("2/a.mp3")).toBe(true);
    expect(urls.has("seed/x.mp3")).toBe(false);
  });

  it("returns no URLs when the request fails or throws", async () => {
    bucket.createSignedUrls.mockResolvedValueOnce({ data: null, error: { message: "Down" } });
    expect((await signMediaUrls(["2/a.mp3"])).size).toBe(0);

    bucket.createSignedUrls.mockRejectedValueOnce(new Error("fetch failed"));
    expect((await signMediaUrls(["2/a.mp3"])).size).toBe(0);
  });

  it("makes no request for an empty list or when Storage isn't configured", async () => {
    expect((await signMediaUrls([])).size).toBe(0);

    notConfigured();
    expect((await signMediaUrls(["2/a.mp3"])).size).toBe(0);

    expect(bucket.createSignedUrls).not.toHaveBeenCalled();
  });
});
