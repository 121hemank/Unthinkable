import { Router } from "express";
import { register, login, updateMe } from "../controllers/authController";
import {
  startGoogleOAuth,
  handleGoogleOAuthCallback,
  getCalendarLinkStatus,
} from "../controllers/googleAuthController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.put("/me", requireAuth, updateMe); // rename (typo fixes) for any logged-in user

// Google Calendar linking (any logged-in user: patient or doctor)
router.get("/google", requireAuth, startGoogleOAuth);
router.get("/google/callback", handleGoogleOAuthCallback); // Google hits this — no JWT header, state param carries identity
router.get("/calendar/status", requireAuth, getCalendarLinkStatus);

export default router;
