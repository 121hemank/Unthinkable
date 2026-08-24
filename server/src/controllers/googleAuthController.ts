import { Request, Response, NextFunction } from "express";
import { google } from "googleapis";
import { User } from "../models/User";
import { signToken, verifyToken } from "../utils/jwt";
const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];
function getOAuthClient() {
    return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
}
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
export async function handleGoogleOAuthCallback(req: Request, res: Response, next: NextFunction) {
    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
    try {
        const { code, state, error } = req.query as {
            code?: string;
            state?: string;
            error?: string;
        };
        if (error || !code || !state) {
            return res.redirect(`${clientUrl}?calendar=denied`);
        }
        let payload;
        try {
            payload = verifyToken(state);
        }
        catch {
            return res.redirect(`${clientUrl}?calendar=invalid_state`);
        }
        const account = await User.findById(payload.userId).select("isActive");
        if (!account || account.isActive === false) {
            return res.redirect(`${clientUrl}?calendar=denied`);
        }
        const { tokens } = await getOAuthClient().getToken(code);
        if (!tokens.refresh_token) {
            return res.redirect(`${clientUrl}?calendar=no_refresh_token`);
        }
        await User.findByIdAndUpdate(payload.userId, { googleRefreshToken: tokens.refresh_token });
        return res.redirect(`${clientUrl}?calendar=linked`);
    }
    catch (err) {
        next(err);
    }
}
export async function getCalendarLinkStatus(req: Request, res: Response) {
    const user = await User.findById(req.user!.userId).select("googleRefreshToken");
    return res.json({ linked: Boolean(user?.googleRefreshToken) });
}
