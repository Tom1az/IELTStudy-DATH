// Stands in for services/storage.ts in route tests, so they never call Supabase. Use it with
//   vi.mock("../services/storage.ts", () => import("../test/fake-storage.ts"));
// The fake URLs contain their inputs, so tests can check what was asked for.

export const createUploadTicket = async (userId: number, fileName: string) => {
  return {
    uploadUrl: `https://storage.test/upload/${userId}/${fileName}?token=test`,
    path: `${userId}/test-${fileName}`,
  };
};

// Signs every path except those under "missing/", which act like files that were never uploaded
export const signMediaUrls = async (paths: string[]) => {
  const urls = new Map<string, string>();
  for (const path of paths) {
    if (!path.startsWith("missing/")) {
      urls.set(path, `https://storage.test/sign/${path}?token=test`);
    }
  }
  return urls;
};
