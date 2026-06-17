import { NextRequest, NextResponse } from "next/server";

/**
 * Helper route that receives a refresh token via query parameters, stores it as
 * the regular Stack cookie *for the current sub-domain only* and finally
 * redirects the user to the requested path.
 *
 * Example usage (client side):
 *   /impersonate?refresh_token=<TOKEN>&redirect_path=/workflow/123
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);

    const refreshToken = searchParams.get("refresh_token");
    const redirectPath = searchParams.get("redirect_path") ?? "/workflow/create";

    if (!refreshToken) {
        return new Response("Missing refresh_token", { status: 400 });
    }

    // Behind a reverse proxy (e.g. Railway), `request.url` reflects the
    // container's internal host/port rather than the public-facing domain
    // the browser actually hit. The real domain is forwarded via
    // `x-forwarded-host` / `x-forwarded-proto`, so prefer those when present
    // and only fall back to `request.url` (e.g. local dev) otherwise.
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
    const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : request.url;

    // Prepare redirect – if the supplied redirect path is an absolute URL we use
    // it as-is, otherwise we resolve it relative to the current request.
    const redirectUrl = redirectPath.startsWith("http")
        ? redirectPath
        : new URL(redirectPath, origin).toString();

    const response = NextResponse.redirect(redirectUrl);

    // One day in seconds
    const maxAge = 60 * 60 * 24;

    // Store the refresh token cookie without an explicit domain so that it is
    // scoped to the current (sub-)domain. This avoids collisions between the
    // admin (superadmin.*) and the regular app (app.*) domains.
    response.cookies.set(`stack-refresh-${process.env.NEXT_PUBLIC_STACK_PROJECT_ID}` as string, refreshToken, {
        path: "/",
        maxAge,
        secure: true,
        httpOnly: false, // Must be accessible from the browser for Stack SDK
        sameSite: "lax",
    });

    return response;
}
