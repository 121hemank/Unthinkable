import { Request, Response, NextFunction } from "express";
import { google } from "googleapis";
import { User } from "../models/User";
import { signToken, verifyToken } from "../utils/jwt";

// calendar.events scope = read/write events only, NOT the whole calendar
const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

/**
 * Step 1 of calendar linking. Returns the Google consent URL as JSON instead
 * of redirecting: the browser can't send the JWT Authorization header on a
 * plain navigation, so requireAuth only works on an XHR call — the client
 * fetches this URL and then does window.location = authUrl itself.
 * access_type=offline + prompt=consent are what force Google to hand back a
 * refresh token (access tokens alone expire after ~1 hour).
 *
 * The `state` param is a signed JWT of the caller's identity — when Google
 * redirects back we verify it, so a callback can never be forged to attach
 * someone else's calendar to another user's account.
 */
export async function startGoogleOAuth(req: Request, res: Response) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ error: "Google OAuth is not configured on this server" });
  }

  const state = signToken(req.user!.userId as any, req.user!.role);
  const authUrl = getOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
  return res.json({ authUrl });
}

/**
 * Step 2: Google redirects here with ?code=...&state=... We exchange the
 * code for tokens, store ONLY the refresh token on the User, and bounce the
 * browser back to their dashboard with a ?calendar=linked|error flag.
 */
export async function handleGoogleOAuthCallback(req: Request, res: Response, next: NextFunction) {
  const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
  try {
    const { code, state, error } = req.query as { code?: string; state?: string; error?: string };

    if (error || !code || !state) {
      return res.redirect(`${clientUrl}?calendar=denied`);
    }

    let payload;
    try {
      payload = verifyToken(state);
    } catch {
      return res.redirect(`${clientUrl}?calendar=invalid_state`);
    }

    // An in-flight OAuth flow must not complete for a deactivated account.
    const account = await User.findById(payload.userId).select("isActive");
    if (!account || account.isActive === false) {
      return res.redirect(`${clientUrl}?calendar=denied`);
    }

    const { tokens } = await getOAuthClient().getToken(code);
    if (!tokens.refresh_token) {
      // Happens only if prompt=consent was skipped — treat as an error so the
      // user retries the flow rather than silently having no working link.
      return res.redirect(`${clientUrl}?calendar=no_refresh_token`);
    }

    await User.findByIdAndUpdate(payload.userId, { googleRefreshToken: tokens.refresh_token });
    return res.redirect(`${clientUrl}?calendar=linked`);
  } catch (err) {
    next(err);
  }
}

/** Frontend convenience: has the logged-in user linked their calendar? */
export async function getCalendarLinkStatus(req: Request, res: Response) {
  const user = await User.findById(req.user!.userId).select("googleRefreshToken");
  return res.json({ linked: Boolean(user?.googleRefreshToken) });
}
