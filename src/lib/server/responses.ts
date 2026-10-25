import "server-only";

export const privateHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};

export function authRedirect(path: string) {
  return new Response(null, {
    status: 303,
    headers: { ...privateHeaders, Location: path },
  });
}
